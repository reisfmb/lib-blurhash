# lib-blurhash

BlurHash library for Enonic XP 8. Server code is TypeScript (or plain JS) under
`src/main/resources/lib/blurhash`, published as `/lib/blurhash`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/main/resources/lib/blurhash/` | Library source; compiled to `lib/blurhash/*.js` in the jar |
| `src/main/resources/tsconfig.json` | Type-check config (XP globals + `/lib/*` paths) |

## Build

```
./gradlew build                 # jar
./gradlew publishToMavenLocal   # install to ~/.m2 for consuming apps
```

`vp pack` compiles server `.ts` to per-file CommonJS into `build/resources/main`.

## Use from an app

```groovy
dependencies {
    include 'bre.lib:lib-blurhash:1.0.0-SNAPSHOT'
}
```

```ts
import { version } from '/lib/blurhash';
```
