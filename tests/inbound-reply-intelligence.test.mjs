import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { buildEncryptedImapAccount, parseRawEmail } from '../src/uberimap.mjs';
import { suppressionLookup } from '../src/send-safety.mjs';

// Synthetic fixtures only: every domain is example.invalid and no socket, provider or mailbox is ever opened.
// The IMAP read is replaced by a scripted hook that returns parsed messages in the same shape as the real reader.
const KEY = crypto.randomBytes(32).toString('hex');
const SENT = '<sent-1@uberbond.example.invalid>';
const dirs = [];

after(async () => {
  await Promise.all(dirs.map(dir => fs.rm(dir, { recursive: true, force: true })));
});

function rfc822({ from = 'Buyer <buyer@clinic.example.invalid>', subject = 'Re: quick question', messageId = '', inReplyTo = '', references = '', contentType = 'text/plain; charset=utf-8', body }) {
  const headers = [`From: ${from}`, 'To: sales@uberbond.example.invalid', `Subject: ${subject}`];
  if (messageId) headers.push(`Message-ID: <${messageId}>`);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);
  headers.push(`Content-Type: ${contentType}`);
  return `${headers.join('\r\n')}\r\n\r\n${body}\r\n`;
}

function dsnRaw() {
  return [
    'From: Mail Delivery Subsystem <MAILER-DAEMON@mail.example.invalid>',
    'To: sales@uberbond.example.invalid',
    'Subject: Delivery Status Notification (Failure)',
    'Message-ID: <dsn-1@mail.example.invalid>',
    `In-Reply-To: ${SENT}`,
    'Content-Type: multipart/report; report-type=delivery-status; boundary="rpt-1"',
    '',
    '--rpt-1',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Delivery to buyer@clinic.example.invalid failed: address not found.',
    '--rpt-1',
    'Content-Type: message/delivery-status',
    '',
    'Final-Recipient: rfc822; buyer@clinic.example.invalid',
    'Action: failed',
    'Status: 5.1.1',
    '--rpt-1--',
    ''
  ].join('\r\n');
}

// Fields the reader does not yet expose (listUnsubscribe, reportType, embeddedMessageIds) are supplied on the parsed object.
function parsedMessage(uid, raw, extra = {}) {
  return { uid, ...parseRawEmail(raw), ...extra };
}

// A step is a response object, an Error (thrown on every call that reaches it) or a function of the account. The last step repeats.
function scripted(steps) {
  const calls = [];
  const queue = [...steps];
  const hook = async ({ account }) => {
    calls.push({ slot: account.slot, tokens: account.tokens, lastImapUid: account.lastImapUid });
    const step = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof step === 'function') return step(account);
    if (step instanceof Error) throw step;
    return step;
  };
  return { hook, calls };
}

const success = (messages, { uidValidity = 1001, lastUid = 0 } = {}) => ({
  ok: true, status: 'UBERIMAP_FETCH_CONFIRMED', uidValidity, messages, lastUid
});

function imapAccount({ slot, email = `${slot.replace(/[^a-z0-9]/gi, '')}@uberbond.example.invalid`, lastImapUid = 0, lastImapUidValidity = 0, password = 'pw-one' }) {
  const built = buildEncryptedImapAccount({
    slot, email, host: 'imap.example.invalid', port: 993, secure: true, username: email, password,
    evidenceRef: 'test:reply-intelligence', authorized: true, termsCompatible: true
  }, KEY);
  assert.equal(built.ok, true);
  return { ...built.account, lastImapUid, ...(lastImapUidValidity ? { lastImapUidValidity } : {}) };
}

async function storeWith({ accounts = [], prospects = [], messages = [] } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-reply-intelligence-'));
  dirs.push(dir);
  const store = new Store(dir);
  await store.init();
  for (const account of accounts) await store.add('accounts', account);
  for (const prospect of prospects) await store.add('prospects', prospect);
  for (const message of messages) await store.add('messages', message);
  return store;
}

