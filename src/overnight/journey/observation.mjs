import { sha256 } from '../../../src/omnia-v9/canonical.mjs';
import {
  classifyEffectLedger,
  ZERO_EXTERNAL_EFFECTS,
  EFFECT_STATES
} from '../../../src/effect-ledgers.mjs';
import { normalizeEpistemicStatement } from './epistemic.mjs';

export const JOURNEY_OBSERVATION_POLICY_VERSION = 'overnight-journey-observation-1.0.0';

export const JOURNEY_STEP_TYPES = Object.freeze([
  'FORM',
  'CRM_RECEIPT',
  'SCHEDULER',
  'CONFIRMATION',
  'CHECKOUT'
]);

export const JOURNEY_STEP_STATUSES = Object.freeze([
  'PASS',
  'FAIL',
  'NOT_RUN',
  'UNKNOWN'
]);

const STEP_SET = new Set(JOURNEY_STEP_TYPES);
const STATUS_SET = new Set(JOURNEY_STEP_STATUSES);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function failure(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: JOURNEY_OBSERVATION_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: unique(reasonCodes),
    ...extra
  };
}

function normalizeAuthorization(authorization = {}, { journeyId, subjectRef, at }) {
  const reasonCodes = [];
  const decision = text(authorization.decision, 30).toUpperCase();
  const operation = text(authorization.operation, 80).toUpperCase();
  const capability = text(authorization.capability, 80).toUpperCase();
  const effectClass = text(authorization.effectClass, 40).toUpperCase();
  const expiresAt = iso(authorization.expiresAt);

  if (decision !== 'ALLOW') reasonCodes.push('synthetic-check-authorization-not-allowed');
  if (operation !== 'JOURNEY_SYNTHETIC_CHECK') reasonCodes.push('synthetic-check-operation-mismatch');
  if (capability !== 'SYNTHETIC_JOURNEY_CHECK') reasonCodes.push('synthetic-check-capability-mismatch');
  if (effectClass !== 'ZERO_EFFECT') reasonCodes.push('synthetic-check-must-be-zero-effect');
  if (!text(authorization.intentId, 180)) reasonCodes.push('authorization-intent-required');
  if (!text(authorization.nonce, 180)) reasonCodes.push('authorization-nonce-required');
  if (!expiresAt) reasonCodes.push('authorization-expiry-required');
  else if (Date.parse(expiresAt) <= Date.parse(at)) reasonCodes.push('authorization-expired');
  if (authorization.journeyId && text(authorization.journeyId, 180) !== journeyId) reasonCodes.push('authorization-journey-mismatch');
  if (authorization.subjectRef && text(authorization.subjectRef, 180) !== subjectRef) reasonCodes.push('authorization-subject-mismatch');

  if (reasonCodes.length) return { ok: false, reasonCodes };

  const normalized = {
    decision,
    operation,
    capability,
    effectClass,
    intentId: text(authorization.intentId, 180),
    nonce: text(authorization.nonce, 180),
    expiresAt,
    journeyId: text(authorization.journeyId, 180) || journeyId,
    subjectRef: text(authorization.subjectRef, 180) || subjectRef
  };
  return {
    ok: true,
    authorization: {
      ...normalized,
      authorizationDigest: sha256(normalized)
    }
  };
}

function normalizeReceipt(receipt = {}, { checkId, at }) {
  const ledger = receipt.externalEffectLedger;
  const classified = classifyEffectLedger('externalEffectLedger', ledger);
  if (!classified.ok) return failure(['receipt-effect-ledger-invalid', ...classified.reasonCodes]);
  if (classified.state !== EFFECT_STATES.ZERO_EFFECT || !classified.provenZero) {
    return failure(['synthetic-check-requires-proven-zero-effect', `receipt-effect-state:${classified.state}`]);
  }

  const receiptId = text(receipt.receiptId, 180);
  const operation = text(receipt.operation, 100).toUpperCase();
  const observedAt = iso(receipt.observedAt || at);
  const receiptCheckId = text(receipt.checkId, 180);
  const reasonCodes = [];
  if (!receiptId) reasonCodes.push('receipt-id-required');
  if (operation !== 'JOURNEY_SYNTHETIC_CHECK') reasonCodes.push('receipt-operation-mismatch');
  if (!observedAt) reasonCodes.push('receipt-time-required');
  if (receiptCheckId && receiptCheckId !== checkId) reasonCodes.push('receipt-check-mismatch');
  if (reasonCodes.length) return failure(reasonCodes);

  const normalized = {
    receiptId,
    operation,
    observedAt,
    checkId,
    effectState: EFFECT_STATES.ZERO_EFFECT,
    externalEffectLedger: { ...classified.ledger },
    providerReferences: []
  };
  return {
    ok: true,
    receipt: {
      ...normalized,
      receiptDigest: sha256(normalized)
    }
  };
}

