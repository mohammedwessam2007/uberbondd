// Tasks where the truth is planted by a generator and has to be found.
//
// The retired corpus asked questions whose answers were reads of the same file
// the question came from, so the tree was compared to itself. These are built
// the other way round: a seeded generator constructs a structure and therefore
// knows the answer by construction, and a solver sees only the surface. The
// answer path is the generator; the observation path is the solver. They
// cannot coincide, because the solver is never shown what the generator kept.
//
// Everything here is deterministic given a seed, so a run is reproducible and
// a trivial baseline can be scored on exactly the same items.

export const NULLSTAR_COGNITIVE_TASKS_VERSION = 'uberbond.nullstar-cognitive-tasks.v1';

/**
 * A small deterministic PRNG. Seeded so every baseline sees identical items.
 *
 * The seed is mixed and the stream warmed before anything is handed out.
 * Without that, a raw xorshift over a small seed returns a near-zero first
 * value for every seed in a normal range -- which silently pinned every
 * generator's first decision. Science chose the same hidden rule every time
 * and causality drew CHAIN for every seed, so two of the seven families were
 * measuring a constant.
 */
export function seededRandom(seed) {
  // Mix the seed so nearby seeds do not produce nearby streams.
  let state = (Number(seed) >>> 0) || 1;
  state = Math.imul(state ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  state ^= state >>> 13;
  state = Math.imul(state, 0xc2b2ae35) >>> 0;
  state ^= state >>> 16;
  if (state === 0) state = 0x6d2b79f5;

  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
  // Warm the stream so the first value handed out is already well mixed.
  for (let i = 0; i < 8; i += 1) next();
  return next;
}

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];
const intBetween = (rand, min, max) => min + Math.floor(rand() * (max - min + 1));

// ---------------------------------------------------------------------------
// PLANNING: a hidden dependency graph. The generator builds a DAG with a known
// longest chain; the solver sees only the edges.
// ---------------------------------------------------------------------------

export function generatePlanningTask(seed) {
  const rand = seededRandom(seed);
  const nodeCount = intBetween(rand, 8, 14);
  const nodes = Array.from({ length: nodeCount }, (_, i) => `n${i}`);

  // Build a layered DAG so the longest path is known while being constructed.
  const layers = [];
  let remaining = [...nodes];
  while (remaining.length) {
    const size = Math.min(remaining.length, intBetween(rand, 1, 3));
    layers.push(remaining.splice(0, size));
  }

  const edges = [];
  for (let i = 1; i < layers.length; i += 1) {
    for (const node of layers[i]) {
      // Every node depends on at least one node from the previous layer, which
      // is what makes the layer count the true longest chain length.
      const parents = layers[i - 1];
      edges.push([pick(rand, parents), node]);
      // Some extra edges from further back, which cannot lengthen the chain.
      if (i >= 2 && rand() < 0.4) edges.push([pick(rand, layers[intBetween(rand, 0, i - 2)]), node]);
    }
  }

  return {
    taskId: `planning.dag.${seed}`,
    family: 'PLANNING',
    prompt: 'Given these dependency edges, how many steps long is the longest chain that must run in order?',
    surface: { nodes, edges: edges.map(([from, to]) => ({ from, to })) },
    groundTruth: String(layers.length),
    answerKind: 'NUMBER',
    // The generator knows this because it built the layers. The solver has to
    // recover it from edges alone.
    whyIndependent: 'The layer count was fixed before any edge was emitted, and the solver receives only the edge list.'
  };
}

// ---------------------------------------------------------------------------
// SCIENCE: a hidden rule. The solver must design experiments that distinguish
// it from its neighbours, not merely find one example that fits.
// ---------------------------------------------------------------------------

const SCIENCE_RULES = Object.freeze([
  { id: 'ascending', test: ([a, b, c]) => a < b && b < c },
  { id: 'even-sum', test: ([a, b, c]) => (a + b + c) % 2 === 0 },
  { id: 'constant-gap', test: ([a, b, c]) => b - a === c - b },
  { id: 'all-even', test: ([a, b, c]) => [a, b, c].every(n => n % 2 === 0) },
  { id: 'sum-under-twenty', test: ([a, b, c]) => a + b + c < 20 }
]);

