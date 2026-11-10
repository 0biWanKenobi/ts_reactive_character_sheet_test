import { CompiledFormula } from '../../wasm/pkg/chumsky_dice';

export type Field = { id: string; formula: string };
export type Sheet = Record<string, Field>;
export type DiceResult = { rolls: number[]; kept: boolean[]; total: number };
export type Resolution = {
  expression: string;
  value: number | boolean | null;
  rollable: boolean;
  dependencies: string[];
};
export type RollOutcome = { total: number; dice: DiceResult[] };

type WasmOutcome = { value: number | boolean; dice: DiceResult[] };
const cache = new Map<string, CompiledFormula>();
const CACHE_LIMIT = 512;
const MAX_FORMULA = 1024;
const MAX_EXPANDED = 65536;

function compile(source: string): CompiledFormula {
  const previous = cache.get(source);
  if (previous) return previous;
  const compiled = new CompiledFormula(source);
  if (cache.size >= CACHE_LIMIT) {
    for (const old of cache.values()) old.free();
    cache.clear();
  }
  cache.set(source, compiled);
  return compiled;
}

export function validateId(id: string): string | null {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id)
    ? null : 'Use letters, digits, and underscores; start with a letter or underscore';
}

export function resolve(sheet: Sheet, id: string): Resolution {
  const expandedCache = new Map<string, string>();
  const dependencies = new Set<string>();
  const stack: string[] = [];

  function expand(name: string): string {
    const cycle = stack.indexOf(name);
    if (cycle !== -1) {
      throw Error('Circular reference: ' + [...stack.slice(cycle), name].join(' → '));
    }
    const field = sheet[name];
    if (!field) throw Error('Unknown field: ' + name);
    const previous = expandedCache.get(name);
    if (previous !== undefined) return previous;
    const formula = field.formula;
    if (formula.length > MAX_FORMULA) throw Error('Formula exceeds 1024 characters');
    const references = compile(formula).dependencies() as string[];

    stack.push(name);
    try {
      let expanded = formula;
      for (const ref of references) {
        dependencies.add(ref);
        const replacement = '(' + expand(ref) + ')';
        expanded = expanded.replaceAll('{' + ref + '}', replacement);
        if (expanded.length > MAX_EXPANDED) throw Error('Expanded formula is too large');
      }
      expandedCache.set(name, expanded);
      return expanded;
    } finally {
      stack.pop();
    }
  }
  const expression = expand(id);
  dependencies.delete(id);
  const formula = compile(expression);
  const rollable = formula.rollable();
  const value = rollable ? null : (formula.evaluate() as WasmOutcome).value;
  return { expression, value, rollable, dependencies: [...dependencies] };
}

export function executeRoll(expression: string): RollOutcome {
  const output = compile(expression).roll() as WasmOutcome;
  if (typeof output.value !== 'number') {
    throw Error('Roll expressions must produce a numeric result');
  }
  return { total: output.value, dice: output.dice };
}
