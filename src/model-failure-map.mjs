// What a given provider and model systematically gets wrong.
//
// The router already scores candidates on aggregate quality, reliability,
// latency and cost. Those are averages, and an average is exactly the wrong
// shape for the failure that matters: a model that is excellent overall and
// reliably fabricates citations is not a slightly-worse model, it is the wrong
// model for anything citation-bearing and a fine one everywhere else. Averaged
// into one reliability number, that distinction disappears, and the router
// keeps choosing it for the one task class it cannot do.
//
// So failures are recorded per provider x model x failure mode, and a mode is
// only called systematic when enough independent observations support it. Two
// bad answers are an anecdote. The threshold is explicit and the evidence count
// travels with every verdict, because a routing penalty derived from one bad
// afternoon is how a useful model gets quietly blacklisted.
//
// This map advises the router. It cannot disable a model, cannot call a
// provider, and holds no authority: its output is a penalty and a reason, and
// the routing decision stays where it already lives.
import { createHash } from 'node:crypto';
import { ZERO_CONSEQUENCE_EFFECTS } from './effect-ledgers.mjs';

export const MODEL_FAILURE_MAP_VERSION = 'uberbond.model-failure-map.v1';

/**
 * Failure modes worth routing around.
 *
 * Closed on purpose. An open vocabulary lets any caller invent a mode and
 * attach a penalty to it, which turns the map into a way to express a
 * preference about a provider rather than a record of what it did.
 */
export const FAILURE_MODES = Object.freeze([
  'FABRICATED_CITATION',
  'FABRICATED_TOOL_RESULT',
  'INSTRUCTION_IGNORED',
  'SCHEMA_VIOLATION',
  'TRUNCATED_OUTPUT',
  'ARITHMETIC_ERROR',
  'STALE_WORLD_KNOWLEDGE',
  'OVERCONFIDENT_WRONG_ANSWER',
  'REFUSED_PERMITTED_TASK',
  'CONTEXT_LOSS_LONG_HORIZON',
  'NONDETERMINISM_ACROSS_RETRIES',
  'LATENCY_OUTLIER',
  'PROVIDER_ERROR'
]);

/** How an observation was established. Self-report is the weakest and is capped. */
export const OBSERVATION_SOURCES = Object.freeze([
  'DETERMINISTIC_CHECK',
  'INDEPENDENT_VERIFIER',
  'HUMAN_REVIEW',
  'PROVIDER_ERROR_RESPONSE',
  'MODEL_SELF_REPORT'
]);

/**
 * Sources that cannot, alone, establish a systematic failure.
 *
 * A model's own account of its mistake is evidence about the model's account.
 * It is worth recording and worth nothing as proof, which is the same rule the
 * repository applies to worker prose everywhere else.
 */
const WEAK_SOURCES = new Set(['MODEL_SELF_REPORT']);

/** Minimum independent observations before a mode is called systematic. */
export const SYSTEMATIC_THRESHOLD = 3;

/** Largest routing penalty a single failure mode may contribute. */
export const MAX_MODE_PENALTY = 0.4;

/** Largest total penalty the map will ever recommend for one candidate. */
export const MAX_TOTAL_PENALTY = 0.75;

const text = (value, max = 200) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function refuse(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: MODEL_FAILURE_MAP_VERSION,
    status: 'MODEL_FAILURE_MAP_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS },
    ...extra
  };
}

export function candidateKey(provider, model) {
  return `${String(provider ?? '').trim().toLowerCase()}::${String(model ?? '').trim()}`;
}

/**
 * One observed failure.
 *
 * `observationId` is required and is what makes "independent" mean something:
 * replaying the same receipt ten times must not manufacture a systematic mode,
 * so identical ids collapse rather than accumulate.
 */
export function normalizeFailureObservation(input = {}) {
  const provider = text(input.provider, 80)?.toLowerCase() || null;
  const model = text(input.model, 120);
  const mode = text(input.failureMode, 80);
  const taskClass = text(input.taskClass, 80)?.toLowerCase() || null;
  const source = text(input.observationSource, 80);
  const observationId = text(input.observationId, 200);
  const observedAt = text(input.observedAt, 40);

  const reasons = [];
  if (!provider) reasons.push('observation-provider-required');
  if (!model) reasons.push('observation-model-required');
  if (!taskClass) reasons.push('observation-task-class-required');
  if (!FAILURE_MODES.includes(mode)) reasons.push('recognized-failure-mode-required');
  if (!OBSERVATION_SOURCES.includes(source)) reasons.push('recognized-observation-source-required');
  if (!observationId) reasons.push('observation-identity-required');
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) reasons.push('observation-timestamp-required');
  if (reasons.length) return refuse(reasons);

  return {
    ok: true,
    provider,
    model,
    candidateKey: candidateKey(provider, model),
    taskClass,
    failureMode: mode,
    observationSource: source,
    observationId,
    observedAt,
    weak: WEAK_SOURCES.has(source),
    evidenceRef: text(input.evidenceRef, 500) || null
  };
}

/**
 * Compiles observations into per-candidate, per-task-class failure verdicts.
 *
 * A mode becomes SYSTEMATIC only on enough distinct, non-weak observations.
 * Everything below that is reported as OBSERVED with its count, because the
 * difference between "this happened twice" and "this model does this" is the
 * entire value of the map -- collapsing them would let a bad afternoon set
 * routing policy.
 */
