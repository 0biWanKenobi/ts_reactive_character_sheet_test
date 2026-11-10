import assert from 'node:assert/strict';
import test from 'node:test';
import { CompiledFormula, FormulaContext } from '@0biwankenobi/dice-wasm';
import { deleteField, executeRoll, releaseSheet, resolve } from '../src/lib/engine.ts';

const makeSheet = (entries) => Object.fromEntries(
  Object.entries(entries).map(([id, formula]) => [id, { id, formula }]),
);
function withRandom(random, action) {
  const previous = Math.random;
  Math.random = random;
  try { return action(); }
  finally { Math.random = previous; }
}

test('nested deterministic references and booleans collapse to typed values', () => {
  const sheet = makeSheet({ A: '2 + 3', B: '{A} * 4', C: '{B} > 19', D: '{C} + 2' });
  try {
    assert.deepEqual(resolve(sheet, 'B'), { expression: '20', value: 20, rollable: false, dependencies: ['A'] });
    assert.equal(resolve(sheet, 'C').value, true);
    assert.equal(resolve(sheet, 'D').value, 3);
    sheet.A.formula = '10';
    assert.equal(resolve(sheet, 'B').value, 40);
  } finally { releaseSheet(sheet); }
});

test('preview folds deterministic parts without calling the random generator', () => {
  const sheet = makeSheet({ STAT: '18', MOD: 'floor(({STAT} - 10) / 2)', ROOT: 'dl(3d6, 1) + {MOD}' });
  try {
    withRandom(() => { throw Error('preview attempted to roll'); }, () => {
      const result = resolve(sheet, 'ROOT');
      assert.equal(result.expression, 'dl(3d6, 1) + 4');
      assert.equal(result.rollable, true);
      assert.equal(result.value, null);
    });
  } finally { releaseSheet(sheet); }
});

test('referenced dice pools retain keep/drop metadata and roll independently', () => {
  const sheet = makeSheet({ POOL: '3d6', DROP: 'dl({POOL}, 1) + 4', TWICE: '{POOL} + {POOL}' });
  try {
    let calls = 0;
    withRandom(() => { calls++; return 0; }, () => {
      const dropped = executeRoll(sheet, 'DROP');
      assert.equal(dropped.total, 6);
      assert.equal(dropped.dice.length, 1);
      assert.deepEqual(dropped.dice[0].kept, [false, true, true]);
      calls = 0;
      const twice = executeRoll(sheet, 'TWICE');
      assert.equal(twice.total, 6);
      assert.equal(twice.dice.length, 2);
      assert.equal(calls, 6);
    });
  } finally { releaseSheet(sheet); }
});

test('conditional reduction preserves lazy errors and discards inactive dice', () => {
  const sheet = makeSheet({ SAFE: '0 ? sqrt(-1) : 3', CONSTANT: '1 ? 7 : 2d6', CHOICE: '1d6 > 3 ? sqrt(-1) : 2 + 3' });
  try {
    assert.equal(resolve(sheet, 'SAFE').value, 3);
    assert.equal(resolve(sheet, 'CONSTANT').rollable, false);
    assert.equal(resolve(sheet, 'CHOICE').expression, '1d6 > 3 ? sqrt(-1) : 5');
    withRandom(() => 0, () => assert.equal(executeRoll(sheet, 'CHOICE').total, 5));
    withRandom(() => 0.99, () => assert.throws(() => executeRoll(sheet, 'CHOICE'), /Non-finite result/));
  } finally { releaseSheet(sheet); }
});

test('reference edits, cycles, deletion, and recreation update existing contexts', () => {
  const sheet = makeSheet({ A: '3', B: '{A} * 4' });
  try {
    assert.equal(resolve(sheet, 'B').value, 12);
    sheet.A.formula = '{B}';
    assert.throws(() => resolve(sheet, 'B'), /Circular reference/);
    delete sheet.A;
    assert.throws(() => resolve(sheet, 'B'), /Unknown field: A/);
    sheet.A = { id: 'A', formula: '5' };
    assert.equal(resolve(sheet, 'B').value, 20);
    deleteField(sheet, 'A');
    assert.throws(() => resolve(sheet, 'B'), /Unknown field: A/);
    sheet.A = { id: 'A', formula: '6' };
    assert.equal(resolve(sheet, 'B').value, 24);
  } finally { releaseSheet(sheet); }
});

test('shared AST bindings survive compiled-formula cache eviction', () => {
  const sheet = makeSheet({ A: '0', B: '{A} * 4' });
  try {
    for (let n = 0; n < 520; n++) {
      sheet.A.formula = String(n);
      assert.equal(resolve(sheet, 'B').value, n * 4);
    }
  } finally { releaseSheet(sheet); }
});

test('dependency diamonds collapse without constructing exponentially large strings', () => {
  const sheet = makeSheet({ N0: '1' });
  for (let n = 1; n < 50; n++) sheet['N' + n] = { id: 'N' + n, formula: `{N${n - 1}} + {N${n - 1}}` };
  try {
    assert.equal(resolve(sheet, 'N49').value, 562949953421312);
    assert.equal(resolve(sheet, 'N49').dependencies.length, 49);
  } finally { releaseSheet(sheet); }
});

test('formatted expressions preserve operation order and dice logs when parsed', () => {
  for (const source of [
    '(1d6 + 2) * 3', '1d6 - (1d6 - 2)', '1d6 / (1d6 / 2)',
    '((1d6) ^ 2) ^ 3', '(1d6) ^ ((1d6) ^ 2)',
    '(1d6) ^ -2', '(-2) ^ (1d6)',
    'kh(4d8, 2) + dl(3d6, 1)', '1d6 > 3 ? 1d8 + 2 : 1d4 * 2',
  ]) {
    const sheet = makeSheet({ ROOT: source });
    let printed;
    try {
      printed = new CompiledFormula(resolve(sheet, 'ROOT').expression);
      const original = withRandom(() => 0.4, () => executeRoll(sheet, 'ROOT'));
      const reparsed = withRandom(() => 0.4, () => printed.roll());
      assert.deepEqual({ total: reparsed.value, dice: reparsed.dice }, original, source);
    } finally { printed?.free(); releaseSheet(sheet); }
  }
});

test('context retains compiled trees after the original WASM handle is freed', () => {
  const context = new FormulaContext();
  const formula = new CompiledFormula('2 + 3');
  try {
    context.set('A', formula);
    formula.free();
    assert.equal(context.resolve('A').value, 5);
    context.remove('A');
    assert.throws(() => context.resolve('A'), /Unknown field/);
  } finally { context.free(); }
});
