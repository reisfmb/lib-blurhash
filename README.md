# lib-blurhash

BlurHash library for Enonic XP 8. Server code is TypeScript under
`src/main/resources/lib/blurhash`, published as `/lib/blurhash`.

The library also ships the `blurhash` mixin schema. A consuming app only registers it by
name — see [Use from an app](#use-from-an-app).

## Layout

| Path | Purpose |
| --- | --- |
| `src/main/resources/lib/blurhash/` | Library source; compiled to `lib/blurhash/*.js` in the jar |
| `src/main/resources/cms/mixins/blurhash/` | Mixin schema; merges into the consuming app's bundle |
| `src/main/resources/tsconfig.json` | Type-check config (XP globals + `/lib/*` paths) |

## Build

```
./gradlew build                 # jar
./gradlew publishToMavenLocal   # install to ~/.m2 for consuming apps
```

`vp pack` compiles server `.ts` to per-file CommonJS into `build/resources/main`.

There is no `deploy` task, and that is deliberate: `deploy` comes from the
`com.enonic.xp.app` plugin, and a library jar is not an OSGi bundle. `publishToMavenLocal`
is the library's equivalent — apps consume it at build time via `include`.

> **Server code must be `.ts`.** A hand-written `.js` under `src/main/resources` never
> reaches the jar: `processResources` copies it, then `pnpmPack` deletes
> `build/resources/main/**/*.js` before `vp pack` regenerates from `.ts`. The build still
> succeeds — the file is just silently absent.

## Iterating against a running XP

A library change only reaches a running XP through a consuming app, so the app rebuild in
the middle is required — it is what re-merges the library:

```
cd lib-blurhash    && ./gradlew publishToMavenLocal
cd ../app-blurhash && XP_HOME=/path/to/xp/home ./gradlew deploy
```

If a library change appears not to land, Gradle resolved a cached SNAPSHOT — add
`--refresh-dependencies` to the app build.

## Use from an app

```groovy
dependencies {
    include 'bre.lib:lib-blurhash:1.0.0-SNAPSHOT'
}
```

Register the mixin in the app's `src/main/resources/cms/cms.yaml`. This part cannot live in
the library: `cms/cms.yaml` is a single app-level path, so a library shipping one would
collide with the app's own on merge.

```yaml
kind: "CMS"
mixins:
  - name: "blurhash"
    allowContentTypes: "media:image"
```

```ts
import { version } from '/lib/blurhash';
```
