import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRA_COLLECTION_STATES,
  compileContraCollectionReadiness,
  summarizeContraCollectionReadiness,
  defaultContraFirstCashProjectPlan
} from '../src/contra-collection-readiness.mjs';

const AT = new Date('2026-10-07T01:44:00+03:00');
const readyObservation = (overrides = {}) => ({
  provider: 'contra',
  observedAt: '2026-10-07T01:40:00+03:00',
  ownerAttested: true,
  evidenceRefs: ['owner:contra-wallet-screen:2026-10-07'],
  existingAccountConfirmed: true,
  duplicateAccountCreated: false,
  authenticated: true,
  wallet: { status: 'READY', identityVerificationStatus: 'VERIFIED' },
  taxProfileStatus: 'COMPLETE',
  payout: { status: 'READY', method: 'SWIFT', country: 'EG', accountOwnerMatch: true },
  blockingRequirements: [],
  capabilities: { oneTimeFixedProject: true, paymentLink: true, invoice: true },
  ...overrides
});

test('general provider support never mints collection readiness', () => {
  const r = compileContraCollectionReadiness(null, { at: AT });
  assert.equal(r.state, 'ACCOUNT_OBSERVATION_REQUIRED');
  assert.equal(r.liveReady, false);
  assert.equal(r.paymentRequestAuthority, 'NONE');
});

test('stale or unattested UI observations fail closed', () => {
  const stale = compileContraCollectionReadiness(readyObservation({ observedAt: '2026-09-20T00:00:00Z' }), { at: AT });
  assert.equal(stale.state, 'ACCOUNT_OBSERVATION_REQUIRED');
  assert.ok(stale.reasonCodes.includes('account-observation-stale'));
  const unattested = compileContraCollectionReadiness(readyObservation({ ownerAttested: false }), { at: AT });
  assert.equal(unattested.state, 'ACCOUNT_OBSERVATION_REQUIRED');
  assert.ok(unattested.reasonCodes.includes('owner-attestation-required'));
});

test('authentication, KYC, tax, payout and project capability are independent gates', () => {
  assert.equal(compileContraCollectionReadiness(readyObservation({ authenticated: false }), { at: AT }).state, 'ACCOUNT_AUTH_REQUIRED');
  assert.equal(compileContraCollectionReadiness(readyObservation({ wallet: { status: 'PENDING', identityVerificationStatus: 'VERIFIED' } }), { at: AT }).state, 'WALLET_SETUP_REQUIRED');
  assert.equal(compileContraCollectionReadiness(readyObservation({ wallet: { status: 'READY', identityVerificationStatus: 'PENDING' } }), { at: AT }).state, 'KYC_REQUIRED');
  assert.equal(compileContraCollectionReadiness(readyObservation({ taxProfileStatus: 'NOT_REQUESTED' }), { at: AT }).state, 'TAX_PROFILE_REQUIRED');
  assert.equal(compileContraCollectionReadiness(readyObservation({ payout: { status: 'PENDING', method: 'SWIFT', country: 'EG', accountOwnerMatch: true } }), { at: AT }).state, 'PAYOUT_METHOD_REQUIRED');
  assert.equal(compileContraCollectionReadiness(readyObservation({ capabilities: { oneTimeFixedProject: false } }), { at: AT }).state, 'PAYMENT_PATH_REQUIRED');
});

test('unresolved provider banners keep the account under review', () => {
  const unknown = compileContraCollectionReadiness(readyObservation({ blockingRequirements: undefined }), { at: AT });
  assert.equal(unknown.state, 'ACCOUNT_REVIEW_PENDING');
  const blocked = compileContraCollectionReadiness(readyObservation({ blockingRequirements: ['proof-of-address-requested'] }), { at: AT });
  assert.equal(blocked.state, 'ACCOUNT_REVIEW_PENDING');
  assert.ok(blocked.reasonCodes.includes('contra-account-blocker:proof-of-address-requested'));
});

test('a fully observed account reaches collection ready without granting payment authority', () => {
  const r = compileContraCollectionReadiness(readyObservation(), { at: AT });
  assert.equal(r.state, 'COLLECTION_READY');
  assert.equal(r.liveReady, true);
  assert.equal(r.paymentRequestAuthority, 'NONE');
  assert.equal(r.externalEffectAuthority, 'NONE');
  assert.equal(r.externalEffectLedger.paymentMutations, 0);
  assert.ok(CONTRA_COLLECTION_STATES.includes(r.state));
});

test('Egypt local-bank payout can satisfy the payout gate when the provider account shows it ready', () => {
  const r = compileContraCollectionReadiness(readyObservation({ payout: { status: 'ACTIVE', method: 'LOCAL_BANK', country: 'EG', accountOwnerMatch: true } }), { at: AT });
  assert.equal(r.state, 'COLLECTION_READY');
});

test('summary never asks for an external payment effect', () => {
  const r = compileContraCollectionReadiness(readyObservation({ capabilities: { oneTimeFixedProject: false } }), { at: AT });
  const summary = summarizeContraCollectionReadiness(r);
  assert.equal(summary.ownerActionQueue.length, 1);
  assert.match(summary.ownerActionQueue[0].action, /draft without sending/i);
  assert.equal(summary.paymentRequestAuthority, 'NONE');
});

test('default first-cash plan selects fixed escrow but stays an internal plan', () => {
  const plan = defaultContraFirstCashProjectPlan({ priceUsd: 2500 });
  assert.equal(plan.projectType, 'ONE_TIME_FIXED_ESCROW');
  assert.equal(plan.priceUsd, 2500);
  assert.equal(plan.paymentRequestAuthority, 'NONE');
  assert.match(plan.truthBoundary, /NO_PROPOSAL_CONTRACT_PAYMENT_REQUEST_OR_PRICE_IS_CLIENT_ACCEPTED/);
});
