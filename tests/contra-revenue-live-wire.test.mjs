import test from 'node:test';
import assert from 'node:assert/strict';

import { contraCurrentCollectionRoute, paymentRailsFromSnapshot } from '../src/revenue-singularity-service.mjs';
import { compressPayment } from '../src/payment-compression.mjs';

const NOW = Date.parse('2026-10-07T02:20:00+03:00');
const baseSnapshot = settings => ({
  now: NOW,
  settings,
  leads: [],
  orders: [],
  revenueEvents: [],
  auditLog: []
});

const readyObservation = overrides => ({
  provider: 'contra',
  observedAt: '2026-10-07T02:15:00+03:00',
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
  ...(overrides || {})
});

test('Revenue Terminal keeps Contra blocked when no current authenticated observation exists', () => {
  const route = contraCurrentCollectionRoute(baseSnapshot({}));
  assert.equal(route.state, 'ACCOUNT_OBSERVATION_REQUIRED');
  assert.equal(route.collectionReady, false);
  assert.equal(route.liveReady, false);
  assert.equal(route.paymentRequestAuthority, 'NONE');
  assert.equal(route.lifecycle, 'SELECTED_CURRENT_ROUTE');
});

test('stale owner observation cannot make Contra selectable', () => {
  const s = baseSnapshot({ contraCollectionObservation: readyObservation({ observedAt: '2026-09-20T00:00:00Z' }) });
  const rails = paymentRailsFromSnapshot(s, {});
  const contra = rails.find(r => r.provider === 'contra');
  assert.equal(contra.state, 'ACCOUNT_OBSERVATION_REQUIRED');
  assert.equal(contra.liveReady, false);
  const compressed = compressPayment({ rails, amountCents: 250000, currency: 'USD' });
  assert.equal(compressed.ok, false);
  assert.equal(compressed.state, 'NO_LIVE_RAIL_READY');
});

test('fresh fully satisfied Contra observation becomes the selected collection path without granting payment authority', () => {
  const s = baseSnapshot({ contraCollectionObservation: readyObservation() });
  const rails = paymentRailsFromSnapshot(s, {});
  const contra = rails.find(r => r.provider === 'contra');
  assert.equal(contra.state, 'COLLECTION_READY');
  assert.equal(contra.collectionReady, true);
  assert.equal(contra.liveReady, true);
  assert.equal(contra.paymentRequestAuthority, 'NONE');
  assert.equal(contra.projectPlan.projectType, 'ONE_TIME_FIXED_ESCROW');

  const compressed = compressPayment({ rails, amountCents: 250000, currency: 'USD' });
  assert.equal(compressed.ok, true);
  assert.equal(compressed.state, 'PAYMENT_PATH_COMPRESSED');
  assert.equal(compressed.provider, 'contra');
  assert.equal(compressed.outboundAuthority, 'NONE');
  assert.equal(compressed.externalEffectLedger.paymentMutations, 0);
});

test('an unresolved Contra provider requirement blocks compression again', () => {
  const s = baseSnapshot({ contraCollectionObservation: readyObservation({ blockingRequirements: ['proof-of-address-requested'] }) });
  const rails = paymentRailsFromSnapshot(s, {});
  const contra = rails.find(r => r.provider === 'contra');
  assert.equal(contra.state, 'ACCOUNT_REVIEW_PENDING');
  assert.equal(contra.liveReady, false);
  assert.ok(contra.reasonCodes.includes('contra-account-blocker:proof-of-address-requested'));
  const compressed = compressPayment({ rails, amountCents: 250000, currency: 'USD' });
  assert.equal(compressed.ok, false);
});
