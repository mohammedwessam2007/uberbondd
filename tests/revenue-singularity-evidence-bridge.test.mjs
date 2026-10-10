import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceBundleFromStoredProspect,
  buyerFromStoredProspect,
  moneyQueueFromSnapshot,
  paymentRailsFromSnapshot,
  dealFromSnapshot
} from '../src/revenue-singularity-service.mjs';
import { PROSPECT_EVIDENCE_VERSION } from '../src/prospect-evidence-reconciliation.mjs';

import { sealAdapterVerification } from '../src/contact-verification-trust.mjs';
process.env.ADMIN_TOKEN = 'test-only-verifier-adapter-key-00000001';
const NOW = Date.parse('2026-10-04T08:00:00.000Z');
const canonicalVerification = (route = 'owner@signal.example') => sealAdapterVerification({
  version: PROSPECT_EVIDENCE_VERSION,
  verificationId: 'verify_test_owner_signal',
  route,
  state: 'VALID',
  provider: 'Hunter',
  sourceUrl: 'https://api.hunter.io/v2/email-verifier',
  sourceRecordId: 'verify-record-1',
  evidenceClass: 'LICENSED_PROVIDER',
  confidence: 0.97,
  checkedAt: '2026-10-03T08:05:00.000Z',
  expiresAt: null,
  riskFlags: [],
  providerCostCents: 0,
  providerCalls: 0,
  externalEffects: 0,
  businessEffectAuthority: 'NONE'
});
const prospect = (overrides = {}) => ({
  id: 'pros_live_1', status: 'ready', company: 'Signal Agency', website: 'https://signal.example', domain: 'signal.example',
  source: 'public_website', niche: 'performance marketing agency HVAC', serviceFit: 0.92,
  contact: {
    email: 'owner@signal.example', name: 'Owner Person', title: 'Agency Owner',
    source: 'public_website', sourceUrl: 'https://signal.example/team', observedAt: '2026-10-03T08:00:00Z',
    // This legacy field is deliberately present. It must NOT be enough by itself.
    verified: 'valid', verificationScore: 0.97, exact: true, inferred: false,
    verifications: [canonicalVerification()]
  },
  issue: {
    title: 'Lead form loses booking context', evidenceUrl: 'https://signal.example/contact',
    evidenceExcerpt: 'Observed form path omits booking source context', evidenceObservedAt: '2026-10-03T08:10:00Z',
    confidence: 0.9, safeForOutreach: true
  },
  demandSignals: [{ kind: 'observed_defect', observedAt: '2026-10-03T08:10:00Z', evidenceRef: 'https://signal.example/contact' }],
  createdAt: '2026-10-03T07:00:00Z',
  ...overrides
});

const emptyRead = rows => ({ ok: true, rows });
function snap(p, { suppressions = [], outboundEvents = [], leads = [], settings = {} } = {}) {
  const prospects = [p];
  return {
    prospects, outboundEvents, replies: [], senderHealth: [], leads, suppressions, settings, now: NOW,
    contactHistoryReads: {
      suppressions: emptyRead(suppressions), prospects: emptyRead(prospects), outboundReservations: emptyRead([]),
      outboundEvents: emptyRead(outboundEvents), replies: emptyRead([]), messages: emptyRead([]), providerEvents: emptyRead([])
    }
  };
}

test('durable public prospect facts reconstruct canonical evidence when verifier lineage is canonical', () => {
  const p = prospect();
  const bundle = evidenceBundleFromStoredProspect(p, { now: new Date(NOW) });
  assert.equal(bundle.prospectId, p.id);
  assert.equal(bundle.summary.verifiedRoutes, 1);
  assert.equal(bundle.people[0].role, 'Agency Owner');
  assert.equal(bundle.businessEffectAuthority, 'NONE');
});

test('legacy verified string cannot masquerade as mailbox-verifier provenance', () => {
  const p = prospect();
  p.contact = { ...p.contact, verifications: [] };
  const bundle = evidenceBundleFromStoredProspect(p, { now: new Date(NOW) });
  assert.equal(bundle.summary.verifiedRoutes, 0);
  assert.equal(bundle.routes[0].status, 'NEEDS_VERIFICATION');
  const out = moneyQueueFromSnapshot(snap(p));
  assert.equal(out.items.length, 0);
  assert.equal(out.excluded.some(x => x.prospectId === p.id), true);
});

test('buyer resolution accepts the canonical imported contact.title field', () => {
  assert.deepEqual(buyerFromStoredProspect(prospect()), {
    resolved: true, role: 'Agency Owner', email: 'owner@signal.example'
  });
});

test('Money Queue admits a source-backed ready prospect with canonical verifier lineage and no hand-set contactHistoryVerified boolean', () => {
  const out = moneyQueueFromSnapshot(snap(prospect()));
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].prospectId, 'pros_live_1');
  assert.equal(out.items[0].offerId, 'LEAD_TO_BOOKING_LEAK_AUDIT');
  assert.equal(out.items[0].outboundAuthority, 'NONE');
});

test('suppression remains dominant after evidence reconstruction', () => {
  const p = prospect();
  const out = moneyQueueFromSnapshot(snap(p, { suppressions: [{ value: 'owner@signal.example', reason: 'opt-out' }] }));
  assert.equal(out.items.length, 0);
  assert.equal(out.excluded.some(x => x.prospectId === p.id), true);
});

