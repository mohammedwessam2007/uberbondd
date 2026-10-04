import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceBundleFromStoredProspect,
  buyerFromStoredProspect,
  moneyQueueFromSnapshot,
  paymentRailsFromSnapshot,
  dealFromSnapshot
} from '../src/revenue-singularity-service.mjs';

const NOW = Date.parse('2026-10-04T08:00:00.000Z');
const prospect = (overrides = {}) => ({
  id: 'pros_live_1', status: 'ready', company: 'Signal Agency', website: 'https://signal.example', domain: 'signal.example',
  source: 'public_website', niche: 'performance marketing agency HVAC', serviceFit: 0.92,
  contact: {
    email: 'owner@signal.example', name: 'Owner Person', title: 'Agency Owner',
    source: 'public_website', sourceUrl: 'https://signal.example/team', observedAt: '2026-10-03T08:00:00Z',
    verified: 'valid', verificationScore: 0.97, exact: true, inferred: false
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

test('durable public prospect facts reconstruct canonical evidence without stored evidenceBundle', () => {
  const p = prospect();
  const bundle = evidenceBundleFromStoredProspect(p, { now: new Date(NOW) });
  assert.equal(bundle.prospectId, p.id);
  assert.equal(bundle.summary.verifiedRoutes, 1);
  assert.equal(bundle.people[0].role, 'Agency Owner');
  assert.equal(bundle.businessEffectAuthority, 'NONE');
});

test('buyer resolution accepts the canonical imported contact.title field', () => {
  assert.deepEqual(buyerFromStoredProspect(prospect()), {
    resolved: true, role: 'Agency Owner', email: 'owner@signal.example'
  });
});

test('Money Queue admits a source-backed ready prospect and does not require a hand-set contactHistoryVerified boolean', () => {
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

test('payment compression is fed by the live rail doctor and still does not create payment authority', () => {
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
  const rails = paymentRailsFromSnapshot(s, env);
  assert.equal(rails.find(r => r.provider === 'paypal').state, 'LIVE_READY');
  const deal = dealFromSnapshot(s, 'lead1', env);
  assert.equal(deal.paymentPath.ok, true);
  assert.equal(deal.paymentPath.provider, 'paypal');
  assert.equal(deal.paymentPath.outboundAuthority, 'NONE');
});
