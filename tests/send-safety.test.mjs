import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateSendEligibility, contactEligibility, sendIdempotencyKey, classifyDeliverySignal } from '../src/send-safety.mjs';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../src/unsubscribe.mjs';
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-send-safety-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('send gate accepts a domain-matched address only with a current solicited route and exact approval', () => {
  const result = evaluateSendEligibility({ prospect, campaign, cfg, date: monday });
  assert.equal(result.ok, true);
  assert.equal(result.contactMode, 'published');
});

test('send gate rejects unverified enrichment, free mail, mismatched domains, missing allowlists, and off-hours', () => {
  assert.equal(contactEligibility({ email: 'owner@clinic.example', source: 'hunter', verified: 'unknown' }, prospect).reason, 'contact-not-published-or-verified');
  assert.equal(contactEligibility({ email: 'clinic@gmail.com', source: 'website' }, prospect).reason, 'free-mail-contact');
  assert.equal(contactEligibility({ email: 'info@other.example', source: 'website' }, prospect).reason, 'contact-domain-mismatch');
  assert.equal(evaluateSendEligibility({ prospect, campaign: { ...campaign, allowedCountries: [] }, cfg, date: monday }).reason, 'country-not-campaign-allowed');
  assert.equal(evaluateSendEligibility({ prospect, campaign, cfg, date: new Date('2026-07-14T02:00:00Z') }).reason, 'outside-recipient-business-hours');
});

test('multi-timezone countries require an explicit prospect timezone', () => {
  const usBase = { ...baseProspect, country: 'United States' };
  const usCampaign = { ...campaign, allowedCountries: ['US'] };
  const usCfg = { ...cfg, outbound: { ...cfg.outbound, allowedCountries: ['US'] } };
  const us = approveProspectForTest({ prospect: usBase, campaign: usCampaign, cfg: usCfg, date: monday, jurisdiction: 'US' });
  assert.equal(evaluateSendEligibility({ prospect: us, campaign: usCampaign, cfg: usCfg, date: monday }).reason, 'recipient-timezone-missing');
  assert.equal(evaluateSendEligibility({ prospect: { ...us, timeZone: 'America/New_York' }, campaign: usCampaign, cfg: usCfg, date: new Date('2026-07-13T14:00:00Z') }).ok, true);
});


test('unsubscribe tokens are signed, expire, and reject tampering', () => {
  const secret = 's'.repeat(64);
  const token = createUnsubscribeToken('prospect-1', secret, monday.getTime() + 60000);
  assert.equal(verifyUnsubscribeToken(token, secret, monday.getTime()).prospectId, 'prospect-1');
  assert.equal(verifyUnsubscribeToken(`${token}x`, secret, monday.getTime()), null);
  assert.equal(verifyUnsubscribeToken(token, secret, monday.getTime() + 120000), null);
});

test('delivery signals distinguish bounces, complaints, and automatic replies', () => {
  assert.equal(classifyDeliverySignal({ from: 'MAILER-DAEMON@example.com', subject: 'Delivery Status Notification', body: '550 5.1.1 address not found' }).label, 'bounce');
  assert.equal(classifyDeliverySignal({ subject: 'Spam complaint feedback loop', body: 'reported as spam' }).label, 'complaint');
  assert.equal(classifyDeliverySignal({ subject: 'Automatic reply: away from office' }).label, 'automatic');
});

test('JSON store atomically enforces idempotency, hourly/daily caps, cadence, and global pause', async () => {
  const store = await tempStore();
  const base = { inbox: 'A', dailyCap: 1, hourlyCap: 1, minGapSeconds: 0, recipientEmail: 'info@clinic.example', now: monday.toISOString() };
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => store.reserveOutboundSend({
    ...base,
    recipientEmail: `info@clinic${i}.example`,
    businessDomain: `clinic${i}.example`,
    idempotencyKey: `initial:p${i}`,
    prospectId: `p${i}`
  })));
  assert.equal(attempts.filter(item => item.ok).length, 1);
  assert(attempts.some(item => item.reason === 'daily-cap' || item.reason === 'hourly-cap'));
  const first = attempts.find(item => item.ok).reservation;
  await store.markOutboundReservation(first.id, 'sent', { sentAt: monday.toISOString() });
  const duplicate = await store.reserveOutboundSend({ ...base, idempotencyKey: first.idempotencyKey, prospectId: first.prospectId, dailyCap: 10, hourlyCap: 10 });
  assert.equal(duplicate.reason, 'duplicate-sent');
  await store.setOutboundPaused(true, 'test');
  const paused = await store.reserveOutboundSend({ ...base, idempotencyKey: 'new-after-pause', dailyCap: 10, hourlyCap: 10 });
  assert.equal(paused.reason, 'global-outbound-paused');
});

test('sender health pauses after a complaint or configured bounce threshold', async () => {
  const store = await tempStore();
  let health = await store.recordOutboundEvent({ inbox: 'A', eventType: 'hard_bounce', recipientEmail: 'bad@clinic.example' }, { hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 });
  assert.equal(health.paused, false);
  health = await store.recordOutboundEvent({ inbox: 'A', eventType: 'hard_bounce', recipientEmail: 'bad2@clinic.example' }, { hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 });
  assert.equal(health.paused, true);
  assert.equal(health.pauseReason, 'hard-bounce-threshold');
});

