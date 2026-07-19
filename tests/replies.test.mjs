import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import {
  REPLY_LABELS,
  classifyReplyDeterministic,
  classifyReplyWithFallback,
  extractMailbox,
  matchReplyToProspect,
  prospectReplyPatch,
  responseDraftFor,
  suppressionPolicy,
  validateResponseDraft,
  visibleReplyText
} from '../src/replies.mjs';

const receivedAt = '2026-07-18T08:00:00.000Z';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-replies-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

const fixtures = [
  ['interested', { body: 'I am interested in exploring this.' }],
  ['meeting-requested', { body: "Let's schedule a call next week." }],
  ['asks-for-information', { body: 'Can you send me more details?' }],
  ['price-objection', { body: 'This is too expensive for us.' }],
  ['already-has-provider', { body: 'We already work with an agency.' }],
  ['not-now', { body: 'Maybe later, perhaps next quarter.' }],
  ['not-interested', { body: "No thanks, we're not interested." }],
  ['unsubscribe', { body: 'Please unsubscribe me.' }],
  ['automatic-reply', { subject: 'Automatic reply: out of office', body: 'I am away.' }],
  ['bounce', { from: 'MAILER-DAEMON@example.net', subject: 'Delivery Status Notification', body: '550 5.1.1 address not found' }],
  ['complaint', { subject: 'Feedback loop', body: 'This is a spam complaint report.' }],
  ['unknown-needs-review', { body: 'Thanks for the note.' }]
];

test('deterministic fixtures cover every normalized reply class', () => {
  assert.deepEqual(fixtures.map(([label]) => label), REPLY_LABELS);
  for (const [label, parsed] of fixtures) {
    const result = classifyReplyDeterministic(parsed);
    assert.equal(result.label, label, JSON.stringify(parsed));
    assert.equal(result.stopsFollowup, true);
    assert.equal(result.source, 'deterministic');
  }
});

test('classification ignores quoted outbound history and treats unknown intent as human review', () => {
  const body = 'Thanks for the note.\n\nOn Fri, Jul 17, UberBond wrote:\n> Please unsubscribe if this is not relevant.';
  assert.equal(visibleReplyText({ body }), 'Thanks for the note.');
  const result = classifyReplyDeterministic({ body });
  assert.equal(result.label, 'unknown-needs-review');
  assert.equal(result.humanReviewRequired, true);
  assert.equal(classifyReplyDeterministic({ autoSubmitted: 'auto-replied', body: 'Thank you.' }).label, 'automatic-reply');
});

test('optional AI only resolves unknown text at high confidence and cannot override a deterministic rule', async () => {
  let calls = 0;
  const high = await classifyReplyWithFallback({ body: 'Thanks for the note.' }, { provider: 'openai' }, async () => {
    calls += 1;
    return { label: 'interested', confidence: 0.91 };
  });
  assert.equal(high.label, 'interested');
  assert.equal(high.source, 'ai');

  const low = await classifyReplyWithFallback({ body: 'Thanks for the note.' }, { provider: 'openai' }, async () => ({ label: 'meeting-requested', confidence: 0.7 }));
  assert.equal(low.label, 'unknown-needs-review');

  const invalid = await classifyReplyWithFallback({ body: 'Thanks for the note.' }, { provider: 'openai' }, async () => ({ label: 'send-proposal', confidence: 0.99 }));
  assert.equal(invalid.label, 'unknown-needs-review');

  const unsubscribe = await classifyReplyWithFallback({ body: 'Unsubscribe me.' }, { provider: 'openai' }, async () => {
    calls += 1;
    return { label: 'interested', confidence: 1 };
  });
  assert.equal(unsubscribe.label, 'unsubscribe');
  assert.equal(calls, 1);
});

test('reply matching prioritizes exact Gmail thread and RFC identifiers before constrained exact sender fallback', () => {
  const prospects = [
    { id: 'threaded', status: 'sent', inbox: 'A', threadId: 'thread-1', contact: { email: 'owner@clinic.example' } },
    { id: 'referenced', status: 'sent', inbox: 'A', contact: { email: 'office@agency.example' } },
    { id: 'sender', status: 'sent', inbox: 'A', contact: { email: 'director@business.example' } }
  ];
  const messages = [{ id: 'message-1', prospectId: 'referenced', inbox: 'A', threadId: 'outbound-thread', rfcMessageId: '<outbound-1@example>' }];
  assert.deepEqual(matchReplyToProspect({ threadId: 'thread-1', from: 'someone@else.example' }, { prospects, messages, inbox: 'A' }).prospect, prospects[0]);
  assert.equal(matchReplyToProspect({ inReplyTo: '<outbound-1@example>' }, { prospects, messages, inbox: 'A' }).prospect.id, 'referenced');
  assert.equal(matchReplyToProspect({ from: 'Director <director@business.example>' }, { prospects, messages, inbox: 'A' }).prospect.id, 'sender');
  assert.equal(matchReplyToProspect({ from: 'attacker-director@business.example' }, { prospects, messages, inbox: 'A' }).prospect, null);
  assert.equal(matchReplyToProspect({ threadId: 'thread-1' }, { prospects, messages, inbox: 'B' }).prospect, null);
  assert.equal(extractMailbox('Director <DIRECTOR@business.example>'), 'director@business.example');
});

