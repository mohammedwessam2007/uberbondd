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
  const intent = [
    ['total', 'sum'],
    ['ascending order', 'sort'],
    ['distinct', 'unique'],
    ['back to front', 'reverse'],
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
function solveResearch(surface) {
  const sources = surface.sources ?? [];
  const rank = { PRIMARY_MEASUREMENT: 3, SECONDHAND_SUMMARY: 1, UNSOURCED_ASSERTION: 0 };
  let best = null;
  let bestScore = -1;
  for (const source of sources) {
    const score = rank[source.quality] ?? 0;
    if (score > bestScore) { bestScore = score; best = source; }
  }
  return best ? String(best.claim) : null;
}

/** Compose the primitives the surface does provide. */
function solveInvention(surface) {
  const data = surface.data ?? [];
  const primitives = surface.primitives ?? [];
  if (!primitives.includes('sum') || !primitives.includes('count') || data.length === 0) return null;
  const total = data.reduce((a, b) => a + b, 0);
  return { answer: (total / data.length).toFixed(4), used: ['sum', 'count'] };
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
