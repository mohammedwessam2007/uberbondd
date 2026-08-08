import { digestObject } from './canonical.mjs';
import { verifyIntent, verifyExecutionReceiptShadow } from './kernel.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const SCHEMA_VERSION = 'omnia.v9.authorization-bound-execution-receipt.p7';

export class OmniaV9AuthorizationBindingError extends Error {
  constructor(message, code = 'AUTHORIZATION_BINDING_INVALID', detail = {}) {
    super(message);
    this.name = 'OmniaV9AuthorizationBindingError';
    this.code = code;
    this.detail = detail;
  }
}

function requireText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new OmniaV9AuthorizationBindingError(`${field} is required`, 'INVALID_INPUT', { field });
  return text;
}

function requireDigest(value, field) {
  const text = requireText(value, field).toLowerCase();
  if (!SHA256_HEX.test(text)) throw new OmniaV9AuthorizationBindingError(`${field} must be sha256 hex`, 'INVALID_INPUT', { field });
  return text;
}

function validIso(value, field) {
  const text = requireText(value, field);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new OmniaV9AuthorizationBindingError(`${field} must be ISO datetime`, 'INVALID_INPUT', { field });
  return new Date(ms).toISOString();
}

function verifyDecision(decision) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    return { ok: false, reason: 'authorization-decision-required' };
  }
  if (!['ALLOW', 'DENY', 'REVIEW'].includes(decision.decision)) return { ok: false, reason: 'authorization-decision-invalid' };
  if (!SHA256_HEX.test(String(decision.intentDigest || ''))) return { ok: false, reason: 'authorization-intent-digest-invalid' };
  if (!SHA256_HEX.test(String(decision.decisionDigest || ''))) return { ok: false, reason: 'authorization-decision-digest-invalid' };
  if (!SHA256_HEX.test(String(decision.policyDigest || ''))) return { ok: false, reason: 'authorization-policy-digest-invalid' };
  if (!SHA256_HEX.test(String(decision.constitutionDigest || ''))) return { ok: false, reason: 'authorization-constitution-digest-invalid' };
  try {
    if (digestObject(decision, ['decisionDigest']) !== decision.decisionDigest) return { ok: false, reason: 'authorization-decision-digest-mismatch' };
  } catch {
    return { ok: false, reason: 'authorization-decision-canonicalization-failed' };
  }
  return { ok: true };
}

export function buildAuthorizationBoundExecutionReceipt({ tenantId, intent, authorizationDecision, executionReceipt, boundAt = new Date().toISOString() }) {
  tenantId = requireText(tenantId, 'tenantId');

  const intentVerification = verifyIntent(intent, { now: new Date(boundAt) });
  if (!intentVerification.ok) {
    throw new OmniaV9AuthorizationBindingError('intent verification failed', 'INTENT_INVALID', { errors: intentVerification.errors });
  }

  const decisionVerification = verifyDecision(authorizationDecision);
  if (!decisionVerification.ok) {
    throw new OmniaV9AuthorizationBindingError(decisionVerification.reason, 'AUTHORIZATION_INVALID');
  }

  const receiptVerification = verifyExecutionReceiptShadow(executionReceipt);
  if (!receiptVerification.ok) {
    throw new OmniaV9AuthorizationBindingError(receiptVerification.reason, 'EXECUTION_RECEIPT_INVALID');
  }

  if (intent.tenantId !== tenantId) {
    throw new OmniaV9AuthorizationBindingError('tenant does not match intent tenant', 'TENANT_MISMATCH');
  }
  if (authorizationDecision.decision !== 'ALLOW') {
    throw new OmniaV9AuthorizationBindingError('only ALLOW decisions may bind a consequence receipt', 'AUTHORIZATION_NOT_ALLOW');
  }
  if (authorizationDecision.intentDigest !== intent.intentDigest) {
    throw new OmniaV9AuthorizationBindingError('authorization decision does not bind this intent', 'INTENT_DECISION_MISMATCH');
  }
  if (!authorizationDecision.approvalId) {
    throw new OmniaV9AuthorizationBindingError('ALLOW decision missing approval identity', 'APPROVAL_ID_MISSING');
  }
  if (executionReceipt.reservation?.idempotencyKey !== intent.idempotencyKey) {
    throw new OmniaV9AuthorizationBindingError('execution consequence idempotency key does not match intent', 'CONSEQUENCE_INTENT_MISMATCH');
  }

  const base = {
    schemaVersion: SCHEMA_VERSION,
    authoritative: false,
    enforced: false,
    tenantId,
    intentDigest: requireDigest(intent.intentDigest, 'intent.intentDigest'),
    authorizationDecisionDigest: requireDigest(authorizationDecision.decisionDigest, 'authorizationDecision.decisionDigest'),
    approvalId: requireText(authorizationDecision.approvalId, 'authorizationDecision.approvalId'),
    policyVersion: requireText(authorizationDecision.policyVersion, 'authorizationDecision.policyVersion'),
    policyDigest: requireDigest(authorizationDecision.policyDigest, 'authorizationDecision.policyDigest'),
    constitutionDigest: requireDigest(authorizationDecision.constitutionDigest, 'authorizationDecision.constitutionDigest'),
    consequence: {
      reservationId: requireText(executionReceipt.reservation?.id, 'executionReceipt.reservation.id'),
      idempotencyKey: requireText(executionReceipt.reservation?.idempotencyKey, 'executionReceipt.reservation.idempotencyKey'),
      receiptDigest: requireDigest(executionReceipt.receiptDigest, 'executionReceipt.receiptDigest'),
      preEffectContextDigest: requireDigest(executionReceipt.preEffectContextDigest, 'executionReceipt.preEffectContextDigest'),
      preEffectObservationDigest: requireDigest(executionReceipt.preEffectObservationDigest, 'executionReceipt.preEffectObservationDigest'),
      outcome: requireText(executionReceipt.outcome, 'executionReceipt.outcome')
    },
    boundAt: validIso(boundAt, 'boundAt')
  };

  return { ...base, bindingDigest: digestObject(base) };
}

