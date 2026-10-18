import { all, create, type SymbolNode, type FunctionNode, type MathNode, type OperatorNodeFn } from 'mathjs';
import type { ExtendedMathJsInstance } from '../../math';
type Field = { id: string; formula: string };
export type Sheet = Record<string, Field>;
type DiceResult = { rolls: number[]; kept: boolean[]; total: number };
export type Resolution = {
  expression: string;
  value: number | boolean | null;
  rollable: boolean;
  dependencies: string[];
};
export type RollOutcome = { total: number; dice: DiceResult[] };

const math = create(all) as ExtendedMathJsInstance;
const functions = new Set(['floor', 'ceil', 'round', 'abs', 'min', 'max', 'sqrt', 'roll', 'dl', 'kh']);
const operators: Set<OperatorNodeFn> = new Set(['add', 'subtract', 'multiply', 'divide', 'unaryMinus', 'unaryPlus', 'pow', 'mod', 'equal', 'larger', 'smaller', 'largerEq', 'smallerEq']);
const constants = new Set(['pi', 'e']);
const parseCache = new Map<string, MathNode>();
const compileCache = new Map<string, ReturnType<MathNode['compile']>>();
const MAX_FORMULA = 1024;

const typed = math.typed;

// DiceResult is an internal type: 'rolls' uniquely identifies it in our evaluator.
typed.addType({
  name: 'DiceResult',
  test: (value): value is DiceResult =>
    value !== null && typeof value === 'object' && 'rolls' in value
});
typed.addConversion<DiceResult>({
  from: 'DiceResult',
  to: 'number',
  convert: (result) => result.total
});

function digit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}
function ident(c: string | undefined): boolean {
  return c !== undefined &&
    ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || digit(c) || c === '_');
}
function normalizeDice(input: string): string {
  let out = '';
  for (let i = 0; i < input.length;) {
    if ((i === 0 || !ident(input[i - 1])) && digit(input[i])) {
      let mid = i;
      while (digit(input[mid])) mid++;
      if (input[mid] === 'd' || input[mid] === 'D') {
        let end = mid + 1;
        while (digit(input[end])) end++;
        if (end > mid + 1 && !ident(input[end])) {
          out += `roll(${input.slice(i, mid)},${input.slice(mid + 1, end)})`;
          i = end;
          continue;
        }
      }
    }
    out += input[i++];
  }
  return out;
}
export function validateId(id: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id))
    return 'Use letters, digits, and underscores; start with a letter or underscore';
  if (functions.has(id) || constants.has(id))
    return 'Name is reserved by the formula language';
  return null;
}

