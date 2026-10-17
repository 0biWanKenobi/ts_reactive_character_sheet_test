# Reactive RPG Sheet — Svelte 5 + math.js

Run `npm install`, `npm run check`, and `npm run dev` (or `npm run build`).

## How it works

- A per-row `$derived.by()` reads the reactive `sheet` through recursive `resolve()`. References and circular references are resolved synchronously.
- `normalizeDice()` is a generic one-pass character scanner: `3d6` becomes `roll(3,6)` even when nested, e.g. `kh(4d8,2)` becomes `kh(roll(4,8),2)`. There is no `dl`/`kh` special-case during normalization.
- math.js parses each formula into a validated AST, cached by **original formula text**. On dependency changes the AST is reused, avoiding reparsing. The numeric AST evaluator is intentionally restricted to permitted math operations.
- A `DiceResult` records `rolls`, `kept` flags, and `total`. `dl` and `kh` operate on the resulting dice pool, preserving rolls and showing discarded dice in strikethrough.
- Dice expressions resolve and display their dependencies reactively, but random rolls happen only when the user clicks **Roll**. Previous rolls stay visible as snapshots.
- Resolution memoizes shared references within each top-level resolve. Across rows, reactivity is per-row, not a globally shared dependency graph.
- For portability the demo has no Obsidian APIs or native modules.

## Try it

Change `STR` to `20`; use `ATTACK` in another expression; make `STR_MOD = ATTACK + 1` to test cycles; try `dl(3d6,1) + STR_MOD` or `kh(4d8,2)` and click **Roll**.

## Notes

- Literal dice only: `XdY` requires numeric literals, not dynamic dice counts like `STRd6`.
- Input formulas are restricted to 1,024 characters and 500 AST nodes, and individual dice pools are limited to 100 dice with 2–1,000 sides.
- The math.js **parsed AST** is cached, not `math.compile()` output: the custom evaluator is needed to preserve `DiceResult` values through `dl`/`kh` and only convert them to numeric totals for arithmetic.
