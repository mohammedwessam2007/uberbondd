import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REASON_CODES, isCanonicalReasonCode, assertCanonicalReasonCode, canonicalizeContactReason,
  UnknownReasonCodeError, POLICY_REASON_CODES_VERSION
} from '../src/policy-reason-codes.mjs';
import { contactEligibility } from '../src/send-safety.mjs';

test('REASON_CODES matches 05_POLICY_REASON_CODES.json exactly (30 codes, uberbond-policy-reasons-v2)', () => {
  assert.equal(POLICY_REASON_CODES_VERSION, 'uberbond-policy-reasons-v2');
  assert.equal(REASON_CODES.length, 30);
  assert.deepEqual([...REASON_CODES], [
    'missing-current-official-evidence', 'evidence-expired', 'evidence-low-confidence',
    'generic-contact-page', 'contact-not-officially-published', 'prohibited-mailbox',
    'contact-domain-mismatch', 'recipient-suppressed', 'domain-suppressed',
    'duplicate-organization-lane-signal', 'duplicate-recipient', 'prospect-terminal-status',
    'country-restricted', 'unsupported-service-lane', 'capability-proof-gap',
    'expected-value-below-threshold', 'owner-minutes-above-threshold', 'delivery-capacity-risk',
    'prohibitive-upfront-spend', 'authenticated-platform-required', 'terms-acceptance-required',
    'account-creation-required', 'opportunity-expired', 'competition-unacceptable',
    'ability-to-pay-insufficient', 'source-not-provider-facing', 'privacy-or-data-risk',
    'security-testing-requested', 'fabricated-proof-required', 'outside-current-priority'
  ]);
});

test('isCanonicalReasonCode / assertCanonicalReasonCode: registry membership', () => {
  assert.equal(isCanonicalReasonCode('contact-domain-mismatch'), true);
  assert.equal(isCanonicalReasonCode('contact-contact-domain-mismatch'), false);
  assert.equal(assertCanonicalReasonCode('opportunity-expired'), 'opportunity-expired');
  assert.throws(() => assertCanonicalReasonCode('not-a-real-code'), UnknownReasonCodeError);
});

// Every value send-safety.mjs#contactEligibility can actually return must have a mapping --
// exercised against the real function, not a hardcoded list, so a future new reason there is
// caught by this test rather than silently reaching evaluateOpportunityPolicy unmapped.
test('canonicalizeContactReason: every real contactEligibility() failure reason maps to a canonical code', () => {
  const prospect = { website: 'example.com', domain: 'example.com' };
  const cases = [
    contactEligibility({}, prospect), // missing-contact
    contactEligibility({ email: 'someone@gmail.com', source: 'website' }, prospect), // free-mail-contact
    contactEligibility({ email: 'abuse@example.com', source: 'website' }, prospect), // risky-mailbox
    contactEligibility({ email: 'someone@not-example.com', source: 'website' }, prospect), // contact-domain-mismatch
    contactEligibility({ email: 'someone@example.com', source: 'other' }, prospect) // contact-not-published-or-verified
  ];
  for (const result of cases) {
    assert.equal(result.ok, false, `expected a failure reason from contactEligibility, got ok:true (${JSON.stringify(result)})`);
    const canonical = canonicalizeContactReason(result.reason);
    assert(REASON_CODES.includes(canonical), `${canonical} (mapped from ${result.reason}) is not canonical`);
  }
});

test('canonicalizeContactReason: an unmapped raw reason throws rather than silently passing through', () => {
  assert.throws(() => canonicalizeContactReason('some-new-reason-nobody-mapped-yet'), UnknownReasonCodeError);
});
