// Product-agnostic delivery + customer acceptance truth engine.
//
// This module intentionally cannot infer customer acceptance from internal
// activity. ACCEPTED requires customer-origin evidence bound to the exact
// customer, scope and delivery version. Synthetic/model/operator evidence may
// prove preparation or internal verification, never acceptance.

export const DELIVERY_ACCEPTANCE_POLICY_VERSION = 'delivery-acceptance-truth-1.0.0';

export const DELIVERY_STATES = Object.freeze([
  'NOT_STARTED',
  'IN_PROGRESS',
  'DELIVERY_READY',
  'DELIVERED_UNACKNOWLEDGED',
  'ACCEPTED',
  'REJECTED_WITH_REASON',
  'REPAIR_REQUIRED',
  'CANCELLED',
  'REFUNDED'
]);

export const DELIVERY_ZERO_EFFECTS = Object.freeze({
  messages: 0,
  calls: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  customerMutations: 0,
  paymentEffects: 0,
  spendCents: 0
});

const TERMINAL = new Set(['ACCEPTED', 'CANCELLED', 'REFUNDED']);
const EVIDENCE_ORIGINS = new Set([
  'INTERNAL_DETERMINISTIC',
  'MODEL_OUTPUT',
  'OPERATOR_ASSERTION',
  'PROVIDER_EVENT',
  'CUSTOMER_ORIGIN',
  'SYNTHETIC'
]);