function pipelineFor(store, { imapPoll, outbound = {}, thresholds, retryDelays = [0, 0] } = {}) {
  const cfg = {
    encryptionKey: KEY,
    ai: { provider: 'rules' },
    outbound: thresholds || { hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 }
  };
  return new Pipeline(store, cfg, {
    imapPoll,
    // Any call here would be an automatic outbound send from the reply path. None is allowed.
    sendEmail: async () => {
      outbound.n = (outbound.n || 0) + 1;
      throw new Error('the reply path must never send mail');
    },
    imapRetryDelaysMs: retryDelays,
    imapSleep: async () => {}
  });
}

const prospect = {
  id: 'pros-1', company: 'Clinic', website: 'https://clinic.example.invalid', domain: 'clinic.example.invalid',
  contact: { email: 'buyer@clinic.example.invalid', source: 'website' }, status: 'sent'
};
const sentMessage = { id: 'msg-1', prospectId: 'pros-1', rfcMessageId: SENT, inbox: 'imap-slot-sent' };

const logsOf = async (store, type) => (await store.list('auditLog')).filter(row => row.type === type);
const escalationsOf = async store => (await store.list('auditLog')).filter(row => row.type === 'inbound_operator_escalation');
const healthOf = (store, inbox) => store.findOne('senderHealth', { inbox });

test('thread correlation matches a multi-ID In-Reply-To and a Message-ID stored without angle brackets', async () => {
  const bare = { id: 'msg-2', prospectId: 'pros-2', rfcMessageId: 'sent-2@uberbond.example.invalid', inbox: 'slot-bare' };
  const second = { id: 'pros-2', company: 'Second', contact: { email: 'second@clinic.example.invalid' }, status: 'sent' };
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-thread' })], prospects: [prospect, second], messages: [sentMessage, bare] });
  const raw = rfc822({
    from: 'Other <other@elsewhere.example.invalid>', messageId: 'thread-1@elsewhere.example.invalid',
    inReplyTo: '<other@elsewhere.example.invalid> <sent-2@uberbond.example.invalid>', body: 'Happy to talk next week.'
  });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]).hook }).pollReplies();
  const replies = await store.list('replies');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].prospectId, 'pros-2');
  assert.equal(replies[0].correlation, 'thread');
});

test('a human reply in a linked thread is escalated to the operator, never answered, and carries no body text', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-human' })], prospects: [prospect], messages: [sentMessage] });
  const outbound = {};
  const raw = rfc822({ messageId: 'human-1@clinic.example.invalid', inReplyTo: SENT, body: 'Thanks, I will look at this next week.' });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]).hook, outbound }).pollReplies();
  assert.equal(outbound.n, undefined, 'no outbound call was attempted');
  const [escalation] = await escalationsOf(store);
  assert.equal(escalation.detail.kind, 'human_response');
  assert.equal(escalation.detail.reasonCode, 'THREAD_LINKED_HUMAN_REPLY');
  assert.equal(escalation.detail.correlation, 'thread');
  assert.equal(JSON.stringify(escalation).includes('next week'), false);
  const [after] = await store.list('prospects');
  assert.equal(after.status, 'replied');
  assert.equal(after.nextFollowupAt, null, 'a human reply cancels the automatic follow-up');
});

test('an opt-out in a linked thread suppresses the address for every sender slot and raises an operator event', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-optout' })], prospects: [prospect], messages: [sentMessage] });
  const raw = rfc822({ messageId: 'optout-1@clinic.example.invalid', inReplyTo: SENT, body: 'Please stop sending me these.' });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]).hook }).pollReplies();
  const [reply] = await store.list('replies');
  assert.equal(reply.classification.label, 'optout');
  assert.equal(reply.classification.unsubscribeIntent, true);
  const suppressions = await store.list('suppressions');
  assert.deepEqual(suppressions.map(row => [row.value, row.reason, row.scope]), [['buyer@clinic.example.invalid', 'optout', 'all-slots']]);
  assert.equal((await suppressionLookup(store, { email: 'buyer@clinic.example.invalid' })).suppressed, true);
  const escalations = await escalationsOf(store);
  assert.deepEqual(escalations.map(row => row.detail.kind), ['unsubscribe']);
  assert.equal((await store.list('prospects'))[0].nextFollowupAt, null);
});