test('prior outbound effect remains a hard Money Queue exclusion', () => {
  const p = prospect();
  const outboundEvents = [{ id: 'e1', prospectId: p.id, recipientEmail: p.contact.email, eventType: 'sent', occurredAt: '2026-10-03T09:00:00Z' }];
  const out = moneyQueueFromSnapshot(snap(p, { outboundEvents }));
  assert.equal(out.items.length, 0);
  const excluded = out.excluded.find(x => x.prospectId === p.id);
  assert.ok(excluded.reasons.includes('PRIOR_EFFECT_UNRESOLVED') || excluded.reasons.includes('CONTACT_HISTORY_UNVERIFIED'));
});

test('owner settings cannot mint provider-origin payment readiness', () => {
  const p = prospect();
  const settings = {
    paymentRailVerificationReceipts: {
      paypal: { provider: 'paypal', providerEventId: 'PAYPAL-EVT-abc123', evidenceClass: 'PROVIDER_ORIGIN', outcome: 'RECONCILED', durable: true, verifiedAt: '2026-10-03T08:00:00Z' }
    },
    paymentRailKycAttestations: {
      paypal: { ownerAttested: true, attestedAt: '2026-10-01T08:00:00Z', evidenceRefs: ['provider:paypal-merchant-verification'] }
    }
  };
  const s = snap(p, { settings, leads: [{ id: 'lead1', prospectId: p.id, dealStage: 'positive', amountCents: 150000, currency: 'USD' }] });
  const env = {
    PAYPAL_ENVIRONMENT: 'live', PAYPAL_LIVE_CLIENT_ID: 'present', PAYPAL_LIVE_CLIENT_SECRET: 'present', PAYPAL_LIVE_WEBHOOK_ID: 'present',
    PAYPAL_SANDBOX_CLIENT_ID: 'present', PAYPAL_SANDBOX_CLIENT_SECRET: 'present', PAYPAL_SANDBOX_WEBHOOK_ID: 'present',
    DATABASE_URL: 'postgres://present', APP_BASE_URL: 'https://uberbond.example'
  };
  const paypal = paymentRailsFromSnapshot(s, env).find(r => r.provider === 'paypal');
  assert.notEqual(paypal.state, 'LIVE_READY');
  assert.equal(paypal.liveReady, false);
  assert.equal(paypal.state, 'DEACTIVATED');
  assert.equal(paypal.evidenceBinding, 'OWNER_PROVIDER_ACCOUNT_UNAVAILABLE');
  assert.ok(paypal.reasonCodes.includes('provider-account-permanently-deactivated'));
  const deal = dealFromSnapshot(s, 'lead1', env);
  assert.equal(deal.paymentPath.ok, false);
  assert.equal(deal.paymentPath.outboundAuthority, 'NONE');
});


test('current collection route policy surfaces Contra and never resurrects deactivated PayPal or dormant Lemon Squeezy actions', () => {
  const p = prospect();
  const s = snap(p, { leads: [{ id: 'lead-route', prospectId: p.id, amountCents: 250000, currency: 'USD' }] });
  const env = {
    PAYPAL_ENVIRONMENT: 'live',
    PAYPAL_LIVE_CLIENT_ID: 'present',
    PAYPAL_LIVE_CLIENT_SECRET: 'present',
    PAYPAL_LIVE_WEBHOOK_ID: 'present',
    PAYPAL_SANDBOX_CLIENT_ID: 'present',
    PAYPAL_SANDBOX_CLIENT_SECRET: 'present',
    PAYPAL_SANDBOX_WEBHOOK_ID: 'present',
    DATABASE_URL: 'postgres://present',
    APP_BASE_URL: 'https://uberbond.example'
  };
  const rails = paymentRailsFromSnapshot(s, env);
  const contra = rails.find(r => r.provider === 'contra');
  const paypal = rails.find(r => r.provider === 'paypal');
  const lemon = rails.find(r => r.provider === 'lemon_squeezy');
  const xpay = rails.find(r => r.provider === 'xpay');
  const payoneer = rails.find(r => r.provider === 'payoneer');

  assert.equal(contra.state, 'ACCOUNT_OBSERVATION_REQUIRED');
  assert.ok(contra.reasonCodes.includes('current-authenticated-account-observation-required'));
  assert.equal(contra.collectionReady, false);
  assert.equal(contra.liveReady, false);
  assert.equal(contra.criticalPath, true);
  assert.deepEqual(contra.evidenceRefs, ['docs/handoffs/WORK_CONTRA_CURRENT_2026-10-06.md']);

  assert.equal(paypal.state, 'DEACTIVATED');
  assert.equal(paypal.liveReady, false);
  assert.deepEqual(paypal.ownerActionQueue, []);
  assert.ok(paypal.reasonCodes.includes('provider-account-permanently-deactivated'));

  assert.equal(lemon.state, 'DORMANT_NOT_SELECTED');
  assert.equal(lemon.liveReady, false);
  assert.deepEqual(lemon.ownerActionQueue, []);

  assert.equal(xpay.state, 'REVIEW_TEST_ONLY_BACKUP');
  assert.equal(payoneer.state, 'RECOVERY_ONLY_BACKUP');
});
