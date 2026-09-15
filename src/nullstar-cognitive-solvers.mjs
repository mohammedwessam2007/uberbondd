// Deterministic solvers, and the harness that keeps them honest.
//
// A solver receives only the surface. It never receives the item, so it cannot
// read the ground truth even by accident -- the harness strips it before the
// call rather than trusting the solver not to look. That single rule is what
// separates this from the retired corpus, where the answer and the observation
// came out of the same expression.

export const NULLSTAR_COGNITIVE_SOLVERS_VERSION = 'uberbond.nullstar-cognitive-solvers.v1';

/** Longest chain through a dependency graph, recovered from edges alone. */
function solvePlanning(surface) {
  const incoming = new Map((surface.nodes ?? []).map(node => [node, []]));
  for (const edge of surface.edges ?? []) {
    if (incoming.has(edge.to)) incoming.get(edge.to).push(edge.from);
  }
  const depth = new Map();
  const resolve = (node, guard = new Set()) => {
    if (depth.has(node)) return depth.get(node);
    if (guard.has(node)) return 1;
    guard.add(node);
    const parents = incoming.get(node) ?? [];
    const value = parents.length === 0 ? 1 : 1 + Math.max(...parents.map(parent => resolve(parent, guard)));
    depth.set(node, value);
    return value;
  };
  const longest = Math.max(0, ...(surface.nodes ?? []).map(node => resolve(node)));
  return String(longest);
}

/**
 * A probe that splits the candidate set rather than confirming the witness.
 *
 * Searching for the triple that maximises disagreement among candidate rules
 * is the scientific move; re-testing the known-positive is the trap.
 */
function solveScience(surface) {
  const candidates = surface.candidateRules ?? [];
  const rules = {
    ascending: ([a, b, c]) => a < b && b < c,
    'even-sum': ([a, b, c]) => (a + b + c) % 2 === 0,
    'constant-gap': ([a, b, c]) => b - a === c - b,
    'all-even': ([a, b, c]) => [a, b, c].every(n => n % 2 === 0),
    'sum-under-twenty': ([a, b, c]) => a + b + c < 20
  };

  let best = null;
  let bestSplit = -1;
  for (let a = 1; a <= 9; a += 1) {
    for (let b = 1; b <= 9; b += 1) {
      for (let c = 1; c <= 9; c += 1) {
        const probe = [a, b, c];
        const accepting = candidates.filter(id => rules[id]?.(probe)).length;
        const split = Math.min(accepting, candidates.length - accepting);
        if (split > bestSplit) { bestSplit = split; best = probe; }
      }
    }
  }
  return best;
}

/** The variable whose intervention distinguishes a chain from a common cause. */
function solveCausality(surface) {
  // The mediator is the one correlated with both others; intervening anywhere
  // else leaves the two structures indistinguishable.
  const observed = String(surface.observed ?? '');
  const variables = surface.variables ?? [];
  const mentionedWithBoth = variables.find(variable => {
    const others = variables.filter(other => other !== variable);
    return others.every(other => observed.includes(other)) && observed.includes(`${variable} correlates with both`);
  });
  return mentionedWithBoth ?? variables[1] ?? null;
}

/** The single tool the goal actually needs. */
function solveToolUse(surface, prompt) {
  const text = String(prompt ?? '').toLowerCase();
  // A lookup, and honestly a lookup. Tool selection here is a mapping from a
  // stated goal to the one tool that serves it, and the generator names goals
  // from a closed set. Difficulty 2 added median and range to that set and this
  // table was never extended, which is why the family sat at 0.67 for four
  // declarations: not a reasoning gap, two missing rows.
  //
  // The rows stayed missing on purpose while generations were running. Closing
  // a family by extending a dictionary and reporting it as a capability
  // generation is the exact move GA1 and GA2 turned out to have made by
  // accident, and doing it deliberately would have been worse. It is closed
  // here as the maintenance it is.
  const intent = [
    ['total', 'sum'],
    ['ascending order', 'sort'],
    ['distinct', 'unique'],
    ['back to front', 'reverse'],
    ['middle value once ordered', 'median'],
    ['spread between largest and smallest', 'range'],
    ['how many numbers', 'count']
  ];
  for (const [phrase, tool] of intent) {
    if (text.includes(phrase) && (surface.tools ?? []).includes(tool)) return [tool];
  }
  return [];
}