test('an Arabic opt-out with diacritics is recognised and suppresses the recipient', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-arabic' })], prospects: [prospect], messages: [sentMessage] });
  const body = 'إِ' + 'لغاء الاشتراك من فضلكم.';
  const raw = rfc822({ messageId: 'ar-1@clinic.example.invalid', inReplyTo: SENT, body });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]).hook }).pollReplies();
  assert.equal((await store.list('replies'))[0].classification.label, 'optout');
  assert.equal((await store.list('suppressions')).length, 1);
  assert.equal((await escalationsOf(store))[0].detail.kind, 'unsubscribe');
});

test('a List-Unsubscribe header counts only inside a linked thread; an unlinked sender is stored, not suppressed', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-list' })], prospects: [prospect], messages: [sentMessage] });
  const listUnsubscribe = '<mailto:stop@clinic.example.invalid>';
  const linked = parsedMessage(1, rfc822({ messageId: 'list-1@clinic.example.invalid', inReplyTo: SENT, body: 'Ok.' }), { listUnsubscribe });
  const stranger = parsedMessage(2, rfc822({ from: 'Stranger <stranger@elsewhere.example.invalid>', messageId: 'list-2@elsewhere.example.invalid', body: 'Ok.' }), { listUnsubscribe });
  await pipelineFor(store, { imapPoll: scripted([success([linked, stranger], { lastUid: 2 })]).hook }).pollReplies();
  assert.deepEqual((await store.list('suppressions')).map(row => row.value), ['buyer@clinic.example.invalid']);
  assert.equal((await store.list('unlinkedReplies')).length, 1, 'the unlinked message is kept');
  assert.deepEqual((await escalationsOf(store)).map(row => row.detail.kind), ['unsubscribe'], 'only the linked opt-out is escalated');
});

test('an ARF feedback report that names an outbound thread is a complaint: suppression and a sender hold below the threshold', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-fbl' })], prospects: [prospect], messages: [sentMessage] });
  const raw = rfc822({
    from: 'Feedback Loop <staff@feedback.example.invalid>', messageId: 'fbl-1@feedback.example.invalid', inReplyTo: SENT,
    contentType: 'multipart/report; report-type=feedback-report; boundary="fbl"',
    body: 'This is an email abuse report for a message you sent.'
  });
  const thresholds = { complaintPauseThreshold: 5, hardBouncePauseThreshold: 2, failurePauseThreshold: 3 };
  await pipelineFor(store, {
    imapPoll: scripted([success([parsedMessage(1, raw, { reportType: 'feedback-report' })], { lastUid: 1 })]).hook, thresholds
  }).pollReplies();
  assert.equal((await store.list('replies'))[0].classification.label, 'complaint');
  assert.equal((await store.list('prospects'))[0].status, 'complaint');
  assert.deepEqual((await store.list('suppressions')).map(row => [row.value, row.reason, row.scope]), [['buyer@clinic.example.invalid', 'complaint', 'all-slots']]);
  const health = await healthOf(store, 'imap-slot-sent');
  assert.equal(health.complaintsToday, 1);
  assert.equal(health.paused, true);
  assert.equal(health.pauseReason, 'inbound-complaint-hold');
  assert.deepEqual((await escalationsOf(store)).map(row => [row.detail.kind, row.detail.reasonCode]), [['complaint', 'MACHINE_FEEDBACK_REPORT']]);
});

test('an ARF feedback report that embeds the original Message-ID is linked through that evidence', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-embed' })], prospects: [prospect], messages: [sentMessage] });
  const raw = rfc822({
    from: 'Feedback Loop <staff@feedback.example.invalid>', messageId: 'fbl-2@feedback.example.invalid',
    contentType: 'multipart/report; report-type=feedback-report; boundary="fbl"', body: 'Abuse report.'
  });
  await pipelineFor(store, {
    imapPoll: scripted([success([parsedMessage(1, raw, { reportType: 'feedback-report', embeddedMessageIds: [SENT] })], { lastUid: 1 })]).hook
  }).pollReplies();
  assert.equal((await store.list('replies'))[0].classification.label, 'complaint');
  assert.equal((await store.list('suppressions')).length, 1);
});

