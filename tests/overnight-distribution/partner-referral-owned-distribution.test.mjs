import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  normalizePartnerCandidate,
  scorePartnerFit
} from '../../src/overnight/distribution/partner-fit.mjs';
import {
  normalizeAccountRecord,
  buildAccountOverlapHypotheses
} from '../../src/overnight/distribution/account-overlap.mjs';
import {
  normalizeReferralCandidate,
  registerReferral,
  compileReferralRegistry,
  buildCommissionLedger
} from '../../src/overnight/distribution/referral-ledger.mjs';
import {
  ZERO_EFFECTS,
  digest
} from '../../src/overnight/distribution/policy.mjs';
import { COMMERCIAL_OUTCOME_POLICY_VERSION } from '../../src/commercial-outcome.mjs';

const NOW = new Date('2026-08-25T01:00:00.000Z');

function evidence(evidenceId, field, values, evidenceClass, sourceUrl = 'https://evidence.example/record') {
  return { evidenceId, field, values, evidenceClass, sourceUrl, observedAt: NOW.toISOString() };
}

function partnerInput() {
  return {
    id: 'partner-agency-1',
    name: 'Evidence Agency',
    type: 'AGENCY',
    website: 'https://agency.example',
    observedAt: NOW.toISOString(),
    evidence: [
      evidence('ev-cap', 'capabilities', ['crm', 'lead-follow-up'], 'VERIFIED_FACT', 'https://agency.example/services'),
      evidence('ev-vertical', 'verticals', ['aesthetic-clinics'], 'BUYER_SIGNAL', 'https://signals.example/agency'),
      evidence('ev-claim', 'channels', ['partner-referral'], 'CREATOR_CLAIM', 'https://agency.example/claim')
    ]
  };
}

function referralInput(overrides = {}) {
  return {
    partnerId: 'partner-agency-1',
    accountId: 'clinic-1',
    accountDomain: 'clinic.example',
    offerId: 'revenue-journey-assurance',
    evidenceClass: 'OWNER_ATTESTED',
    evidenceRefs: ['owner-note-1'],
    observedAt: NOW.toISOString(),
    ...overrides
  };
}

function clearedPaymentProof(outcomeEventId = 'payment-outcome-1') {
  return {
    providerEventId: 'provider-event-1',
    outcomeEventId,
    outcomeId: `out_${digest({ policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION, eventId: outcomeEventId }).slice(0, 24)}`,
    policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION,
    amountCents: 5000,
    currency: 'USD'
  };
}

test('partner fit scores only evidence-backed overlap and never accepts contact data', () => {
  const normalized = normalizePartnerCandidate(partnerInput(), { now: NOW });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.partner.contactAuthority, 'NONE');
  assert.equal(normalized.partner.attributes.channels['partner-referral'], undefined, 'creator claim must not score');

  const fit = scorePartnerFit({
    partner: normalized.partner,
    targetProfile: {
      capabilities: ['crm', 'lead-follow-up'],
      verticals: ['aesthetic-clinics'],
      channels: ['partner-referral']
    },
    date: NOW
  });
  assert.equal(fit.ok, true);
  assert.equal(fit.status, 'PREPARE_ONLY_RANKED');
  assert.ok(fit.score > 50);
  assert.equal(fit.partnerContact, 'DISABLED');
  assert.deepEqual(fit.externalEffectLedger, ZERO_EFFECTS);

  const contact = normalizePartnerCandidate({ ...partnerInput(), contactEmail: 'guessed@agency.example' }, { now: NOW });
  assert.equal(contact.ok, false);
  assert.ok(contact.reasonCodes.includes('contact-data-not-accepted-in-partner-fit'));
});

