# Reactive RPG Formula Sheet — Rust/WASM + Chumsky

The Svelte app uses [@0biwankenobi/dice-wasm](https://www.npmjs.com/package/@0biwankenobi/dice-wasm)
from [dice-wasm](https://github.com/0biWanKenobi/dice-wasm).
There is no embedded Rust crate or local WebAssembly build in this repository.

## Install and run

Once version 0.1.0 has been published:

```sh
npm install
npm run check
npm run build
npm run dev
```

The upstream project compiles its browser-compatible WASM package with
wasm-pack (`bundler` target) and publishes it to npm via version tags.
The generated `.wasm` and JavaScript glue code come from npm.

## Syntax and behavior

- References are delimited, e.g. `{STR}`, `{STR_MOD}`.
- Dice `3d6`, `({STR})d({PROF}+4)`, `kh(4d8,2)`, `dl(3d6,1)`.
- `+ - * / ^ %`, comparisons, ternaries and built-in math functions.
- Svelte 5 `$derived.by()` reads nested sheet dependencies recursively.
- Cycles and unknown references are detected by the TypeScript adapter.
- Rolls occur only on user action, with kept/dropped roll details.
- Compiled formula objects are cached with bounded eviction.

## Package release prerequisite

The first npm release has to be bootstrapped under an npm account that
controls the scope `@0biwankenobi`, then the trusted publisher must
be configured for GitHub repository `0biWanKenobi/dice-wasm`, workflow
`release.yml`, with permission for direct `npm publish`. The upstream
workflow uses npm OIDC; no permanent npm token is required afterwards.

Until the upstream package exists in npm, installation of this branch will
fail. After the initial release, regenerate and commit `package-lock.json`
using `npm install`.
