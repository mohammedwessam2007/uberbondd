import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  PAYMENT_IDENTITY, CASH_READY_CATEGORIES, buildPaymentLinkMessage, prepareReplyToCash, ReplyToCashError
} from '../../revenue-os/src/reply-to-cash.mjs';
import { buildProposal, buildPaymentRequestMessage } from '../../revenue-os/src/proposal.mjs';

const OFFER = { offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', priceCents: 25000, siteCount: 3, deliveryHoursMin: 12, deliveryHoursMax: 24 };
const OPPORTUNITY = { id: 'opp1', organizationDomain: 'reply-fixture.invalid', channel: 'published_email', data: {} };

// --- payment identity ---

test('PAYMENT_IDENTITY carries the exact mission-named account holder and PayPal.Me handle', () => {
  assert.equal(PAYMENT_IDENTITY.accountHolder, 'Mohamed Wessam');
  assert.equal(PAYMENT_IDENTITY.method, 'PayPal.Me');
  assert.equal(PAYMENT_IDENTITY.handle, 'SaraWessam');
  assert.ok(PAYMENT_IDENTITY.link.includes('SaraWessam'));
});

// --- "do not place the payment link in the first message" ---

test('buildPaymentRequestMessage (the first payment-related message) never contains the payment link or handle', () => {
  const proposal = buildProposal({ opportunity: OPPORTUNITY, offer: OFFER });
  const message = buildPaymentRequestMessage(proposal);
  assert.ok(!message.body.toLowerCase().includes('paypal.me'));
  assert.ok(!message.body.includes('SaraWessam'));
});

test('buildPaymentLinkMessage throws when no prior payment_request timestamp is supplied -- the link can never be the first message', () => {
  const proposal = buildProposal({ opportunity: OPPORTUNITY, offer: OFFER });
  assert.throws(() => buildPaymentLinkMessage(proposal, {}), ReplyToCashError);
  assert.throws(() => buildPaymentLinkMessage(proposal), ReplyToCashError);
});

test('hostile: buildPaymentLinkMessage rejects a malformed or non-prior (future/now) timestamp', () => {
  const proposal = buildProposal({ opportunity: OPPORTUNITY, offer: OFFER });
  assert.throws(() => buildPaymentLinkMessage(proposal, { priorPaymentRequestSentAt: 'not-a-date' }), ReplyToCashError);
  const now = Date.now();
  assert.throws(() => buildPaymentLinkMessage(proposal, { priorPaymentRequestSentAt: new Date(now + 60000).toISOString(), nowMs: now }), ReplyToCashError);
  assert.throws(() => buildPaymentLinkMessage(proposal, { priorPaymentRequestSentAt: new Date(now).toISOString(), nowMs: now }), ReplyToCashError, 'equal to now does not count as strictly prior');
});

test('buildPaymentLinkMessage succeeds and contains the link once a genuinely prior payment_request timestamp is supplied', () => {
  const proposal = buildProposal({ opportunity: OPPORTUNITY, offer: OFFER });
  const priorSentAt = new Date(Date.now() - 3600000).toISOString();
  const linkMessage = buildPaymentLinkMessage(proposal, { priorPaymentRequestSentAt: priorSentAt });
  assert.ok(linkMessage.body.includes(PAYMENT_IDENTITY.link));
  assert.ok(linkMessage.body.includes('SaraWessam'));
  assert.equal(linkMessage.kind, 'payment_link');
});

// --- prepareReplyToCash orchestration ---

test('prepareReplyToCash drafts a grounded reply and prepares a proposal + payment request for a cash-ready category', () => {
  const result = prepareReplyToCash({ replyBody: "sounds good, I'm interested", opportunity: OPPORTUNITY, offer: OFFER });
  assert.equal(result.classification.category, 'interested');
  assert.ok(result.replyDraft);
  assert.ok(result.proposal);
  assert.ok(result.paymentRequestMessage);
  assert.ok(!result.paymentRequestMessage.body.includes('SaraWessam'), 'the very first automated cash-ready artifact still never contains the payment link');
});

test('prepareReplyToCash drafts a grounded reply but does NOT prepare a proposal for a merely-draftable, not-cash-ready category', () => {
  const result = prepareReplyToCash({ replyBody: 'can I see an example report first?', opportunity: OPPORTUNITY, offer: OFFER });
  assert.equal(result.classification.category, 'proof_request');
  assert.ok(result.replyDraft);
  assert.equal(result.proposal, undefined);
  assert.equal(result.paymentRequestMessage, undefined);
});

test('prepareReplyToCash produces nothing automated at all for a negotiation reply -- never automatically negotiates unusual terms', () => {
  const result = prepareReplyToCash({ replyBody: "what's your best price, any discount?", opportunity: OPPORTUNITY, offer: OFFER });
  assert.equal(result.classification.category, 'negotiation');
  assert.equal(result.replyDraft, undefined);
  assert.equal(result.proposal, undefined);
  assert.equal(result.paymentRequestMessage, undefined);
});

test('prepareReplyToCash produces nothing automated for compliance-sensitive categories (unsubscribe/complaint/legal_concern)', () => {
  for (const body of ['please unsubscribe me', 'this is spam, I will report you', 'talk to my lawyer about this']) {
    const result = prepareReplyToCash({ replyBody: body, opportunity: OPPORTUNITY, offer: OFFER });
    assert.equal(result.replyDraft, undefined, `unexpected draft for: ${body}`);
    assert.equal(result.proposal, undefined, `unexpected proposal for: ${body}`);
  }
});

test('hostile: prepareReplyToCash requires an opportunity and an offer', () => {
  assert.throws(() => prepareReplyToCash({ replyBody: 'interested', offer: OFFER }), ReplyToCashError);
  assert.throws(() => prepareReplyToCash({ replyBody: 'interested', opportunity: OPPORTUNITY }), ReplyToCashError);
});

// --- capability-scan: structurally incapable of confirming payment or resolving money disputes ---

test('reply-to-cash.mjs has no import statement referencing payments.mjs at all -- it cannot confirm, refund, or dispute a payment', async () => {
  const content = await fs.readFile(new URL('../../revenue-os/src/reply-to-cash.mjs', import.meta.url), 'utf8');
  const importLines = content.split('\n').filter(line => line.trim().startsWith('import '));
  assert.ok(importLines.every(line => !line.includes('payments.mjs')), `unexpected payments.mjs import: ${importLines.join(' | ')}`);
});

test('CASH_READY_CATEGORIES never includes negotiation, not_interested, or any compliance-sensitive category', () => {
  for (const forbidden of ['negotiation', 'not_interested', 'unsubscribe', 'complaint', 'legal_concern', 'bounce']) {
    assert.ok(!CASH_READY_CATEGORIES.includes(forbidden), `${forbidden} must never be cash-ready`);
  }
});
