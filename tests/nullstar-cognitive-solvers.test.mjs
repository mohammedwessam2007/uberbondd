import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTaskSet, GENERATORS } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, TRIVIAL_SOLVERS, scoreItem, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234];
const set = () => generateTaskSet({ seeds: SEEDS });

test('a solver is handed the surface and the prompt, never the item', () => {
  // The whole separation from the retired corpus rests on this. If the item
  // crossed the boundary a solver could read groundTruth and score perfectly
  // without solving anything.
  const seen = [];
  const spy = { PLANNING: (...args) => { seen.push(args); return '0'; } };
  const planning = set().items.filter(item => item.family === 'PLANNING');
  scoreItem(planning[0], spy);

  assert.equal(seen.length, 1);
  const [surface, prompt] = seen[0];
  assert.equal(seen[0].length, 2, 'only two arguments may cross the boundary');
  assert.equal(surface.groundTruth, undefined);
  assert.equal(surface.scoreProbe, undefined);
  assert.equal(typeof prompt, 'string');
  // Whether the answer is readable in the surface is a property of the item,
  // tested against precise patterns in the tasks suite. A substring check here
  // would fail on a chain length of 4 appearing inside the node name "n4".
});

test('the deterministic solvers separate cleanly from the trivial baseline', () => {
  const items = set().items;
  const uberbond = scoreTaskSet(items, UBERBOND_SOLVERS);
  const trivial = scoreTaskSet(items, TRIVIAL_SOLVERS);
  assert.ok(uberbond.mean > trivial.mean + 0.5, `${uberbond.mean} must clear ${trivial.mean} by a wide margin`);
  // The retired corpus could not do this: a constant scored half of it.
  assert.ok(trivial.mean < 0.25, `a no-capability baseline scoring ${trivial.mean} would mean the suite is weak`);
});

test('every family is separated, not just the aggregate', () => {
  const items = set().items;
  const uberbond = scoreTaskSet(items, UBERBOND_SOLVERS);
  const trivial = scoreTaskSet(items, TRIVIAL_SOLVERS);
  for (const family of Object.keys(GENERATORS)) {
    assert.ok(
      uberbond.byFamily[family].mean > trivial.byFamily[family].mean,
      `${family}: ${uberbond.byFamily[family].mean} does not beat trivial ${trivial.byFamily[family].mean}`
    );
  }
});

test('a solver that throws scores zero rather than crashing the run', () => {
  const item = set().items[0];
  const result = scoreItem(item, { [item.family]: () => { throw new Error('boom'); } });
  assert.equal(result.score, 0);
  assert.match(result.reason, /SOLVER_THREW/);
});

test('a missing solver scores zero and says so', () => {
  const item = set().items[0];
  assert.equal(scoreItem(item, {}).reason, 'NO_SOLVER');
});

test('invention needs the right number by the right route', () => {
  const item = set().items.find(row => row.family === 'INVENTION');
  const rightAnswerWrongRoute = scoreItem(item, { INVENTION: () => ({ answer: item.groundTruth, used: ['max'] }) });
  const bothRight = scoreItem(item, { INVENTION: surface => {
    const total = surface.data.reduce((a, b) => a + b, 0);
    return { answer: (total / surface.data.length).toFixed(4), used: ['sum', 'count'] };
  } });
  assert.equal(bothRight.score, 1);
  assert.equal(rightAnswerWrongRoute.score, 0.5, 'the right number by the wrong route is half credit, not full');
});

test('research is not solved by taking the first source', () => {
  const items = set().items.filter(row => row.family === 'RESEARCH');
  const firstSource = scoreTaskSet(items, { RESEARCH: surface => String(surface.sources[0].claim) });
  assert.ok(firstSource.mean < 0.5, `taking sources[0] scores ${firstSource.mean}; position must not encode quality`);
});

test('research is not solved by counting votes', () => {
  const items = set().items.filter(row => row.family === 'RESEARCH');
  const majority = scoreTaskSet(items, { RESEARCH: surface => {
    const tally = new Map();
    for (const source of surface.sources) tally.set(String(source.claim), (tally.get(String(source.claim)) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } });
  assert.equal(majority.mean, 0, 'the popular answer is wrong by construction');
});

test('planning is not solved by counting nodes', () => {
  const items = set().items.filter(row => row.family === 'PLANNING');
  const nodeCount = scoreTaskSet(items, { PLANNING: surface => String(surface.nodes.length) });
  assert.ok(nodeCount.mean < 0.2, `counting nodes scores ${nodeCount.mean}; the chain length must require the edges`);
});

test('scoring reports per family as well as in aggregate', () => {
  const result = scoreTaskSet(set().items, UBERBOND_SOLVERS);
  assert.equal(Object.keys(result.byFamily).length, Object.keys(GENERATORS).length);
  assert.equal(result.items, SEEDS.length * Object.keys(GENERATORS).length);
  assert.ok(result.rows.every(row => typeof row.score === 'number'));
});