export function compileModelFailureMap({ observations = [], threshold = SYSTEMATIC_THRESHOLD } = {}) {
  if (!Array.isArray(observations)) return refuse(['observations-array-required']);
  const limit = Number.isSafeInteger(threshold) && threshold >= 2 ? threshold : SYSTEMATIC_THRESHOLD;

  const normalized = [];
  const reasons = [];
  for (const raw of observations) {
    const observation = normalizeFailureObservation(raw);
    if (!observation.ok) { reasons.push(...observation.reasonCodes); continue; }
    normalized.push(observation);
  }
  if (reasons.length) return refuse(reasons);

  const buckets = new Map();
  for (const observation of normalized) {
    const key = `${observation.candidateKey}::${observation.taskClass}::${observation.failureMode}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        provider: observation.provider,
        model: observation.model,
        candidateKey: observation.candidateKey,
        taskClass: observation.taskClass,
        failureMode: observation.failureMode,
        observationIds: new Set(),
        weakObservationIds: new Set(),
        firstObservedAt: observation.observedAt,
        lastObservedAt: observation.observedAt,
        evidenceRefs: []
      });
    }
    const bucket = buckets.get(key);
    // Replay must not accumulate. The same receipt seen twice is one fact.
    if (observation.weak) bucket.weakObservationIds.add(observation.observationId);
    else bucket.observationIds.add(observation.observationId);
    if (observation.observedAt < bucket.firstObservedAt) bucket.firstObservedAt = observation.observedAt;
    if (observation.observedAt > bucket.lastObservedAt) bucket.lastObservedAt = observation.observedAt;
    if (observation.evidenceRef && bucket.evidenceRefs.length < 8) bucket.evidenceRefs.push(observation.evidenceRef);
  }

  const findings = [...buckets.values()].map(bucket => {
    const independentCount = bucket.observationIds.size;
    const weakCount = bucket.weakObservationIds.size;
    const systematic = independentCount >= limit;
    return {
      provider: bucket.provider,
      model: bucket.model,
      candidateKey: bucket.candidateKey,
      taskClass: bucket.taskClass,
      failureMode: bucket.failureMode,
      verdict: systematic ? 'SYSTEMATIC' : 'OBSERVED',
      independentObservations: independentCount,
      selfReportedObservations: weakCount,
      threshold: limit,
      // Penalty grows with evidence and stops. An unbounded penalty would let a
      // long tail of one failure mode remove a model from every route.
      routingPenalty: systematic
        ? Math.min(MAX_MODE_PENALTY, Number((0.1 * Math.min(4, independentCount - limit + 1)).toFixed(4)))
        : 0,
      firstObservedAt: bucket.firstObservedAt,
      lastObservedAt: bucket.lastObservedAt,
      evidenceRefs: bucket.evidenceRefs
    };
  }).sort((a, b) =>
    b.routingPenalty - a.routingPenalty
    || b.independentObservations - a.independentObservations
    || a.candidateKey.localeCompare(b.candidateKey)
    || a.failureMode.localeCompare(b.failureMode));

  return {
    ok: true,
    version: MODEL_FAILURE_MAP_VERSION,
    status: 'MODEL_FAILURE_MAP_COMPILED',
    threshold: limit,
    counts: {
      observations: normalized.length,
      distinctCandidates: new Set(normalized.map(item => item.candidateKey)).size,
      findings: findings.length,
      systematic: findings.filter(finding => finding.verdict === 'SYSTEMATIC').length
    },
    findings,
    mapDigest: hash(findings.map(finding => [finding.candidateKey, finding.taskClass, finding.failureMode, finding.verdict, finding.routingPenalty])),
    truthBoundary:
      'A_FAILURE_MAP_RECORDS_WHAT_WAS_OBSERVED_OF_A_PROVIDER_AND_MODEL_ON_A_TASK_CLASS. '
      + 'SYSTEMATIC_MEANS_ENOUGH_INDEPENDENT_OBSERVATIONS_AGREED_AND_NOT_THAT_THE_MODEL_ALWAYS_FAILS. '
      + 'IT_ADVISES_ROUTING_ONLY_AND_CANNOT_DISABLE_A_MODEL_CALL_A_PROVIDER_OR_GRANT_AUTHORITY.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS }
  };
}

/**
 * The routing advice for one candidate on one task class.
 *
 * Returns a penalty the router may subtract from its own score, plus the
 * reasons. Only SYSTEMATIC findings contribute: an OBSERVED mode is visible to
 * a human reading the map and does not move a route on its own.
 */
export function failurePenaltyFor(map, { provider, model, taskClass } = {}) {
  const none = { ok: true, penalty: 0, systematicModes: [], observedModes: [], businessEffectAuthority: 'NONE' };
  if (!map?.ok || !Array.isArray(map.findings)) return none;
  const key = candidateKey(provider, model);
  const klass = String(taskClass ?? '').trim().toLowerCase();
  if (!key.trim() || key === '::' || !klass) return none;

  const relevant = map.findings.filter(finding => finding.candidateKey === key && finding.taskClass === klass);
  const systematic = relevant.filter(finding => finding.verdict === 'SYSTEMATIC');
  const penalty = Math.min(
    MAX_TOTAL_PENALTY,
    Number(systematic.reduce((total, finding) => total + finding.routingPenalty, 0).toFixed(4))
  );

  return {
    ok: true,
    penalty,
    systematicModes: systematic.map(finding => ({
      failureMode: finding.failureMode,
      independentObservations: finding.independentObservations,
      routingPenalty: finding.routingPenalty
    })),
    observedModes: relevant.filter(finding => finding.verdict === 'OBSERVED').map(finding => finding.failureMode),
    businessEffectAuthority: 'NONE'
  };
}