test('recipient and business-domain cooldowns prevent re-importing the same company as a new prospect', async () => {
  const store = await tempStore();
  const reserve = overrides => store.reserveOutboundSend({
    inbox: 'A', dailyCap: 20, hourlyCap: 20, minGapSeconds: 0,
    recipientCooldownDays: 365, domainCooldownDays: 90,
    now: monday.toISOString(), kind: 'initial', followup: 0,
    ...overrides
  });
  const first = await reserve({
    idempotencyKey: 'initial:first', prospectId: 'first',
    recipientEmail: 'careers@agency.example', businessDomain: 'agency.example'
  });
  assert.equal(first.ok, true);
  await store.markOutboundReservation(first.reservation.id, 'sent', { sentAt: monday.toISOString() });
  const sameRecipient = await reserve({
    idempotencyKey: 'initial:second', prospectId: 'second',
    recipientEmail: 'careers@agency.example', businessDomain: 'agency.example', inbox: 'B'
  });
  assert.equal(sameRecipient.reason, 'recipient-contact-cooldown');
  const sameDomain = await reserve({
    idempotencyKey: 'initial:third', prospectId: 'third',
    recipientEmail: 'hello@agency.example', businessDomain: 'agency.example', inbox: 'B'
  });
  assert.equal(sameDomain.reason, 'business-domain-contact-cooldown');
  const followup = await reserve({
    idempotencyKey: 'followup:first:1', prospectId: 'first',
    recipientEmail: 'careers@agency.example', businessDomain: 'agency.example',
    kind: 'followup', followup: 1
  });
  assert.equal(followup.ok, true);
});

test('an uncertain recipient outcome remains blocked even after a nominal cooldown', async () => {
  const store = await tempStore();
  const first = await store.reserveOutboundSend({
    inbox: 'A', dailyCap: 20, hourlyCap: 20, minGapSeconds: 0,
    idempotencyKey: 'initial:uncertain-old', prospectId: 'uncertain-old',
    recipientEmail: 'hello@uncertain.example', businessDomain: 'uncertain.example',
    recipientCooldownDays: 30, domainCooldownDays: 7, now: '2024-01-01T10:00:00.000Z'
  });
  await store.markOutboundReservation(first.reservation.id, 'uncertain');
  const later = await store.reserveOutboundSend({
    inbox: 'B', dailyCap: 20, hourlyCap: 20, minGapSeconds: 0,
    idempotencyKey: 'initial:uncertain-new', prospectId: 'uncertain-new',
    recipientEmail: 'hello@uncertain.example', businessDomain: 'uncertain.example',
    recipientCooldownDays: 30, domainCooldownDays: 7, now: '2026-08-10T10:00:00.000Z'
  });
  assert.equal(later.reason, 'recipient-result-uncertain');
});

test('pipeline sends once and a repeated execution is stopped by the durable idempotency reservation', async () => {
  const store = await tempStore();
  await store.add('campaigns', campaign);
  await store.add('prospects', { ...prospect, status: 'ready', createdAt: monday.toISOString() });
  await store.add('accounts', { id: 'acct', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
  let sends = 0;
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    sendEmail: async () => { sends += 1; return { data: { id: 'gmail-1', threadId: 'thread-1' } }; },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<message-1@example>' }] } } })
  });
  const first = await pipeline.maybeSend(prospect, campaign);
  const second = await pipeline.maybeSend(prospect, campaign);
  assert.equal(first.sent, true);
  assert.equal(second.sent, true);
  assert.equal(second.duplicate, true);
  assert.equal(sends, 1);
  assert.equal(sendIdempotencyKey(prospect.id), 'initial:pros');
});

test('an uncertain provider result is never automatically retried', async () => {
  const store = await tempStore();
  await store.add('campaigns', campaign);
  const uncertainBase = { ...baseProspect, id: 'uncertain', domain: 'uncertain.example', website: 'https://uncertain.example', contact: { email: 'info@uncertain.example', source: 'website' }, issue: { ...baseProspect.issue, evidenceUrl: 'https://uncertain.example/book' }, status: 'ready' };
  const uncertainApproved = approveProspectForTest({ prospect: uncertainBase, campaign, cfg, date: monday });
  await store.add('prospects', uncertainApproved);
  await store.add('accounts', { id: 'acct', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
  let sends = 0;
  const uncertainProspect = await store.get('prospects', 'uncertain');
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    sendEmail: async () => { sends += 1; throw new Error('network timed out after dispatch'); }
  });
  const first = await pipeline.maybeSend(uncertainProspect, campaign);
  const second = await pipeline.maybeSend(uncertainProspect, campaign);
  assert.equal(first.uncertain, true);
  assert.equal(second.reason, 'duplicate-uncertain');
  assert.equal(sends, 1);
});

test('pipeline cannot reach Gmail when the authoritative consequence gate is absent', async () => {
  const store = await tempStore();
  const blockedProspect = approveProspectForTest({
    prospect: { ...baseProspect, id: 'blocked-no-v9-gate' },
    campaign,
    cfg,
    date: monday
  });
  await store.add('campaigns', campaign);
  await store.add('prospects', { ...blockedProspect, status: 'ready', createdAt: monday.toISOString() });
  await store.add('accounts', { id: 'acct', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
  let sends = 0;
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    sendEmail: async () => { sends += 1; return { data: { id: 'must-not-exist' } }; }
  });
  const result = await pipeline.maybeSend(blockedProspect, campaign);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'v9-authoritative-consequence-admission-required');
  assert.equal(sends, 0);
  const reservations = await store.list('outboundReservations');
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].status, 'cancelled');
  assert.equal(reservations[0].cancellationReason, 'authoritative-consequence-gate-not-configured');
});
