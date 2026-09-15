// What is actually limiting the system, ranked by what removing it would unlock.
//
// The naive move is to take the lowest-scoring dimension and work on it. That
// is usually wrong: a niche weakness with nothing downstream of it is cheaper
// to leave alone than a mediocre retrieval layer fifteen systems depend on.
// Leverage here is therefore downstream unlocks per unit of cost, computed from
// a declared dependency graph rather than asserted, so a diagnosis can be
// argued with by pointing at the graph.
//
// Every serious diagnosis carries competing explanations and a test that would
// tell them apart. A bottleneck with one hypothesis and no discriminating test
// is a guess wearing a ranking, and acting on it burns a generation.
import { createHash } from 'node:crypto';
import { ZERO_CONSEQUENCE_EFFECTS } from './effect-ledgers.mjs';

export const NULLSTAR_OMEGA_BOTTLENECK_VERSION = 'uberbond.nullstar-omega-bottleneck.v1';

/** Evidence classes a bottleneck may rest on, weakest last. */
export const EVIDENCE_CLASSES = Object.freeze([
  'SEALED_HOLDOUT_FAILURE',
  'VISIBLE_BENCHMARK_FAILURE',
  'MISSION_FAILURE',
  'DENOMINATOR_GAP',
  'LATENCY_MEASUREMENT',
  'COST_MEASUREMENT',
  'OPERATOR_OBSERVATION'
]);

/**
 * Evidence that cannot, alone, rank a bottleneck first.
 *
 * An operator observation is a lead. Ranking on it alone is how a plausible
 * story about the system outranks a measured failure of it.
 */
const WEAK_EVIDENCE = new Set(['OPERATOR_OBSERVATION']);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

function refuse(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: NULLSTAR_OMEGA_BOTTLENECK_VERSION,
    status: 'NULLSTAR_OMEGA_BOTTLENECK_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS },
    ...extra
  };
}

/**
 * How many dimensions depend on this one, transitively.
 *
 * Transitive on purpose: a dimension two hops upstream of ten systems is
 * upstream of ten systems. Cycles are tolerated by visiting each node once,
 * because a declared graph with a cycle should still produce a usable count
 * rather than hang.
 */
export function downstreamUnlockCount(dimensionId, dependencyGraph) {
  const seen = new Set();
  const queue = [dimensionId];
  while (queue.length) {
    const current = queue.shift();
    for (const [dependent, dependsOn] of Object.entries(dependencyGraph || {})) {
      if (!Array.isArray(dependsOn) || !dependsOn.includes(current)) continue;
      if (seen.has(dependent) || dependent === dimensionId) continue;
      seen.add(dependent);
      queue.push(dependent);
    }
  }
  return seen.size;
}

export function normalizeBottleneck(input = {}) {
  const id = text(input.id, 200);
  const dimension = text(input.dimension, 120);
  const symptom = text(input.symptom, 2000);
  const evidenceClass = text(input.evidenceClass, 80);
  const evidenceRef = text(input.evidenceRef, 1000);
  const hypotheses = Array.isArray(input.rootCauseHypotheses) ? input.rootCauseHypotheses.map(h => text(h, 1000)).filter(Boolean) : [];
  const discriminatingTest = text(input.discriminatingTest, 2000);
  const cost = Number(input.estimatedCost);

  const reasons = [];
  if (!id) reasons.push('bottleneck-id-required');
  if (!dimension) reasons.push(`bottleneck-dimension-required:${id || '<unidentified>'}`);
  if (!symptom) reasons.push(`bottleneck-symptom-required:${id || '<unidentified>'}`);
  if (!EVIDENCE_CLASSES.includes(evidenceClass)) reasons.push(`recognized-evidence-class-required:${id || '<unidentified>'}`);
  if (!evidenceRef) reasons.push(`bottleneck-evidence-reference-required:${id || '<unidentified>'}`);
  // Competing explanations are not optional. One hypothesis is a guess, and a
  // guess that cannot be told apart from its alternatives wastes a generation.
  if (hypotheses.length < 2) reasons.push(`competing-root-cause-hypotheses-required:${id || '<unidentified>'}`);
  if (!discriminatingTest) reasons.push(`discriminating-test-required:${id || '<unidentified>'}`);
  if (!Number.isFinite(cost) || cost <= 0) reasons.push(`positive-estimated-cost-required:${id || '<unidentified>'}`);
  if (reasons.length) return refuse(reasons);

  return {
    ok: true,
    id,
    dimension,
    symptom,
    evidenceClass,
    evidenceRef,
    rootCauseHypotheses: hypotheses,
    discriminatingTest,
    estimatedCost: cost,
    weakEvidence: WEAK_EVIDENCE.has(evidenceClass)
  };
}

/**
 * Ranks bottlenecks by downstream unlocks per unit cost.
 *
 * Weak-evidence findings are ranked but never placed first: they surface as
 * leads to investigate rather than as the thing the next generation attacks.
 */
export function rankBottlenecks({ bottlenecks = [], dependencyGraph = {}, generatedAt = new Date().toISOString(), sourceCommit = null } = {}) {
  if (!Array.isArray(bottlenecks) || bottlenecks.length === 0) return refuse(['bottlenecks-required']);

  const normalized = [];
  const reasons = [];
  const seen = new Set();
  for (const raw of bottlenecks) {
    const item = normalizeBottleneck(raw);
    if (!item.ok) { reasons.push(...item.reasonCodes); continue; }
    if (seen.has(item.id)) { reasons.push(`duplicate-bottleneck-id:${item.id}`); continue; }
    seen.add(item.id);
    normalized.push(item);
  }
  if (reasons.length) return refuse(reasons);

  const scored = normalized.map(item => {
    const unlocks = downstreamUnlockCount(item.dimension, dependencyGraph);
    return {
      ...item,
      downstreamUnlocks: unlocks,
      // +1 so a leaf bottleneck still ranks on cost rather than collapsing to
      // zero and becoming invisible.
      leverage: Number(((unlocks + 1) / item.estimatedCost).toFixed(6))
    };
  });

  const strong = scored.filter(item => !item.weakEvidence).sort((a, b) => b.leverage - a.leverage || a.id.localeCompare(b.id));
  const weak = scored.filter(item => item.weakEvidence).sort((a, b) => b.leverage - a.leverage || a.id.localeCompare(b.id));
  const ranked = [...strong, ...weak];

  return {
    ok: true,
    version: NULLSTAR_OMEGA_BOTTLENECK_VERSION,
    status: 'NULLSTAR_OMEGA_BOTTLENECKS_RANKED',
    sourceCommit,
    generatedAt,
    counts: { bottlenecks: ranked.length, strongEvidence: strong.length, weakEvidence: weak.length },
    ranked,
    selected: strong[0] || null,
    selectionLaw: 'The top strong-evidence finding by downstream unlocks per unit cost. A weak-evidence finding is a lead and may never be selected first.',
    truthBoundary:
      'A_RANKING_IS_A_PRIORITISATION_OF_DIAGNOSES_AND_NOT_A_PROOF_OF_CAUSE. '
      + 'EVERY_ENTRY_CARRIES_COMPETING_HYPOTHESES_AND_A_DISCRIMINATING_TEST_BECAUSE_THE_CAUSE_IS_NOT_YET_ESTABLISHED.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS }
  };
}

export function bottleneckDigest(result) {
  return createHash('sha256').update(JSON.stringify((result?.ranked || []).map(row => [row.id, row.dimension, row.leverage]))).digest('hex');
}
