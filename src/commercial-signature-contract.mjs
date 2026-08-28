import crypto from 'node:crypto';

export const COMMERCIAL_SIGNATURE_POLICY_VERSION = 'commercial-signature-contract-1.0.0';
export const SIGNATURE_OPERATIONS = Object.freeze([
  'PREPARE_REQUEST', 'SEND_REQUEST', 'SEND_REMINDER', 'VOID_REQUEST'
]);
export const SIGNATURE_EVENT_TYPES = Object.freeze([
  'REQUEST_CREATED', 'REQUEST_SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'VOIDED', 'EXPIRED', 'PROVIDER_REJECTED'
]);
export const SIGNATURE_DOCUMENT_KINDS = Object.freeze([
  'PROPOSAL', 'STATEMENT_OF_WORK', 'ORDER_FORM', 'SERVICE_AGREEMENT', 'DATA_PROCESSING_ADDENDUM', 'OTHER'
]);
export const SIGNATURE_PROVIDER_CAPABILITIES = Object.freeze([
  'identity', 'authenticationMethod', 'termsAndAllowedPurposes', 'dryRunSupported', 'liveSupported',
  'createRequest', 'sendRequest', 'sendReminder', 'voidRequest', 'getRequest', 'webhookEvents', 'receipts', 'cancel'
]);

const EFFECT_OPERATIONS = new Set(['SEND_REQUEST', 'SEND_REMINDER', 'VOID_REQUEST']);
const SENSITIVE_KEYS = /(?:email|phone|address|fullname|firstname|lastname|signatur(?:e|edata)|document(?:body|content|bytes)|message|body|notes?|password|secret|token|authorization|cookie|credential|api[_-]?key|raw(?:payload|body|value))/i;
const SAFE_REFERENCE_KEYS = new Set([
  'documentRef', 'signerRef', 'signerRefs', 'providerReceiptRef', 'authorityReceiptRef',
  'communicationPolicyRef', 'suppressionCheckRef', 'signatureEvidenceRef', 'signedArtifactRef'
]);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
  credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
});

function clone(value) { return structuredClone(value); }
function text(value, max = 240) { const s = String(value ?? '').trim(); return s && s.length <= max ? s : null; }
function slug(value, max = 120) { const s = text(value, max); if (!s) return null; return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || null; }
function iso(value) { const s = text(value, 80); if (!s) return null; const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function invalid(reasonCodes, extra = {}) {
  return { ok: false, policyVersion: COMMERCIAL_SIGNATURE_POLICY_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS), ...extra };
}
function sensitiveKeys(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(String(key)) && !SAFE_REFERENCE_KEYS.has(String(key))) found.push(String(key));
    if (child && typeof child === 'object') found.push(...sensitiveKeys(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 30);
}
function signerRefs(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const refs = value.map(item => text(item, 200)).filter(Boolean);
  if (refs.length !== value.length || new Set(refs).size !== refs.length) return null;
  return refs;
}