/**
 * Weigh provenance rather than count votes.
 *
 * Three secondhand sources repeating one number do not outweigh a primary
 * measurement, which is exactly the item's trap.
 */
const RESEARCH_PROVENANCE = Object.freeze({
  REPLICATED_MEASUREMENT: 4,
  PRIMARY_MEASUREMENT: 3,
  SECONDHAND_SUMMARY: 1,
  UNSOURCED_ASSERTION: 0
});

/**
 * Rank sources on provenance and freshness as two axes.
 *
 * Promoted from GA2 as R2_TWO_AXIS, and the promotion is sound: it scores 1.0
 * where the previous version scored 0.00 at difficulty 3, and regresses
 * nothing. What the promotion does NOT establish is why.
 *
 * The previous version's rank table had no entry for REPLICATED_MEASUREMENT,
 * so it read as 0 and lost to every stale primary. An ablation run after the
 * tournament -- the old provenance-only ladder with that one entry added and
 * no freshness term at all -- scores 1.0 at difficulties 1, 2 and 3, the same
 * as this. So the freshness axis does no measured work on this instrument, and
 * the tournament could not distinguish the two-axis hypothesis from a missing
 * dictionary entry. The gap GA2 closed was vocabulary, not reasoning.
 *
 * That is recorded as F010 in the failure-debt ledger rather than left in the
 * result artifact as a capability win. Testing whether freshness carries real
 * weight needs an item where a fresh secondhand source beats a stale primary
 * with no replication present to shortcut it; no such item exists yet, so the
 * hypothesis is open, not confirmed.
 *
 * R1_RECENCY_ONLY, which also scored 1.0 here, was disqualified for regressing
 * difficulty 1 and 2 to zero. That much the instrument did establish: recency
 * alone is the opposite error, not the fix.
 */
function solveResearch(surface) {
  const sources = surface.sources ?? [];
  if (sources.length === 0) return null;
  const latest = sources.reduce((best, source) =>
    (!best || String(source.observedAt) > String(best.observedAt) ? source : best), null)?.observedAt;

  let best = null;
  let bestScore = -Infinity;
  for (const source of sources) {
    const provenance = RESEARCH_PROVENANCE[source.quality] ?? 0;
    const from = Date.parse(source.observedAt);
    const to = Date.parse(latest);
    const ageDays = Number.isFinite(from) && Number.isFinite(to) ? Math.abs(to - from) / 86400000 : 0;
    const score = provenance * (1 / (1 + ageDays / 30));
    if (score > bestScore) { bestScore = score; best = source; }
  }
  return best ? String(best.claim) : null;
}

/**
 * Compose the quantity the prompt names out of the primitives on offer.
 *
 * Promoted from GA6 as L2_OPERATOR_REPAIRED, and the route there is the part
 * worth keeping.
 *
 * GA3 promoted a version that matched whole phrases. It scored 1.0 on every
 * item the generator emits and could compose nothing the generator does not
 * ask for -- and given "Report the mean plus the midrange" it returned the
 * mean, because the prompt contains "report the mean" and the shorter pattern
 * claimed the longer sentence. It answered a different question without
 * refusing. No in-distribution score could have caught that: the distribution
 * was what it had learned.
 *
 * Three generations then went into replacing it. GA4 gated promotions on items
 * built outside the generator and promoted nothing. GA5 repaired the operator
 * search -- English puts "minus" between its operands and "the average of" in
 * front of both, and searching only the span between them silently loses the
 * second kind -- and promoted nothing, because the rule required beating an
 * incumbent these candidates tied. GA6 repaired the comparison and promoted
 * this.
 *
 * It reads the quantities the prompt names, in the order it names them, finds
 * the operator where that operator's kind puts it, and assembles the result. On
 * the three probes that gated the promotion it answers all three; on three more
 * held back and used to gate nothing, it also answers all three, where the
 * version it replaces answers none and confabulates on one.
 *
 * Two candidates tied it and are not worse: L3 additionally refuses when a
 * named quantity is left unaccounted for, and L4 parses the clause structurally.
 * The tournament chose among the three on size, so this one is the smallest of
 * three equals rather than the best of three.
 */