test('duplicate sender candidates remain ambiguous instead of being silently attached', () => {
  const prospects = [
    { id: 'one', status: 'sent', inbox: 'A', contact: { email: 'info@clinic.example' } },
    { id: 'two', status: 'sent', inbox: 'A', contact: { email: 'info@clinic.example' } }
  ];
  const result = matchReplyToProspect({ from: 'info@clinic.example' }, { prospects, inbox: 'A' });
  assert.equal(result.prospect, null);
  assert.equal(result.ambiguous, true);
  assert.equal(result.source, 'exact-sender-fallback-ambiguous');
});

test('response drafts are positive-only, owner-gated, and reject automated commercial negotiation', () => {
  const positive = responseDraftFor({ label: 'meeting-requested' }, { subject: 'Re: Availability\r\nBcc: attacker@example.com' });
  assert.equal(positive.status, 'needs-owner-approval');
  assert.equal(positive.sendEligible, false);
  assert.doesNotMatch(positive.subject, /\r|\n|Bcc:/);
  assert.equal(responseDraftFor({ label: 'price-objection' }, { subject: 'Price' }), null);

  assert.equal(validateResponseDraft({ subject: 'Re: Availability', body: 'Thanks. Which time zone should I use?' }).ok, true);
  for (const body of [
    'Here is a payment link: https://example.test/pay',
    'I can send a proposal for $500.',
    'This will guarantee results.',
    `${'word '.repeat(121)}`
  ]) assert.equal(validateResponseDraft({ subject: 'Re: Reply', body }).ok, false, body);
});

test('every reply patch clears follow-ups and terminal signals create durable suppression policy', () => {
  for (const label of REPLY_LABELS) {
    const patch = prospectReplyPatch(classifyReplyDeterministic(fixtures.find(item => item[0] === label)[1]), receivedAt);
    assert.equal(patch.nextFollowupAt, null, label);
    assert.equal(patch.replyLabel, label);
  }
  assert.deepEqual(suppressionPolicy('unsubscribe'), { suppressEmail: true, suppressDomain: true });
  assert.deepEqual(suppressionPolicy('bounce'), { suppressEmail: true, suppressDomain: true });
  assert.deepEqual(suppressionPolicy('complaint'), { suppressEmail: true, suppressDomain: true });
  assert.deepEqual(suppressionPolicy('not-interested'), { suppressEmail: true, suppressDomain: false });
  assert.deepEqual(suppressionPolicy('interested'), { suppressEmail: false, suppressDomain: false });
});