export function generateScienceTask(seed) {
  const rand = seededRandom(seed);
  const rule = SCIENCE_RULES[Math.floor(rand() * SCIENCE_RULES.length) % SCIENCE_RULES.length];

  // One positive example that several rules also explain, which is the trap:
  // confirming it proves nothing.
  const witness = [2, 4, 6];
  const consistentRules = SCIENCE_RULES.filter(candidate => candidate.test(witness)).map(candidate => candidate.id);

  return {
    taskId: `science.rule.${seed}`,
    family: 'SCIENCE',
    prompt: 'A hidden rule accepts [2,4,6]. Name a triple whose acceptance would rule OUT the largest number of candidate rules.',
    surface: { witness, candidateRules: SCIENCE_RULES.map(r => r.id) },
    groundTruth: rule.id,
    answerKind: 'RULE_ID',
    consistentWithWitness: consistentRules,
    // Scored on discrimination rather than on naming the rule: a probe that
    // separates many candidates is the scientific act.
    scoreProbe: probe => {
      if (!Array.isArray(probe) || probe.length !== 3 || !probe.every(Number.isInteger)) return 0;
      const accepting = SCIENCE_RULES.filter(candidate => candidate.test(probe)).length;
      const separated = Math.min(accepting, SCIENCE_RULES.length - accepting);
      return separated / Math.floor(SCIENCE_RULES.length / 2);
    },
    whyIndependent: 'The rule is chosen before the surface is emitted and never appears in it.'
  };
}

// ---------------------------------------------------------------------------
// CAUSALITY: two structures that produce identical observations and differ
// only under intervention.
// ---------------------------------------------------------------------------

export function generateCausalityTask(seed) {
  const rand = seededRandom(seed);
  // Chain A->B->C, or fork A<-B->C. Both make A and C correlate.
  const structure = rand() < 0.5 ? 'CHAIN' : 'FORK';
  const variables = ['a', 'b', 'c'];

  return {
    taskId: `causality.structure.${seed}`,
    family: 'CAUSALITY',
    prompt: 'A and C are correlated. Which single variable should be intervened on to distinguish a chain from a common cause?',
    surface: { variables, observed: 'a and c correlate; b correlates with both' },
    groundTruth: 'b',
    answerKind: 'VARIABLE',
    hiddenStructure: structure,
    // Intervening on b is the discriminating move under either structure:
    // in a chain it breaks the a-c correlation, in a fork it does not.
    whyIndependent: 'The structure is drawn before the surface is written, and the surface is identical under both structures.'
  };
}

// ---------------------------------------------------------------------------
// TOOL_USE: several tools, one sufficient. Scored on selection and on not
// calling what it did not need.
// ---------------------------------------------------------------------------

export function generateToolUseTask(seed) {
  const rand = seededRandom(seed);
  const tools = ['sum', 'sort', 'unique', 'reverse', 'count'];
  const needed = pick(rand, tools);
  const goals = {
    sum: 'report the total of these numbers',
    sort: 'report these numbers in ascending order',
    unique: 'report how many distinct values there are',
    reverse: 'report these numbers back to front',
    count: 'report how many numbers there are'
  };

  return {
    taskId: `tooluse.select.${seed}`,
    family: 'TOOL_USE',
    prompt: `Using the fewest tools: ${goals[needed]}.`,
    surface: { tools, data: Array.from({ length: intBetween(rand, 4, 8) }, () => intBetween(rand, 1, 9)) },
    groundTruth: needed,
    answerKind: 'TOOL',
    // Calling every tool and picking the right output afterwards is not tool
    // use. Efficiency is part of the score.
    scoreSelection: calls => {
      const list = Array.isArray(calls) ? calls : [];
      if (!list.includes(needed)) return 0;
      return list.length === 1 ? 1 : Math.max(0, 1 - (list.length - 1) / tools.length);
    },
    whyIndependent: 'The needed tool is chosen before the prompt is phrased, and the prompt names a goal rather than a tool.'
  };
}

// ---------------------------------------------------------------------------
// RESEARCH: a corpus with a planted contradiction and uneven source quality.
// ---------------------------------------------------------------------------