const COMPOSITION_QUANTITIES = [
  // Longest phrase first, so "the spread between largest and smallest" is not
  // shadowed by a shorter fragment of itself.
  { key: 'spread', phrase: 'spread between largest and smallest' },
  { key: 'size', phrase: 'how many numbers there are' },
  { key: 'midrange', phrase: 'midrange' },
  { key: 'mean', phrase: 'mean' }
];

const COMPOSITION_NEEDS = {
  mean: ['sum', 'count'],
  midrange: ['max', 'min'],
  spread: ['max', 'min'],
  size: ['count']
};

// Position is part of what an operator is, not a detail of how it is written.
// "the average of" governs from in front of both operands; "minus" from between
// them. Prefix is tested first because "the average of a and b" also contains
// "and", and reading that symmetrically would give a sum rather than a mean.
const COMPOSITION_OPERATORS = [
  { word: 'average of', position: 'PREFIX', apply: (a, b) => (a + b) / 2 },
  { word: 'divided by', position: 'INFIX', apply: (a, b) => (b === 0 ? a : a / b) },
  { word: 'minus', position: 'INFIX', apply: (a, b) => a - b },
  { word: 'plus', position: 'INFIX', apply: (a, b) => a + b },
  { word: 'times', position: 'INFIX', apply: (a, b) => a * b }
];

function solveInvention(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;

  const text = String(prompt ?? '').toLowerCase();
  const high = Math.max(...data);
  const low = Math.min(...data);
  const quantities = {
    mean: data.reduce((a, b) => a + b, 0) / data.length,
    midrange: (high + low) / 2,
    spread: high - low,
    size: data.length
  };

  const named = [];
  for (const entry of COMPOSITION_QUANTITIES) {
    const at = text.indexOf(entry.phrase);
    if (at < 0) continue;
    // A mention inside a longer phrase already claimed is part of that phrase,
    // not a second operand.
    if (named.some(prior => at >= prior.at && at < prior.at + prior.phrase.length)) continue;
    named.push({ ...entry, at });
  }
  named.sort((a, b) => a.at - b.at);
  if (named.length === 0) return null;

  const available = new Set(surface.primitives ?? []);
  const report = (value, needs) => (Number.isFinite(value)
    ? { answer: value.toFixed(4), used: [...new Set(needs)].filter(name => available.has(name)) }
    : null);

  if (named.length === 1) return report(quantities[named[0].key], COMPOSITION_NEEDS[named[0].key]);

  const [first, second] = named;
  const before = text.slice(0, first.at);
  const between = text.slice(first.at, second.at + second.phrase.length);
  const operator = COMPOSITION_OPERATORS.find(entry =>
    (entry.position === 'PREFIX' ? before : between).includes(entry.word));
  // Returning nothing is the right answer to a question this cannot read.
  // Guessing is how the version this replaced produced a confident wrong number.
  if (!operator) return null;

  return report(
    operator.apply(quantities[first.key], quantities[second.key]),
    [...COMPOSITION_NEEDS[first.key], ...COMPOSITION_NEEDS[second.key]]
  );
}

/**
 * Extrapolate by finding the order at which differences go constant.
 *
 * Promoted from GA1 as C1_POLYNOMIAL_DIFFERENCE. The previous version tested
 * only a constant first difference and returned null for anything else, which
 * scored zero on every quadratic item. Three candidates tied at 1.0 on
 * held-out seeds and this one won on being the smallest.
 *
 * It generalises the old behaviour rather than replacing it: order 1 is the
 * case the previous version handled.
 */
function solveForecasting(surface) {
  const series = (surface.series ?? []).map(Number);
  if (series.length < 3) return null;

  const differences = list => list.slice(1).map((value, i) => value - list[i]);
  const allEqual = list => list.length > 0 && list.every(value => value === list[0]);

  let level = series;
  const lastOfEachOrder = [];
  for (let order = 0; order < series.length - 1; order += 1) {
    lastOfEachOrder.push(level[level.length - 1]);
    const next = differences(level);
    if (next.length === 0) return null;
    if (allEqual(next)) {
      let carry = next[0];
      for (let i = lastOfEachOrder.length - 1; i >= 0; i -= 1) carry += lastOfEachOrder[i];
      return String(carry);
    }
    level = next;
  }
  return null;
}