export function verifyAuthorizationBoundExecutionReceipt(binding, { intent, authorizationDecision, executionReceipt } = {}) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return { ok: false, reason: 'binding-required' };
  if (binding.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: 'binding-schema-version-invalid' };
  if (binding.authoritative !== false || binding.enforced !== false) return { ok: false, reason: 'binding-must-remain-shadow' };
  if (!SHA256_HEX.test(String(binding.bindingDigest || ''))) return { ok: false, reason: 'binding-digest-invalid' };
  try {
    if (digestObject(binding, ['bindingDigest']) !== binding.bindingDigest) return { ok: false, reason: 'binding-digest-mismatch' };
  } catch {
    return { ok: false, reason: 'binding-canonicalization-failed' };
  }
  for (const field of ['intentDigest', 'authorizationDecisionDigest', 'policyDigest', 'constitutionDigest']) {
    if (!SHA256_HEX.test(String(binding[field] || ''))) return { ok: false, reason: `binding-${field}-invalid` };
  }
  for (const field of ['receiptDigest', 'preEffectContextDigest', 'preEffectObservationDigest']) {
    if (!SHA256_HEX.test(String(binding.consequence?.[field] || ''))) return { ok: false, reason: `binding-consequence-${field}-invalid` };
  }
  if (!binding.tenantId || !binding.approvalId || !binding.policyVersion || !binding.consequence?.reservationId || !binding.consequence?.idempotencyKey) {
    return { ok: false, reason: 'binding-required-fields-missing' };
  }
  if (!Number.isFinite(Date.parse(String(binding.boundAt || '')))) return { ok: false, reason: 'binding-bound-at-invalid' };

  if (intent) {
    const verifiedIntent = verifyIntent(intent, { now: new Date(binding.boundAt) });
    if (!verifiedIntent.ok) return { ok: false, reason: 'binding-intent-invalid', errors: verifiedIntent.errors };
    if (binding.tenantId !== intent.tenantId) return { ok: false, reason: 'binding-tenant-intent-mismatch' };
    if (binding.intentDigest !== intent.intentDigest) return { ok: false, reason: 'binding-intent-digest-mismatch' };
    if (binding.consequence.idempotencyKey !== intent.idempotencyKey) return { ok: false, reason: 'binding-idempotency-mismatch' };
  }

  if (authorizationDecision) {
    const verifiedDecision = verifyDecision(authorizationDecision);
    if (!verifiedDecision.ok) return verifiedDecision;
    if (authorizationDecision.decision !== 'ALLOW') return { ok: false, reason: 'binding-authorization-not-allow' };
    if (binding.authorizationDecisionDigest !== authorizationDecision.decisionDigest) return { ok: false, reason: 'binding-authorization-digest-mismatch' };
    if (binding.intentDigest !== authorizationDecision.intentDigest) return { ok: false, reason: 'binding-authorization-intent-mismatch' };
    if (binding.approvalId !== authorizationDecision.approvalId) return { ok: false, reason: 'binding-approval-mismatch' };
    if (binding.policyVersion !== authorizationDecision.policyVersion) return { ok: false, reason: 'binding-policy-version-mismatch' };
    if (binding.policyDigest !== authorizationDecision.policyDigest) return { ok: false, reason: 'binding-policy-digest-mismatch' };
    if (binding.constitutionDigest !== authorizationDecision.constitutionDigest) return { ok: false, reason: 'binding-constitution-digest-mismatch' };
  }

  if (executionReceipt) {
    const verifiedReceipt = verifyExecutionReceiptShadow(executionReceipt);
    if (!verifiedReceipt.ok) return verifiedReceipt;
    if (binding.consequence.reservationId !== executionReceipt.reservation?.id) return { ok: false, reason: 'binding-reservation-mismatch' };
    if (binding.consequence.idempotencyKey !== executionReceipt.reservation?.idempotencyKey) return { ok: false, reason: 'binding-receipt-idempotency-mismatch' };
    if (binding.consequence.receiptDigest !== executionReceipt.receiptDigest) return { ok: false, reason: 'binding-receipt-digest-mismatch' };
    if (binding.consequence.preEffectContextDigest !== executionReceipt.preEffectContextDigest) return { ok: false, reason: 'binding-context-digest-mismatch' };
    if (binding.consequence.preEffectObservationDigest !== executionReceipt.preEffectObservationDigest) return { ok: false, reason: 'binding-observation-digest-mismatch' };
    if (binding.consequence.outcome !== executionReceipt.outcome) return { ok: false, reason: 'binding-outcome-mismatch' };
  }

  return { ok: true };
}
