# Reactive RPG Formula Sheet — Rust/WASM + Chumsky

This application uses the standalone [dice-wasm](https://github.com/0biWanKenobi/dice-wasm)
library, distributed as an installable package tarball attached to a **GitHub Release**.
No npm registry publication or embedded Rust crate is required.

## Install and run

The consumer is pinned to the GitHub Release artifact for `v0.1.0`.
**That release must exist before installation will work.** After tagging and releasing
the library:

```sh
npm install
npm run check
npm run build
npm run dev
```

The dependency in `package.json` is a URL pointing directly to the
`dice-wasm-v0.1.0.tgz` asset. Despite using npm as the installer, the
package is hosted exclusively on GitHub Releases.

```ts
import { CompiledFormula } from '@0biwankenobi/dice-wasm';
```

## Syntax and runtime

- Braced references: `{STR}`, `{STR_MOD}`.
- Dice: `3d6`, `({STR})d({PROF}+4)`, `kh(4d8,2)`, `dl(3d6,1)`.
- Arithmetic, comparisons, ternary expressions and built-in functions.
- Each Svelte field retains its `$derived.by()` dependency tracking.
- TypeScript resolves nested references and detects circular/missing fields.
- Rust/WASM handles expression parsing, evaluation and explicit dice rolls.
- Compiled WASM formula objects are cached and freed on eviction.

## Updating the package

When `dice-wasm` publishes another GitHub Release, change the release URL in
`package.json` to its versioned `.tgz` asset, then run `npm install` and commit
the updated `package-lock.json`.

The lockfile cannot be regenerated until the first GitHub Release asset exists.
