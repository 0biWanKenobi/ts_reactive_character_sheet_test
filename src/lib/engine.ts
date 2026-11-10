import { CompiledFormula, FormulaContext } from '@0biwankenobi/dice-wasm';

type Field = { id: string; formula: string };
export type Sheet = Record<string, Field>;
type DiceResult = { rolls: number[]; kept: boolean[]; total: number };
type Resolution = {
  expression: string;
  value: number | boolean | null;
  rollable: boolean;
  dependencies: string[];
};
export type RollOutcome = { total: number; dice: DiceResult[] };

type WasmOutcome = { value: number | boolean; dice: DiceResult[] };
type CachedFormula = { compiled: CompiledFormula; dependencies: string[] };
type SheetContext = { wasm: FormulaContext; sources: Map<string, string> };
const cache = new Map<string, CachedFormula>();
const contexts = new WeakMap<Sheet, SheetContext>();
const CACHE_LIMIT = 512;
const MAX_FORMULA = 1024;
const MAX_DEPTH = 128;
const MAX_VISITS = 100_000;

function compile(source: string): CachedFormula {
  const previous = cache.get(source);
  if (previous) return previous;
  if (source.length > MAX_FORMULA) throw Error('Formula exceeds 1024 characters');
  const compiled = new CompiledFormula(source);
  const entry = { compiled, dependencies: compiled.dependencies() as string[] };
  if (cache.size >= CACHE_LIMIT) {
    for (const old of cache.values()) old.compiled.free();
    cache.clear();
  }
  cache.set(source, entry);
  return entry;
}

export function validateId(id: string): string | null {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id)
    ? null : 'Use letters, digits, and underscores; start with a letter or underscore';
}

function synchronize(sheet: Sheet, id: string): FormulaContext {
  let context = contexts.get(sheet);
  if (!context) {
    context = { wasm: new FormulaContext(), sources: new Map() };
    contexts.set(sheet, context);
  }
  const { wasm, sources } = context;

  const visited = new Set<string>();
  let visits = 0;
  function visit(name: string, depth: number) {
    if (++visits > MAX_VISITS || depth >= MAX_DEPTH) {
      throw Error('Reference graph is too complex');
    }
    if (visited.has(name)) return;
    visited.add(name);
    if (!Object.hasOwn(sheet, name)) {
      wasm.remove(name);
      sources.delete(name);
      throw Error('Unknown field: ' + name);
    }
    // Read every reachable source here, inside the caller's $derived, so Svelte
    // tracks edits even when Rust already owns the compiled expression tree.
    const source = sheet[name].formula;
    const entry = compile(source);
    if (sources.get(name) !== source) {
      wasm.set(name, entry.compiled);
      sources.set(name, source);
    }
    for (const reference of entry.dependencies) visit(reference, depth + 1);
  }
  visit(id, 0);
  return wasm;
}

export function deleteField(sheet: Sheet, id: string) {
  const context = contexts.get(sheet);
  context?.wasm.remove(id);
  context?.sources.delete(id);
  delete sheet[id];
}

export function releaseSheet(sheet: Sheet) {
  contexts.get(sheet)?.wasm.free();
  contexts.delete(sheet);
}

export function resolve(sheet: Sheet, id: string): Resolution {
  const result = synchronize(sheet, id).resolve(id) as Resolution;
  result.value ??= null;
  return result;
}

export function executeRoll(sheet: Sheet, id: string): RollOutcome {
  const output = synchronize(sheet, id).roll(id) as WasmOutcome;
  if (typeof output.value !== 'number') {
    throw Error('Roll expressions must produce a numeric result');
  }
  return { total: output.value, dice: output.dice };
}
