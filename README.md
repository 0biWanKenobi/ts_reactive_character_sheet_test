# Reactive RPG Formula Sheet — Rust/WASM + Chumsky

The expression parser and evaluator are written in Rust with Chumsky and compiled
to WebAssembly with wasm-bindgen. Svelte 5 keeps the existing per-field reactive
resolution and click-to-roll behavior.

## Setup

1. `cd wasm && docker compose run --rm build`
2. `cd .. && npm install`
3. `npm run check && npm run build && npm run dev`

The `wasm/pkg` directory is a generated, gitignored wasm-pack package.
Rebuild after Rust changes.

## Syntax

- References require braces: `{STR}`, `{STR_MOD}`. Bare variable names are invalid.
- Dice: `3d6`, `({STR})d({PROF}+4)`, `kh(4d8, 2)`, `dl(3d6, 1)`.
- Arithmetic: `+ - * / ^ %`, comparisons: `> < >= <= == !=`.
- Functions: `floor`, `ceil`, `round`, `abs`, `sqrt`, `min`, `max`.
- Conditional: `condition ? whenTrue : whenFalse`.

## Architecture

Each FieldRow retains its `$derived.by()`. `resolve()` recursively reads the
reactive sheet fields, detects circular and missing references, and expands
referenced expressions before compiling the aggregate expression in WASM.
Dice expressions are never evaluated during reactive updates; a Roll click
evaluates them explicitly. The WASM evaluator returns kept/dropped roll flags.
Compiled formula objects are cached and freed on eviction.

The JavaScript-to-WASM calls are per compiled expression, not per variable.
Expanded formulas are parsed again when their contents change; the original
formula sources are cached. This is intended as a feature-parity migration,
not a claim of improved benchmark performance.

## Testing

The Rust crate has not been compiled in this environment because Rust and
Docker are unavailable. Run the Docker build and then the Svelte checks.