test('an unmatched ARF feedback report goes to the operator and is never suppressed automatically', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-orphan' })], prospects: [prospect], messages: [sentMessage] });
  const raw = rfc822({
    from: 'Feedback Loop <staff@feedback.example.invalid>', messageId: 'fbl-3@feedback.example.invalid',
    contentType: 'multipart/report; report-type=feedback-report; boundary="fbl"', body: 'Abuse report.'
  });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw, { reportType: 'feedback-report' })], { lastUid: 1 })]).hook }).pollReplies();
  assert.equal((await store.list('suppressions')).length, 0);
  assert.equal(await healthOf(store, 'imap-slot-sent'), null);
  assert.deepEqual((await escalationsOf(store)).map(row => [row.detail.kind, row.detail.reasonCode]), [['complaint', 'UNLINKED_FEEDBACK_REPORT']]);
});

test('a replayed hard bounce is counted once, never twice', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-replay-bounce' })], prospects: [prospect], messages: [sentMessage] });
  const message = parsedMessage(1, dsnRaw());
  const { hook } = scripted([success([message], { lastUid: 1 }), success([message], { lastUid: 1 })]);
  const pipeline = pipelineFor(store, { imapPoll: hook });
  await pipeline.pollReplies();
  const [reply] = await store.list('replies');
  // The earlier run stopped after recording the event but before its completion marker.
  await store.patch('replies', reply.id, { sideEffectsDone: false });
  const account = (await store.list('accounts'))[0];
  await store.patch('accounts', account.id, { lastImapUid: 0 });
  await pipeline.pollReplies();
  assert.equal((await store.list('replies')).length, 1);
  assert.equal((await healthOf(store, 'imap-slot-sent')).hardBouncesToday, 1);
  assert.equal((await store.list('outboundEvents')).length, 1);
  assert.equal((await store.list('suppressions')).length, 1);
  assert.equal((await store.list('replies'))[0].sideEffectsDone, true);
});

test('a replayed complaint is counted once and keeps the sender hold', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-replay-fbl' })], prospects: [prospect], messages: [sentMessage] });
  const raw = rfc822({
    from: 'Feedback Loop <staff@feedback.example.invalid>', messageId: 'fbl-r@feedback.example.invalid', inReplyTo: SENT,
    contentType: 'multipart/report; report-type=feedback-report; boundary="fbl"', body: 'Abuse report.'
  });
  const message = parsedMessage(1, raw, { reportType: 'feedback-report' });
  const pipeline = pipelineFor(store, { imapPoll: scripted([success([message], { lastUid: 1 })]).hook, thresholds: { complaintPauseThreshold: 9 } });
  await pipeline.pollReplies();
  const [reply] = await store.list('replies');
  await store.patch('replies', reply.id, { sideEffectsDone: false });
  await store.patch('accounts', (await store.list('accounts'))[0].id, { lastImapUid: 0 });
  await pipeline.pollReplies();
  const health = await healthOf(store, 'imap-slot-sent');
  assert.equal(health.complaintsToday, 1);
  assert.equal(health.paused, true);
  assert.equal((await store.list('suppressions')).length, 1);
});

test('stored bodies are bounded previews: 4000 characters for a linked reply, 500 for an unlinked preview, and no full body field', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-bounds' })], prospects: [prospect], messages: [sentMessage] });
  const linked = parsedMessage(1, rfc822({ messageId: 'long-1@clinic.example.invalid', inReplyTo: SENT, body: 'Interested. '.repeat(900) }));
  const stranger = parsedMessage(2, rfc822({ from: 'Stranger <stranger@elsewhere.example.invalid>', messageId: 'long-2@elsewhere.example.invalid', body: 'z'.repeat(9000) }));
  await pipelineFor(store, { imapPoll: scripted([success([linked, stranger], { lastUid: 2 })]).hook }).pollReplies();
  const [reply] = await store.list('replies');
  assert.equal(reply.body.length, 4000);
  const [unlinked] = await store.list('unlinkedReplies');
  assert.equal(unlinked.bodyPreview.length, 500);
  assert.equal(Object.hasOwn(unlinked, 'body'), false);
  assert.equal(Object.hasOwn(unlinked, 'raw'), false);
});