test('account overlap emits deduped co-sell hypotheses and suppression dominates', () => {
  const partnerAccount = {
    accountId: 'clinic-1', name: 'Clinic One', domain: 'clinic.example',
    sourceType: 'PUBLIC_SOURCE', sourceUrl: 'https://agency.example/portfolio', observedAt: NOW.toISOString()
  };
  const targetAccount = {
    accountId: 'clinic-1', name: 'Clinic One', domain: 'clinic.example',
    sourceType: 'CUSTOMER_RECORD', observedAt: NOW.toISOString()
  };
  const overlap = buildAccountOverlapHypotheses({
    partnerId: 'partner-agency-1',
    partnerAccounts: [partnerAccount, partnerAccount],
    targetAccounts: [targetAccount],
    date: NOW
  });
  assert.equal(overlap.ok, true);
  assert.equal(overlap.hypotheses.length, 1);
  assert.equal(overlap.hypotheses[0].evidenceClass, 'INFERENCE');
  assert.equal(overlap.hypotheses[0].buyerIntent, 'UNPROVEN');
  assert.equal(overlap.hypotheses[0].partnerContact, 'DISABLED');
  assert.deepEqual(overlap.externalEffectLedger, ZERO_EFFECTS);

  const suppressed = buildAccountOverlapHypotheses({
    partnerId: 'partner-agency-1',
    partnerAccounts: [partnerAccount],
    targetAccounts: [targetAccount],
    suppressions: [{ value: 'clinic.example', reason: 'optout' }],
    date: NOW
  });
  assert.equal(suppressed.hypotheses.length, 0);
  assert.equal(suppressed.suppressed.length, 1);

  const privateAccount = normalizeAccountRecord({ ...partnerAccount, privateData: true }, { now: NOW });
  assert.equal(privateAccount.ok, false);
  assert.ok(privateAccount.reasonCodes.includes('private-or-scraped-account-data-forbidden'));
});

test('referral registration is idempotent and suppression blocks before registration', () => {
  const first = registerReferral({ referral: referralInput(), date: NOW });
  assert.equal(first.ok, true);
  assert.equal(first.status, 'REGISTERED_PREPARATION_ONLY');

  const duplicate = registerReferral({ referral: referralInput(), existing: [first.referral], date: NOW });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.ok(duplicate.reasonCodes.includes('duplicate-referral'));

  const registry = compileReferralRegistry({ referrals: [referralInput(), referralInput()], date: NOW });
  assert.equal(registry.referrals.length, 1);
  assert.equal(registry.duplicates.length, 1);

  const suppressed = registerReferral({
    referral: referralInput(),
    suppressions: [{ value: 'clinic-1', reason: 'optout' }],
    date: NOW
  });
  assert.equal(suppressed.ok, false);
  assert.equal(suppressed.status, 'BLOCKED');
  assert.ok(suppressed.reasonCodes.includes('suppressed-referral'));
  assert.deepEqual(suppressed.externalEffectLedger, ZERO_EFFECTS);
});

test('commission ledger separates currencies, rejects unverified payment claims, and prevents double counting', () => {
  const referral = normalizeReferralCandidate(referralInput(), { now: NOW });
  assert.equal(referral.ok, true);
  const valid = {
    eventId: 'commission-event-1',
    referralId: referral.referral.referralId,
    partnerId: referral.referral.partnerId,
    truthLevel: 'CLEARED_PAYMENT',
    amountCents: 5000,
    currency: 'USD',
    commissionRateBps: 1000,
    paymentProof: clearedPaymentProof(),
    occurredAt: NOW.toISOString()
  };
  const ledger = buildCommissionLedger({
    referrals: [referral.referral],
    events: [
      { ...valid, eventId: 'checkout-event-1', truthLevel: 'CHECKOUT_STARTED', paymentProof: undefined },
      valid,
      valid,
      { ...valid, eventId: 'unverified-payment', paymentProof: undefined }
    ],
    date: NOW
  });
  assert.equal(ledger.entries.length, 2, 'pending observation and one cleared payment only');
  assert.equal(ledger.duplicates.length, 1);
  assert.equal(ledger.rejected.length, 1);
  assert.equal(ledger.totals.USD.grossClearedPaymentCents, 5000);
  assert.equal(ledger.totals.USD.commissionCents, 500);
  assert.equal(ledger.entries.find(entry => entry.truthLevel === 'CHECKOUT_STARTED').commissionCents, 0);
  assert.equal(ledger.entries.find(entry => entry.truthLevel === 'CLEARED_PAYMENT').economicStatus, 'COMMISSION_ACCRUED_FROM_CLEARED_PAYMENT');
  assert.deepEqual(ledger.externalEffectLedger, ZERO_EFFECTS);
  assert.equal(ledger.authorization.partnerContact, 'DISABLED');
});

test('the current lane has no provider, network, or publishing boundary of its own', async () => {
  for (const path of [
    '../../src/overnight/distribution/policy.mjs',
    '../../src/overnight/distribution/partner-fit.mjs',
    '../../src/overnight/distribution/account-overlap.mjs',
    '../../src/overnight/distribution/referral-ledger.mjs'
  ]) {
    const source = await fs.readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|http\.request|https\.request|writeFile\s*\(|readFile\s*\(/, path);
  }
});
