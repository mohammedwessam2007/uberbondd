import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pipeline } from '../src/pipeline.mjs';
import { Store } from '../src/store.mjs';
import {
  registerSendingDomain,
  recordDomainDnsVerification,
  recordMailboxLinked,
  recordDomainWarmupStateChange,
  recordOutreachAuthorized,
  logSendingDomainEvent
} from '../src/sending-domain-registry.mjs';
import {
  registerSendingMailbox,
  recordMailboxAuthentication,
  recordMailboxWarmupStatus,
  logSendingMailboxEvent
} from '../src/sending-mailbox-registry.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

const campaign = {
  id: 'camp-domain-mailbox', approved: true, autoSend: true, allowedCountries: ['GB'],
  minScore: 60, dailyCaps: { A: 5 }, maxFollowups: 0
};

const prospect = {
  id: 'pros-domain-mailbox', campaignId: campaign.id, company: 'Clinic',
  website: 'https://clinic.example', domain: 'clinic.example', country: 'GB', inbox: 'A',
  draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test',
  oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
  contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' },
  score: { total: 80 }, completedAt: monday.toISOString(),
  issue: {
    title: 'Booking path issue', confidence: .9, safeForOutreach: true,
    evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.'
  }
};

const cfg = {
  outbound: {
    enabled: true, dryRun: false, provider: 'fixture', domainMailboxGateRequired: true,
    allowedCountries: ['GB'], hourlyCaps: { A: 2 }, minGapSeconds: 0,
    businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75,
    maxEvidenceAgeDays: 45, hardBouncePauseThreshold: 2,
    complaintPauseThreshold: 1, failurePauseThreshold: 3
  },
  domainMailbox: { minWarmupDays: 14, maxDnsEvidenceAgeHours: 24 },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' },
  caps: { A: 5 }, google: {}, encryptionKey: ''
};

async function makeStore(account = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-domain-mailbox-send-'));
  const store = new Store(dir);
  await store.init();
  await store.add('campaigns', campaign);
  await store.add('prospects', prospect);
  await store.add('accounts', {
    id: 'acct-a', slot: 'A', connected: true, email: 'outreach@sender.example', tokens: 'unused', ...account
  });
  return store;
}

function makePipeline(store, sends) {
  return new Pipeline(store, cfg, {
    clock: () => monday,
    sendEmail: async () => {
      sends.count += 1;
      return { data: { id: 'fixture-message-1', threadId: 'fixture-thread-1' } };
    },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<fixture@example>' }] } } })
  });
}

async function seedRegistered(store) {
  const domain = registerSendingDomain({
    domainId: 'd1', workspaceId: 'w1', domain: 'sender.example',
    ownershipStatus: 'OWNER_CONFIRMED', provider: 'fixture', simulation: true, date: monday
  });
  await logSendingDomainEvent(store, domain.event);

  const mailbox = registerSendingMailbox({
    mailboxId: 'm1', workspaceId: 'w1', address: 'outreach@sender.example',
    sendingDomainId: 'd1', provider: 'fixture', plannedDailyCap: 5, date: monday
  });
  await logSendingMailboxEvent(store, mailbox.event);
  return { domain, mailbox };
}

async function seedReady(store) {
  await seedRegistered(store);
  const dns = recordDomainDnsVerification({
    domainId: 'd1',
    dnsResult: { overallStatus: 'GREEN', checks: { spf: 'GREEN', dkim: 'GREEN', dmarc: 'GREEN' }, reasonCodes: [] },
    date: monday
  });
  await logSendingDomainEvent(store, dns.event);
  await logSendingDomainEvent(store, recordMailboxLinked({ domainId: 'd1', mailboxId: 'm1', date: monday }).event);
  await logSendingDomainEvent(store, recordDomainWarmupStateChange({
    domainId: 'd1', mailboxId: 'm1', warmupState: 'WARMUP_COMPLETE', date: monday
  }).event);
  await logSendingDomainEvent(store, recordOutreachAuthorized({ domainId: 'd1', authorizedBy: 'owner-test', date: monday }).event);

  await logSendingMailboxEvent(store, recordMailboxAuthentication({
    mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', mxStatus: 'GREEN',
    spfStatus: 'GREEN', dkimStatus: 'GREEN', dmarcStatus: 'GREEN', alignmentStatus: 'GREEN', date: monday
  }).event);
  await logSendingMailboxEvent(store, recordMailboxWarmupStatus({
    mailboxId: 'm1', warmupStatus: 'WARMUP_COMPLETE',
    warmupStartTime: new Date(monday.getTime() - 15 * 86_400_000),
    currentDailyCap: 5, currentHourlyCap: 2, date: monday
  }).event);
}

test('production-default gate denies a connected account without canonical domain/mailbox/workspace linkage', async () => {
  const store = await makeStore();
  const sends = { count: 0 };
  const result = await makePipeline(store, sends).maybeSend(prospect, campaign);

  assert.equal(result.sent, false);
  assert.equal(result.reason, 'domain-mailbox-gate-denied');
  assert.ok(result.reasonCodes.includes('domain-mailbox-registry-linkage-required'));
  assert.ok(result.reasonCodes.includes('sending-workspace-linkage-required'));
  assert.equal(sends.count, 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
  const decision = (await store.list('auditLog')).find(row => row.type === 'domain_mailbox_gate_decision');
  assert.equal(decision.detail.decision, 'DENY');
});

test('canonical linkage is not enough: unobserved registry readiness denies before reservation or provider call', async () => {
  const store = await makeStore({ sendingDomainId: 'd1', sendingMailboxId: 'm1', workspaceId: 'w1' });
  await seedRegistered(store);
  const sends = { count: 0 };
  const result = await makePipeline(store, sends).maybeSend(prospect, campaign);

  assert.equal(result.sent, false);
  assert.equal(result.reason, 'domain-mailbox-gate-denied');
  assert.ok(result.reasonCodes.includes('domain-dns-not-verified:UNKNOWN'));
  assert.ok(result.reasonCodes.includes('mailbox-authentication-not-confirmed'));
  assert.equal(sends.count, 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
});

test('fully observed, warm, authorized registry clears its own gate and then reaches the provider boundary', async () => {
  const store = await makeStore({ sendingDomainId: 'd1', sendingMailboxId: 'm1', workspaceId: 'w1' });
  await seedReady(store);
  const sends = { count: 0 };
  const result = await makePipeline(store, sends).maybeSend(prospect, campaign);

  assert.equal(result.sent, true);
  assert.equal(sends.count, 1);
  const decision = (await store.list('auditLog')).find(row => row.type === 'domain_mailbox_gate_decision');
  assert.equal(decision.detail.decision, 'NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE');
  assert.deepEqual(decision.detail.reasonCodes, []);
});
