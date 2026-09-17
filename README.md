# lib-blurhash

[BlurHash](https://blurha.sh) for Enonic XP 8. Every `media:image` gets a ~28-character hash
stored in a mixin; a controller decodes it server-side into a tiny PNG data URI to show while
the real image loads.

```
content.x['<app-key-with-dashes>'].blurhash = { hash: 'LdE{LX9axuae~pIVxtV@s.ozoeV@', source: '1aa48dd94ff1a05d' }
```

`hash` is the BlurHash. `source` is the first 16 characters of the attachment's `sha512`, and
is what tells the library an image has been replaced.

Java turns bytes into pixels; TypeScript turns pixels into a hash. The codec is
[woltapp's reference implementation](https://github.com/woltapp/blurhash), vendored
unmodified.

## Install

**1. Depend on the library.** It is merged into your app's bundle — its JS, its Java bean,
its mixin and its task all resolve under your app's key.

```groovy
dependencies {
    include 'bre.lib:lib-blurhash:1.0.0-SNAPSHOT'
}
```

**2. Register the mixin** in `src/main/resources/cms/cms.yaml`. The mixin *definition* ships
in the library; the registration cannot, because `cms/cms.yaml` is a single app-level file
that would collide on merge.

```yaml
kind: "CMS"
mixins:
  - name: "blurhash"
    allowContentTypes: "media:image"
```

**3. Call `init()` from `main.ts`.** This registers the upload listener and starts a
backfill of existing images. The library does nothing on import — XP gives each controller
its own module instance, so registering on import would add one listener per controller.

```ts
import { init } from '/lib/blurhash';

init();
```

**4. GraalJS only.** Set `scriptEngine = 'GraalJS'` in your app's `build.gradle`. The emitted
JS is ES2023; Nashorn cannot parse it (see [Limitations](#limitations)).

## Render

In a part or page controller:

```ts
import { get as getContent } from '/lib/xp/content';
import { decode } from '/lib/blurhash';

const namespace = app.name.replace(/\./g, '-');

function placeholder(imageId: string): { src: string | null; width?: number; height?: number } {
  const image = getContent({ key: imageId });
  if (!image) return { src: null };

  const stored = image.x?.[namespace]?.blurhash as { hash?: string } | undefined;
  const info = image.x?.media?.imageInfo as { imageWidth?: number; imageHeight?: number } | undefined;

  return {
    // `decode` returns null for a missing or malformed hash: render without a placeholder.
    src: stored?.hash ? decode(stored.hash, { width: info?.imageWidth, height: info?.imageHeight }) : null,
    width: info?.imageWidth,
    height: info?.imageHeight,
  };
}
```

```html
<div class="blur-up" style="aspect-ratio: 4 / 3">
  <img class="placeholder" data-th-if="${placeholder.src}" data-th-src="${placeholder.src}" alt="">
  <img class="real" data-th-src="${imageUrl}" loading="lazy" alt="…">
</div>
```

`decode`'s `opts` set the placeholder's **aspect ratio**, not its size. The long edge is
always 32 px: the result is blur, the browser scales it for free, and decode cost is linear in
output pixels (~5.5 µs/px). `{width: 4, height: 3}` and `{width: 1200, height: 900}` return
the same image.

## Config

Optional. Keys go in **your app's** `.cfg` (`$XP_HOME/config/<app.key>.cfg`) — the library has
no bundle of its own.

| Key | Default | Range | Meaning |
| --- | --- | --- | --- |
| `blurhash.componentsX` | `4` | 1–9 | horizontal components |
| `blurhash.componentsY` | `3` | 1–9 | vertical components |
| `blurhash.maxEdge` | `32` | 8–256 | sampling size: the thumbnail's long edge |
| `blurhash.listener` | `true` | `true`/`false` | register the upload listener from `init()` |
| `blurhash.backfill` | `true` | `true`/`false` | run a backfill from `init()` |

**Precedence:** an explicit `init({ listener, backfill })` argument, then the `.cfg`, then
the default. Code wins over config.

**Bad values** log a warning and fall back to the default. Booleans are exactly `true` or
`false`; `TRUE`, `yes` and `0` are all rejected.

**A config change does not re-hash existing images.** The fingerprint is the attachment's
`sha512`, which has not changed, so every image reports `unchanged`. New uploads get the new
component counts; old ones keep theirs. `decode` reads the component counts from the hash
itself, so mixed hashes render fine. To re-hash everything, clear the mixin and let the
backfill refill it.

## Behaviour

**Listener.** On `node.created`/`node.updated` in `draft`, for repositories whose project or
site is connected to your app. Reads the content, compares `source` with the current
`sha512`, and writes only when they differ. The library's own write re-fires the event; the
second pass matches and stops. Never writes to `master` — publishing is the editor's.

**Backfill.** Runs as an XP task from `init()`, on every application start. Discovers
repositories from `projectLib.list()` plus each project's sites; `backfill({ repositories })`
overrides that. Batches of 20, `taskLib.progress` per batch, one summary log line per
repository. A run where everything is current does no writes, so restarting is cheap and is
also the recovery path — a task that dies halfway just runs again next start.

**`process` results.** `written`, `unchanged`, or `skipped` with a reason: not found, not a
`media:image`, no attachment, or `unreadable image` (WebP — see below). Nothing throws; a
missing placeholder is never the reason an editor cannot save.

**Logging.** Every line is prefixed `[blurhash]`. `init()` logs the backfill's task id.

## API

Frozen for v1; `averageColor` added after the freeze (additive, pure).

```ts
// XP
init(opts?: InitOpts): void
backfill(opts?: BackfillOpts): string          // task id
encode(contentId: string): string | null      // hash, no write
process(contentId: string): ProcessResult     // hash + write to the mixin, in draft
decode(hash: string, opts?: DecodeOpts): string | null   // PNG data URI

// Pure — no XP needed; unit-tested
encodeRgb(pixels, width, height, componentsX?, componentsY?): string | null
decodeRgb(hash, width, height, punch?): Uint8ClampedArray | null
encodeThumbnail(raw, componentsX?, componentsY?): string | null
isValidHash(value: unknown): value is string
averageColor(hash: unknown): string | null     // '#rrggbb' from the hash's DC term; no pixels decoded
DEFAULT_COMPONENTS_X, DEFAULT_COMPONENTS_Y

// Types
InitOpts = { listener?: boolean; backfill?: boolean }
BackfillOpts = { repositories?: string[] }
DecodeOpts = { width?: number; height?: number }
ProcessResult = { status: 'written' | 'unchanged' | 'skipped'; hash?: string; reason?: string }
BackfillSummary = { written: number; unchanged: number; skipped: number; total: number }
```

`encode`/`process`/`decode` run under `role:system.admin` in `draft`, inheriting the current
repository. The elevation is bounded: two fields, on `media:image`, in draft.

## Limitations

- **GraalJS only.** Nashorn rejects the emitted ES2023 and, separately, presents a Java
  `int[]` as something without `.slice`. Both were hit; neither is fixed in v1.
- **WebP gets no hash.** Stock `ImageIO` has no WebP reader; `process` reports `skipped`.
  JPEG, PNG, GIF and TIFF work.
- **Not cluster-aware.** Every node runs `init()`, so every node backfills. Identical
  hashes, so duplicated work rather than corruption.
- **Config changes are not retroactive** — see [Config](#config).
- **EXIF orientation is ignored**; a rotated photo gets a rotated blur.
- **Alpha is discarded**; the placeholder is opaque.
- The `hash` field is editable in Content Studio (XP 8 has no read-only input). A hash an
  editor breaks renders no placeholder until the image is re-uploaded, or the mixin cleared.

## Development

| Path | Purpose |
| --- | --- |
| `src/main/resources/lib/blurhash/` | Library source; compiled to `lib/blurhash/*.js` in the jar |
| `src/main/resources/lib/blurhash/vendor/` | woltapp's codec, MIT, unmodified bar one `@ts-nocheck` |
| `src/main/resources/cms/mixins/blurhash/` | Mixin schema; merges into the consuming app |
| `src/main/resources/tasks/blurhash-backfill/` | Backfill task descriptor; merges into the consuming app |
| `src/main/java/bre/lib/blurhash/ImageBean.java` | Attachment bytes → RGBA thumbnail; RGBA → PNG base64 |

```
pnpm test                       # vitest, *.test.ts beside the source
pnpm exec tsc --noEmit -p src/main/resources/tsconfig.json
./gradlew publishToMavenLocal   # install to ~/.m2 for consuming apps
```

There is no `deploy` task: a library jar is not an OSGi bundle. A change reaches a running XP
only through a consuming app, and the app rebuild is what re-merges the library:

```
cd lib-blurhash    && ./gradlew publishToMavenLocal
cd ../app-blurhash && XP_HOME=/path/to/xp/home ./gradlew deploy
```

If a change appears not to land, Gradle resolved a cached SNAPSHOT — add
`--refresh-dependencies` to the app build. `XP_HOME` must be the instance you are browsing;
deploying elsewhere succeeds silently.

**Server code must be `.ts`.** A hand-written `.js` under `src/main/resources` never reaches
the jar: `processResources` copies it, then `pnpmPack` deletes `build/resources/main/**/*.js`
before `vp pack` regenerates from `.ts`. The build still succeeds — the file is just absent.

**No npm dependencies at runtime.** There is no `node_modules` on XP, and the pack setting
that inlines a dependency emits a root-level chunk that does not survive the merge. Vendor
instead.

The demo app's dev harness, one section per milestone, is at
`http://localhost:8080/webapp/bre.app.blurhash/` once `app-blurhash` is deployed.
