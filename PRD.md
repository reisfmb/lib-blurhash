# PRD — lib-blurhash

BlurHash for Enonic XP 8. Every image content gets a compact hash stored beside it; pages show
a blurred placeholder decoded from that hash while the real image downloads.

| | |
| --- | --- |
| Author | Bruno Reis |
| Date | 2026-09-16 |
| Context | Enonic internal AI hackathon, one to two days |
| Deliverables | `lib-blurhash` (XP library), `app-blurhash` (demo site app) |

## Problem

Image-heavy XP sites show empty boxes, or layout shifts, until each image arrives. Solutions
today are per-project: a low-quality preview generated in a build step, a dominant colour
picked by hand, or nothing. Nothing in XP produces a placeholder from the image itself, at
upload time, for every image in a project.

## Goals

1. **Zero-touch.** An editor uploads an image and it has a hash. No button, no build step.
2. **One call to render.** A controller turns the stored hash into something an `<img>` can
   show, in one line.
3. **Drop-in.** A consuming app adds a dependency, registers a mixin and calls one function.
4. **Cannot break editing.** A failed or missing hash never blocks an upload, a save or a
   render.
5. **Demonstrable.** A demo site shows blur-up next to plain lazy-loading on the same page.

## Non-goals (v1)

Client-side decoding, non-image content types, EXIF orientation, alpha, animated GIF, CMYK,
cluster coordination, decode caching, Nashorn. Each is recorded with its reason and the cost
of undoing it, so "why doesn't it handle X?" has an answer.

## Users

- **Editors** upload images in Content Studio and expect nothing new to do.
- **Site developers** read a field and call a function in a part or page controller.
- **App developers** add the library to an app and wire it in once.

## Requirements

### Functional

| # | Requirement |
| --- | --- |
| F1 | On create or replace of a `media:image` in `draft`, compute its BlurHash and store it on the content. Never write to `master`; publishing stays with the editor. |
| F2 | Store the hash in a mixin, `blurhash`, with two fields: `hash` and `source`, a fingerprint of the attachment. Re-hash only when the fingerprint changes. The fingerprint is also the loop guard: the library's own write re-fires the event and the second pass is a no-op. |
| F3 | On application start, backfill every existing image in every project connected to the app, as a background task. A repeat run writes nothing, so it is also the recovery path. |
| F4 | `decode(hash, opts?)` returns a PNG data URI at the requested aspect ratio, long edge fixed at 32 px. Malformed input returns `null`. |
| F5 | `encode(contentId)` returns the hash without writing; `process(contentId)` encodes and writes, reporting `written`, `unchanged` or `skipped` with a reason. |
| F6 | `init(opts?)`, called by the consumer from `main.ts`, registers the listener and starts the backfill. The library has no import side effects. |
| F7 | `backfill(opts?)` is exported for a consumer who wants a button, a schedule or a widget. The library ships no HTTP endpoint. |
| F8 | Configurable via the consuming app's `.cfg`: component counts, sampling size, listener and backfill on/off. Bad values warn and fall back to defaults. |
| F9 | Unreadable images (no ImageIO reader, e.g. WebP) are `skipped`, not errors. |

### Non-functional

| # | Requirement |
| --- | --- |
| N1 | Encode cost well under 100 ms per image on upload. |
| N2 | Decode cost a few milliseconds per placeholder; placeholders stay small because cost is linear in output pixels. |
| N3 | Every log line prefixed `[blurhash]`. Failures logged, never thrown into XP. |
| N4 | The pure codec layer is unit-tested without XP. Everything above it is verified by hand in the demo app. |
| N5 | Elevation is bounded: `role:system.admin` in `draft`, two fields, on `media:image` only. |

## Design

**Java does bytes to pixels; TypeScript does pixels to hash.** Java is confined to what only
Java can do (ImageIO decode, PNG encode). The algorithm is woltapp's reference TypeScript
implementation, vendored unmodified rather than reimplemented or pulled from npm, because
there is no `node_modules` at XP runtime.

```
init / backfill / encode / process / decode     needs XP
  ImageBean (Java)                              attachment bytes -> RGBA thumbnail; RGBA -> PNG
    encodeRgb / decodeRgb / isValidHash         pure, unit-tested
      vendor/                                   woltapp codec, MIT
```

**Storage.** Mixin definition ships in the library; registration is the consumer's, in
`cms/cms.yaml`, because that file is app-level and would collide on merge. Read at
`content.x[<app key, dots as dashes>].blurhash`. Dimensions are not stored; `x.media.imageInfo`
already has them.

