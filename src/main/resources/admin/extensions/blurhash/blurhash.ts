/**
 * Content Studio context-panel widget: the BlurHash of the selected image, and a button to
 * generate it on demand.
 *
 * Exists for the consumer who switched the listener or the backfill off and wants to hash
 * one image by hand. Shipped by the library and merged into the consuming app like the mixin
 * and the task, so it appears under the app's key with nothing to register.
 *
 * `allow` in the descriptor limits it to cms.admin: XP filters the extension list by it, so
 * other users never see the widget, and a direct request is refused with 403.
 *
 * GET renders; POST runs `process`. Both read `contentId` and `repository` from the query,
 * which is how Content Studio addresses a context-panel extension.
 */

import type { Request, Response } from '@enonic-types/core';
import type { Content } from '/lib/xp/content';
import { get as getContent } from '/lib/xp/content';
import { run } from '/lib/xp/context';
import { BlurhashData, dataNamespace, isStale } from '/lib/blurhash/content';
import { decode, process, ProcessResult } from '/lib/blurhash/xp';

const IMAGE_TYPE = 'media:image';
const MIXIN_NAME = 'blurhash';

type ImageContent = Content<{ media?: { attachment?: string } }> & {
  x: Record<string, Record<string, unknown>>;
};

type HashStatus = 'missing' | 'current' | 'stale';

/** What the widget shows. `image` is null when there is nothing to act on. */
type View = {
  image: {
    status: HashStatus;
    hash: string | null;
    /** Decoded placeholder, so the editor sees what the hash looks like. */
    preview: string | null;
    width: number;
    height: number;
  } | null;
  message: string | null;
};

export function get(req: Request): Response {
  const contentId = param(req, 'contentId');
  const repository = param(req, 'repository');
  const view = inspect(contentId, repository);
  return { contentType: 'text/html; charset=utf-8', body: render(view, actionUrl(req, contentId, repository)) };
}

export function post(req: Request): Response {
  const contentId = param(req, 'contentId');
  const repository = param(req, 'repository');

  const before = inspect(contentId, repository);
  if (!contentId || !repository || !before.image) return json(400, { error: before.message });

  // `process` elevates internally, bounded to two fields in draft. What the widget adds is
  // the check above: the user must be able to see the image in their own context.
  const result = inRepository(repository, () => process(contentId));
  return json(200, { result, view: inspect(contentId, repository) });
}

/** Read the content as the current user, in draft, and describe the hash's state. */
function inspect(contentId: string | undefined, repository: string | undefined): View {
  if (!contentId) return { image: null, message: 'Select a content.' };
  if (!repository) return { image: null, message: 'No project in the request.' };

  const id = contentId;
  const content = inRepository(repository, () => getContent<ImageContent>({ key: id }));
  if (!content) return { image: null, message: 'Content not found.' };
  if (content.type !== IMAGE_TYPE) return { image: null, message: 'Only available for images.' };

  const namespace = dataNamespace(app.name);
  const stored = namespace ? (content.x?.[namespace]?.[MIXIN_NAME] as BlurhashData | undefined) : undefined;
  const attachment = content.data.media?.attachment || content._name;
  const sha512 = content.attachments?.[attachment]?.sha512;
  const info = (content.x?.media?.imageInfo ?? {}) as { imageWidth?: number; imageHeight?: number };
  const width = info.imageWidth || 4;
  const height = info.imageHeight || 3;

  const hash = stored?.hash || null;
  const status: HashStatus = !hash ? 'missing' : isStale(stored, sha512) ? 'stale' : 'current';

  return {
    image: { status, hash, preview: hash ? decode(hash, { width, height }) : null, width, height },
    message: null,
  };
}

/**
 * An extension request does not carry the project: Content Studio passes it as `repository`.
 * Draft, because that is the only branch the library writes and the one the editor is on.
 */
function inRepository<T>(repository: string, fn: () => T): T {
  return run({ repository, branch: 'draft' }, fn);
}

/** The widget's own URL, so the button posts back to this controller. */
function actionUrl(req: Request, contentId: string | undefined, repository: string | undefined): string {
  const base = req.contextPath || req.rawPath;
  const query = [contentId && `contentId=${encodeURIComponent(contentId)}`, repository && `repository=${encodeURIComponent(repository)}`]
    .filter(Boolean)
    .join('&');
  return query ? `${base}?${query}` : base;
}

function param(req: Request, name: string): string | undefined {
  const value = req.params?.[name];
  return Array.isArray(value) ? value[0] : value || undefined;
}