test('pipeline ingests replies idempotently, stops follow-ups, suppresses terminal signals, and creates owner tasks without sending', async () => {
  const store = await tempStore();
  await store.add('accounts', { id: 'account-a', slot: 'A', connected: true, tokens: 'sealed-test-value' });
  const prospects = [
    ['positive', 'thread-positive', 'positive@clinic.example'],
    ['unsubscribe', 'thread-unsubscribe', 'unsubscribe@clinic.example'],
    ['bounce', 'thread-bounce', 'bounce@clinic.example'],
    ['unknown', 'thread-unknown', 'unknown@clinic.example'],
    ['recover', 'thread-recover', 'recover@clinic.example']
  ].map(([id, threadId, email]) => ({
    id, campaignId: 'campaign-a', company: `${id} clinic`, website: `https://${id}.clinic.example`,
    domain: `${id}.clinic.example`, inbox: 'A', status: 'sent', threadId,
    contact: { email }, nextFollowupAt: '2026-07-20T08:00:00.000Z'
  }));
  for (const prospect of prospects) await store.add('prospects', prospect);
  await store.add('replies', {
    id: 'reply-recover', prospectId: 'recover', inbox: 'A', gmailId: 'gmail-recover', threadId: 'thread-recover',
    from: 'recover@clinic.example', subject: 'Re: Website', body: 'I am interested.',
    classification: classifyReplyDeterministic({ body: 'I am interested.' }),
    match: { source: 'gmail-thread', confidence: 1, ambiguous: false },
    responseDraft: responseDraftFor({ label: 'interested' }, { subject: 'Re: Website' }),
    processingStatus: 'stored', receivedAt, createdAt: receivedAt
  });
  await store.add('notifications', {
    id: 'note-recover', type: 'positive_reply', prospectId: 'recover', replyId: 'reply-recover',
    status: 'unread', title: 'recover clinic sent a positive reply', createdAt: receivedAt
  });

  const parsed = {
    'gmail-positive': { id: 'gmail-positive', threadId: 'thread-positive', from: 'positive@clinic.example', subject: 'Re: Website', body: 'I am interested.' },
    'gmail-unsubscribe': { id: 'gmail-unsubscribe', threadId: 'thread-unsubscribe', from: 'unsubscribe@clinic.example', subject: 'Re: Website', body: 'Please unsubscribe me.' },
    'gmail-bounce': { id: 'gmail-bounce', threadId: 'thread-bounce', from: 'MAILER-DAEMON@example.net', subject: 'Delivery Status Notification', body: '550 5.1.1 address not found' },
    'gmail-unknown': { id: 'gmail-unknown', threadId: 'thread-unknown', from: 'unknown@clinic.example', subject: 'Re: Website', body: 'Thanks for the note.' },
    'gmail-recover': { id: 'gmail-recover', threadId: 'thread-recover', from: 'recover@clinic.example', subject: 'Re: Website', body: 'I am interested.' },
    'gmail-unmatched': { id: 'gmail-unmatched', threadId: 'unmatched-thread', from: 'someone@unmatched.example', subject: 'Re: Unknown', body: 'Can you explain?' }
  };
  let sends = 0;
  const pipeline = new Pipeline(store, {
    outbound: { provider: 'gmail', hardBouncePauseThreshold: 1, complaintPauseThreshold: 1, failurePauseThreshold: 3 },
    ai: { provider: 'rules' }, google: {}, encryptionKey: '', crawl: {}
  }, {
    clock: () => new Date(receivedAt),
    listMessages: async () => ({ data: { messages: Object.keys(parsed).map(id => ({ id })) } }),
    getMessage: async (_cfg, _account, _key, id) => ({ data: parsed[id] }),
    parseGmailMessage: value => value,
    sendEmail: async () => { sends += 1; throw new Error('reply ingestion must never send'); }
  });

  assert.equal(await pipeline.pollReplies(), 6);
  assert.equal(await pipeline.pollReplies(), 0);
  assert.equal(sends, 0);
  assert.equal((await store.list('replies')).length, 6);

  const positiveReply = await store.findOne('replies', { gmailId: 'gmail-positive' });
  assert.equal(positiveReply.responseDraft.status, 'needs-owner-approval');
  assert.equal(positiveReply.responseDraft.sendEligible, false);
  const unmatchedReply = await store.findOne('replies', { gmailId: 'gmail-unmatched' });
  assert.equal(unmatchedReply.prospectId, null);
  assert.equal(unmatchedReply.match.source, 'unmatched');

  for (const id of ['positive', 'unsubscribe', 'bounce', 'unknown', 'recover']) {
    assert.equal((await store.get('prospects', id)).nextFollowupAt, null, id);
  }
  assert.equal((await store.get('prospects', 'positive')).acquisitionStatus, 'interested');
  assert.equal((await store.get('prospects', 'unknown')).needsReplyReview, true);
  assert.equal((await store.get('prospects', 'unsubscribe')).status, 'suppressed');
  assert.equal((await store.get('prospects', 'bounce')).status, 'bounce');
  assert.equal((await store.get('replies', 'reply-recover')).processingStatus, 'completed');

  const suppressions = (await store.list('suppressions')).map(item => item.value).sort();
  assert.deepEqual(suppressions, [
    'bounce.clinic.example', 'bounce@clinic.example',
    'unsubscribe.clinic.example', 'unsubscribe@clinic.example'
  ]);
  const notifications = await store.list('notifications');
  assert.equal(notifications.filter(item => item.type === 'positive_reply').length, 2);
  assert.equal(notifications.filter(item => item.type === 'reply_review').length, 2);
  assert.equal(JSON.stringify(notifications).includes('@'), false);
  const health = await store.findOne('senderHealth', { inbox: 'A' });
  assert.equal(health.paused, true);
  assert.equal(health.pauseReason, 'hard-bounce-threshold');
  const event = (await store.list('outboundEvents'))[0];
  assert.equal(event.recipientEmail, '');
  assert.match(event.recipientHash, /^[a-f0-9]{64}$/);
});