function fnName(node: FunctionNode<MathNode>): string {
  const fn = node.fn;
  if (!math.isSymbolNode(fn)) throw Error('Unsupported function syntax');
  return fn.name;
}
function parsed(formula: string): MathNode {
  if (formula.length > MAX_FORMULA) throw Error('Formula exceeds 1024 characters');
  const cached = parseCache.get(formula);
  if (cached) return cached;
  const ast = math.parse(normalizeDice(formula));
  let count = 0;
  ast.traverse((node) => {
    if (++count > 500) throw Error('Formula is too complex');
    if (node.type === 'OperatorNode') {
      const op = node.fn;
      if (!operators.has(op)) throw Error(`Unsupported operator: ${op}`);
    } else if (node.type === 'FunctionNode') {
      if (!functions.has(fnName(node))) throw Error(`Unsupported function: ${fnName(node)}`);
    } else if (!['ConstantNode', 'SymbolNode', 'ParenthesisNode', 'ConditionalNode'].includes(node.type)) {
      throw Error(`Unsupported syntax: ${node.type}`);
    }
  });
  if (parseCache.size >= 1000) parseCache.clear();
  parseCache.set(formula, ast);
  return ast;
}
function compiled(expression: string): ReturnType<MathNode['compile']> {
  const cached = compileCache.get(expression);
  if (cached) return cached;
  // Validation occurs before compilation, including for expanded formulas.
  const result = parsed(expression).compile();
  if (compileCache.size >= 1000) compileCache.clear();
  compileCache.set(expression, result);
  return result;
}
function sum(rolls: number[], kept: boolean[]): number {
  return rolls.reduce((total, value, i) => total + (kept[i] ? value : 0), 0);
}
function dice(count: number, sides: number): DiceResult {
  if (!Number.isInteger(count) || count < 1 || count > 100 ||
      !Number.isInteger(sides) || sides < 2 || sides > 1000)
    throw Error('Dice must have 1–100 rolls and 2–1000 sides');
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const kept = rolls.map(() => true);
  return { rolls, kept, total: sum(rolls, kept) };
}
function selectDice(value: DiceResult, amount: number, mode: 'dl' | 'kh'): DiceResult {
  if (!Number.isInteger(amount) || amount < 0 || amount > value.rolls.length)
    throw Error('Invalid keep/drop count');
  const order = value.rolls.map((_, i) => i).sort((a, b) =>
    mode === 'dl' ? value.rolls[a] - value.rolls[b] : value.rolls[b] - value.rolls[a]);
  const kept = value.rolls.map(() => mode === 'dl');
  for (let i = 0; i < amount; i++) kept[order[i]] = mode === 'kh';
  return { rolls: [...value.rolls], kept, total: sum(value.rolls, kept) };
}
function finite(value: number): number {
  if (!Number.isFinite(value)) throw Error('Non-finite result');
  return value;
}
function baseValue(value: unknown): number | boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return finite(value);
  if (value !== null && typeof value === 'object' && 'rolls' in value)
    return finite((value as DiceResult).total);
  throw Error('Expression must produce a number or boolean');
}
function rollable(ast: MathNode): boolean {
  let found = false;
  ast.traverse((node) => {
    if (node.type === 'FunctionNode' && fnName(node) === 'roll') found = true;
  });
  return found;
}

export function resolve(sheet: Sheet, id: string): Resolution {
  const memo = new Map<string, MathNode>();
  const dependencies = new Set<string>();
  const stack: string[] = [];
  const walk = (name: string): MathNode => {
    const cycle = stack.indexOf(name);
    if (cycle !== -1)
      throw Error(`Circular reference: ${[...stack.slice(cycle), name].join(' → ')}`);
    if (!Object.hasOwn(sheet, name)) throw Error(`Unknown field: ${name}`);
    const cached = memo.get(name);
    if (cached) return cached;
    stack.push(name);
    try {
      // Reactive access: Svelte tracks the referenced field's formula.
      const ast = parsed(sheet[name].formula);
      const expanded = ast.transform((node, _path, parent) => {
        if (node.type !== 'SymbolNode') return node;
        if (parent?.type === 'FunctionNode' &&
            (parent as MathNode & { fn: MathNode }).fn === node) return node;
        const symbol = (node as MathNode & { name: string }).name;
        if (constants.has(symbol)) return node;
        dependencies.add(symbol);
        return new math.ParenthesisNode(walk(symbol));
      });
      memo.set(name, expanded);
      return expanded;
    } finally {
      stack.pop();
    }
  };
  const ast = walk(id);
  dependencies.delete(id);
  const expression = ast.toString();
  const hasDice = rollable(ast);
  return {
    expression,
    value: hasDice ? null : baseValue(compiled(expression).evaluate()),
    rollable: hasDice,
    dependencies: [...dependencies]
  };
}

export function executeRoll(expression: string): RollOutcome {
  const diceLog: DiceResult[] = [];
  const scope = new Map<string, unknown>();

  scope.set('roll', typed('roll', {
    'number, number': (count: number, sides: number) => {
      const result = dice(count, sides);
      diceLog.push(result);
      return result;
    }
  }));
  for (const mode of ['dl', 'kh'] as const) {
    scope.set(mode, typed(mode, {
      'DiceResult, number': (pool: DiceResult, amount: number) => {
        const result = selectDice(pool, amount, mode);
        const index = diceLog.lastIndexOf(pool);
        if (index >= 0) diceLog[index] = result;
        return result;
      }
    }));
  }

  const result: unknown = compiled(expression).evaluate(scope);
  if (typeof result === 'boolean')
    throw Error('Roll expressions must produce a numeric result');
  const total = baseValue(result);
  if (typeof total !== 'number') throw Error('Roll expressions must produce a numeric result');
  return { total, dice: diceLog };
}
