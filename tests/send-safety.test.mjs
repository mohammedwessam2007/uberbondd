import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateSendEligibility, contactEligibility, deterministicCadenceSeconds, sendIdempotencyKey, classifyDeliverySignal } from '../src/send-safety.mjs';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../src/unsubscribe.mjs';
import { buildRawMessage, createOAuthState, createTestGmailAdapter, getProfile, googleAuthUrl, verifyOAuthState } from '../src/gmail.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');
const campaign = {
  id: 'camp', approved: true, enabled: true, autoSend: true, dryRun: false, liveSendApproved: true,
  countries: ['GB'], allowedCountries: ['GB'], minimumProspectScore: 60, minScore: 60,
  minimumEvidenceConfidence: .75, dailySendCap: 10, hourlySendCap: 3,
  dailyCaps: { A: 10 }, allowedInboxes: ['A'], businessHourStart: 9, businessHourEnd: 17,
  maximumFollowups: 0, maxFollowups: 0, followupDelayDays: 5
};
const cfg = {
  outbound: { provider: 'gmail', enabled: true, dryRun: false, liveSendApproved: true, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0, maxGapJitterSeconds: 0, businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 10 }, google: {}, encryptionKey: ''
};
const prospect = {
  id: 'pros', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example', domain: 'clinic.example', country: 'United Kingdom',
  inbox: 'A', draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
  outreach: { selected: { body: 'Evidence-backed message with reply no.', subject: 'Website observation', quality: { passed: true, score: 95 } } },
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test', oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
  contact: {
    email: 'info@clinic.example', source: 'website', verified: 'unverified', published: true,
    evidence: [{
      email: 'info@clinic.example', sourceUrl: 'https://clinic.example/contact', sourceType: 'visible_text',
      evidenceExcerpt: 'Business enquiries: info@clinic.example', published: true
    }]
  },
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
  assert.equal(contactEligibility({ email: 'owner@clinic.example', source: 'website', published: true }, prospect).reason, 'published-evidence-missing');
  assert.equal(contactEligibility({ email: 'clinic@gmail.com', source: 'website' }, prospect).reason, 'free-mail-contact');
  assert.equal(contactEligibility({ email: 'security-alerts@clinic.example', source: 'website' }, prospect).reason, 'risky-mailbox');
  assert.equal(contactEligibility({ email: 'info@other.example', source: 'website' }, prospect).reason, 'contact-domain-mismatch');
  assert.equal(contactEligibility({ email: 'owner@clinic.example', source: 'hunter', verified: 'valid', verificationStatus: 'valid', externallyVerified: true }, prospect).mode, 'externally_verified');
  assert.equal(evaluateSendEligibility({ prospect, campaign: { ...campaign, countries: [], allowedCountries: [] }, cfg, date: monday }).reason, 'country-not-campaign-allowed');
  assert.equal(evaluateSendEligibility({ prospect, campaign, cfg, date: new Date('2026-07-13T02:00:00Z') }).reason, 'outside-recipient-business-hours');
});

test('multi-timezone countries require an explicit prospect timezone', () => {
  const us = { ...prospect, country: 'United States' };
  const usCampaign = { ...campaign, countries: ['US'], allowedCountries: ['US'] };
  const usCfg = { ...cfg, outbound: { ...cfg.outbound, allowedCountries: ['US'] } };
  assert.equal(evaluateSendEligibility({ prospect: us, campaign: usCampaign, cfg: usCfg, date: monday }).reason, 'recipient-timezone-missing');
  assert.equal(evaluateSendEligibility({ prospect: { ...us, timeZone: 'America/New_York' }, campaign: usCampaign, cfg: usCfg, date: new Date('2026-07-13T14:00:00Z') }).ok, true);
});

test('send gate requires explicit campaign and system live-send approvals', () => {
  assert.equal(evaluateSendEligibility({ prospect, campaign: { ...campaign, liveSendApproved: false }, cfg, date: monday }).reason, 'campaign-live-send-not-approved');
  assert.equal(evaluateSendEligibility({ prospect, campaign, cfg: { ...cfg, outbound: { ...cfg.outbound, liveSendApproved: false } }, date: monday }).reason, 'system-live-send-not-approved');
  assert.equal(evaluateSendEligibility({ prospect, campaign: { ...campaign, dryRun: true }, cfg, date: monday }).reason, 'campaign-dry-run');
  assert.equal(evaluateSendEligibility({ prospect, campaign: { ...campaign, autoSend: false }, cfg, date: monday }).reason, 'campaign-auto-send-disabled');
});

