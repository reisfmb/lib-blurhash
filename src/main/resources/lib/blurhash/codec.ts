/**
 * BlurHash encode/decode — the pure layer.
 *
 * A thin wrapper over the vendored reference implementation (`vendor/`, woltapp, MIT). It
 * exists to do three things the codec deliberately does not:
 *
 *   - accept the plain JS array the Java bridge produces, not only a Uint8ClampedArray;
 *   - return null instead of throwing, because hashes come from an editable field;
 *   - apply the 4×3 component default.
 *
 * XP-facing functions (encode/process/decode by content id) live in `xp.ts`.
 */

import { encode as codecEncode, decode as codecDecode, isBlurhashValid, decode83 } from './vendor';
import {
  hasExpectedLength,
  isValidComponentCount,
  isValidDimension,
  readThumbnail,
  toClamped,
} from './pixels';

/**
 * The base83 alphabet, duplicated here on purpose.
 *
 * Upstream validates a hash's *length* but not its characters: `decode83` resolves an unknown
 * character to -1 and carries on, so "L///…" of the right length decodes to garbage instead of
 * failing. Since our hashes come from a field an editor can type into, the charset check has
 * to exist somewhere, and the alphabet is frozen by the format.
 */
const BASE83 = /^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]+$/;

export const DEFAULT_COMPONENTS_X = 4;
export const DEFAULT_COMPONENTS_Y = 3;

/**
 * Pixels -> hash. Null when the input does not describe a width × height RGBA image.
 */
export function encodeRgb(
  pixels: Uint8ClampedArray | number[],
  width: number,
  height: number,
  componentsX: number = DEFAULT_COMPONENTS_X,
  componentsY: number = DEFAULT_COMPONENTS_Y,
): string | null {
  if (!isValidDimension(width) || !isValidDimension(height)) return null;
  if (!isValidComponentCount(componentsX) || !isValidComponentCount(componentsY)) return null;
  if (!pixels || !hasExpectedLength(pixels, width, height)) return null;

  try {
    return codecEncode(toClamped(pixels), width, height, componentsX, componentsY);
  } catch (e) {
    return null;
  }
}

/**
 * Hash -> pixels, at whatever size the caller asks for. Null when the hash is malformed.
 *
 * Size is the placeholder's own resolution, not the display size: the result is blur, so it
 * is scaled up by the browser. Aspect ratio is the only part that has to be right.
 */
export function decodeRgb(
  hash: string,
  width: number,
  height: number,
  punch?: number,
): Uint8ClampedArray | null {
  if (!isValidHash(hash)) return null;
  if (!isValidDimension(width) || !isValidDimension(height)) return null;

  try {
    return codecDecode(hash, width, height, punch);
  } catch (e) {
    return null;
  }
}

/**
 * Is this a hash we can decode?
 *
 * The mixin field is editable in Content Studio (XP 8 has no read-only input), so every hash
 * read back from content is untrusted input.
 */
export function isValidHash(hash: unknown): hash is string {
  if (typeof hash !== 'string' || hash.length === 0) return false;
  if (!BASE83.test(hash)) return false;
  try {
    return isBlurhashValid(hash).result;
  } catch (e) {
    return false;
  }
}

/**
 * The image's average colour, as `#rrggbb`, straight from the hash.
 *
 * Characters 2–5 of a BlurHash are the DC component: the mean colour, base83-encoded as
 * 24-bit sRGB. No decoding of pixels is needed, so this is free to call per image and is the
 * natural tint for borders, skeletons and card backgrounds while the real image loads.
 */
export function averageColor(hash: unknown): string | null {
  if (!isValidHash(hash)) return null;
  const rgb = decode83(hash.substring(2, 6));
  return '#' + rgb.toString(16).padStart(6, '0');
}

/**
 * The bean's thumbnail array -> hash, in one step.
 *
 * What M3's `encode(contentId)` will call once it has a `ByteSource`; separate from
 * `encodeRgb` so the dimension handling is tested without a running XP.
 */
export function encodeThumbnail(
  raw: number[] | null | undefined,
  componentsX: number = DEFAULT_COMPONENTS_X,
  componentsY: number = DEFAULT_COMPONENTS_Y,
): string | null {
  const thumb = readThumbnail(raw);
  if (!thumb) return null;
  return encodeRgb(thumb.pixels, thumb.width, thumb.height, componentsX, componentsY);
}
