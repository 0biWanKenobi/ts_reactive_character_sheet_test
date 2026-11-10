# Reactive RPG Formula Sheet — Rust/WASM + Chumsky

This application uses the standalone [dice-wasm](https://github.com/0biWanKenobi/dice-wasm)
library, distributed as an installable package tarball attached to a **GitHub Release**.
No npm registry publication or embedded Rust crate is required.

The reference-aware engine uses the `dice-wasm` **v0.2.0** API and installs its
published release tarball directly from GitHub.

## Install and run

The consumer is pinned to the GitHub Release artifact for `v0.2.0`.
Use Node.js 22.12+ and Bun:

```sh
bun install --frozen-lockfile
bun run check
bun run test
bun run build
bun run dev
```

The dependency in `package.json` is a URL pointing directly to the
`dice-wasm-v0.2.0.tgz` asset. The package is hosted exclusively on GitHub Releases;
both Bun and npm can install the tarball.

```ts
import { CompiledFormula, FormulaContext } from '@0biwankenobi/dice-wasm';
```

## Syntax and runtime

- Braced references: `{STR}`, `{STR_MOD}`.
- Dice: `3d6`, `({STR})d({PROF}+4)`, `kh(4d8,2)`, `dl(3d6,1)`.
- Arithmetic, comparisons, ternary expressions and built-in functions.
- Each Svelte field retains its `$derived.by()` dependency tracking.
- TypeScript reads reachable sources in each reactive scope and synchronizes changed bindings.
- Rust/WASM resolves references through shared compiled expression trees, detects circular/missing fields, and performs explicit dice rolls.
- Deterministic subexpressions reduce to numbers or booleans. The remaining dice expression uses only the grouping parentheses required to preserve evaluation order.
- Displayed expressions are never reparsed for evaluation or rolls.
- Compiled WASM formula objects are cached and freed on eviction; sheet contexts retain shared trees until bindings are replaced, removed, or the sheet is disposed.
- Repeated dice references roll independently, and referenced pools preserve keep/drop details.

The integration tests run the packaged WASM module under Node.js using its
experimental TypeScript and WebAssembly module support. CI uses Node.js 24.

## Updating the package

When `dice-wasm` publishes another GitHub Release, change the release URL in
`package.json` to its versioned `.tgz` asset, then run `bun install` and commit
the updated `bun.lock`. Publish the release before updating its consumer dependency.