export const UBERBOND_SOLVERS = Object.freeze({
  PLANNING: solvePlanning,
  SCIENCE: solveScience,
  CAUSALITY: solveCausality,
  TOOL_USE: solveToolUse,
  RESEARCH: solveResearch,
  INVENTION: solveInvention,
  FORECASTING: solveForecasting
});

/**
 * A baseline with no capability, steelmanned.
 *
 * It answers with the first plausible option it can see rather than something
 * deliberately stupid, because a trivial baseline is only informative if it is
 * the best a non-thinking approach could do.
 */
export const TRIVIAL_SOLVERS = Object.freeze({
  PLANNING: surface => String((surface.nodes ?? []).length),
  SCIENCE: surface => surface.witness ?? null,
  CAUSALITY: surface => (surface.variables ?? [])[0] ?? null,
  TOOL_USE: surface => [(surface.tools ?? [])[0]].filter(Boolean),
  RESEARCH: surface => String((surface.sources ?? [])[0]?.claim ?? ''),
  INVENTION: surface => ({ answer: String((surface.data ?? [])[0] ?? ''), used: [(surface.primitives ?? [])[0]].filter(Boolean) }),
  FORECASTING: surface => String((surface.series ?? [])[(surface.series ?? []).length - 1] ?? '')
});

/**
 * Score one item.
 *
 * The solver is handed the surface and the prompt, never the item. Families
 * with their own scorer use it; the rest are exact-match.
 */
export function scoreItem(item, solvers) {
  const solver = solvers[item.family];
  if (typeof solver !== 'function') return { taskId: item.taskId, family: item.family, score: 0, reason: 'NO_SOLVER' };

  let response;
  try {
    // Only the surface and the prompt cross this boundary.
    response = solver(item.surface, item.prompt);
  } catch (error) {
    return { taskId: item.taskId, family: item.family, score: 0, reason: `SOLVER_THREW: ${String(error?.message ?? error).slice(0, 120)}` };
  }

  if (item.family === 'SCIENCE') {
    return { taskId: item.taskId, family: item.family, score: item.scoreProbe(response), response: JSON.stringify(response) };
  }
  if (item.family === 'TOOL_USE') {
    return { taskId: item.taskId, family: item.family, score: item.scoreSelection(response), response: JSON.stringify(response) };
  }
  if (item.family === 'INVENTION') {
    const correct = response?.answer === item.groundTruth ? 1 : 0;
    const composed = item.scoreComposition(response?.used);
    // Both halves matter: the right number by the wrong route is not invention.
    return { taskId: item.taskId, family: item.family, score: (correct + composed) / 2, response: JSON.stringify(response) };
  }
  return {
    taskId: item.taskId,
    family: item.family,
    score: String(response) === item.groundTruth ? 1 : 0,
    response: String(response)
  };
}

/** Score a whole set and report per family. */
export function scoreTaskSet(items, solvers) {
  const rows = (Array.isArray(items) ? items : []).map(item => scoreItem(item, solvers));
  const byFamily = {};
  for (const row of rows) {
    const bucket = byFamily[row.family] ?? { items: 0, score: 0 };
    bucket.items += 1;
    bucket.score += Number(row.score) || 0;
    byFamily[row.family] = bucket;
  }
  for (const family of Object.keys(byFamily)) {
    byFamily[family].mean = Number((byFamily[family].score / byFamily[family].items).toFixed(4));
  }
  const total = rows.reduce((sum, row) => sum + (Number(row.score) || 0), 0);
  return {
    ok: rows.length > 0,
    version: NULLSTAR_COGNITIVE_SOLVERS_VERSION,
    items: rows.length,
    totalScore: Number(total.toFixed(4)),
    mean: rows.length ? Number((total / rows.length).toFixed(4)) : null,
    byFamily,
    rows,
    businessEffectAuthority: 'NONE'
  };
}
