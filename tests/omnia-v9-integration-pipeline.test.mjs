import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { sendIdempotencyKey } from '../src/send-safety.mjs';
import { resolveOutboundFinalAdmissionHook } from '../src/omnia-v9/integrations/outbound-admission.mjs';
import { allowOutboundConsequenceForTest } from './helpers/outbound-consequence-gate.mjs';
import { approveProspectForTest, TEST_OUTREACH_APPROVAL_SECRET } from './helpers/outreach-governance.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');
const campaign = { id: 'camp', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0 };
const cfg = {
  outbound: { enabled: true, dryRun: false, launchPhase: 'canary', provider: 'fixture', approvalSecret: TEST_OUTREACH_APPROVAL_SECRET, routeEvidenceMaxAgeDays: 7, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0, canaryDailyCap: 3, canaryHourlyCap: 1, canaryMinGapSeconds: 0, recipientCooldownDays: 365, domainCooldownDays: 90, businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 10 }, google: {}, encryptionKey: ''
};
const baseProspect = {
  id: 'pros', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example', domain: 'clinic.example', country: 'United Kingdom',
  inbox: 'A', draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test', oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
  contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' },
  score: { total: 80 }, issue: { title: 'Booking path issue', confidence: .9, safeForOutreach: true, evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.' }
};
const prospect = approveProspectForTest({ prospect: baseProspect, campaign, cfg, date: monday });

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-omnia-v9-integration-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function seedFixture(store) {
  await store.add('campaigns', campaign);
  await store.add('prospects', { ...prospect, status: 'ready', createdAt: monday.toISOString() });
  await store.add('accounts', { id: 'acct', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
}

async function sendOnceWithMode(mode, { hookOverride } = {}) {
  const store = await tempStore();
  await seedFixture(store);
  let sends = 0;
  const hook = hookOverride !== undefined ? hookOverride : resolveOutboundFinalAdmissionHook({ mode, store });
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    sendEmail: async () => { sends += 1; return { data: { id: 'gmail-1', threadId: 'thread-1' } }; },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<message-1@example>' }] } } }),
    outboundFinalAdmissionShadow: hook
  });
  const result = await pipeline.maybeSend(prospect, campaign);
  return { store, sends, result };
}

for (const mode of ['off', 'shadow', 'compare']) {
  test(`mode=${mode}: send outcome and count are unaffected by V9 participation`, async () => {
    const { sends, result } = await sendOnceWithMode(mode);
    assert.equal(result.sent, true);
    assert.equal(sends, 1);
  });
}

test('mode=shadow: a V9 DENY decision never blocks the send — legacy remains authoritative', async () => {
  const { store } = await tempStore().then(async store => { await seedFixture(store); return { store }; });
  let sends = 0;
  const denyingHook = async () => ({ decision: 'DENY', reasons: ['forced-deny-for-test'] });
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    sendEmail: async () => { sends += 1; return { data: { id: 'gmail-1', threadId: 'thread-1' } }; },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<message-1@example>' }] } } }),
    outboundFinalAdmissionShadow: denyingHook
  });
  const result = await pipeline.maybeSend(prospect, campaign);
  assert.equal(result.sent, true, 'V9 DENY must not suppress the legacy-eligible send in shadow/compare mode');
  assert.equal(sends, 1);
});

test('a crashing V9 hook never blocks or duplicates the send', async () => {
  const { store } = await tempStore().then(async store => { await seedFixture(store); return { store }; });
  let sends = 0;
  const crashingHook = async () => { throw new Error('simulated V9 crash'); };
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    sendEmail: async () => { sends += 1; return { data: { id: 'gmail-1', threadId: 'thread-1' } }; },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<message-1@example>' }] } } }),
    outboundFinalAdmissionShadow: crashingHook
  });
  const result = await pipeline.maybeSend(prospect, campaign);
  assert.equal(result.sent, true);
  assert.equal(sends, 1);
});

