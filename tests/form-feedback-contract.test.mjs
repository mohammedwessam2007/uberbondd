import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORM_PROVIDER_CAPABILITIES,
  compileFormOperationalPatch,
  createUnconfiguredFormProviderAdapter,
  dedupeFormSubmissions,
  deriveFeedbackMeasurement,
  normalizeFormSubmission,
  validateFormProviderAdapter
} from '../src/form-feedback-contract.mjs';

const observedAt = '2026-08-28T15:00:00.000Z';
const receivedAt = '2026-08-28T15:00:01.000Z';
function submission(overrides = {}) {
  return {
    provider: 'form-provider', providerEventId: 'evt-1', formRef: 'form:feedback:1', submissionRef: 'submission:1',
    respondentRef: 'customer:1', formKind: 'CUSTOMER_FEEDBACK',
    fields: [{ field: 'score', valueRef: 'value:score:1' }, { field: 'topic', valueRef: 'value:topic:1' }],
    providerReceiptRef: 'provider-receipt:1', collectionPolicyRef: 'collection-policy:1', observedAt, receivedAt,
    ...overrides
  };
}

test('valid form submission is reference-only and grants no business authority', () => {
  const result = normalizeFormSubmission(submission());
  assert.equal(result.ok, true);
  assert.equal(result.submission.canonicalTruthAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.messages, 0);
  assert.match(result.submission.eventId, /^form_evt_/);
});

test('provider receipt and collection policy are mandatory', () => {
  const noReceipt = normalizeFormSubmission(submission({ providerReceiptRef: null }));
  assert.equal(noReceipt.ok, false);
  assert.ok(noReceipt.reasonCodes.includes('provider-receipt-ref-required-for-form-truth'));
  const noPolicy = normalizeFormSubmission(submission({ collectionPolicyRef: null }));
  assert.equal(noPolicy.ok, false);
  assert.ok(noPolicy.reasonCodes.includes('collection-policy-ref-required'));
});

test('raw PII and free text are rejected while opaque refs remain valid', () => {
  assert.equal(normalizeFormSubmission(submission()).ok, true);
  const result = normalizeFormSubmission(submission({ email: 'person@example.com', answerText: 'I accept everything' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('raw-form-pii-or-free-text-prohibited'));
  assert.ok(result.prohibitedKeys.includes('email'));
  assert.ok(result.prohibitedKeys.includes('answerText'));
});

test('duplicate field names fail closed instead of choosing one value', () => {
  const result = normalizeFormSubmission(submission({ fields: [
    { field: 'score', valueRef: 'value:1' }, { field: 'score', valueRef: 'value:2' }
  ] }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-field-reference-array-required'));
});

test('provider event replay is idempotent and conflicting identity fails uncertain', () => {
  const exact = submission();
  const replay = dedupeFormSubmissions([exact, exact]);
  assert.equal(replay.ok, true);
  assert.equal(replay.submissions.length, 1);
  assert.equal(replay.duplicates.length, 1);
  const conflict = dedupeFormSubmissions([exact, { ...exact, formKind: 'SURVEY' }]);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 'UNCERTAIN_EXTERNAL_STATE');
});

test('future-dated submissions fail closed', () => {
  const result = normalizeFormSubmission(submission({ observedAt: '2026-08-29T00:00:00.000Z' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('future-dated-form-submission'));
});

test('operational patch requires an explicit field allowlist', () => {
  const normalized = normalizeFormSubmission(submission());
  const blocked = compileFormOperationalPatch({ submission: normalized.submission, allowedOperationalFields: ['score'] });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.deniedFields, ['topic']);
  const allowed = compileFormOperationalPatch({ submission: normalized.submission, allowedOperationalFields: ['score', 'topic'] });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.patch.canonicalTruthAuthority, 'NONE');
});

test('form fields cannot manufacture payment, acceptance, consent, authority, KYC or renewal truth', () => {
  for (const field of ['payment-status', 'delivery-accepted', 'customer-acceptance', 'consent-status', 'authority-status', 'kyc-status', 'renewal-status']) {
    const normalized = normalizeFormSubmission(submission({ fields: [{ field, valueRef: `value:${field}` }] }));
    assert.equal(normalized.ok, true, field);
    const patch = compileFormOperationalPatch({ submission: normalized.submission, allowedOperationalFields: [field] });
    assert.equal(patch.ok, false, field);
    assert.ok(patch.reasonCodes.includes('form-cannot-author-canonical-truth'), field);
  }
});

test('acceptance-request response remains a claim, not canonical delivery acceptance', () => {
  const normalized = normalizeFormSubmission(submission({
    formKind: 'ACCEPTANCE_REQUEST', fields: [{ field: 'customer-acceptance', valueRef: 'value:yes' }]
  }));
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.protectedFieldClaims, ['customer-acceptance']);
  const patch = compileFormOperationalPatch({ submission: normalized.submission, allowedOperationalFields: ['customer-acceptance'] });
  assert.equal(patch.ok, false);
});

test('feedback score derives measurement reference only, never commercial truth', () => {
  const normalized = normalizeFormSubmission(submission());
  const result = deriveFeedbackMeasurement({ submission: normalized.submission, scoreField: 'score', maxScore: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.measurement.classification, 'MEASUREMENT_ONLY_NOT_COMMERCIAL_TRUTH');
  assert.equal(result.measurement.mayAuthorizePayment, false);
  assert.equal(result.measurement.mayAuthorizeDeliveryAcceptance, false);
  assert.equal(result.measurement.mayAuthorizeRenewal, false);
});

test('non-feedback forms cannot be silently treated as survey measurements', () => {
  const normalized = normalizeFormSubmission(submission({ formKind: 'LEAD_INTAKE' }));
  const result = deriveFeedbackMeasurement({ submission: normalized.submission });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('feedback-form-kind-required'));
});

test('unconfigured form adapter is structurally complete and has no I/O authority', async () => {
  const adapter = createUnconfiguredFormProviderAdapter('formbricks');
  assert.equal(validateFormProviderAdapter(adapter).ok, true);
  assert.equal(FORM_PROVIDER_CAPABILITIES.every(capability => typeof adapter[capability] === 'function'), true);
  const result = await adapter.getSubmission({ submissionRef: 'submission:1' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FORM_PROVIDER_NOT_CONFIGURED');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});
