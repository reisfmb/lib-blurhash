# Vendored: woltapp/blurhash

TypeScript sources from the reference implementation, by the authors of the format.
Unmodified except for one `// @ts-nocheck` line at the top of `decode.ts` (see below).

- Source: https://github.com/woltapp/blurhash/tree/master/TypeScript/src
- Version: 2.0.5
- License: MIT (see `LICENSE`)

## Updating

Re-download the files from the tag you want and re-run the tests. Keep them unmodified: local
edits here are indistinguishable from upstream code at a glance, so anything we need to change
belongs in the wrapper one directory up.

## The one local edit

`decode.ts` carries a `// @ts-nocheck` header. Upstream does not compile under `strict`
(`catch (error)` is `unknown`; `punch | 1` on an optional), and an imported file is always
type-checked regardless of `tsconfig` `exclude`, so the wrapper's type-check could not pass
without it. It changes nothing at runtime. Re-add it after updating.