test('mode=compare: repeated execution is still stopped by the durable idempotency reservation exactly as before V9 existed', async () => {
  const store = await tempStore();
  await seedFixture(store);
  let sends = 0;
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    sendEmail: async () => { sends += 1; return { data: { id: 'gmail-1', threadId: 'thread-1' } }; },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<message-1@example>' }] } } }),
    outboundFinalAdmissionShadow: resolveOutboundFinalAdmissionHook({ mode: 'compare', store })
  });
  const first = await pipeline.maybeSend(prospect, campaign);
  const second = await pipeline.maybeSend(prospect, campaign);
  assert.equal(first.sent, true);
  assert.equal(second.sent, true);
  assert.equal(second.duplicate, true);
  assert.equal(sends, 1, 'V9 participation must not cause a duplicate real send');
  assert.equal(sendIdempotencyKey(prospect.id), 'initial:pros');
});

test('mode=off produces the exact pre-integration NO_HOOK observation, not a different one', async () => {
  const store = await tempStore();
  await seedFixture(store);
  const logged = [];
  const originalLog = store.log.bind(store);
  store.log = async (type, detail) => { logged.push({ type, detail }); return originalLog(type, detail); };
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    sendEmail: async () => ({ data: { id: 'gmail-1', threadId: 'thread-1' } }),
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<message-1@example>' }] } } }),
    outboundFinalAdmissionShadow: resolveOutboundFinalAdmissionHook({ mode: 'off', store })
  });
  await pipeline.maybeSend(prospect, campaign);
  const shadowLog = logged.find(entry => entry.type === 'omnia_v9_outbound_final_shadow');
  assert(shadowLog, 'the pre-existing shadow observer still logs unconditionally');
  assert.equal(shadowLog.detail.status, 'NO_HOOK');
  assert.equal(shadowLog.detail.decision, 'REVIEW');
  const compareLog = logged.find(entry => entry.type === 'omnia_v9_outbound_compare');
  assert.equal(compareLog, undefined, 'off mode must never produce a compare-mode record');
});

test('mode=shadow never produces a compare-mode record (only compare mode does)', async () => {
  const store = await tempStore();
  await seedFixture(store);
  const logged = [];
  const originalLog = store.log.bind(store);
  store.log = async (type, detail) => { logged.push({ type, detail }); return originalLog(type, detail); };
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    sendEmail: async () => ({ data: { id: 'gmail-1', threadId: 'thread-1' } }),
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<message-1@example>' }] } } }),
    outboundFinalAdmissionShadow: resolveOutboundFinalAdmissionHook({ mode: 'shadow', store })
  });
  await pipeline.maybeSend(prospect, campaign);
  const compareLog = logged.find(entry => entry.type === 'omnia_v9_outbound_compare');
  assert.equal(compareLog, undefined, 'shadow mode must never produce a compare-mode record');
  const shadowLog = logged.find(entry => entry.type === 'omnia_v9_outbound_final_shadow');
  assert(shadowLog);
  assert.equal(shadowLog.detail.status, 'OBSERVED');
});

test('kill switch: OMNIA_V9_MODE=off removes V9 from the send path immediately, same behavior as no integration at all', async () => {
  const withV9 = await sendOnceWithMode('shadow');
  const withoutV9 = await sendOnceWithMode('off');
  assert.equal(withV9.result.sent, withoutV9.result.sent);
  assert.equal(withV9.sends, withoutV9.sends);
});

test('an unrecognized mode string behaves exactly like off, not like an active mode', async () => {
  const { resolveOmniaV9Mode } = await import('../src/omnia-v9/integrations/config.mjs');
  const mode = resolveOmniaV9Mode({ OMNIA_V9_MODE: 'enforce' });
  assert.equal(mode, 'off');
  const { sends, result } = await sendOnceWithMode(mode);
  assert.equal(result.sent, true);
  assert.equal(sends, 1);
});
