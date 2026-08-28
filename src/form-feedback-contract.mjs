import crypto from 'node:crypto';

export const FORM_FEEDBACK_POLICY_VERSION = 'form-feedback-contract-1.0.0';
export const FORM_KINDS = Object.freeze([
  'LEAD_INTAKE', 'ONBOARDING', 'SURVEY', 'CUSTOMER_FEEDBACK', 'DELIVERY_FEEDBACK', 'ACCEPTANCE_REQUEST', 'REVIEW_CAPTURE'
]);
export const FORM_PROVIDER_CAPABILITIES = Object.freeze([
  'identity', 'authenticationMethod', 'termsAndAllowedPurposes', 'dryRunSupported', 'liveSupported',
  'listForms', 'getSubmission', 'webhookEvents', 'receipts', 'cancel'
]);

const CANONICAL_PROTECTED_FIELDS = new Set([
  'payment-status', 'payment-cleared', 'revenue-cents', 'refund-status', 'chargeback-status',
  'delivery-accepted', 'customer-acceptance', 'renewal-status', 'consent-status', 'suppression-status',
  'authority-status', 'kyc-status', 'legal-acceptance'
]);
const SENSITIVE_KEYS = /(?:email|phone|address|fullname|firstname|lastname|customername|response|answer|value|message|body|comment|notes?|password|secret|token|authorization|cookie|credential|api[_-]?key|raw(?:payload|body|value))/i;
const SAFE_REFERENCE_KEYS = new Set(['valueRef', 'respondentRef', 'providerReceiptRef', 'collectionPolicyRef', 'evidenceRef']);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
  credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
});

function clone(value) { return structuredClone(value); }
function text(value, max = 240) {
  const string = String(value ?? '').trim();
  return string && string.length <= max ? string : null;
}
function slug(value, max = 120) {
  const string = text(value, max);
  if (!string) return null;
  return string.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || null;
}
function iso(value) {
  const string = text(value, 80);
  if (!string) return null;
  const date = new Date(string);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: FORM_FEEDBACK_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS),
    ...extra
  };
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
function normalizeFieldRefs(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const result = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const field = slug(item.field, 100);
    const valueRef = text(item.valueRef, 240);
    const evidenceRef = item.evidenceRef == null ? null : text(item.evidenceRef, 240);
    if (!field || !valueRef || seen.has(field)) return null;
    seen.add(field);
    result.push({ field, valueRef, evidenceRef, canonicalProtected: CANONICAL_PROTECTED_FIELDS.has(field) });
  }
  return result;
}

