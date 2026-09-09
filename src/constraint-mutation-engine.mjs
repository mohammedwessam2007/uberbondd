import crypto from 'node:crypto';
import { deriveCountermoves } from './wallbreaker.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONSTRAINT_MUTATION_ENGINE_VERSION = 'constraint-mutation-engine-1.0.1';

const MAX_HISTORY = 200;
const MAX_EVIDENCE = 100;
const FORBIDDEN_ALWAYS = Object.freeze([
  'blind-identical-retry',
  'quota-evasion',
  'identity-cycling',
  'credential-sharing',
  'access-control-circumvention',
  'provider-limit-bypass',
  'impersonate-authority'
]);

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const list = (value, max = MAX_EVIDENCE, len = 500) => Array.isArray(value)
  ? [...new Set(value.map(item => text(item, len)).filter(Boolean))].slice(0, max)
  : [];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: CONSTRAINT_MUTATION_ENGINE_VERSION,
    status: 'CONSTRAINT_MUTATION_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

function normalizeAttempt(input = {}) {
  const objectiveId = text(input.objectiveId, 200);
  const mechanismId = text(input.mechanismId, 200);
  const providerId = text(input.providerId, 200) || 'provider-unspecified';
  const failureInput = input.failure && typeof input.failure === 'object' ? input.failure : {};
  const wall = deriveCountermoves({
    ...failureInput,
    candidateId: mechanismId || failureInput.candidateId,
    evidenceRefs: list(input.evidenceRefs || failureInput.evidenceRefs)
  });
  if (!objectiveId || !mechanismId) return { ok: false, reasonCodes: ['objective-and-mechanism-required'] };
  if (!wall?.ok) return { ok: false, reasonCodes: wall?.reasonCodes || ['wallbreaker-classification-failed'] };
  const normalized = {
    objectiveId,
    mechanismId,
    providerId,
    failureClass: wall.failure.failureClass,
    failedSignature: text(failureInput.failedSignature, 128) || null,
    outcomeUncertain: failureInput.outcomeUncertain === true,
    safeToRetrySameMechanism: wall.failure.safeToRetrySameMechanism === true,
    evidenceRefs: list(input.evidenceRefs || failureInput.evidenceRefs),
    wallbreakerCountermoves: wall.actions.map(action => action.type),
    wallbreakerForbidden: list(wall.forbidden, 30, 200)
  };
  normalized.strategyFingerprint = digest({
    objectiveId: normalized.objectiveId,
    mechanismId: normalized.mechanismId,
    providerId: normalized.providerId,
    failureClass: normalized.failureClass,
    failedSignature: normalized.failedSignature
  }).slice(0, 32);
  return { ok: true, attempt: normalized };
}

function mutationFamilies(failureClass) {
  const common = ['decompose-objective', 'change-mechanism-family', 'run-bounded-independent-check'];
  const byClass = {
    PROVIDER_FAILURE: ['switch-provider', 'switch-execution-substrate', 'self-host-authorized-runtime', 'replace-with-open-or-local-capability', 'replace-with-deterministic-code'],
    VERIFIER_FAILURE: ['switch-verifier', 'switch-runner-substrate', 'construct-minimal-reproduction', 'add-independent-check'],
    CAPABILITY_GAP: ['query-capability-genome', 'compose-existing-capability-atoms', 'build-missing-capability', 'benchmark-substitutes'],
    IMPLEMENTATION_DEFECT: ['localize-defect', 'reduce-change-surface', 'construct-minimal-reproduction', 'repair-implementation'],
    WRONG_ASSUMPTION: ['invalidate-assumption', 'recompile-problem', 'expand-solution-families', 'seek-disconfirming-evidence'],
    MISSING_EVIDENCE: ['gather-targeted-evidence', 'design-value-of-information-probe', 'reduce-decision-scope'],
    AUTHORITY_BLOCK: ['find-lawful-substitute', 'redesign-dependency', 'request-owner-authority-only-if-irreducible'],
    IMPOSSIBLE_CONSTRAINT: ['prove-conflict', 'identify-relaxable-constraint', 'reframe-objective'],
    ECONOMIC_FAILURE: ['change-channel-or-segment', 'reprice-or-repackage', 'reduce-cost', 'kill-negative-mechanism-after-proof'],
    ENVIRONMENT_CHANGE: ['refresh-world-state', 'reopen-pruned-branches', 'rerank-under-new-conditions'],
    STOCHASTIC_FAILURE: ['increase-sample-size', 'prefer-robust-candidate', 'bounded-retry-only-if-safe'],
    UNKNOWN: ['collect-failure-evidence', 'diversify-search', 'switch-representation']
  };
  return [...new Set([...(byClass[failureClass] || byClass.UNKNOWN), ...common])];
}

export function compileConstraintMutationPlan({ currentAttempt, history = [] } = {}) {
  if (!Array.isArray(history) || history.length > MAX_HISTORY) return fail(['bounded-history-required']);
  const current = normalizeAttempt(currentAttempt);
  if (!current.ok) return fail(current.reasonCodes || ['current-attempt-invalid']);

  const prior = history
    .map(item => normalizeAttempt(item))
    .filter(item => item.ok)
    .map(item => item.attempt)
    .filter(item => item.strategyFingerprint === current.attempt.strategyFingerprint);

  const previousEvidence = new Set(prior.flatMap(item => item.evidenceRefs));
  const novelEvidence = current.attempt.evidenceRefs.filter(ref => !previousEvidence.has(ref));
  const repeatCount = prior.length;
  const sameStrategyRepeated = repeatCount > 0;
  const retryPermitted = !sameStrategyRepeated
    ? current.attempt.safeToRetrySameMechanism && !current.attempt.outcomeUncertain
    : current.attempt.safeToRetrySameMechanism && !current.attempt.outcomeUncertain && novelEvidence.length > 0;

  const hardMutationRequired = sameStrategyRepeated && !retryPermitted;
  const status = hardMutationRequired
    ? 'STRATEGY_MUTATION_REQUIRED'
    : retryPermitted
      ? 'BOUNDED_RETRY_WITH_NEW_EVIDENCE_PERMITTED'
      : 'COUNTERMOVE_REQUIRED';

  return {
    ok: true,
    policyVersion: CONSTRAINT_MUTATION_ENGINE_VERSION,
    status,
    objectiveId: current.attempt.objectiveId,
    mechanismId: current.attempt.mechanismId,
    providerId: current.attempt.providerId,
    failedSignature: current.attempt.failedSignature,
    strategyFingerprint: current.attempt.strategyFingerprint,
    repeatCount,
    sameStrategyRepeated,
    novelEvidenceRefs: novelEvidence,
    identicalRetryAllowed: retryPermitted,
    hardMutationRequired,
    failureClass: current.attempt.failureClass,
    mutationFamilies: mutationFamilies(current.attempt.failureClass),
    wallbreakerCountermoves: current.attempt.wallbreakerCountermoves,
    forbidden: [...new Set([...FORBIDDEN_ALWAYS, ...current.attempt.wallbreakerForbidden])],
    decision: hardMutationRequired ? 'MUTATE_STRATEGY_NOW' : retryPermitted ? 'BOUNDED_RETRY_ALLOWED' : 'USE_COUNTERMOVE',
    truthBoundary: 'A BLOCKED PATH IS NOT A BLOCKED OBJECTIVE; THIS ENGINE MAY CHANGE STRATEGY BUT NEVER WIDENS AUTHORITY OR FABRICATES SUCCESS',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
