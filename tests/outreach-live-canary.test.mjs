import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { approveProspectForTest, TEST_OUTREACH_APPROVAL_SECRET } from './helpers/outreach-governance.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

const campaign = {
  id: 'camp-canary', approved: true, autoSend: true, allowedCountries: ['GB'],
  minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0
};

const cfg = {
  outbound: {
    enabled: true, dryRun: false, launchPhase: 'canary', provider: 'fixture',
    approvalSecret: TEST_OUTREACH_APPROVAL_SECRET, routeEvidenceMaxAgeDays: 7,
    allowedCountries: ['GB'], hourlyCaps: { A: 3 }, minGapSeconds: 0,
    businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75,
    maxEvidenceAgeDays: 45, hardBouncePauseThreshold: 2,
    complaintPauseThreshold: 1, failurePauseThreshold: 3
  },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' },
  caps: { A: 10 }, google: {}, encryptionKey: ''
};

const baseProspect = {
  id: 'pros-canary', campaignId: campaign.id, company: 'Clinic',
  website: 'https://clinic.example', domain: 'clinic.example', country: 'GB',
  inbox: 'A', status: 'ready', draft: 'Evidence-backed message with reply no.',
  subject: 'Website observation',
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test',
  oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
  contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' },
  score: { total: 80 }, completedAt: monday.toISOString(),
  issue: {
    title: 'Booking path issue', confidence: .9, safeForOutreach: true,
    evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.'
  }
};

async function makeStore(prospect) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-live-canary-'));
  const store = new Store(dir);
  await store.init();
  await store.add('campaigns', campaign);
  await store.add('prospects', prospect);
  await store.add('accounts', { id: 'acct-a', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
  return store;
}

function makePipeline(store, sends) {
  return new Pipeline(store, cfg, {
    clock: () => monday,
    sendEmail: async () => {
      sends.count += 1;
      return { data: { id: 'gmail-canary-1', threadId: 'thread-canary-1' } };
    },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<canary@example>' }] } } })
  });
}

test('canary refuses an unapproved prospect before reservation or provider call', async () => {
  const store = await makeStore(baseProspect);
  const sends = { count: 0 };
  const result = await makePipeline(store, sends).maybeSend(baseProspect, campaign);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'outreach-governance-denied');
  assert.equal(sends.count, 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
  const decision = (await store.list('auditLog')).find(row => row.type === 'outreach_governance_decision');
  assert.equal(decision.detail.decision, 'DENY');
});

test('an exact route and payload approval allows one canary send', async () => {
  const approved = approveProspectForTest({ prospect: baseProspect, campaign, cfg, date: monday });
  const store = await makeStore(approved);
  const sends = { count: 0 };
  const result = await makePipeline(store, sends).maybeSend(approved, campaign);
  assert.equal(result.sent, true);
  assert.equal(sends.count, 1);
  const decision = (await store.list('auditLog')).find(row => row.type === 'outreach_governance_decision');
  assert.equal(decision.detail.decision, 'ALLOW');
  assert.match(decision.detail.effectPayloadDigest, /^[a-f0-9]{64}$/);
});

test('changing the rendered payload after approval fails closed', async () => {
  const approved = approveProspectForTest({ prospect: baseProspect, campaign, cfg, date: monday });
  const store = await makeStore(approved);
  const sends = { count: 0 };
  const result = await makePipeline(store, sends).maybeSend(approved, campaign, { subject: 'Tampered subject' });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'outreach-governance-denied');
  assert.equal(sends.count, 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
});