export function generateResearchTask(seed) {
  const rand = seededRandom(seed);
  const truth = intBetween(rand, 100, 999);
  const popularWrong = truth + intBetween(rand, 1, 50);
  const otherWrongA = truth - intBetween(rand, 1, 40);
  const otherWrongB = truth + intBetween(rand, 60, 120);

  // Five distinct claimed values rather than two. With two, a coin flip scored
  // half the item and the family measured almost nothing.
  const sources = [
    { id: 's1', quality: 'PRIMARY_MEASUREMENT', claim: truth, observedAt: '2026-09-01' },
    { id: 's2', quality: 'SECONDHAND_SUMMARY', claim: popularWrong, observedAt: '2026-09-10' },
    { id: 's3', quality: 'SECONDHAND_SUMMARY', claim: popularWrong, observedAt: '2026-09-11' },
    { id: 's4', quality: 'UNSOURCED_ASSERTION', claim: popularWrong, observedAt: '2026-09-12' },
    { id: 's5', quality: 'UNSOURCED_ASSERTION', claim: otherWrongA, observedAt: '2026-09-12' },
    { id: 's6', quality: 'SECONDHAND_SUMMARY', claim: otherWrongB, observedAt: '2026-09-13' }
  ];

  // Shuffle, because position was leaking the answer: the primary measurement
  // was always first, so a baseline that simply took sources[0] scored a
  // perfect 1.0 on this family without weighing anything.
  for (let i = sources.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }

  return {
    taskId: `research.contradiction.${seed}`,
    family: 'RESEARCH',
    prompt: 'These sources disagree. Which value is best supported?',
    // Three sources agree on the wrong number and one primary measurement
    // disagrees. Counting votes gets this wrong; weighing provenance gets it
    // right.
    surface: { sources: sources.map(({ id, quality, claim, observedAt }) => ({ id, quality, claim, observedAt })) },
    groundTruth: String(truth),
    answerKind: 'NUMBER',
    majorityAnswer: String(popularWrong),
    distinctClaims: [...new Set(sources.map(source => String(source.claim)))],
    whyIndependent: 'The true value is drawn first and the disagreeing majority is constructed around it.'
  };
}

// ---------------------------------------------------------------------------
// INVENTION: no provided tool solves it; a composition does.
// ---------------------------------------------------------------------------

export function generateInventionTask(seed) {
  const rand = seededRandom(seed);
  const data = Array.from({ length: intBetween(rand, 5, 9) }, () => intBetween(rand, 1, 20));
  const primitives = ['sum', 'count', 'max', 'min'];
  // The mean is not a primitive. It has to be composed from sum and count.
  const answer = data.reduce((a, b) => a + b, 0) / data.length;

  return {
    taskId: `invention.compose.${seed}`,
    family: 'INVENTION',
    prompt: 'Report the mean. No primitive computes it; compose one.',
    surface: { primitives, data },
    groundTruth: answer.toFixed(4),
    answerKind: 'NUMBER',
    requiredComposition: ['sum', 'count'],
    scoreComposition: used => {
      const list = Array.isArray(used) ? used : [];
      return ['sum', 'count'].every(p => list.includes(p)) ? 1 : 0;
    },
    whyIndependent: 'The mean is computed by the generator over data the solver receives, and no listed primitive returns it.'
  };
}

// ---------------------------------------------------------------------------
// FORECASTING: a question about a value the surface does not contain.
// ---------------------------------------------------------------------------

export function generateForecastingTask(seed) {
  const rand = seededRandom(seed);
  // The step is drawn once. Drawing it inside the map produced a series with
  // no rule at all -- [10,12,16,22,22,25] -- and an answer extrapolated from a
  // step that never existed, so the item was unanswerable rather than hard.
  const step = intBetween(rand, 2, 4);
  const start = intBetween(rand, 5, 15);
  const series = Array.from({ length: 6 }, (_, i) => start + i * step);
  const next = series[series.length - 1] + step;

  return {
    taskId: `forecasting.extrapolate.${seed}`,
    family: 'FORECASTING',
    prompt: 'What is the next value in this series?',
    // The next value is withheld. Reading the surface cannot produce it.
    surface: { series },
    groundTruth: String(next),
    answerKind: 'NUMBER',
    whyIndependent: 'The answer is the one element of the generated series the solver is not shown.'
  };
}

export const GENERATORS = Object.freeze({
  PLANNING: generatePlanningTask,
  SCIENCE: generateScienceTask,
  CAUSALITY: generateCausalityTask,
  TOOL_USE: generateToolUseTask,
  RESEARCH: generateResearchTask,
  INVENTION: generateInventionTask,
  FORECASTING: generateForecastingTask
});

/**
 * Build a full item set.
 *
 * Every family, every seed, deterministic. The ground truth is returned
 * separately from the surface so a caller can hand a solver the surface alone.
 */
export function generateTaskSet({ seeds = [1, 2, 3], families = Object.keys(GENERATORS) } = {}) {
  const items = [];
  for (const family of families) {
    const generator = GENERATORS[family];
    if (!generator) continue;
    for (const seed of seeds) items.push(generator(seed));
  }
  return {
    ok: items.length > 0,
    version: NULLSTAR_COGNITIVE_TASKS_VERSION,
    counts: { items: items.length, families: new Set(items.map(i => i.family)).size },
    items,
    surfaceOnly: items.map(({ taskId, family, prompt, surface }) => ({ taskId, family, prompt, surface })),
    businessEffectAuthority: 'NONE'
  };
}