function json(status: number, body: unknown): Response {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

/** One line per state. `stale` is the third state: the image was replaced since it was hashed. */
const LABELS: Record<HashStatus, string> = {
  missing: 'No hash yet',
  current: 'Up to date',
  stale: 'Image changed — hash is out of date',
};

const BUTTONS: Record<HashStatus, string> = {
  missing: 'Generate BlurHash',
  current: 'Up to date',
  stale: 'Regenerate BlurHash',
};

/**
 * Plain HTML in a template string: no view library, because the library has no dependencies
 * to spare. Content Studio puts it in a shadow root, so the styles stay local, and it patches
 * `document.getElementById` to look inside that root, so the script below works unchanged.
 */
function render(view: View, url: string): string {
  const body = view.image ? renderImage(view.image) : `<p class="bh-muted">${escape(view.message || '')}</p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>BlurHash</title>
<style>
  :host, .bh { font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: inherit; }
  .bh { display: flex; flex-direction: column; gap: 12px; }
  .bh-muted { opacity: .7; margin: 0; }
  .bh-preview { display: block; max-width: 100%; width: 160px; height: auto; border-radius: 4px; }
  .bh-status { margin: 0; }
  .bh-status[hidden] { display: none; }
  .bh-status[data-status="missing"], .bh-status[data-status="stale"] { font-weight: 600; }
  .bh-button { align-self: flex-start; padding: 6px 14px; border: 1px solid currentColor; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
  .bh-button:disabled { opacity: .5; cursor: default; }
  .bh-result { margin: 0; min-height: 1.4em; }
  .bh-result.is-error { color: #d33030; }
</style></head>
<body><div class="bh" id="bh-root" data-url="${escape(url)}">${body}</div>
<script type="application/json" id="bh-labels">${JSON.stringify({ status: LABELS, button: BUTTONS })}</script>
<script>
(function () {
  var root = document.getElementById('bh-root');
  var button = document.getElementById('bh-button');
  if (!root || !button) return;
  var labels = JSON.parse(document.getElementById('bh-labels').textContent);
  var status = document.getElementById('bh-status');
  var result = document.getElementById('bh-result');

  function show(message, isError) {
    result.textContent = message || '';
    result.className = 'bh-result' + (isError ? ' is-error' : '');
  }

  function apply(view) {
    var image = view && view.image;
    if (!image) return;
    status.textContent = labels.status[image.status] || image.status;
    status.setAttribute('data-status', image.status);
    // When up to date the disabled button says so; a second line would repeat it.
    status.hidden = image.status === 'current';
    button.textContent = labels.button[image.status] || labels.button.missing;
    button.disabled = image.status === 'current';
    // The preview exists only when there is a hash: create it on the first hash, never leave
    // an empty <img> behind.
    var preview = document.getElementById('bh-preview');
    if (image.preview) {
      if (!preview) {
        preview = document.createElement('img');
        preview.className = 'bh-preview';
        preview.id = 'bh-preview';
        preview.alt = 'BlurHash preview';
        root.insertBefore(preview, root.firstChild);
      }
      preview.src = image.preview;
    } else if (preview) {
      preview.remove();
    }
  }

  button.addEventListener('click', function () {
    button.disabled = true;
    show('Generating…');
    fetch(root.getAttribute('data-url'), { method: 'POST', credentials: 'same-origin' })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (!r.ok) { show(r.body && r.body.error || 'Request failed', true); button.disabled = false; return; }
        var p = r.body.result || {};
        show(p.status === 'written' ? 'Hash written to draft.' : p.status === 'unchanged' ? 'Already up to date.' : 'Skipped: ' + (p.reason || 'unknown'), p.status === 'skipped');
        apply(r.body.view);
      })
      .catch(function (e) { show(String(e && e.message || e), true); button.disabled = false; });
  });
})();
</script></body></html>`;
}

function renderImage(image: NonNullable<View['image']>): string {
  const preview = image.preview
    ? `<img class="bh-preview" id="bh-preview" src="${image.preview}" width="${image.width}" height="${image.height}" alt="BlurHash preview">\n`
    : '';

  return `${preview}<p class="bh-status" id="bh-status" data-status="${image.status}"${image.status === 'current' ? ' hidden' : ''}>${escape(LABELS[image.status])}</p>
<button class="bh-button" id="bh-button" type="button"${image.status === 'current' ? ' disabled' : ''}>${escape(BUTTONS[image.status])}</button>
<p class="bh-result" id="bh-result"></p>`;
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
