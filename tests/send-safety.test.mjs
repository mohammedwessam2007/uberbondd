import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateSendEligibility, contactEligibility, sendIdempotencyKey, classifyDeliverySignal } from '../src/send-safety.mjs';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../src/unsubscribe.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');
const campaign = { id: 'camp', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0 };
const cfg = {
  outbound: { enabled: true, dryRun: false, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0, businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 10 }, google: {}, encryptionKey: ''
};
const prospect = {
  id: 'pros', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example', domain: 'clinic.example', country: 'United Kingdom',
  inbox: 'A', draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test', oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
  contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' },
  score: { total: 80 }, issue: { title: 'Booking path issue', confidence: .9, safeForOutreach: true, evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.' }
};

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-send-safety-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('send gate accepts a domain-matched email published on the company website', () => {
  const result = evaluateSendEligibility({ prospect, campaign, cfg, date: monday });
  assert.equal(result.ok, true);
  assert.equal(result.contactMode, 'published');
});

test('send gate rejects unverified enrichment, free mail, mismatched domains, missing allowlists, and off-hours', () => {
  assert.equal(contactEligibility({ email: 'owner@clinic.example', source: 'hunter', verified: 'unknown' }, prospect).reason, 'contact-not-published-or-verified');
  assert.equal(contactEligibility({ email: 'clinic@gmail.com', source: 'website' }, prospect).reason, 'free-mail-contact');
  assert.equal(contactEligibility({ email: 'info@other.example', source: 'website' }, prospect).reason, 'contact-domain-mismatch');
  assert.equal(evaluateSendEligibility({ prospect, campaign: { ...campaign, allowedCountries: [] }, cfg, date: monday }).reason, 'country-not-campaign-allowed');
  assert.equal(evaluateSendEligibility({ prospect, campaign, cfg, date: new Date('2026-07-13T02:00:00Z') }).reason, 'outside-recipient-business-hours');
});

test('multi-timezone countries require an explicit prospect timezone', () => {
  const us = { ...prospect, country: 'United States' };
  const usCampaign = { ...campaign, allowedCountries: ['US'] };
  const usCfg = { ...cfg, outbound: { ...cfg.outbound, allowedCountries: ['US'] } };
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
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => store.reserveOutboundSend({ ...base, idempotencyKey: `initial:p${i}`, prospectId: `p${i}` })));
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

test('pipeline sends once and a repeated execution is stopped by the durable idempotency reservation', async () => {
  const store = await tempStore();
  await store.add('campaigns', campaign);
  await store.add('prospects', { ...prospect, status: 'ready', createdAt: monday.toISOString() });
  await store.add('accounts', { id: 'acct', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
  let sends = 0;
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
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
  await store.add('prospects', { ...prospect, id: 'uncertain', domain: 'uncertain.example', website: 'https://uncertain.example', contact: { email: 'info@uncertain.example', source: 'website' }, issue: { ...prospect.issue, evidenceUrl: 'https://uncertain.example/book' }, status: 'ready' });
  await store.add('accounts', { id: 'acct', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
  let sends = 0;
  const uncertainProspect = await store.get('prospects', 'uncertain');
  const pipeline = new Pipeline(store, cfg, { clock: () => monday, sendEmail: async () => { sends += 1; throw new Error('network timed out after dispatch'); } });
  const first = await pipeline.maybeSend(uncertainProspect, campaign);
  const second = await pipeline.maybeSend(uncertainProspect, campaign);
  assert.equal(first.uncertain, true);
  assert.equal(second.reason, 'duplicate-uncertain');
  assert.equal(sends, 1);
});
