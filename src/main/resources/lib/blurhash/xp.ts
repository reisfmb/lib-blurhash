/**
 * The XP-facing API: read an image, hash it, store it, turn a stored hash back into a
 * placeholder.
 *
 * Nothing here is unit-testable — every function needs content, a repository and a bean — so
 * the decisions live in `content.ts` and this file stays as close to plumbing as it can.
 */

import type { Content } from '/lib/xp/content';
import { get as getContent, getAttachmentStream, modify } from '/lib/xp/content';
import { run } from '/lib/xp/context';
import { BlurhashData, dataNamespace, fingerprint, isStale } from './content';
import { decodeRgb, encodeThumbnail, isValidHash } from './codec';
import { config } from './settings';

/** Placeholder resolution. Fixed: `opts` chooses the shape, never the size. */
const DECODE_EDGE = 32;

const IMAGE_TYPE = 'media:image';
const MIXIN_NAME = 'blurhash';

export type ProcessStatus = 'written' | 'unchanged' | 'skipped';
export type ProcessResult = { status: ProcessStatus; hash?: string; reason?: string };

/** Aspect ratio for the placeholder. Any pair with the same ratio gives the same image. */
export type DecodeOpts = { width?: number; height?: number };

type ImageBean = {
  rgbaThumbnail: (source: unknown, maxEdge: number) => number[];
  pngBase64Rgba: (rgba: number[], width: number, height: number) => string;
};

type ImageData = { media?: { attachment?: string } };

/** `Content` with the data and `x` shapes narrowed to what a media:image carries for us. */
type ImageContent = Content<ImageData> & { x: Record<string, Record<string, BlurhashData>> };

function bean(): ImageBean {
  return __.newBean<ImageBean>('bre.lib.blurhash.ImageBean');
}

/**
 * Draft, as the library's own user.
 *
 * The elevation is required, not convenient: the event listener in M4 runs with no user at
 * all. It is bounded by what the callers below actually do — two fields, on media:image, in
 * draft — and never exposed for a caller to borrow.
 */
function inLibraryContext<T>(fn: () => T): T {
  return run({ branch: 'draft', principals: ['role:system.admin'] }, fn);
}

/** The attachment holding the image itself. */
function attachmentName(content: ImageContent): string {
  return content.data.media?.attachment || content._name;
}

/** Existing mixin value, or null when the content has never been processed. */
function storedData(content: ImageContent): BlurhashData | null {
  const namespace = dataNamespace(app.name);
  if (!namespace) return null;
  return content.x?.[namespace]?.[MIXIN_NAME] || null;
}

/**
 * Content id -> hash. Null when the content is not an image, or the image cannot be read.
 *
 * Does not write: persistence is `process`, so that callers who only want a hash — tests,
 * previews, a consumer with its own storage — are not forced into a content modification.
 */
export function encode(contentId: string): string | null {
  return inLibraryContext(() => {
    const content = getContent<ImageContent>({ key: contentId });
    if (!content || content.type !== IMAGE_TYPE) return null;

    const stream = getAttachmentStream({ key: content._id, name: attachmentName(content) });
    if (!stream) return null;

    // Null rather than a throw: an unreadable image (WebP has no ImageIO reader) is an
    // expected outcome, and the contract is "no placeholder", not "no page".
    return hashOf(stream);
  });
}

/**
 * Encode and store, in draft.
 *
 * Returns what it did rather than throwing: M5 counts these for task progress, and M4 needs
 * to tell "skipped a WebP" apart from "nothing changed".
 */
export function process(contentId: string): ProcessResult {
  return inLibraryContext(() => {
    const content = getContent<ImageContent>({ key: contentId });
    if (!content) return { status: 'skipped', reason: 'not found' };
    if (content.type !== IMAGE_TYPE) return { status: 'skipped', reason: `not ${IMAGE_TYPE}` };

    const namespace = dataNamespace(app.name);
    if (!namespace) return { status: 'skipped', reason: 'cannot derive the x namespace' };

    const name = attachmentName(content);
    const sha512 = content.attachments?.[name]?.sha512;

    // The guard, and the reason a write does not loop: our own modify re-fires node.updated,
    // the next pass finds a matching fingerprint, and stops here.
    if (!isStale(storedData(content), sha512)) {
      return { status: 'unchanged', hash: storedData(content)?.hash };
    }

    const stream = getAttachmentStream({ key: content._id, name });
    if (!stream) return { status: 'skipped', reason: `no attachment "${name}"` };

    const hash = hashOf(stream);
    if (!hash) return { status: 'skipped', reason: 'unreadable image' };

    const source = fingerprint(sha512);
    modify<ImageData>({
      key: content._id,
      // A draft with an unfilled required field still deserves its hash; the mixin is ours
      // to complete, and the rest of the form is the editor's problem.
      requireValid: false,
      editor: (c) => {
        c.x = c.x || {};
        c.x[namespace] = c.x[namespace] || {};
        c.x[namespace][MIXIN_NAME] = source ? { hash, source } : { hash };
        return c;
      },
    });

    return { status: 'written', hash };
  });
}

/**
 * Attachment bytes -> hash, at the configured sampling size and component counts.
 *
 * Config is read here and nowhere else in this file, so the two callers cannot drift.
 */
function hashOf(stream: unknown): string | null {
  const { componentsX, componentsY, maxEdge } = config();
  return encodeThumbnail(bean().rgbaThumbnail(stream, maxEdge), componentsX, componentsY);
}

/**
 * Stored hash -> PNG data URI. Null when the hash is unusable.
 *
 * `opts` sets the placeholder's **aspect ratio**, not its size — `{width: 4, height: 3}` and
 * `{width: 1200, height: 900}` give the same image. The result is blur, so the browser scales
 * it for free, and decoding is linear in output pixels (~5.5 µs/px): honouring a display size
 * would cost seconds for something indistinguishable from 32px.
 */
export function decode(hash: string, opts?: DecodeOpts): string | null {
  if (!isValidHash(hash)) return null;

  const { width, height } = placeholderSize(opts);
  const pixels = decodeRgb(hash, width, height);
  if (!pixels) return null;

  const base64 = bean().pngBase64Rgba(Array.from(pixels), width, height);
  return base64 ? `data:image/png;base64,${base64}` : null;
}

/** The requested shape at a fixed size: long edge DECODE_EDGE, aspect preserved. */
function placeholderSize(opts?: DecodeOpts): { width: number; height: number } {
  const w = positiveOr(opts?.width, DECODE_EDGE);
  const h = positiveOr(opts?.height, DECODE_EDGE);
  const scale = DECODE_EDGE / Math.max(w, h);

  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && isFinite(value) && value > 0 ? Math.round(value) : fallback;
}
