import crypto from 'node:crypto';

export const EXTERNAL_CRM_SYNC_POLICY_VERSION = 'external-crm-sync-contract-1.0.0';
export const CRM_OBJECT_TYPES = Object.freeze(['ACCOUNT', 'CONTACT', 'OPPORTUNITY', 'ACTIVITY', 'BOOKING', 'RECEIVABLE']);
export const CRM_WRITE_OPERATIONS = Object.freeze(['CREATE', 'UPDATE', 'LINK']);
export const CRM_PROVIDER_CAPABILITIES = Object.freeze([
  'identity', 'authenticationMethod', 'termsAndAllowedPurposes', 'dryRunSupported', 'liveSupported',
  'getObject', 'listChanges', 'createObject', 'updateObject', 'linkObjects', 'receipts', 'cancel'
]);

const CANONICAL_PROTECTED_FIELDS = new Set([
  'payment-status', 'payment-cleared', 'revenue-cents', 'refund-status', 'chargeback-status',
  'delivery-accepted', 'renewal-status', 'customer-acceptance', 'consent-status', 'suppression-status',
  'authority-status', 'kyc-status'
]);
const SENSITIVE_KEYS = /(?:email|phone|address|fullname|customername|firstname|lastname|message|notes?|description|password|secret|token|authorization|cookie|credential|api[_-]?key|raw(?:payload|body|value))/i;
const ZERO_EFFECTS = Object.freeze({ providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 });

function clone(v) { return structuredClone(v); }
function text(v, max = 240) { const s = String(v ?? '').trim(); return s && s.length <= max ? s : null; }
function slug(v, max = 120) { const s = text(v, max); if (!s) return null; return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null; }
function iso(v) { const s = text(v, 80); if (!s) return null; const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
function digest(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
function invalid(reasonCodes, extra = {}) { return { ok: false, policyVersion: EXTERNAL_CRM_SYNC_POLICY_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS), ...extra }; }
function sensitiveKeys(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(String(key))) found.push(String(key));
    if (child && typeof child === 'object') found.push(...sensitiveKeys(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 20);
}
function normalizeFieldClaims(fields) {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 100) return null;
  const result = [];
  const seen = new Set();
  for (const entry of fields) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const field = slug(entry.field, 100);
    const valueRef = text(entry.valueRef, 240);
    const evidenceRef = entry.evidenceRef == null ? null : text(entry.evidenceRef, 240);
    if (!field || !valueRef || seen.has(field)) return null;
    seen.add(field);
    result.push({ field, valueRef, evidenceRef, canonicalProtected: CANONICAL_PROTECTED_FIELDS.has(field) });
  }
  return result;
}

