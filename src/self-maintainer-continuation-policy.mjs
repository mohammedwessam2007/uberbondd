import { compileConstraintMutationPlan } from './constraint-mutation-engine.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SELF_MAINTAINER_CONTINUATION_POLICY_VERSION = 'self-maintainer-continuation-policy-1.0.0';

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);

function envelope(payload = {}) {
  return {
    policyVersion: SELF_MAINTAINER_CONTINUATION_POLICY_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...payload
  };
}

export function decideSelfMaintainerContinuation({ taskId, baseRevision, relayStatus, priorContinuations = [], evidenceRefs = [] } = {}) {
  const normalizedStatus = text(relayStatus, 80).toUpperCase();
  const objectiveId = text(taskId, 200);
  const base = text(baseRevision, 80);
  if (!objectiveId || !/^[a-f0-9]{40}$/i.test(base)) {
    return envelope({ ok: false, status: 'CONTINUATION_REFUSED', reasonCodes: ['task-id-and-exact-base-required'] });
  }

  if (normalizedStatus === 'WAITING_FOR_WORKER_RESULT') {
    return envelope({
      ok: true,
      status: 'WAIT_FOR_EXISTING_ATTEMPT',
      decision: 'DO_NOT_CREATE_DUPLICATE_TASK',
      taskId: objectiveId,
      truthBoundary: 'WAITING FOR AN EXISTING ATTEMPT IS NOT A NEW RETRY AND MUST NOT BE COUNTED AS PROGRESS'
    });
  }

  if (normalizedStatus === 'ALREADY_PROMOTED_REVIEW_PENDING') {
    return envelope({
      ok: true,
      status: 'REVIEW_PENDING',
      decision: 'DO_NOT_REIMPLEMENT_OR_REPROMOTE',
      taskId: objectiveId,
      truthBoundary: 'A REVIEW-PENDING CHANGESET IS ONE ATTEMPT; CLOCK TIME DOES NOT CREATE A NEW ENGINEERING OBJECTIVE'
    });
  }

  if (!['WORKER_REPAIR_REQUIRED', 'RELAY_UNAVAILABLE', 'PROMOTION_BLOCKED', 'RUNTIME_BLOCKED', 'CANDIDATE_REJECTED'].includes(normalizedStatus)) {
    return envelope({
      ok: true,
      status: 'CONTINUATION_NOT_REQUIRED',
      decision: 'FOLLOW_PRIMARY_RESULT',
      taskId: objectiveId
    });
  }

  const mechanismByStatus = {
    WORKER_REPAIR_REQUIRED: 'current-worker-mechanism',
    RELAY_UNAVAILABLE: 'current-relay-provider',
    PROMOTION_BLOCKED: 'current-promotion-substrate',
    RUNTIME_BLOCKED: 'current-runtime-substrate',
    CANDIDATE_REJECTED: 'current-candidate-generation-mechanism'
  };
  const failureByStatus = {
    WORKER_REPAIR_REQUIRED: { failureClass: 'IMPLEMENTATION_DEFECT', implementationError: true, outcomeUncertain: false },
    RELAY_UNAVAILABLE: { failureClass: 'PROVIDER_FAILURE', providerUnavailable: true, outcomeUncertain: true },
    PROMOTION_BLOCKED: { failureClass: 'AUTHORITY_BLOCK', authorityDenied: true, outcomeUncertain: false },
    RUNTIME_BLOCKED: { failureClass: 'PROVIDER_FAILURE', providerUnavailable: true, outcomeUncertain: true },
    CANDIDATE_REJECTED: { failureClass: 'IMPLEMENTATION_DEFECT', implementationError: true, outcomeUncertain: false }
  };

  const currentAttempt = {
    objectiveId,
    mechanismId: mechanismByStatus[normalizedStatus],
    providerId: normalizedStatus === 'WORKER_REPAIR_REQUIRED' || normalizedStatus === 'CANDIDATE_REJECTED' ? 'agent-worker' : 'execution-substrate',
    evidenceRefs: Array.isArray(evidenceRefs) ? evidenceRefs : [],
    failure: failureByStatus[normalizedStatus]
  };
  const sameMechanismPrior = Array.isArray(priorContinuations) && priorContinuations.length
    ? priorContinuations
    : [currentAttempt];
  const mutation = compileConstraintMutationPlan({ currentAttempt, history: sameMechanismPrior });
  if (!mutation.ok) return envelope({ ok: false, status: 'CONTINUATION_REFUSED', reasonCodes: mutation.reasonCodes || ['constraint-mutation-failed'] });

  return envelope({
    ok: true,
    status: 'STRATEGY_MUTATION_REQUIRED',
    decision: 'DO_NOT_REPEAT_ON_NEXT_CLOCK_TICK',
    taskId: objectiveId,
    blockedStatus: normalizedStatus,
    mutationPlan: mutation,
    nextMechanismMustDiffer: true,
    requiresNewEvidenceOrNewMechanism: true,
    truthBoundary: 'THE TIMER MAY REOBSERVE STATE; IT MAY NOT TURN THE SAME FAILED STRATEGY INTO A NEW ATTEMPT OR CLAIM PROGRESS'
  });
}
