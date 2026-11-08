import assert from 'node:assert/strict';

const mode = process.argv[2];
assert.ok(['empty', 'demo'].includes(mode), 'Use empty or demo.');
const base = process.env.HOMEBUDGET_URL || 'http://localhost:3001';
const month = new Date().toISOString().slice(0, 7);
const response = await fetch(`${base}/api/v1/household?month=${month}`);
assert.equal(response.status, 200);
const state = await response.json();
if (mode === 'empty') {
  for (const key of ['categories', 'expenses', 'incomes', 'merchants', 'goals', 'meters'])
    assert.equal(state[key].length, 0, `${key} should be empty.`);
} else {
  assert.equal(state.categories.length, 4);
  assert.equal(state.expenses.length, 5);
  assert.equal(state.incomes.length, 1);
  assert.equal(state.merchants.length, 2);
  assert.equal(state.goals.length, 1);
  assert.equal(state.meters.length, 1);
  assert.equal(state.recurring.charges.length, 1);
  assert.equal(state.expenses.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100) * (row.kind === 'REFUND' ? -1 : 1), 0), 141890);
}
assert.equal((await fetch(`${base}/`)).status, 200);
assert.match(await (await fetch(`${base}/LICENSE`)).text(), /MIT License[\s\S]*Maciej Dybowski/);
console.log(`Docker installation (${mode}): API, data and frontend license verified.`);