export function normalizeCrmObservation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['crm-observation-object-required']);
  const provider = slug(input.provider, 80);
  const providerEventId = text(input.providerEventId, 200);
  const objectType = String(input.objectType ?? '').trim().toUpperCase();
  const externalObjectRef = text(input.externalObjectRef, 200);
  const providerVersionRef = text(input.providerVersionRef, 200);
  const fields = normalizeFieldClaims(input.fields);
  const providerReceiptRef = text(input.providerReceiptRef, 240);
  const observedAt = iso(input.observedAt); const receivedAt = iso(input.receivedAt);
  const reasonCodes = [];
  if (!provider) reasonCodes.push('provider-required');
  if (!providerEventId) reasonCodes.push('provider-event-id-required-or-too-long');
  if (!CRM_OBJECT_TYPES.includes(objectType)) reasonCodes.push('invalid-crm-object-type');
  if (!externalObjectRef) reasonCodes.push('external-object-ref-required');
  if (!providerVersionRef) reasonCodes.push('provider-version-ref-required');
  if (!fields) reasonCodes.push('valid-field-reference-array-required');
  if (!providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-crm-observation');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) reasonCodes.push('future-dated-crm-observation');
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-crm-pii-or-secret-prohibited');
  const observation = {
    schemaVersion: 'external-crm-observation-1.0.0', provider, providerEventId,
    observationId: provider && providerEventId ? `crm_obs_${digest([provider, providerEventId]).slice(0, 32)}` : null,
    objectType, externalObjectRef, providerVersionRef, fields: fields || [], providerReceiptRef, observedAt, receivedAt,
    canonicalTruthAuthority: 'NONE', durablePayloadClass: 'REFERENCE_ONLY_NO_CUSTOMER_PII'
  };
  if (reasonCodes.length) return invalid(reasonCodes, { observation, prohibitedKeys: prohibited });
  return { ok: true, policyVersion: EXTERNAL_CRM_SYNC_POLICY_VERSION, observation, protectedFieldClaims: observation.fields.filter(field => field.canonicalProtected).map(field => field.field), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function compileCrmIngestPatch({ observation, allowedOperationalFields = [] } = {}) {
  if (!observation?.observationId || !Array.isArray(observation.fields)) return invalid(['valid-crm-observation-required']);
  const allowed = new Set((Array.isArray(allowedOperationalFields) ? allowedOperationalFields : []).map(field => slug(field)).filter(Boolean));
  const protectedClaims = observation.fields.filter(field => field.canonicalProtected);
  if (protectedClaims.length) return invalid(['crm-cannot-author-canonical-truth'], { protectedFields: protectedClaims.map(field => field.field) });
  const denied = observation.fields.filter(field => !allowed.has(field.field));
  if (denied.length) return invalid(['crm-field-not-allowlisted-for-ingest'], { deniedFields: denied.map(field => field.field) });
  return { ok: true, policyVersion: EXTERNAL_CRM_SYNC_POLICY_VERSION, status: 'CRM_OPERATIONAL_PATCH_PREPARED', patch: { sourceObservationId: observation.observationId, objectType: observation.objectType, externalObjectRef: observation.externalObjectRef, fields: clone(observation.fields), canonicalTruthAuthority: 'NONE' }, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function compileCrmWriteCommand(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['crm-write-command-object-required']);
  const operation = String(input.operation ?? '').trim().toUpperCase();
  const occurrenceKey = text(input.occurrenceKey, 300);
  const objectType = String(input.objectType ?? '').trim().toUpperCase();
  const canonicalObjectRef = text(input.canonicalObjectRef, 200);
  const externalObjectRef = input.externalObjectRef == null ? null : text(input.externalObjectRef, 200);
  const fields = normalizeFieldClaims(input.fields);
  const authorityReceiptRef = text(input.authorityReceiptRef, 240);
  const idempotencyKey = text(input.idempotencyKey, 300);
  const reasonCodes = [];
  if (!CRM_WRITE_OPERATIONS.includes(operation)) reasonCodes.push('invalid-crm-write-operation');
  if (!occurrenceKey) reasonCodes.push('occurrence-key-required-or-too-long');
  if (!CRM_OBJECT_TYPES.includes(objectType)) reasonCodes.push('invalid-crm-object-type');
  if (!canonicalObjectRef) reasonCodes.push('canonical-object-ref-required');
  if (['UPDATE', 'LINK'].includes(operation) && !externalObjectRef) reasonCodes.push('external-object-ref-required-for-update-or-link');
  if (!fields) reasonCodes.push('valid-field-reference-array-required');
  if (!authorityReceiptRef) reasonCodes.push('authority-receipt-ref-required-for-crm-write');
  if (!idempotencyKey) reasonCodes.push('idempotency-key-required-for-crm-write');
  if (fields) {
    for (const field of fields.filter(item => item.canonicalProtected)) {
      if (!field.evidenceRef) reasonCodes.push(`canonical-evidence-ref-required-for-protected-field:${field.field}`);
    }
  }
  const prohibited = sensitiveKeys(input).filter(key => key !== 'authorityReceiptRef');
  if (prohibited.length) reasonCodes.push('raw-crm-pii-or-secret-prohibited');
  const command = {
    schemaVersion: 'external-crm-write-command-1.0.0', operation, occurrenceKey, objectType, canonicalObjectRef, externalObjectRef,
    fields: fields || [], authorityReceiptRef, idempotencyKey,
    sourceTruthRule: 'CANONICAL_UBERBOND_OUTBOUND_ONLY_FOR_PROTECTED_FIELDS', durablePayloadClass: 'REFERENCE_ONLY_NO_CUSTOMER_PII'
  };
  command.commandId = CRM_WRITE_OPERATIONS.includes(operation) && occurrenceKey && canonicalObjectRef && idempotencyKey ? `crm_cmd_${digest(command).slice(0, 32)}` : null;
  if (reasonCodes.length) return invalid(reasonCodes, { command, prohibitedKeys: prohibited });
  return { ok: true, policyVersion: EXTERNAL_CRM_SYNC_POLICY_VERSION, status: 'CRM_WRITE_COMMAND_PREPARED', command, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function normalizeCrmWriteOutcome(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['crm-write-outcome-object-required']);
  const commandId = text(input.commandId, 200); const provider = slug(input.provider, 80); const providerEventId = text(input.providerEventId, 200);
  const status = String(input.status ?? '').trim().toUpperCase(); const providerReceiptRef = text(input.providerReceiptRef, 240);
  const externalObjectRef = input.externalObjectRef == null ? null : text(input.externalObjectRef, 200);
  const observedAt = iso(input.observedAt); const receivedAt = iso(input.receivedAt); const reasonCodes = [];
  if (!commandId) reasonCodes.push('command-id-required'); if (!provider) reasonCodes.push('provider-required'); if (!providerEventId) reasonCodes.push('provider-event-id-required');
  if (!['WRITE_CONFIRMED', 'WRITE_REJECTED', 'UNCERTAIN_EXTERNAL_STATE'].includes(status)) reasonCodes.push('invalid-crm-write-outcome-status');
  if (['WRITE_CONFIRMED', 'WRITE_REJECTED'].includes(status) && !providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-crm-write-truth');
  if (status === 'WRITE_CONFIRMED' && !externalObjectRef) reasonCodes.push('external-object-ref-required-for-confirmed-write');
  if (!observedAt) reasonCodes.push('observed-at-required'); if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) reasonCodes.push('future-dated-crm-write-outcome');
  if (reasonCodes.length) return invalid(reasonCodes);
  return { ok: true, policyVersion: EXTERNAL_CRM_SYNC_POLICY_VERSION, status, commandId, eventId: `crm_write_evt_${digest([provider, providerEventId]).slice(0,32)}`, provider, providerEventId, providerReceiptRef, externalObjectRef, observedAt, receivedAt, retryDisposition: status === 'WRITE_CONFIRMED' ? 'ALREADY_COMPLETED' : status === 'UNCERTAIN_EXTERNAL_STATE' ? 'BLOCK_RETRY_UNTIL_RECONCILED' : 'SAFE_TO_REEVALUATE', businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

function unconfigured(provider, capability) { return { ok: false, policyVersion: EXTERNAL_CRM_SYNC_POLICY_VERSION, status: 'CRM_ADAPTER_NOT_CONFIGURED', provider, capability, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) }; }
export function createUnconfiguredCrmProviderAdapter(providerName = 'unknown') { const provider = slug(providerName, 80) || 'unknown'; const adapter = { providerName: provider, configured: false }; for (const capability of CRM_PROVIDER_CAPABILITIES) adapter[capability] = async () => unconfigured(provider, capability); adapter.dryRunSupported = async () => ({ ok: true, policyVersion: EXTERNAL_CRM_SYNC_POLICY_VERSION, status: 'DRY_RUN_ONLY', provider, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) }); return adapter; }
export function validateCrmProviderAdapter(adapter) { const missing = CRM_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function'); return { ok: missing.length === 0, policyVersion: EXTERNAL_CRM_SYNC_POLICY_VERSION, missing }; }