**Trust.** Both mixin fields are editable in Content Studio (XP 8 has no read-only input), so
`decode` treats the hash as untrusted input and validates charset and length.

## Consumer contract

```groovy
include 'bre.lib:lib-blurhash:<version>'
```

```yaml
# cms/cms.yaml
mixins:
  - name: "blurhash"
    allowContentTypes: "media:image"
```

```ts
// main.ts
import { init } from '/lib/blurhash';
init();
```

```ts
// any controller
const src = decode(image.x[ns].blurhash.hash, { width, height });
```

## Demo app

`app-blurhash`: a site app with a gallery part and a hero part, each in a BlurHash variant and
a plain variant, so the effect is visible side by side under devtools throttling. Plus a dev
harness webapp with one section per milestone, so a regression names the milestone that broke.

## Success criteria

- Upload an image in Content Studio: the mixin is filled within a second, no editor action.
- Replace the image: the hash changes. Save without replacing: it does not.
- Deploy to a project with existing images: all are hashed after start, no request needed.
- Gallery under throttled network: placeholders paint immediately, images fade in over them.
- Unit tests pass without XP; a malformed hash renders no placeholder and no error.

## Milestones

| # | Delivers | Done when |
| --- | --- | --- |
| M0 | Both projects build and deploy; lib-shipped mixin appears in Content Studio | Field visible on an image |
| M1 | Java `ImageBean`: attachment stream to pixels to PNG base64 | PNG round-trips in the harness |
| M2 | Encode and decode in TS over the vendored codec, unit-tested | `pnpm test` green |
| M3 | `encode` / `process` / `decode` by content id | Hash stored and rendered from storage |
| M4 | Event listener, draft-only, fingerprint guard | Upload fills the field; second event is a no-op |
| M5 | Backfill from `init()` as a task | Wiped hashes refill on restart |
| M6 | Config from `.cfg`, hash validation, API freeze, README | Bad config warns and falls back |
| M7 | Demo gallery and hero in `app-blurhash` | Blur-up visible under throttling |
| M8 | Content Studio widget calling `backfill()` | Stretch |
| M9 | Decode caching | Stretch, only with a measurement |

M1 goes first because it is the riskiest: ImageIO finds codecs via `ServiceLoader`, which
OSGi tends to break. If it fails, the split is wrong and everything after it is a guess.

## Risks and open questions

| Risk | Checked at | If it fails |
| --- | --- | --- |
| ImageIO codec registry under OSGi | M1 | Thread-context classloader workaround, or a pure-TS decoder |
| Attachment `sha512` present on the content object | M1 | Hash the bytes ourselves as the fingerprint |
| `x.media.imageInfo` dimensions populated | M1 | Store dimensions in the mixin |
| A library can ship a mixin definition at all | M0 | Consumer copies the schema |
| Vendored ES2023 JS runs on the consumer's script engine | M2 | Downlevel, or declare GraalJS-only |
| `projectLib.list()` from a startup context | M5 | Consumer passes `repositories` |

## Appendix: AI usage

The library and demo app were built in pair with Claude Code over two calendar days,
2026-09-16 to 2026-09-17. Figures below come from the local session transcripts and both
repositories' git history.

| | |
| --- | --- |
| Milestones completed | 8 out of 10 (M0–M7; M8 widget and M9 caching, both stretch, not started) |
| Sessions | 5 (1 brainstorm, 2 build, 2 wrap-up) |
| Active session time | ~9 hours (gaps over 15 min excluded; ~14 hours wall clock) |
| Human prompts | 117 |
| API calls | 654 |
| Token usage | 114M input / 0.60M output |
| of which uncached input | 1.45M |
| Models | Claude Opus 5 (brainstorm, M0–M2), Claude Fable 5.1 (M3–M7, wrap-up) |
| Commits | 24 (11 lib, 13 app) |
| Files changed | 98 (49 lib, 49 app) |
| Unit tests | 116, pure layer only |

How it was used: the idea was discussed and challenged before any code; the plan, spikes and
findings were written as working notes under `.claude/docs`, then discarded once they had done
their job. Riskiest work first (Java/OSGi bridge), each milestone left the repo in a runnable,
deployed state, and the human did the Content Studio verification and the gallery styling
decisions. Extras beyond the plan: `averageColor` from the hash's DC term, and the hero part.
