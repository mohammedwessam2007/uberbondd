import { compileConstraintMutationPlan } from './constraint-mutation-engine.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SELF_MAINTAINER_CONTINUATION_POLICY_VERSION = 'self-maintainer-continuation-policy-1.2.0';

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const reasonSet = value => new Set(Array.isArray(value) ? value.map(item => text(item, 200)).filter(Boolean) : []);

function envelope(payload = {}) {
  return {
    policyVersion: SELF_MAINTAINER_CONTINUATION_POLICY_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...payload
  };
}

export function decideSelfMaintainerContinuation({
  taskId,
  baseRevision,
  relayStatus,
  reasonCodes = [],
  priorContinuations = [],
  evidenceRefs = []
} = {}) {
  const normalizedStatus = text(relayStatus, 80).toUpperCase();
  const objectiveId = text(taskId, 200);
  const base = text(baseRevision, 80);
  const reasons = reasonSet(reasonCodes);
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

  if (normalizedStatus === 'CANDIDATE_REJECTED' && reasons.has('worker-decision-stop')) {
    return envelope({
      ok: true,
      status: 'NO_SAFE_CHANGE_THIS_BASE',
      decision: 'WAIT_FOR_NEW_EVIDENCE_OR_MAIN_CHANGE',
      taskId: objectiveId,
      reasonCodes: ['worker-decision-stop'],
      nextMechanismMustDiffer: false,
      requiresNewEvidenceOrNewMechanism: true,
      truthBoundary: 'A PRINCIPLED STOP IS A STOPPING RULE, NOT AN IMPLEMENTATION FAILURE; DO NOT FORCE ACTION MERELY TO KEEP THE LOOP BUSY'
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
    truthBoundary: 'A TIMER OR MANUAL REENTRY MAY REOBSERVE STATE; IT MAY NOT TURN THE SAME FAILED STRATEGY INTO A NEW ATTEMPT OR CLAIM PROGRESS'
  });
}

export function gateSelfMaintainerPulse({ currentBaseRevision, priorReceipt = null } = {}) {
  const currentBase = text(currentBaseRevision, 80).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(currentBase)) {
    return envelope({ ok: false, status: 'PULSE_PREFLIGHT_REFUSED', runPrimaryTick: false, reasonCodes: ['exact-current-base-required'] });
  }
  if (!priorReceipt || typeof priorReceipt !== 'object' || Array.isArray(priorReceipt)) {
    return envelope({
      ok: true,
      status: 'PULSE_ALLOWED_NO_PRIOR_CONTINUATION',
      runPrimaryTick: true,
      resumeExistingAttemptOnly: false,
      currentBaseRevision: currentBase,
      truthBoundary: 'NO PRIOR CONTINUATION RECEIPT WAS AVAILABLE; THIS DOES NOT IMPLY THE BASE IS NOVEL OUTSIDE THIS WORKFLOW'
    });
  }

  const observedBase = text(priorReceipt.observedBaseRevision, 80).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(observedBase)) {
    return envelope({
      ok: true,
      status: 'PULSE_ALLOWED_UNUSABLE_PRIOR_RECEIPT',
      runPrimaryTick: true,
      resumeExistingAttemptOnly: false,
      currentBaseRevision: currentBase,
      reasonCodes: ['prior-receipt-exact-base-unavailable'],
      truthBoundary: 'AN UNBOUND HISTORICAL RECEIPT CANNOT BLOCK A CURRENT BASE'
    });
  }
  if (observedBase !== currentBase) {
    return envelope({
      ok: true,
      status: 'PULSE_ALLOWED_NEW_BASE_EVIDENCE',
      runPrimaryTick: true,
      resumeExistingAttemptOnly: false,
      currentBaseRevision: currentBase,
      priorBaseRevision: observedBase,
      truthBoundary: 'A DIFFERENT MAIN SHA IS NEW REPOSITORY EVIDENCE; PREVIOUS SAME-BASE STOPPING RULES DO NOT AUTOMATICALLY VETO REEVALUATION'
    });
  }

  const priorContinuation = priorReceipt.continuation && typeof priorReceipt.continuation === 'object'
    ? priorReceipt.continuation
    : {};
  const priorStatus = text(priorContinuation.status, 120).toUpperCase();

  if (priorStatus === 'WAIT_FOR_EXISTING_ATTEMPT') {
    const issueNumber = Number(priorReceipt.observedIssueNumber);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
      return envelope({
        ok: true,
        status: 'CURRENT_BASE_WAIT_WITHOUT_BOUND_ATTEMPT_BLOCKED',
        runPrimaryTick: false,
        resumeExistingAttemptOnly: false,
        currentBaseRevision: currentBase,
        priorContinuationStatus: priorStatus,
        reasonCodes: ['waiting-continuation-requires-existing-issue-binding'],
        truthBoundary: 'WAIT MAY RESUME ONLY THE EXACT EXISTING RELAY ATTEMPT; WITHOUT ITS ISSUE ID A NEW SAME-BASE ATTEMPT IS REFUSED'
      });
    }
    return envelope({
      ok: true,
      status: 'CURRENT_BASE_EXISTING_ATTEMPT_RESUME_ONLY',
      runPrimaryTick: true,
      resumeExistingAttemptOnly: true,
      resumeIssueNumber: issueNumber,
      currentBaseRevision: currentBase,
      priorContinuationStatus: priorStatus,
      requiredDecision: 'READ_OR_ADVANCE_EXISTING_ATTEMPT_ONLY',
      truthBoundary: 'THE SAME-BASE PULSE MAY OBSERVE OR ADVANCE THE EXACT EXISTING RELAY ISSUE; IT MAY NOT CREATE A SECOND TASK OR COUNT WAITING AS PROGRESS'
    });
  }

  const blocking = new Set([
    'REVIEW_PENDING',
    'NO_SAFE_CHANGE_THIS_BASE',
    'STRATEGY_MUTATION_REQUIRED'
  ]);
  if (blocking.has(priorStatus)) {
    return envelope({
      ok: true,
      status: 'CURRENT_BASE_REENTRY_BLOCKED',
      runPrimaryTick: false,
      resumeExistingAttemptOnly: false,
      currentBaseRevision: currentBase,
      priorContinuationStatus: priorStatus,
      requiredDecision: priorStatus === 'STRATEGY_MUTATION_REQUIRED'
        ? 'MUTATE_MECHANISM_OR_WAIT_FOR_NEW_EVIDENCE'
        : 'PRESERVE_EXISTING_ATTEMPT_OR_STOPPING_RULE',
      truthBoundary: 'THE SAME BASE AND SAME CONTINUATION STATE MAY NOT BE RECAST AS A FRESH ATTEMPT BY MANUAL OR CLOCK REENTRY'
    });
  }

  return envelope({
    ok: true,
    status: 'PULSE_ALLOWED_PRIOR_CONTINUATION_NONBLOCKING',
    runPrimaryTick: true,
    resumeExistingAttemptOnly: false,
    currentBaseRevision: currentBase,
    priorContinuationStatus: priorStatus || null,
    truthBoundary: 'THE PRIOR RECEIPT DID NOT REQUIRE STOP, REVIEW HOLD, OR STRATEGY MUTATION'
  });
}
