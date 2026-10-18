import { all, ConditionalNode, create, type MathNode } from 'mathjs';
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
const math = create(all);
const functions = new Set(['floor', 'ceil', 'round', 'abs', 'min', 'max', 'sqrt', 'roll', 'dl', 'kh']);
const operators = new Set(['add', 'subtract', 'multiply', 'divide', 'unaryMinus', 'unaryPlus', 'pow', 'mod', 'equal', 'larger', 'smaller', 'largerEq', 'smallerEq']);
const constants: Record<string, number> = { pi: Math.PI, e: Math.E };
const parseCache = new Map<string, MathNode>();
const MAX_FORMULA = 1024;
function digit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}
function ident(c: string | undefined): boolean {
  return (
    c !== undefined &&
    ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || digit(c) || c === '_')
  );
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
  if (functions.has(id) || Object.hasOwn(constants, id))
    return 'Name is reserved by the formula language';
  return null;
}
function fnName(node: MathNode): string {
  const n = node as MathNode & { fn: MathNode };
  if (n.fn.type !== 'SymbolNode') throw Error('Unsupported function syntax');
  return (n.fn as MathNode & { name: string }).name;
}
function parsed(formula: string): MathNode {
  if (formula.length > MAX_FORMULA)
    throw Error('Formula exceeds 1024 characters');
  const cached = parseCache.get(formula);
  if (cached) return cached;
  const ast = math.parse(normalizeDice(formula));
  let count = 0;
  ast.traverse((node) => {
    if (++count > 500) throw Error('Formula is too complex');
    if (node.type === 'OperatorNode') {
      if (!operators.has((node as MathNode & { fn: string }).fn))
        throw Error('Unsupported operator ' + (node as any).fn);
    } else if (node.type === 'FunctionNode') {
      if (!functions.has(fnName(node)))
        throw Error(`Unsupported function: ${fnName(node)}`);
    } else if (
      ![
        'ConstantNode',
        'SymbolNode',
        'ParenthesisNode',
        'ConditionalNode',
      ].includes(node.type)
    ) {
      throw Error(`Unsupported syntax: ${node.type}`);
    }
  });
  if (parseCache.size >= 1000) parseCache.clear();
  parseCache.set(formula, ast);
  return ast;
}
function sum(rolls: number[], kept: boolean[]): number {
  return rolls.reduce((total, value, i) => total + (kept[i] ? value : 0), 0);
}
function dice(count: number, sides: number): DiceResult {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100 ||
    !Number.isInteger(sides) ||
    sides < 2 ||
    sides > 1000
  ) {
    throw Error('Dice must have 1–100 rolls and 2–1000 sides');
  }
  const rolls = Array.from(
    { length: count },
    () => 1 + Math.floor(Math.random() * sides)
  );
  const kept = rolls.map(() => true);
  return { rolls, kept, total: sum(rolls, kept) };
}
function selectDice(
  value: DiceResult,
  amount: number,
  mode: 'dl' | 'kh'
): DiceResult {
  if (!Number.isInteger(amount) || amount < 0 || amount > value.rolls.length)
    throw Error('Invalid keep/drop count');
  const order = value.rolls
    .map((_, i) => i)
    .sort((a, b) =>
      mode === 'dl'
        ? value.rolls[a] - value.rolls[b]
        : value.rolls[b] - value.rolls[a]
    );
  const kept = value.rolls.map(() => mode === 'dl');
  for (let i = 0; i < amount; i++) kept[order[i]] = mode === 'kh';
  return { rolls: [...value.rolls], kept, total: sum(value.rolls, kept) };
}
function numeric(v: number | boolean | DiceResult): number {
  switch (typeof v) {
    case 'number':
    case 'boolean':
      return Number(v);
    default:
      return v.total;
  }
}
function finite(v: number): number {
  if (!Number.isFinite(v)) throw Error('Non-finite result');
  return v;
}
type Value = number | boolean | DiceResult;
function evaluateNode(
  ast: MathNode,
  scope: (name: string) => number,
  diceLog: DiceResult[],
  allowDice: boolean
): Value {
  switch (ast.type) {
    case 'ConditionalNode': {
      const n = ast as ConditionalNode;
      const conditionValue = evaluateNode(
        n.condition,
        scope,
        diceLog,
        allowDice
      );
      return evaluateNode(
        conditionValue ? n.trueExpr : n.falseExpr,
        scope,
        diceLog,
        allowDice
      );
    }
    case 'ConstantNode':
      return (ast as MathNode & { value: number | boolean }).value;
    case 'SymbolNode': {
      const name = (ast as MathNode & { name: string }).name;
      return Object.hasOwn(constants, name) ? constants[name] : scope(name);
    }
    case 'ParenthesisNode':
      return evaluateNode(
        (ast as MathNode & { content: MathNode }).content,
        scope,
        diceLog,
        allowDice
      );
    case 'OperatorNode': {
      const node = ast as MathNode & { fn: string; args: MathNode[] };
      const args = node.args.map((part) =>
        numeric(evaluateNode(part, scope, diceLog, allowDice))
      );
      switch (node.fn) {
        case 'add':
          return finite(args[0] + args[1]);
        case 'subtract':
          return finite(args[0] - args[1]);
        case 'multiply':
          return finite(args[0] * args[1]);
        case 'divide':
          return finite(args[0] / args[1]);
        case 'pow':
          return finite(args[0] ** args[1]);
        case 'mod':
          return finite(args[0] % args[1]);
        case 'unaryMinus':
          return -args[0];
        case 'unaryPlus':
          return args[0];
        case 'equal':
            return args[0] === args[1];
        case 'larger':
          return args[0] > args[1];
        case 'smaller':
          return args[0] < args[1];
        case 'smallerEq':
          return args[0] <= args[1];
        case 'largerEq':
          return args[0] >= args[1];
      }
      throw Error('Unsupported operator' + node.fn);
    }
    case 'FunctionNode': {
      const node = ast as MathNode & { args: MathNode[] };
      const fn = fnName(ast);
      const args = node.args.map((part) =>
        evaluateNode(part, scope, diceLog, allowDice)
      );
      if (fn === 'roll') {
        if (!allowDice) throw Error('Roll requires an explicit action');
        if (args.length !== 2)
          throw Error('roll(count,sides) requires two arguments');
        const result = dice(numeric(args[0]), numeric(args[1]));
        diceLog.push(result);
        return result;
      }
      if (fn === 'dl' || fn === 'kh') {
        if (
          args.length !== 2 ||
          typeof args[0] === 'number' ||
          typeof args[0] === 'boolean'
        )
          throw Error(`${fn} requires a dice result and a count`);
        const result = selectDice(args[0], numeric(args[1]), fn);
        const position = diceLog.lastIndexOf(args[0]);
        if (position >= 0) diceLog[position] = result;
        return result;
      }
      const numbers = args.map(numeric);
      switch (fn) {
        case 'floor':
          return Math.floor(numbers[0]);
        case 'ceil':
          return Math.ceil(numbers[0]);
        case 'round':
          return Math.round(numbers[0]);
        case 'abs':
          return Math.abs(numbers[0]);
        case 'min':
          return Math.min(...numbers);
        case 'max':
          return Math.max(...numbers);
        case 'sqrt':
          return finite(Math.sqrt(numbers[0]));
      }
      throw Error(`Unsupported function: ${fn}`);
    }
  }
  throw Error(`Unsupported syntax: ${ast.type}`);
}
function toBaseType(value: Value): number | boolean {
  return typeof value === "boolean"
    ? value
    : finite(numeric(value));
}
function rollable(ast: MathNode): boolean {
  let hasDice = false;
  ast.traverse((node) => {
    if (node.type === 'FunctionNode' && fnName(node) === 'roll') hasDice = true;
  });
  return hasDice;
}
export function resolve(sheet: Sheet, id: string): Resolution {
  const memo = new Map<string, MathNode>();
  const dependencies = new Set<string>();
  const stack: string[] = [];
  const walk = (name: string): MathNode => {
    const cycle = stack.indexOf(name);
    if (cycle !== -1)
      throw Error(
        `Circular reference: ${[...stack.slice(cycle), name].join(' → ')}`
      );
    if (!Object.hasOwn(sheet, name)) throw Error(`Unknown field: ${name}`);
    const cached = memo.get(name);
    if (cached) return cached;
    stack.push(name);
    try {
      const ast = parsed(sheet[name].formula);
      const expanded = ast.transform((node, _path, parent) => {
        if (node.type !== 'SymbolNode') return node;
        if (
          parent?.type === 'FunctionNode' &&
          (parent as MathNode & { fn: MathNode }).fn === node
        )
          return node;
        const symbol = (node as MathNode & { name: string }).name;
        if (Object.hasOwn(constants, symbol)) return node;
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
  const hasDice = rollable(ast);
  const value = hasDice
    ? null
    : toBaseType(
      evaluateNode(
        ast,
        () => {
          throw Error('Unresolved reference');
        },
        [],
        false
      )
    );
  return {
    expression: ast.toString(),
    value,
    rollable: hasDice,
    dependencies: [...dependencies],
  };
}

export function executeRoll(expression: string): RollOutcome {
  const ast = parsed(expression);
  const diceLog: DiceResult[] = [];

  const result = evaluateNode(
    ast,
    name => {
      throw Error(`Unresolved field: ${name}`);
    },
    diceLog,
    true
  );

  if (typeof result === 'boolean') {
    throw Error('Roll expressions must produce a numeric result');
  }

  return {
    total: finite(numeric(result)),
    dice: diceLog
  };
}