export function normalizeFormSubmission(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['form-submission-object-required']);
  const provider = slug(input.provider, 80);
  const providerEventId = text(input.providerEventId, 200);
  const formRef = text(input.formRef, 200);
  const submissionRef = text(input.submissionRef, 200);
  const respondentRef = input.respondentRef == null ? null : text(input.respondentRef, 200);
  const formKind = String(input.formKind ?? '').trim().toUpperCase();
  const fields = normalizeFieldRefs(input.fields);
  const providerReceiptRef = text(input.providerReceiptRef, 240);
  const collectionPolicyRef = text(input.collectionPolicyRef, 240);
  const observedAt = iso(input.observedAt);
  const receivedAt = iso(input.receivedAt);
  const reasonCodes = [];

  if (!provider) reasonCodes.push('provider-required');
  if (!providerEventId) reasonCodes.push('provider-event-id-required-or-too-long');
  if (!formRef) reasonCodes.push('form-ref-required-or-too-long');
  if (!submissionRef) reasonCodes.push('submission-ref-required-or-too-long');
  if (!FORM_KINDS.includes(formKind)) reasonCodes.push('invalid-form-kind');
  if (!fields) reasonCodes.push('valid-field-reference-array-required');
  if (!providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-form-truth');
  if (!collectionPolicyRef) reasonCodes.push('collection-policy-ref-required');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) {
    reasonCodes.push('future-dated-form-submission');
  }
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-form-pii-or-free-text-prohibited');

  const submission = {
    schemaVersion: 'form-feedback-submission-1.0.0', provider, providerEventId,
    eventId: provider && providerEventId ? `form_evt_${digest([provider, providerEventId]).slice(0, 32)}` : null,
    formRef, submissionRef, respondentRef, formKind, fields: fields || [],
    providerReceiptRef, collectionPolicyRef, observedAt, receivedAt,
    canonicalTruthAuthority: 'NONE',
    durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_PII_OR_FREE_TEXT'
  };
  if (reasonCodes.length) return invalid(reasonCodes, { submission, prohibitedKeys: prohibited });
  return {
    ok: true,
    policyVersion: FORM_FEEDBACK_POLICY_VERSION,
    submission,
    protectedFieldClaims: submission.fields.filter(field => field.canonicalProtected).map(field => field.field),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function dedupeFormSubmissions(submissions = []) {
  if (!Array.isArray(submissions)) return invalid(['form-submission-array-required']);
  const kept = [];
  const byEventId = new Map();
  const errors = [];
  const duplicates = [];
  const conflicts = [];
  submissions.forEach((input, index) => {
    const normalized = normalizeFormSubmission(input);
    if (!normalized.ok) {
      errors.push({ index, reasonCodes: normalized.reasonCodes });
      return;
    }
    const submission = normalized.submission;
    const prior = byEventId.get(submission.eventId);
    if (!prior) {
      byEventId.set(submission.eventId, submission);
      kept.push(submission);
    } else if (JSON.stringify(prior) === JSON.stringify(submission)) {
      duplicates.push({ eventId: submission.eventId, index });
    } else {
      conflicts.push({ eventId: submission.eventId, index });
    }
  });
  if (errors.length || conflicts.length) {
    return invalid([
      ...(errors.length ? ['invalid-form-submission'] : []),
      ...(conflicts.length ? ['conflicting-provider-event-identity'] : [])
    ], { status: 'UNCERTAIN_EXTERNAL_STATE', submissions: [], errors, duplicates, conflicts });
  }
  return {
    ok: true,
    policyVersion: FORM_FEEDBACK_POLICY_VERSION,
    status: 'FORM_SUBMISSIONS_READY', submissions: kept, duplicates, conflicts,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function compileFormOperationalPatch({ submission, allowedOperationalFields = [] } = {}) {
  if (!submission?.eventId || !Array.isArray(submission.fields)) return invalid(['valid-form-submission-required']);
  const allowed = new Set((Array.isArray(allowedOperationalFields) ? allowedOperationalFields : []).map(field => slug(field)).filter(Boolean));
  const protectedClaims = submission.fields.filter(field => field.canonicalProtected);
  if (protectedClaims.length) {
    return invalid(['form-cannot-author-canonical-truth'], { protectedFields: protectedClaims.map(field => field.field) });
  }
  const denied = submission.fields.filter(field => !allowed.has(field.field));
  if (denied.length) return invalid(['form-field-not-allowlisted-for-ingest'], { deniedFields: denied.map(field => field.field) });
  return {
    ok: true,
    policyVersion: FORM_FEEDBACK_POLICY_VERSION,
    status: 'FORM_OPERATIONAL_PATCH_PREPARED',
    patch: {
      sourceSubmissionEventId: submission.eventId,
      formRef: submission.formRef,
      submissionRef: submission.submissionRef,
      formKind: submission.formKind,
      fields: clone(submission.fields),
      canonicalTruthAuthority: 'NONE'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function deriveFeedbackMeasurement({ submission, scoreField = 'score', maxScore = 10 } = {}) {
  if (!submission?.eventId || !Array.isArray(submission.fields)) return invalid(['valid-form-submission-required']);
  if (!['SURVEY', 'CUSTOMER_FEEDBACK', 'DELIVERY_FEEDBACK', 'REVIEW_CAPTURE'].includes(submission.formKind)) {
    return invalid(['feedback-form-kind-required']);
  }
  const field = submission.fields.find(item => item.field === slug(scoreField));
  if (!field) return invalid(['score-field-reference-required']);
  if (!Number.isSafeInteger(maxScore) || maxScore <= 0 || maxScore > 100) return invalid(['valid-max-score-required']);
  return {
    ok: true,
    policyVersion: FORM_FEEDBACK_POLICY_VERSION,
    status: 'FEEDBACK_MEASUREMENT_REFERENCE_READY',
    measurement: {
      sourceSubmissionEventId: submission.eventId,
      scoreValueRef: field.valueRef,
      maxScore,
      classification: 'MEASUREMENT_ONLY_NOT_COMMERCIAL_TRUTH',
      mayAuthorizePayment: false,
      mayAuthorizeDeliveryAcceptance: false,
      mayAuthorizeRenewal: false
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function unconfigured(provider, capability) {
  return {
    ok: false,
    policyVersion: FORM_FEEDBACK_POLICY_VERSION,
    status: 'FORM_PROVIDER_NOT_CONFIGURED', provider, capability,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}
export function createUnconfiguredFormProviderAdapter(providerName = 'unknown') {
  const provider = slug(providerName, 80) || 'unknown';
  const adapter = { providerName: provider, configured: false };
  for (const capability of FORM_PROVIDER_CAPABILITIES) adapter[capability] = async () => unconfigured(provider, capability);
  adapter.dryRunSupported = async () => ({
    ok: true, policyVersion: FORM_FEEDBACK_POLICY_VERSION, status: 'DRY_RUN_ONLY', provider,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  });
  return adapter;
}
export function validateFormProviderAdapter(adapter) {
  const missing = FORM_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function');
  return { ok: missing.length === 0, policyVersion: FORM_FEEDBACK_POLICY_VERSION, missing };
}
