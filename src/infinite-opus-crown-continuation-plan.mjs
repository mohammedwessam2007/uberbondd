import {
  SOURCE_KEY,
  RESUME_KEY,
  INTERRUPTED_RESUME_KEY,
  recoverInterruptedCrownCheckpoint
} from './crown-resume-checkpoint.mjs';

export const CROWN_TOTAL_EVALUATION_MICROUSD = 450_000;
export const CROWN_MONTHLY_CAP_MICROUSD = 20_000_000;
export const CROWN_MAX_RETRY_MICROUSD = 300_000;
export const CROWN_REMAINING_PAID_CALLS = 2;

const usdToConservativeMicrousd = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('nonnegative-usd-required');
  return Math.ceil(n * 1_000_000 - 1e-9);
};

export function crownContinuationBudget({ knownSpendUsd = 0, uncertainLiabilityUsd = 0 } = {}) {
  const knownSpendMicrousd = usdToConservativeMicrousd(knownSpendUsd);
  const uncertainLiabilityMicrousd = usdToConservativeMicrousd(uncertainLiabilityUsd);
  const economicExposureMicrousd = knownSpendMicrousd + uncertainLiabilityMicrousd;
  const remainingEnvelopeMicrousd = Math.max(0, CROWN_TOTAL_EVALUATION_MICROUSD - economicExposureMicrousd);
  const maxIncrementalMicrousd = Math.min(CROWN_MAX_RETRY_MICROUSD, remainingEnvelopeMicrousd);
  return Object.freeze({
    knownSpendMicrousd,
    uncertainLiabilityMicrousd,
    economicExposureMicrousd,
    remainingEnvelopeMicrousd,
    maxIncrementalMicrousd,
    knownSpendUsd: knownSpendMicrousd / 1_000_000,
    uncertainLiabilityUsd: uncertainLiabilityMicrousd / 1_000_000,
    economicExposureUsd: economicExposureMicrousd / 1_000_000,
    maxIncrementalUsd: maxIncrementalMicrousd / 1_000_000
  });
}

export function compileCrownContinuationPlan({ settings = {}, checkpointKey, now = Date.now() } = {}) {
  const target = settings?.[INTERRUPTED_RESUME_KEY] ?? null;
  if (target) {
    if (target.status === 'COMPLETE' && target.crownAdmission) {
      return {
        ok: true,
        state: 'CROWN_ADMISSION_READY',
        authorizationRequired: false,
        paidCallsRemaining: 0,
        maxIncrementalMicrousd: 0,
        maxIncrementalUsd: 0,
        crownAdmission: target.crownAdmission,
        providerCallsPerformed: 0,
        hiddenPayloadExposed: false
      };
    }
    if (target.status === 'COMPLETE_NON_OPUS_WINNER') {
      return {
        ok: true,
        state: 'CROWN_TOURNAMENT_COMPLETE_NON_OPUS_WINNER',
        winner: target.winner ?? null,
        authorizationRequired: false,
        paidCallsRemaining: 0,
        maxIncrementalMicrousd: 0,
        maxIncrementalUsd: 0,
        providerCallsPerformed: 0,
        hiddenPayloadExposed: false
      };
    }
    return {
      ok: false,
      state: 'R3_ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY',
      priorStatus: target.status ?? 'UNKNOWN',
      reason: target.reason ?? null,
      authorizationRequired: false,
      paidCallsRemaining: 0,
      providerCallsPerformed: 0,
      hiddenPayloadExposed: false
    };
  }

  const source = settings?.[RESUME_KEY];
  const originalState = settings?.[SOURCE_KEY];
  if (!source || !originalState) {
    return {
      ok: false,
      state: 'SEALED_CONTINUATION_SOURCE_MISSING',
      authorizationRequired: false,
      paidCallsRemaining: 0,
      providerCallsPerformed: 0,
      hiddenPayloadExposed: false
    };
  }

  let recovered;
  try {
    recovered = recoverInterruptedCrownCheckpoint(source, { key: checkpointKey, originalState });
  } catch (error) {
    return {
      ok: false,
      state: 'SEALED_CONTINUATION_NOT_VERIFIED',
      reason: String(error?.message || error),
      authorizationRequired: false,
      paidCallsRemaining: 0,
      providerCallsPerformed: 0,
      hiddenPayloadExposed: false
    };
  }

  const budget = crownContinuationBudget({
    knownSpendUsd: recovered.inheritedSpendUsd,
    uncertainLiabilityUsd: recovered.uncertainChargeLiabilityUsd
  });
  const canAuthorize = recovered.maximumRemainingPaidCalls === CROWN_REMAINING_PAID_CALLS &&
    budget.maxIncrementalMicrousd > 0;

  return {
    ok: canAuthorize,
    state: canAuthorize ? 'OWNER_EXACT_SPEND_AUTHORIZATION_REQUIRED' : 'CROWN_EVALUATION_ENVELOPE_EXHAUSTED',
    authorizationRequired: canAuthorize,
    operation: 'resume-existing-sealed-general-crown-evaluation',
    attemptKey: INTERRUPTED_RESUME_KEY,
    sourceKey: RESUME_KEY,
    evidenceRef: 'owner-approved-two-missing-crown-edges-r3',
    maxTotalEvaluationMicrousd: CROWN_TOTAL_EVALUATION_MICROUSD,
    monthlyCapMicrousd: CROWN_MONTHLY_CAP_MICROUSD,
    maxIncrementalMicrousd: budget.maxIncrementalMicrousd,
    maxIncrementalUsd: budget.maxIncrementalUsd,
    knownSpendUsd: budget.knownSpendUsd,
    uncertainHistoricalChargeActualUsd: null,
    uncertainHistoricalChargeLiabilityUsd: budget.uncertainLiabilityUsd,
    economicExposureUsd: budget.economicExposureUsd,
    paidCallsRemaining: CROWN_REMAINING_PAID_CALLS,
    missingEdges: ['one-missing-sol-candidate-answer', 'one-blind-custodian-grade'],
    retainedCandidateAnswers: recovered.calls?.length ?? 0,
    taskCommitment: recovered.taskCommitment,
    ownerConfirmationPhrase: `AUTHORIZE EXACTLY 2 CROWN EDGES MAX $${budget.maxIncrementalUsd.toFixed(6)}`,
    authorityExpiresMinutesAfterPress: 10,
    providerCallsPerformed: 0,
    hiddenPayloadExposed: false,
    truthBoundary: 'The historical vanished generation remains UNKNOWN actual cost and is charged at its full reserved maximum. This plan creates no spend authority until the authenticated founder explicitly confirms the exact ceiling.'
  };
}

export function buildCrownResumeAuthority(plan, { now = Date.now() } = {}) {
  if (!plan?.ok || plan.state !== 'OWNER_EXACT_SPEND_AUTHORIZATION_REQUIRED' ||
      !Number.isSafeInteger(plan.maxIncrementalMicrousd) || plan.maxIncrementalMicrousd <= 0) {
    throw new Error('authorizable-crown-continuation-plan-required');
  }
  return Object.freeze({
    operation: plan.operation,
    attemptKey: plan.attemptKey,
    sourceKey: plan.sourceKey,
    maxIncrementalMicrousd: plan.maxIncrementalMicrousd,
    maxTotalEvaluationMicrousd: plan.maxTotalEvaluationMicrousd,
    monthlyCapMicrousd: plan.monthlyCapMicrousd,
    maxRemainingPaidCalls: CROWN_REMAINING_PAID_CALLS,
    evidenceRef: plan.evidenceRef,
    authorizedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString()
  });
}