test('send gate rejects missing, failed, or detached draft quality records', () => {
  assert.equal(evaluateSendEligibility({ prospect: { ...prospect, outreach: null }, campaign, cfg, date: monday }).reason, 'draft-quality-gate');
  assert.equal(evaluateSendEligibility({ prospect: { ...prospect, outreach: { selected: { ...prospect.outreach.selected, quality: { passed: false } } } }, campaign, cfg, date: monday }).reason, 'draft-quality-gate');
  assert.equal(evaluateSendEligibility({ prospect: { ...prospect, draft: `${prospect.draft} changed` }, campaign, cfg, date: monday }).reason, 'draft-record-mismatch');
});

test('follow-up dispatch requires the original Gmail thread and RFC message identifiers', () => {
  const followupCampaign = { ...campaign, maximumFollowups: 1, maxFollowups: 1 };
  assert.equal(evaluateSendEligibility({ prospect, campaign: followupCampaign, cfg, date: monday, followup: 1 }).reason, 'followup-thread-metadata-missing');
  const threaded = { ...prospect, threadId: 'thread-1', rfcMessageId: '<message-1@example>' };
  assert.equal(evaluateSendEligibility({ prospect: threaded, campaign: followupCampaign, cfg, date: monday, followup: 1 }).ok, true);
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

test('Gmail MIME output preserves threading and one-click unsubscribe without header injection', () => {
  const raw = buildRawMessage({
    from: 'UberBond <outreach@example.com>\r\nBcc: attacker@example.com',
    to: 'owner@clinic.example\r\nCc: attacker@example.com',
    subject: 'مراجعة موقع العيادة\r\nX-Injected: true',
    body: 'Line one\nLine two',
    threadId: 'thread-1', replyToId: '<initial@example.com>\r\nBcc: attacker@example.com',
    listUnsubscribe: 'https://uberbond.example/api/public/unsubscribe?token=test'
  });
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.match(raw, /In-Reply-To: <initial@example\.com> Bcc: attacker@example\.com/);
  assert.match(raw, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(raw, /Line one\r\nLine two/);
  assert.doesNotMatch(raw, /\r\n(?:Bcc|Cc|X-Injected):/);
});

test('signed OAuth state is scoped, expiring, tamper-resistant, and does not require server memory', () => {
  const secret = 'o'.repeat(64);
  const issuedAt = monday.getTime();
  const state = createOAuthState('A', secret, issuedAt, 'deterministic-nonce');
  assert.equal(verifyOAuthState(state, secret, issuedAt + 1000).slot, 'A');
  assert.equal(verifyOAuthState(`${state}x`, secret, issuedAt + 1000), null);
  assert.equal(verifyOAuthState(state, secret, issuedAt + 11 * 60000), null);
  const authUrl = new URL(googleAuthUrl({ clientId: 'client', redirectUri: 'https://app.example/oauth/google/callback' }, state));
  assert.equal(authUrl.hostname, 'accounts.google.com');
  assert.match(authUrl.searchParams.get('scope'), /gmail\.send/);
  assert.match(authUrl.searchParams.get('scope'), /gmail\.readonly/);
  assert.equal(authUrl.searchParams.get('state'), state);
});

test('real Gmail network access fails closed in test mode and provider errors contain no response body', async () => {
  await assert.rejects(
    getProfile({ allowNetwork: false }, { tokens: 'not-opened' }, 'not-used'),
    error => error.code === 'gmail-network-disabled-in-test' && !String(error.message).includes('not-opened')
  );
});

test('test Gmail adapter simulates correct initial and follow-up threading without network access', async () => {
  const adapter = createTestGmailAdapter();
  const initial = await adapter.sendEmail({}, {}, '', { from: 'sender@example.com', to: 'owner@clinic.example', subject: 'Observation', body: 'Initial', listUnsubscribe: 'https://app.example/u' });
  const first = await adapter.getMessage({}, {}, '', initial.data.id);
  const rfcId = first.data.payload.headers[0].value;
  const followup = await adapter.sendEmail({}, {}, '', { from: 'sender@example.com', to: 'owner@clinic.example', subject: 'Re: Observation', body: 'Follow-up', threadId: initial.data.threadId, replyToId: rfcId, listUnsubscribe: 'https://app.example/u' });
  assert.equal(followup.data.threadId, initial.data.threadId);
  const records = adapter.inspect();
  assert.equal(records.length, 2);
  assert.match(records[1].raw, new RegExp(`In-Reply-To: ${rfcId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(records[1].raw, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
});

test('cadence jitter is deterministic, bounded, and stable across retries', () => {
  const first = deterministicCadenceSeconds(90, 90, 'initial:prospect-1');
  assert.equal(first, deterministicCadenceSeconds(90, 90, 'initial:prospect-1'));
  assert(first >= 90 && first <= 180);
  assert.equal(deterministicCadenceSeconds(90, 0, 'initial:prospect-1'), 90);
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
  const events = await store.list('outboundEvents');
  assert(events.every(event => event.recipientEmail === ''));
  assert(events.every(event => /^[a-f0-9]{64}$/.test(event.recipientHash)));
  assert.equal(JSON.stringify(events).includes('bad@clinic.example'), false);
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
  await store.add('prospects', {
    ...prospect,
    id: 'uncertain',
    domain: 'uncertain.example',
    website: 'https://uncertain.example',
    contact: {
      email: 'info@uncertain.example', source: 'website', published: true,
      evidence: [{
        email: 'info@uncertain.example', sourceUrl: 'https://uncertain.example/contact', sourceType: 'visible_text',
        evidenceExcerpt: 'Contact info@uncertain.example', published: true
      }]
    },
    issue: { ...prospect.issue, evidenceUrl: 'https://uncertain.example/book' },
    status: 'ready'
  });
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

test('owner-scheduled dry-run dispatch uses the test provider and can never send a real email', async () => {
  const store = await tempStore();
  const dryCampaign = {
    ...campaign, id: 'dry-campaign', autoSend: false, dryRun: true, liveSendApproved: false,
    dailySendCap: 10, hourlySendCap: 3, maximumFollowups: 1
  };
  const scheduled = {
    ...prospect, id: 'scheduled-test', campaignId: dryCampaign.id, status: 'scheduled',
    draftApproval: { status: 'approved', approvedAt: monday.toISOString() }
  };
  const dryCfg = {
    ...cfg,
    outbound: { ...cfg.outbound, provider: 'test', enabled: false, dryRun: true, liveSendApproved: false },
    google: { allowNetwork: false }
  };
  await store.add('campaigns', dryCampaign);
  await store.add('prospects', scheduled);
  const pipeline = new Pipeline(store, dryCfg, { clock: () => monday });
  const result = await pipeline.processOutboundQueue(1, { prospectId: scheduled.id });
  assert.deepEqual(result, { attempted: 1, sent: 1 });
  const stored = await store.get('prospects', scheduled.id);
  assert.equal(stored.status, 'sent');
  assert.equal(stored.deliveryMode, 'test');
  assert.equal(stored.sendSafety.simulated, true);
  assert.equal(stored.nextFollowupAt, null);
  const messages = await store.list('messages');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].provider, 'test');
  assert.equal(messages[0].simulated, true);
  assert.equal(pipeline.mailAdapter.inspect().length, 1);
});

test('verified payment stops a due follow-up before provider or reservation work', async () => {
  const store = await tempStore();
  const followupCampaign = { ...campaign, maximumFollowups: 1, maxFollowups: 1 };
  const paidProspect = {
    ...prospect, id: 'paid-stop', leadId: 'lead-paid', status: 'sent', threadId: 'thread-paid',
    rfcMessageId: '<paid@example>', sentAt: '2026-07-01T10:00:00.000Z',
    nextFollowupAt: '2026-07-10T10:00:00.000Z', followupCount: 0
  };
  await store.add('campaigns', followupCampaign);
  await store.add('prospects', paidProspect);
  await store.add('leads', { id: 'lead-paid', prospectId: paidProspect.id, paymentStatus: 'paid', paidAt: '2026-07-12T10:00:00.000Z' });
  let sends = 0;
  const pipeline = new Pipeline(store, cfg, { clock: () => monday, sendEmail: async () => { sends += 1; throw new Error('must not send'); } });
  assert.equal(await pipeline.processFollowups(), 0);
  const stored = await store.get('prospects', paidProspect.id);
  assert.equal(stored.status, 'paid');
  assert.equal(stored.nextFollowupAt, null);
  assert.equal(sends, 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
});

test('unsubscribe-style suppression can permanently stop both email and business domain', async () => {
  const store = await tempStore();
  const pipeline = new Pipeline(store, { ...cfg, outbound: { ...cfg.outbound, provider: 'test' } });
  await pipeline.addSuppression(prospect, 'unsubscribe', { includeDomain: true });
  const values = (await store.list('suppressions')).map(item => item.value).sort();
  assert.deepEqual(values, ['clinic.example', 'info@clinic.example']);
  assert.equal(await pipeline.isSuppressed({ ...prospect, contact: { email: 'other@clinic.example' } }, 'other@clinic.example'), true);
});