function normalizeSteps(rawSteps, { checkId, at }) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return failure(['journey-steps-required']);
  const steps = [];
  const seenIds = new Set();
  const seenTypes = new Set();
  const reasonCodes = [];

  for (const [index, raw] of rawSteps.entries()) {
    const stepType = text(raw?.stepType, 40).toUpperCase();
    const stepId = text(raw?.stepId, 180) || `${checkId}_step_${index + 1}`;
    const status = text(raw?.status, 30).toUpperCase();
    const observedAt = iso(raw?.observedAt || at);
    const evidenceRef = text(raw?.evidenceRef, 300);
    if (!STEP_SET.has(stepType)) reasonCodes.push(`unknown-step-type:${stepType || 'empty'}`);
    if (seenIds.has(stepId)) reasonCodes.push(`duplicate-step-id:${stepId}`);
    if (seenTypes.has(stepType)) reasonCodes.push(`duplicate-step-type:${stepType}`);
    if (!STATUS_SET.has(status)) reasonCodes.push(`invalid-step-status:${status || 'empty'}`);
    if (!observedAt) reasonCodes.push(`step-time-required:${stepId}`);
    if (!evidenceRef) reasonCodes.push(`step-evidence-reference-required:${stepId}`);
    seenIds.add(stepId);
    seenTypes.add(stepType);
    steps.push({
      stepId,
      stepType,
      status,
      observedAt,
      evidenceRef,
      note: text(raw?.note, 240) || null
    });
  }
  if (reasonCodes.length) return failure(reasonCodes);

  const missing = JOURNEY_STEP_TYPES.filter(stepType => !seenTypes.has(stepType));
  for (const stepType of missing) {
    steps.push({
      stepId: `${checkId}_missing_${stepType.toLowerCase()}`,
      stepType,
      status: 'NOT_RUN',
      observedAt: at,
      evidenceRef: `derived:${checkId}:missing:${stepType}`,
      note: 'Required step was not supplied by the deterministic check input.',
      missing: true
    });
  }

  steps.sort((a, b) => JOURNEY_STEP_TYPES.indexOf(a.stepType) - JOURNEY_STEP_TYPES.indexOf(b.stepType));
  return { ok: true, steps };
}

function journeyStatus(steps) {
  if (steps.some(step => step.status === 'FAIL')) return 'BROKEN';
  if (steps.some(step => ['NOT_RUN', 'UNKNOWN'].includes(step.status))) return 'INCOMPLETE';
  return 'COMPLETED';
}

/**
 * Normalize an already-authorized synthetic journey result.
 *
 * This function only evaluates supplied deterministic witnesses. It does not
 * open a browser, call a provider, submit a form, write a CRM, schedule an
 * appointment, or create a checkout. A complete canonical zero-effect receipt
 * is required before any result becomes an observation.
 */
export function observeSyntheticJourney({
  checkId,
  journeyId,
  subjectRef = '',
  authorization,
  receipt,
  steps,
  date = new Date()
} = {}) {
  const at = iso(date);
  const normalizedCheckId = text(checkId, 180);
  const normalizedJourneyId = text(journeyId, 180);
  const normalizedSubjectRef = text(subjectRef, 180);
  if (!at) return failure(['observation-time-required']);
  if (!normalizedCheckId) return failure(['check-id-required']);
  if (!normalizedJourneyId) return failure(['journey-id-required']);

  const auth = normalizeAuthorization(authorization, {
    journeyId: normalizedJourneyId,
    subjectRef: normalizedSubjectRef,
    at
  });
  if (!auth.ok) return failure(auth.reasonCodes);

  const normalizedReceipt = normalizeReceipt(receipt, { checkId: normalizedCheckId, at });
  if (!normalizedReceipt.ok) return normalizedReceipt;

  const normalizedSteps = normalizeSteps(steps, { checkId: normalizedCheckId, at });
  if (!normalizedSteps.ok) return normalizedSteps;

  const observations = normalizedSteps.steps.map(step => {
    const statement = normalizeEpistemicStatement({
      statement: `${step.stepType} recorded status ${step.status} in the authorized synthetic check.`,
      relation: step.missing ? 'DERIVED' : 'OBSERVED',
      evidenceRefs: [step.evidenceRef, normalizedReceipt.receipt.receiptId],
      source: step.missing ? '' : 'SYNTHETIC_CHECK',
      derivationRule: step.missing ? 'required-step-absent-from-deterministic-input' : '',
      confidence: step.missing ? 1 : 1,
      statementId: `observation_${sha256({ normalizedCheckId, step }).slice(0, 24)}`
    });
    if (!statement.ok) return statement;
    return {
      ...statement.statement,
      observationId: statement.statement.statementId,
      stepId: step.stepId,
      stepType: step.stepType,
      status: step.status,
      observedAt: step.observedAt,
      evidenceRef: step.evidenceRef,
      note: step.note
    };
  });
  const invalidObservation = observations.find(item => item?.ok === false);
  if (invalidObservation) return failure(['observation-statement-invalid', ...invalidObservation.reasonCodes]);

  const identity = {
    policyVersion: JOURNEY_OBSERVATION_POLICY_VERSION,
    checkId: normalizedCheckId,
    journeyId: normalizedJourneyId,
    subjectRef: normalizedSubjectRef,
    authorizationDigest: auth.authorization.authorizationDigest,
    receiptDigest: normalizedReceipt.receipt.receiptDigest,
    steps: observations.map(item => item.observationId)
  };

  return {
    ok: true,
    policyVersion: JOURNEY_OBSERVATION_POLICY_VERSION,
    status: journeyStatus(normalizedSteps.steps),
    checkId: normalizedCheckId,
    journeyId: normalizedJourneyId,
    subjectRef: normalizedSubjectRef || null,
    observedAt: at,
    authorization: auth.authorization,
    receipt: normalizedReceipt.receipt,
    steps: normalizedSteps.steps,
    observations,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    effectState: EFFECT_STATES.ZERO_EFFECT,
    runDigest: sha256(identity)
  };
}