test('repeated authentication failures quarantine the mailbox, and a quarantined mailbox is not polled', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-auth' })] });
  const authFailure = () => new Error('imap-command-rejected:UB0001 NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)');
  const { hook, calls } = scripted([() => { throw authFailure(); }]);
  const pipeline = pipelineFor(store, { imapPoll: hook });
  for (let i = 0; i < 3; i += 1) await pipeline.pollReplies();
  assert.equal(calls.length, 3);
  const account = (await store.list('accounts'))[0];
  assert.equal(account.imapQuarantine.reasonCode, 'IMAP_AUTH_REPEATED');
  await pipeline.pollReplies();
  assert.equal(calls.length, 3, 'the quarantined slot is not polled again');
  assert.equal((await logsOf(store, 'imap_mailbox_quarantined')).length, 1);
  assert.equal(JSON.stringify(await store.list('auditLog')).includes('Invalid credentials'), false, 'server text is never logged');
});

test('rotating the credential releases the quarantine and keeps the checkpoint', async () => {
  const account = imapAccount({ slot: 'imap-slot-rotate', lastImapUid: 7 });
  const store = await storeWith({ accounts: [account] });
  const authFailure = () => { throw new Error('imap-command-rejected:UB0001 NO [AUTHENTICATIONFAILED] Invalid credentials'); };
  const { hook, calls } = scripted([authFailure, authFailure, authFailure, success([], { lastUid: 7 })]);
  const pipeline = pipelineFor(store, { imapPoll: hook });
  for (let i = 0; i < 3; i += 1) await pipeline.pollReplies();
  assert.ok((await store.get('accounts', account.id)).imapQuarantine);
  const rotated = imapAccount({ slot: 'imap-slot-rotate', lastImapUid: 7, password: 'pw-two' });
  await store.patch('accounts', account.id, { tokens: rotated.tokens });
  await pipeline.pollReplies();
  assert.equal(calls.length, 4);
  assert.notDeepEqual(calls[3].tokens, calls[0].tokens, 'the poll used the rotated credential');
  const after = await store.get('accounts', account.id);
  assert.equal(after.imapQuarantine, null);
  assert.equal(after.lastImapUid, 7, 'the checkpoint survives the rotation');
  assert.equal((await logsOf(store, 'imap_credential_rotated')).length, 1);
});

test('a rotated credential starts a fresh failure count instead of inheriting the old one', async () => {
  const account = imapAccount({ slot: 'imap-slot-fresh' });
  const store = await storeWith({ accounts: [account] });
  const authFailure = () => { throw new Error('imap-command-rejected:UB0001 NO [AUTHENTICATIONFAILED] Invalid credentials'); };
  const pipeline = pipelineFor(store, { imapPoll: scripted([authFailure]).hook });
  await pipeline.pollReplies();
  await pipeline.pollReplies();
  assert.equal((await store.get('accounts', account.id)).imapAuthFailures, 2);
  await store.patch('accounts', account.id, { tokens: imapAccount({ slot: 'imap-slot-fresh', password: 'pw-three' }).tokens });
  await pipeline.pollReplies();
  const after = await store.get('accounts', account.id);
  assert.equal(after.imapAuthFailures, 1);
  assert.equal(after.imapQuarantine ?? null, null);
});

test('transient errors are retried a fixed number of times, then the mailbox waits out a backoff window', async () => {
  const account = imapAccount({ slot: 'imap-slot-transient' });
  const store = await storeWith({ accounts: [account] });
  const transient = () => { throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }); };
  const { hook, calls } = scripted([transient]);
  const pipeline = pipelineFor(store, { imapPoll: hook });
  await pipeline.pollReplies();
  assert.equal(calls.length, 3, 'one attempt plus two bounded retries');
  const waiting = await store.get('accounts', account.id);
  assert.equal(waiting.imapTransientFailures, 1);
  assert.ok(Date.parse(waiting.imapNextAttemptAt) > Date.now(), 'the next attempt is pushed into the future');
  await pipeline.pollReplies();
  assert.equal(calls.length, 3, 'no poll is attempted inside the backoff window');
  await store.patch('accounts', account.id, { imapNextAttemptAt: '2000-01-01T00:00:00.000Z' });
  await pipeline.pollReplies();
  assert.equal(calls.length, 6);
  assert.equal((await logsOf(store, 'imap_reply_poll_error')).length, 2);
  assert.equal((await logsOf(store, 'imap_reply_poll_error'))[0].detail.errorClass, 'ECONNRESET');
});