const TRANSITIONS = Object.freeze({
  NOT_STARTED: new Set(['IN_PROGRESS', 'CANCELLED', 'REFUNDED']),
  IN_PROGRESS: new Set(['DELIVERY_READY', 'REPAIR_REQUIRED', 'CANCELLED', 'REFUNDED']),
  DELIVERY_READY: new Set(['DELIVERED_UNACKNOWLEDGED', 'REPAIR_REQUIRED', 'CANCELLED', 'REFUNDED']),
  DELIVERED_UNACKNOWLEDGED: new Set(['ACCEPTED', 'REJECTED_WITH_REASON', 'REPAIR_REQUIRED', 'CANCELLED', 'REFUNDED']),
  REJECTED_WITH_REASON: new Set(['REPAIR_REQUIRED', 'CANCELLED', 'REFUNDED']),
  REPAIR_REQUIRED: new Set(['IN_PROGRESS', 'DELIVERY_READY', 'CANCELLED', 'REFUNDED']),
  ACCEPTED: new Set([]),
  CANCELLED: new Set([]),
  REFUNDED: new Set([])
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
}

function normalizeEvidence(evidence = {}) {
  const origin = EVIDENCE_ORIGINS.has(evidence.origin) ? evidence.origin : 'OPERATOR_ASSERTION';
  return {
    evidenceId: text(evidence.evidenceId),
    origin,
    sourceRef: text(evidence.sourceRef) || null,
    customerId: text(evidence.customerId) || null,
    scopeId: text(evidence.scopeId) || null,
    deliveryVersion: text(evidence.deliveryVersion) || null,
    observedAt: text(evidence.observedAt) || null,
    customerDecision: ['ACCEPT', 'REJECT', 'NONE'].includes(evidence.customerDecision)
      ? evidence.customerDecision
      : 'NONE',
    reason: text(evidence.reason) || null,
    synthetic: origin === 'SYNTHETIC' || evidence.synthetic === true
  };
}

export function createDeliveryRecord(input = {}) {
  const deliveryId = text(input.deliveryId);
  const customerId = text(input.customerId);
  const scopeId = text(input.scopeId);
  const skuId = text(input.skuId);
  const deliveryVersion = text(input.deliveryVersion || 'v1');
  const deliverables = stringList(input.deliverables);

  if (!deliveryId) return { ok: false, reason: 'missing-delivery-id', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  if (!customerId) return { ok: false, reason: 'missing-customer-id', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  if (!scopeId) return { ok: false, reason: 'missing-scope-id', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  if (!skuId) return { ok: false, reason: 'missing-sku-id', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  if (!deliverables.length) return { ok: false, reason: 'missing-deliverables', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };

  return {
    ok: true,
    record: {
      policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION,
      deliveryId,
      customerId,
      scopeId,
      skuId,
      deliveryVersion,
      state: 'NOT_STARTED',
      sequence: 0,
      deliverables,
      evidence: [],
      rejectionReason: null,
      acceptedAt: null,
      acceptanceEvidenceId: null,
      truth: {
        prepared: false,
        delivered: false,
        customerAccepted: false,
        customerAcceptanceProof: 'ABSENT'
      },
      externalEffectLedger: { ...DELIVERY_ZERO_EFFECTS }
    }
  };
}

function sameIdentity(record, evidence) {
  return evidence.customerId === record.customerId
    && evidence.scopeId === record.scopeId
    && evidence.deliveryVersion === record.deliveryVersion;
}

function evaluateAcceptanceEvidence(record, evidence) {
  if (evidence.synthetic) return { ok: false, reason: 'synthetic-evidence-cannot-prove-customer-acceptance' };
  if (evidence.origin !== 'CUSTOMER_ORIGIN') return { ok: false, reason: 'acceptance-requires-customer-origin-evidence' };
  if (!evidence.evidenceId) return { ok: false, reason: 'acceptance-evidence-id-required' };
  if (!evidence.sourceRef) return { ok: false, reason: 'acceptance-source-ref-required' };
  if (!sameIdentity(record, evidence)) return { ok: false, reason: 'acceptance-evidence-identity-mismatch' };
  if (evidence.customerDecision !== 'ACCEPT') return { ok: false, reason: 'customer-accept-decision-required' };
  return { ok: true };
}

function evaluateRejectionEvidence(record, evidence) {
  if (evidence.synthetic) return { ok: false, reason: 'synthetic-evidence-cannot-prove-customer-rejection' };
  if (evidence.origin !== 'CUSTOMER_ORIGIN') return { ok: false, reason: 'rejection-requires-customer-origin-evidence' };
  if (!evidence.evidenceId || !evidence.sourceRef) return { ok: false, reason: 'rejection-source-evidence-required' };
  if (!sameIdentity(record, evidence)) return { ok: false, reason: 'rejection-evidence-identity-mismatch' };
  if (evidence.customerDecision !== 'REJECT') return { ok: false, reason: 'customer-reject-decision-required' };
  if (!evidence.reason) return { ok: false, reason: 'customer-rejection-reason-required' };
  return { ok: true };
}

export function transitionDelivery(recordInput, transition = {}) {
  const record = clone(recordInput);
  if (!record || typeof record !== 'object') {
    return { ok: false, reason: 'malformed-delivery-record', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }
  if (!DELIVERY_STATES.includes(record.state)) {
    return { ok: false, reason: 'unknown-current-delivery-state', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }

  const to = text(transition.to);
  if (!DELIVERY_STATES.includes(to)) {
    return { ok: false, reason: 'unknown-target-delivery-state', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }
  if (TERMINAL.has(record.state)) {
    return { ok: false, reason: 'terminal-delivery-state-cannot-transition', state: record.state, policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }
  if (!TRANSITIONS[record.state].has(to)) {
    return { ok: false, reason: 'invalid-delivery-transition', from: record.state, to, policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }

  const expectedSequence = Number(record.sequence) + 1;
  if (transition.sequence != null && Number(transition.sequence) !== expectedSequence) {
    return { ok: false, reason: 'delivery-sequence-conflict', expectedSequence, providedSequence: Number(transition.sequence), policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }

  const evidence = normalizeEvidence(transition.evidence || {});
  if (to === 'ACCEPTED') {
    const verdict = evaluateAcceptanceEvidence(record, evidence);
    if (!verdict.ok) return { ...verdict, policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }
  if (to === 'REJECTED_WITH_REASON') {
    const verdict = evaluateRejectionEvidence(record, evidence);
    if (!verdict.ok) return { ...verdict, policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }

  if (evidence.evidenceId) {
    const existing = record.evidence.find(item => item.evidenceId === evidence.evidenceId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(evidence)) {
      return { ok: false, reason: 'delivery-evidence-id-conflict', evidenceId: evidence.evidenceId, policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
    }
    if (!existing) record.evidence.push(evidence);
  }

  record.state = to;
  record.sequence = expectedSequence;
  if (to === 'DELIVERY_READY') record.truth.prepared = true;
  if (to === 'DELIVERED_UNACKNOWLEDGED') record.truth.delivered = true;
  if (to === 'ACCEPTED') {
    record.truth.customerAccepted = true;
    record.truth.customerAcceptanceProof = 'CUSTOMER_ORIGIN_VERIFIED';
    record.acceptanceEvidenceId = evidence.evidenceId;
    record.acceptedAt = evidence.observedAt;
  }
  if (to === 'REJECTED_WITH_REASON') record.rejectionReason = evidence.reason;
  if (to === 'REPAIR_REQUIRED') {
    record.truth.customerAccepted = false;
    record.truth.customerAcceptanceProof = 'ABSENT';
    record.acceptanceEvidenceId = null;
    record.acceptedAt = null;
  }

  return {
    ok: true,
    record,
    transitionReceipt: {
      deliveryId: record.deliveryId,
      from: recordInput.state,
      to,
      sequence: expectedSequence,
      evidenceId: evidence.evidenceId || null,
      externalEffectLedger: { ...DELIVERY_ZERO_EFFECTS }
    }
  };
}

export function summarizeDeliveryTruth(record = {}) {
  if (!record || typeof record !== 'object' || !DELIVERY_STATES.includes(record.state)) {
    return { ok: false, reason: 'malformed-delivery-record', policyVersion: DELIVERY_ACCEPTANCE_POLICY_VERSION };
  }
  return {
    ok: true,
    deliveryId: record.deliveryId,
    state: record.state,
    sequence: record.sequence,
    prepared: record.truth?.prepared === true,
    delivered: record.truth?.delivered === true,
    customerAccepted: record.truth?.customerAccepted === true,
    customerAcceptanceProof: record.truth?.customerAcceptanceProof || 'ABSENT',
    acceptanceEvidenceId: record.acceptanceEvidenceId || null,
    rejectionReason: record.rejectionReason || null,
    externalEffectLedger: { ...DELIVERY_ZERO_EFFECTS }
  };
}
