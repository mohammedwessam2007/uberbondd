import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import {
  REPLY_CATEGORIES, classifyReply, draftGroundedReply, shouldStopFollowUp, ReplyError,
  createFakeReplyImportProvider, parseEml, importReplyFromEml, importRepliesFromCsv
} from '../../revenue-os/src/reply.mjs';
import { getService } from '../../revenue-os/src/config.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-reply-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('REPLY_CATEGORIES has exactly the mission\'s 19 named categories', () => {
  assert.equal(REPLY_CATEGORIES.length, 19);
  for (const name of ['interested', 'pricing', 'proof_request', 'timing', 'referral', 'wrong_contact', 'existing_vendor', 'free_work_request', 'negotiation', 'not_interested', 'unsubscribe', 'complaint', 'legal_concern', 'bounce', 'automated', 'ambiguous', 'payment_reported_or_verified', 'implementation_interest', 'monitoring_interest']) {
    assert.ok(REPLY_CATEGORIES.includes(name), `missing category: ${name}`);
  }
});

test('classifyReply correctly classifies one representative phrase per category', () => {
  const samples = {
    'please unsubscribe me': 'unsubscribe', 'this is spam, reporting you': 'complaint',
    'i will have my lawyer contact you': 'legal_concern', 'mailer-daemon: delivery has failed': 'bounce',
    'i am currently away, out of office until monday': 'automated',
    'we have just paid the invoice, transaction id 12345': 'payment_reported_or_verified',
    'can you go ahead and fix the issues': 'implementation_interest',
    'interested in ongoing monitoring monthly': 'monitoring_interest',
    'we already have an agency for this': 'existing_vendor', 'can you do this for free as a trial': 'free_work_request',
    'any discount available': 'negotiation', 'how much does this cost': 'pricing',
    'can I see a sample report first': 'proof_request', 'not right now, maybe later': 'timing',
    'please forward this to our marketing person': 'referral', 'wrong person, i no longer work here': 'wrong_contact',
    'not interested, please do not contact again': 'not_interested', 'sounds good, tell me more': 'interested'
  };
  for (const [text, expected] of Object.entries(samples)) assert.equal(classifyReply(text).category, expected, `"${text}"`);
});

test('classifyReply falls back to ambiguous rather than guessing when nothing matches', () => {
  const result = classifyReply('xk9 qzv random unrelated words');
  assert.equal(result.category, 'ambiguous');
  assert.ok(result.confidence < 0.5);
});

test('classifyReply prioritizes compliance categories over commercial ones in a mixed message', () => {
  assert.equal(classifyReply('this is spam and also how much does it cost').category, 'complaint');
});

// --- grounded drafts ---

test('draftGroundedReply refuses to draft for a non-draftable category', () => {
  const opportunity = { id: 'o1' };
  const offer = getService('FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC');
  assert.throws(() => draftGroundedReply({ classification: { category: 'unsubscribe' }, opportunity, offer }), ReplyError);
  assert.throws(() => draftGroundedReply({ classification: { category: 'complaint' }, opportunity, offer }), ReplyError);
});

test('draftGroundedReply produces a draft grounded only in the offer catalog, no fabricated claims', () => {
  const opportunity = { id: 'o1' };
  const offer = getService('FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC');
  const draft = draftGroundedReply({ classification: { category: 'pricing' }, opportunity, offer });
  assert.ok(draft.body.includes('250'));
  assert.equal(draft.groundedIn.offerKey, offer.key);
  assert.ok(!/guarantee/i.test(draft.body));
});

// --- follow-up stop-gate ---

test('shouldStopFollowUp stops on any reply at all, even an ambiguous one', async () => {
  const store = await harness();
  await store.add('replies', { opportunityId: 'o1', classification: 'ambiguous', data: { organizationDomain: 'a.example.com' } });
  const result = await shouldStopFollowUp(store, 'a.example.com');
  assert.equal(result.stop, true);
  assert.ok(result.reasons.includes('reply-received'));
});

test('shouldStopFollowUp stops on a verified/reported payment even with no reply', async () => {
  const store = await harness();
  await store.add('payments', { status: 'VERIFIED', data: { organizationDomain: 'b.example.com' } });
  const result = await shouldStopFollowUp(store, 'b.example.com');
  assert.ok(result.reasons.includes('payment-in-progress-or-verified'));
});

test('shouldStopFollowUp stops when the owner has paused outreach globally', async () => {
  const store = await harness();
  await store.setSetting('ownerPaused', true);
  const result = await shouldStopFollowUp(store, 'c.example.com');
  assert.ok(result.reasons.includes('owner-paused'));
});

test('shouldStopFollowUp stops on an uncertain-quarantined send for the organization', async () => {
  const store = await harness();
  await store.add('sendRecords', { approvalId: 'a', mode: 'export-only', idempotencyKey: 'k1', recipientMessageHash: 'h1', status: 'uncertain-quarantined', data: { organizationDomain: 'd.example.com' } });
  const result = await shouldStopFollowUp(store, 'd.example.com');
  assert.ok(result.reasons.includes('uncertain-send-pending'));
});

test('shouldStopFollowUp does not stop an unrelated organization', async () => {
  const store = await harness();
  await store.add('replies', { opportunityId: 'o1', classification: 'unsubscribe', data: { organizationDomain: 'e.example.com' } });
  const result = await shouldStopFollowUp(store, 'unrelated.example.com');
  assert.equal(result.stop, false);
});

// --- import providers ---

test('createFakeReplyImportProvider is read-only and returns a scripted list without any network access', async () => {
  const provider = createFakeReplyImportProvider([{ body: 'interested' }, { body: 'unsubscribe me' }]);
  const first = await provider.listReplies();
  assert.equal(first.length, 2);
  const second = await provider.listReplies();
  assert.equal(second.length, 0, 'a second call should not re-return already-fetched replies');
});

test('parseEml extracts headers and body from a minimal RFC822-shaped message', () => {
  const eml = 'From: buyer@example.com\r\nSubject: Re: quick question\r\nDate: Mon, 1 Jan 2026 00:00:00 +0000\r\n\r\nHow much does this cost?';
  const parsed = parseEml(eml);
  assert.equal(parsed.from, 'buyer@example.com');
  assert.equal(parsed.subject, 'Re: quick question');
  assert.equal(parsed.body, 'How much does this cost?');
});

test('importReplyFromEml persists a reply record with the correct classification', async () => {
  const store = await harness();
  const eml = 'From: buyer@example.com\r\nSubject: pricing\r\n\r\nHow much does this cost?';
  const record = await importReplyFromEml(store, 'o1', 'f.example.com', eml);
  assert.equal(record.classification, 'pricing');
  assert.equal(record.data.organizationDomain, 'f.example.com');
});

test('importRepliesFromCsv imports multiple rows and classifies each independently', async () => {
  const store = await harness();
  const csv = 'opportunityId,organizationDomain,from,subject,body\no1,g.example.com,a@x.com,x,how much does this cost\no2,h.example.com,b@x.com,y,please unsubscribe me\n';
  const imported = await importRepliesFromCsv(store, csv);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].classification, 'pricing');
  assert.equal(imported[1].classification, 'unsubscribe');
});
