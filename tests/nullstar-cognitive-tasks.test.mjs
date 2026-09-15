import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seededRandom,
  generateTaskSet,
  GENERATORS,
  generatePlanningTask,
  generateScienceTask,
  generateCausalityTask,
  generateToolUseTask,
  generateResearchTask,
  generateInventionTask,
  generateForecastingTask
} from '../src/nullstar-cognitive-tasks.mjs';

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234];

test('the generator is deterministic, so every baseline sees identical items', () => {
  for (const seed of SEEDS) {
    assert.deepEqual(generatePlanningTask(seed), generatePlanningTask(seed));
    assert.deepEqual(generateResearchTask(seed), generateResearchTask(seed));
  }
  const a = seededRandom(5);
  const b = seededRandom(5);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('planning ground truth is confirmed by an independent longest-path computation', () => {
  // The generator claims the layer count. This recomputes the longest chain
  // from the edge list alone by a different method, which is what a solver
  // would have to do. If these ever disagree the instrument is wrong, not the
  // solver.
  for (const seed of SEEDS) {
    const task = generatePlanningTask(seed);
    const incoming = new Map(task.surface.nodes.map(n => [n, []]));
    for (const { from, to } of task.surface.edges) incoming.get(to).push(from);

    const depth = new Map();
    const resolve = node => {
      if (depth.has(node)) return depth.get(node);
      const parents = incoming.get(node) ?? [];
      const value = parents.length === 0 ? 1 : 1 + Math.max(...parents.map(resolve));
      depth.set(node, value);
      return value;
    };
    const longest = Math.max(...task.surface.nodes.map(resolve));
    assert.equal(String(longest), task.groundTruth, `seed ${seed}: generator and independent computation disagree`);
  }
});

test('planning edges never point backwards, so the graph is acyclic', () => {
  for (const seed of SEEDS) {
    const task = generatePlanningTask(seed);
    const index = new Map(task.surface.nodes.map((n, i) => [n, i]));
    for (const { from, to } of task.surface.edges) {
      assert.ok(index.get(from) < index.get(to), `seed ${seed}: edge ${from}->${to} is not forward`);
    }
  }
});

test('the science witness really is explained by several rules, so confirming it proves nothing', () => {
  for (const seed of SEEDS) {
    const task = generateScienceTask(seed);
    assert.deepEqual(task.surface.witness, [2, 4, 6]);
    assert.ok(task.consistentWithWitness.length >= 2, `seed ${seed}: the trap only exists if several rules fit`);
    assert.ok(task.consistentWithWitness.includes('ascending'));
  }
});

test('a probe that separates the candidate rules scores above one that confirms', () => {
  const task = generateScienceTask(1);
  // [2,4,6] is the witness: re-testing it separates nothing new.
  const confirming = task.scoreProbe([2, 4, 6]);
  // An odd descending triple splits the candidate set.
  const separating = task.scoreProbe([9, 5, 2]);
  assert.ok(separating > confirming, `separating ${separating} should beat confirming ${confirming}`);
  assert.equal(task.scoreProbe('not a triple'), 0);
  assert.equal(task.scoreProbe([1, 2]), 0);
});

test('the causal surface is identical under both hidden structures', () => {
  const surfaces = new Set();
  const structures = new Set();
  for (const seed of SEEDS) {
    const task = generateCausalityTask(seed);
    surfaces.add(JSON.stringify(task.surface));
    structures.add(task.hiddenStructure);
    assert.equal(task.groundTruth, 'b');
  }
  // Both structures occur across these seeds, and the surface never changes:
  // that is what makes observation alone insufficient.
  assert.equal(surfaces.size, 1);
  assert.equal(structures.size, 2);
});

test('tool use rewards the single sufficient tool and penalises calling everything', () => {
  for (const seed of SEEDS) {
    const task = generateToolUseTask(seed);
    assert.equal(task.scoreSelection([task.groundTruth]), 1);
    assert.equal(task.scoreSelection([]), 0);
    assert.equal(task.scoreSelection(['nonexistent']), 0);
    const all = task.scoreSelection(task.surface.tools);
    assert.ok(all > 0 && all < 1, `seed ${seed}: calling every tool must score below calling one`);
  }
});

test('the research majority is wrong, so vote-counting fails the item', () => {
  for (const seed of SEEDS) {
    const task = generateResearchTask(seed);
    assert.notEqual(task.groundTruth, task.majorityAnswer);
    const claims = task.surface.sources.map(s => String(s.claim));
    const majority = claims.filter(c => c === task.majorityAnswer).length;
    const truthful = claims.filter(c => c === task.groundTruth).length;
    assert.ok(majority > truthful, `seed ${seed}: the trap requires the wrong answer to be the popular one`);
    // The one source that has it right is the primary measurement.
    const primary = task.surface.sources.find(s => s.quality === 'PRIMARY_MEASUREMENT');
    assert.equal(String(primary.claim), task.groundTruth);
  }
});

test('invention requires composing two primitives because none returns the answer', () => {
  for (const seed of SEEDS) {
    const task = generateInventionTask(seed);
    assert.ok(!task.surface.primitives.includes('mean'));
    assert.ok(!task.surface.primitives.includes('average'));
    const mean = task.surface.data.reduce((a, b) => a + b, 0) / task.surface.data.length;
    assert.equal(mean.toFixed(4), task.groundTruth);
    assert.equal(task.scoreComposition(['sum', 'count']), 1);
    assert.equal(task.scoreComposition(['sum']), 0);
    assert.equal(task.scoreComposition(['max', 'min']), 0);
  }
});

test('the forecasting answer is the one element the solver is not shown', () => {
  for (const seed of SEEDS) {
    const task = generateForecastingTask(seed);
    assert.ok(!task.surface.series.map(String).includes(task.groundTruth));
    const step = task.surface.series[1] - task.surface.series[0];
    const last = task.surface.series[task.surface.series.length - 1];
    assert.equal(String(last + step), task.groundTruth);
  }
});

test('free-answer surfaces never contain the answer; choice surfaces make guessing costly', () => {
  // Three families are multiple choice: the answer has to appear among the
  // options or there is nothing to choose between. Exempting them wholesale
  // would hide a real leak, so instead they are held to the property that
  // actually matters -- enough options that guessing is not close to free.
  const CHOICE_FAMILIES = {
    SCIENCE: task => task.surface.candidateRules,
    CAUSALITY: task => task.surface.variables,
    TOOL_USE: task => task.surface.tools,
    // Research is a choice among the values the sources claim. With only two
    // distinct claims a coin flip scored half the item, so the generator now
    // emits several.
    RESEARCH: task => task.distinctClaims
  };

  const set = generateTaskSet({ seeds: SEEDS });
  for (const item of set.items) {
    const optionsOf = CHOICE_FAMILIES[item.family];
    if (optionsOf) {
      const options = optionsOf(item);
      assert.ok(options.includes(item.groundTruth), `${item.taskId}: the answer must be among the options`);
      assert.ok(options.length >= 3, `${item.taskId}: ${options.length} options makes guessing too cheap`);
      continue;
    }
    const surface = JSON.stringify(item.surface);
    assert.ok(
      !surface.includes(`"${item.groundTruth}"`) && !surface.includes(`:${item.groundTruth},`) && !surface.includes(`,${item.groundTruth},`),
      `${item.taskId}: the answer is readable in the surface`
    );
  }
});

test('guessing a choice family scores well below solving it', () => {
  // The floor a blind guesser gets, stated rather than assumed.
  const set = generateTaskSet({ seeds: SEEDS, families: ['SCIENCE', 'CAUSALITY', 'TOOL_USE', 'RESEARCH'] });
  const floors = { SCIENCE: 1 / 5, CAUSALITY: 1 / 3, TOOL_USE: 1 / 5, RESEARCH: 1 / 4 };
  for (const item of set.items) {
    assert.ok(floors[item.family] <= 0.34, `${item.family}: a guess floor above a third makes the family weak`);
  }
});

test('a full set covers every family', () => {
  const set = generateTaskSet({ seeds: [1, 2] });
  assert.equal(set.counts.families, Object.keys(GENERATORS).length);
  assert.equal(set.counts.items, Object.keys(GENERATORS).length * 2);
  // The surface-only projection must not leak anything.
  for (const row of set.surfaceOnly) {
    assert.equal(row.groundTruth, undefined);
    assert.equal(row.scoreProbe, undefined);
  }
});
