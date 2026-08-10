import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { buildOutboundShadowContext, observeOutboundFinalAdmission } from '../src/omnia-v9/final-admission-shadow.mjs';
import { allowOutboundConsequenceForTest } from './helpers/outbound-consequence-gate.mjs';
import { approveProspectForTest, TEST_OUTREACH_APPROVAL_SECRET } from './helpers/outreach-governance.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');
const campaign = { id: 'camp', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0 };
const cfg = {
  outbound: { enabled: true, dryRun: false, launchPhase: 'canary', provider: 'fixture', approvalSecret: TEST_OUTREACH_APPROVAL_SECRET, routeEvidenceMaxAgeDays: 7, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0, canaryDailyCap: 3, canaryHourlyCap: 1, canaryMinGapSeconds: 0, recipientCooldownDays: 365, domainCooldownDays: 90, businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 10 }, google: {}, encryptionKey: ''
};
const baseProspect = {
  id: 'pros-shadow', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example', domain: 'clinic.example', country: 'United Kingdom',
  inbox: 'A', draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test', oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
  contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' },
  score: { total: 80 }, issue: { title: 'Booking path issue', confidence: .9, safeForOutreach: true, evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.' }
};
const prospect = approveProspectForTest({ prospect: baseProspect, campaign, cfg, date: monday });

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-v9-shadow-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function seededStore() {
  const store = await tempStore();
  await store.add('campaigns', campaign);
  await store.add('prospects', { ...prospect, status: 'ready', createdAt: monday.toISOString() });
  await store.add('accounts', { id: 'acct', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
  return store;
}

function gmailSuccess(events) {
  return async () => {
    events.push('gmail');
    return { data: { id: 'gmail-shadow-1', threadId: 'thread-shadow-1' } };
  };
}

test('shadow context binds the actual outbound payload by digest and is explicitly non-authoritative', () => {
  const context = buildOutboundShadowContext({
    reservation: { id: 'reservation-1', idempotencyKey: 'initial:pros-shadow' }, prospect, campaign,
    account: { email: 'outreach@uberbond.example' }, subject: prospect.subject, body: prospect.draft,
    idempotencyKey: 'initial:pros-shadow', observedAt: monday.toISOString()
  });
  assert.equal(context.authoritative, false);
  assert.equal(context.boundary, 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL');
  assert.equal(context.action.operation, 'OUTBOUND_EMAIL_SEND');
  assert.equal(context.action.effectClass, 'EXTERNAL_CONSEQUENTIAL');
  assert.match(context.action.subjectSha256, /^[a-f0-9]{64}$/);
  assert.match(context.action.bodySha256, /^[a-f0-9]{64}$/);
  assert.notEqual(context.action.subjectSha256, context.action.bodySha256);
});

test('shadow observer normalizes unknown decisions to REVIEW and never marks itself enforced', async () => {
  const observations = [];
  const store = { log: async (type, detail) => observations.push({ type, detail }) };
  const context = buildOutboundShadowContext({
    reservation: { id: 'reservation-2' }, prospect, campaign, account: { email: 'outreach@uberbond.example' },
    subject: prospect.subject, body: prospect.draft, observedAt: monday.toISOString()
  });
  const observation = await observeOutboundFinalAdmission({ hook: async () => ({ decision: 'MAYBE' }), store, context });
  assert.equal(observation.decision, 'REVIEW');
  assert.equal(observation.enforced, false);
  assert.equal(observation.authoritative, false);
  assert.equal(observations[0].type, 'omnia_v9_outbound_final_shadow');
});

test('pipeline invokes shadow only after durable reservation is dispatching and before Gmail', async () => {
  const store = await seededStore();
  const events = [];
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    outboundFinalAdmissionShadow: async context => {
      const reservation = await store.get('outboundReservations', context.reservation.id);
      assert.equal(reservation.status, 'dispatching');
      assert.equal(context.reservation.state, 'dispatching');
      events.push('shadow');
      return { decision: 'ALLOW', reasons: ['shadow-comparison-only'] };
    },
    sendEmail: gmailSuccess(events),
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<shadow@example>' }] } } })
  });
  const result = await pipeline.maybeSend(prospect, campaign);
  assert.equal(result.sent, true);
  assert.deepEqual(events, ['shadow', 'gmail']);
});

test('a shadow DENY cannot block, alter, or duplicate the legacy send', async () => {
  const store = await seededStore();
  let sends = 0;
  let shadowCalls = 0;
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    outboundFinalAdmissionShadow: async () => {
      shadowCalls += 1;
      return { decision: 'DENY', reasons: ['unresolved-authority-in-shadow'] };
    },
    sendEmail: async () => { sends += 1; return { data: { id: 'gmail-shadow-deny', threadId: 'thread-shadow-deny' } }; },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<shadow-deny@example>' }] } } })
  });
  const first = await pipeline.maybeSend(prospect, campaign);
  const second = await pipeline.maybeSend(prospect, campaign);
  assert.equal(first.sent, true);
  assert.equal(second.sent, true);
  assert.equal(second.duplicate, true);
  assert.equal(shadowCalls, 1);
  assert.equal(sends, 1);
});

test('a shadow observer exception is converted to REVIEW and cannot suppress Gmail', async () => {
  const store = await seededStore();
  let sends = 0;
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    outboundFinalAdmissionShadow: async () => { throw new Error('shadow exploded'); },
    sendEmail: async () => { sends += 1; return { data: { id: 'gmail-shadow-error', threadId: 'thread-shadow-error' } }; },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<shadow-error@example>' }] } } })
  });
  const result = await pipeline.maybeSend(prospect, campaign);
  assert.equal(result.sent, true);
  assert.equal(sends, 1);
  const logs = await store.list('auditLog');
  const shadowLog = logs.find(row => row.type === 'omnia_v9_outbound_final_shadow');
  assert.equal(shadowLog.detail.status, 'SHADOW_ERROR');
  assert.equal(shadowLog.detail.decision, 'REVIEW');
  assert.equal(shadowLog.detail.enforced, false);
});