export function compileSignatureCommand(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['signature-command-object-required']);
  const operation = String(input.operation ?? '').trim().toUpperCase();
  const occurrenceKey = text(input.occurrenceKey, 300);
  const documentRef = text(input.documentRef, 240);
  const documentKind = String(input.documentKind ?? '').trim().toUpperCase();
  const signers = signerRefs(input.signerRefs);
  const requestRef = input.requestRef == null ? null : text(input.requestRef, 200);
  const authorityReceiptRef = input.authorityReceiptRef == null ? null : text(input.authorityReceiptRef, 240);
  const idempotencyKey = input.idempotencyKey == null ? null : text(input.idempotencyKey, 300);
  const communicationPolicyRef = input.communicationPolicyRef == null ? null : text(input.communicationPolicyRef, 240);
  const suppressionCheckRef = input.suppressionCheckRef == null ? null : text(input.suppressionCheckRef, 240);
  const reasonCodes = [];
  if (!SIGNATURE_OPERATIONS.includes(operation)) reasonCodes.push('invalid-signature-operation');
  if (!occurrenceKey) reasonCodes.push('occurrence-key-required-or-too-long');
  if (!documentRef) reasonCodes.push('document-ref-required');
  if (!SIGNATURE_DOCUMENT_KINDS.includes(documentKind)) reasonCodes.push('invalid-document-kind');
  if (!signers) reasonCodes.push('valid-signer-ref-array-required');
  if (['SEND_REMINDER', 'VOID_REQUEST'].includes(operation) && !requestRef) reasonCodes.push('request-ref-required');
  if (EFFECT_OPERATIONS.has(operation) && !authorityReceiptRef) reasonCodes.push('authority-receipt-ref-required-for-signature-effect');
  if (EFFECT_OPERATIONS.has(operation) && !idempotencyKey) reasonCodes.push('idempotency-key-required-for-signature-effect');
  if (['SEND_REQUEST', 'SEND_REMINDER'].includes(operation) && !communicationPolicyRef) reasonCodes.push('communication-policy-ref-required-for-signature-message');
  if (['SEND_REQUEST', 'SEND_REMINDER'].includes(operation) && !suppressionCheckRef) reasonCodes.push('suppression-check-ref-required-for-signature-message');
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-signature-document-pii-or-secret-prohibited');
  const command = {
    schemaVersion: 'commercial-signature-command-1.0.0', operation, occurrenceKey, documentRef, documentKind,
    signerRefs: signers || [], requestRef, authorityReceiptRef, idempotencyKey, communicationPolicyRef, suppressionCheckRef,
    signerExecutionAuthority: 'NONE',
    legalAuthorityInference: 'PROHIBITED',
    durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_DOCUMENT_SIGNATURE_OR_SIGNER_PII'
  };
  command.commandId = SIGNATURE_OPERATIONS.includes(operation) && occurrenceKey && documentRef && signers
    ? `sig_cmd_${digest(command).slice(0, 32)}` : null;
  if (reasonCodes.length) return invalid(reasonCodes, { command, prohibitedKeys: prohibited });
  return { ok: true, policyVersion: COMMERCIAL_SIGNATURE_POLICY_VERSION, status: operation === 'PREPARE_REQUEST' ? 'SIGNATURE_REQUEST_PREPARED_LOCALLY' : 'SIGNATURE_COMMAND_PREPARED', command, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function normalizeSignatureProviderEvent(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['signature-event-object-required']);
  const provider = slug(input.provider, 80);
  const providerEventId = text(input.providerEventId, 200);
  const commandId = input.commandId == null ? null : text(input.commandId, 200);
  const requestRef = text(input.requestRef, 200);
  const eventType = String(input.eventType ?? '').trim().toUpperCase();
  const providerReceiptRef = text(input.providerReceiptRef, 240);
  const signerRef = input.signerRef == null ? null : text(input.signerRef, 200);
  const signatureEvidenceRef = input.signatureEvidenceRef == null ? null : text(input.signatureEvidenceRef, 240);
  const signedArtifactRef = input.signedArtifactRef == null ? null : text(input.signedArtifactRef, 240);
  const observedAt = iso(input.observedAt);
  const receivedAt = iso(input.receivedAt);
  const reasonCodes = [];
  if (!provider) reasonCodes.push('provider-required');
  if (!providerEventId) reasonCodes.push('provider-event-id-required-or-too-long');
  if (!requestRef) reasonCodes.push('request-ref-required');
  if (!SIGNATURE_EVENT_TYPES.includes(eventType)) reasonCodes.push('invalid-signature-event-type');
  if (!providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-signature-truth');
  if (['REQUEST_SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'VOIDED'].includes(eventType) && !commandId) reasonCodes.push('command-id-required-for-signature-effect-truth');
  if (eventType === 'SIGNED' && !signerRef) reasonCodes.push('signer-ref-required-for-signed-truth');
  if (eventType === 'SIGNED' && !signatureEvidenceRef) reasonCodes.push('signature-evidence-ref-required-for-signed-truth');
  if (eventType === 'SIGNED' && !signedArtifactRef) reasonCodes.push('signed-artifact-ref-required-for-signed-truth');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) reasonCodes.push('future-dated-signature-event');
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-signature-document-pii-or-secret-prohibited');
  const event = {
    schemaVersion: 'commercial-signature-provider-event-1.0.0', provider, providerEventId,
    eventId: provider && providerEventId ? `sig_evt_${digest([provider, providerEventId]).slice(0, 32)}` : null,
    commandId, requestRef, eventType, providerReceiptRef, signerRef, signatureEvidenceRef, signedArtifactRef,
    observedAt, receivedAt,
    legalEffect: 'UNDETERMINED_REQUIRES_SEPARATE_POLICY_AND_JURISDICTION',
    paymentTruthAuthority: 'NONE', deliveryAcceptanceTruthAuthority: 'NONE', signerAuthorityTruthAuthority: 'NONE',
    durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_DOCUMENT_SIGNATURE_OR_SIGNER_PII'
  };
  if (reasonCodes.length) return invalid(reasonCodes, { event, prohibitedKeys: prohibited });
  return { ok: true, policyVersion: COMMERCIAL_SIGNATURE_POLICY_VERSION, event, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function foldSignatureEvents(events = []) {
  if (!Array.isArray(events)) return invalid(['signature-events-array-required']);
  const kept = []; const byId = new Map(); const errors = []; const duplicates = []; const conflicts = [];
  events.forEach((input, index) => {
    const normalized = normalizeSignatureProviderEvent(input);
    if (!normalized.ok) { errors.push({ index, reasonCodes: normalized.reasonCodes }); return; }
    const event = normalized.event; const prior = byId.get(event.eventId);
    if (!prior) { byId.set(event.eventId, event); kept.push(event); }
    else if (JSON.stringify(prior) === JSON.stringify(event)) duplicates.push({ eventId: event.eventId, index });
    else conflicts.push({ eventId: event.eventId, index });
  });
  if (errors.length || conflicts.length) return invalid([...(errors.length ? ['invalid-signature-event'] : []), ...(conflicts.length ? ['conflicting-provider-event-identity'] : [])], { status: 'UNCERTAIN_EXTERNAL_STATE', errors, duplicates, conflicts });
  if (!kept.length) return invalid(['signature-event-required']);
  const requests = [...new Set(kept.map(event => event.requestRef))];
  if (requests.length !== 1) return invalid(['mixed-signature-request-events']);
  const types = new Set(kept.map(event => event.eventType));
  if (types.has('SIGNED') && types.has('DECLINED')) return invalid(['contradictory-signed-and-declined-truth'], { status: 'UNCERTAIN_EXTERNAL_STATE', requestRef: requests[0] });
  const ordered = [...kept].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt) || a.eventId.localeCompare(b.eventId));
  let state = 'OBSERVED';
  if (types.has('SIGNED')) state = 'SIGNED_PROVIDER_EVIDENCE';
  else if (types.has('DECLINED')) state = 'DECLINED';
  else if (types.has('VOIDED')) state = 'VOIDED';
  else if (types.has('EXPIRED')) state = 'EXPIRED';
  else if (types.has('VIEWED')) state = 'VIEWED';
  else if (types.has('REQUEST_SENT')) state = 'REQUEST_SENT';
  else if (types.has('REQUEST_CREATED')) state = 'REQUEST_CREATED';
  else if (types.has('PROVIDER_REJECTED')) state = 'PROVIDER_REJECTED';
  return {
    ok: true, policyVersion: COMMERCIAL_SIGNATURE_POLICY_VERSION, status: 'SIGNATURE_LIFECYCLE_FOLDED', requestRef: requests[0],
    state, eventIds: ordered.map(event => event.eventId), duplicateCount: duplicates.length,
    mayCountAsPayment: false, mayCountAsDeliveryAcceptance: false, mayProveSignerAuthority: false,
    retryDisposition: ['SIGNED_PROVIDER_EVIDENCE', 'DECLINED', 'VOIDED', 'EXPIRED'].includes(state) ? 'ALREADY_TERMINAL' : state === 'PROVIDER_REJECTED' ? 'SAFE_TO_REEVALUATE' : 'BLOCK_RETRY_UNTIL_RECONCILED',
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function unconfigured(provider, capability) { return { ok: false, policyVersion: COMMERCIAL_SIGNATURE_POLICY_VERSION, status: 'SIGNATURE_PROVIDER_NOT_CONFIGURED', provider, capability, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) }; }
export function createUnconfiguredSignatureProviderAdapter(providerName = 'unknown') {
  const provider = slug(providerName, 80) || 'unknown'; const adapter = { providerName: provider, configured: false };
  for (const capability of SIGNATURE_PROVIDER_CAPABILITIES) adapter[capability] = async () => unconfigured(provider, capability);
  adapter.dryRunSupported = async () => ({ ok: true, policyVersion: COMMERCIAL_SIGNATURE_POLICY_VERSION, status: 'DRY_RUN_ONLY', provider, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) });
  return adapter;
}
export function validateSignatureProviderAdapter(adapter) {
  const missing = SIGNATURE_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function');
  return { ok: missing.length === 0, policyVersion: COMMERCIAL_SIGNATURE_POLICY_VERSION, missing };
}