test('a transient outage that clears on retry records the batch and advances the checkpoint', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-recover' })] });
  const transient = () => { throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }); };
  const stranger = parsedMessage(1, rfc822({ from: 'Stranger <stranger@elsewhere.example.invalid>', messageId: 'rec-1@elsewhere.example.invalid', body: 'hello' }));
  const { hook, calls } = scripted([transient, success([stranger], { lastUid: 1 })]);
  await pipelineFor(store, { imapPoll: hook }).pollReplies();
  assert.equal(calls.length, 2);
  assert.equal((await store.list('unlinkedReplies')).length, 1);
  assert.equal((await store.list('accounts'))[0].lastImapUid, 1);
  assert.equal((await logsOf(store, 'imap_reply_poll_error')).length, 0);
});

test('a failed read leaves the checkpoint where it was and is logged by fixed reason code only', async () => {
  const account = imapAccount({ slot: 'imap-slot-read-fail', lastImapUid: 5 });
  const store = await storeWith({ accounts: [account] });
  const { hook, calls } = scripted([() => { throw new Error('imap-command-rejected:UB0002 NO mailbox busy'); }]);
  await pipelineFor(store, { imapPoll: hook }).pollReplies();
  assert.equal(calls.length, 1, 'a non-transient failure is not retried');
  assert.equal((await store.list('accounts'))[0].lastImapUid, 5);
  const [entry] = await logsOf(store, 'imap_reply_poll_error');
  assert.equal(entry.detail.reasonCode, 'IMAP_OTHER');
  assert.equal(JSON.stringify(entry).includes('mailbox busy'), false);
});

test('a message without a Message-ID is recorded once across a UIDVALIDITY reset', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-digest' })] });
  const noId = parsedMessage(1, rfc822({ from: 'Stranger <stranger@elsewhere.example.invalid>', body: 'Where is the sheet?' }));
  const { hook } = scripted([
    success([noId], { uidValidity: 1001, lastUid: 1 }),
    { ok: true, status: 'UBERIMAP_UIDVALIDITY_CHANGED', uidValidity: 2002, messages: [], lastUid: 0 },
    success([noId], { uidValidity: 2002, lastUid: 1 })
  ]);
  const pipeline = pipelineFor(store, { imapPoll: hook });
  await pipeline.pollReplies();
  await pipeline.pollReplies();
  await pipeline.pollReplies();
  const unlinked = await store.list('unlinkedReplies');
  assert.equal(unlinked.length, 1);
  assert.match(unlinked[0].externalId, /^imapmsg:[0-9a-f]{32}$/);
});

test('a warm reply whose quoted original footer says unsubscribe is not an opt-out and does not suppress', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-quote' })], prospects: [prospect], messages: [sentMessage] });
  const body = [
    'Interested, please send the details.',
    '',
    '-----Original Message-----',
    'From: Sales <sales@uberbond.example.invalid>',
    'To: buyer@clinic.example.invalid',
    '',
    'To unsubscribe from these emails, click here.'
  ].join('\n');
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, rfc822({ messageId: 'quote-1@clinic.example.invalid', inReplyTo: SENT, body }))], { lastUid: 1 })]).hook }).pollReplies();
  const [reply] = await store.list('replies');
  assert.equal(reply.classification.label, 'positive');
  assert.equal(reply.classification.unsubscribeIntent, undefined);
  assert.equal((await store.list('suppressions')).length, 0);
  assert.deepEqual((await escalationsOf(store)).map(row => row.detail.kind), ['human_response']);
});
