import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Store, createStore } from '../src/store.mjs';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { buildEncryptedImapAccount, parseRawEmail, createUberImapReader, pollImapForwardingAccount } from '../src/uberimap.mjs';
import { detectUnsubscribeIntent } from '../src/inbound-classify.mjs';
import { suppressionLookup } from '../src/send-safety.mjs';

// Hostile review fixes for the inbound reply path. Synthetic fixtures only: every domain is example.invalid, no socket
// reaches a real host, and the IMAP read is either a scripted hook or an in-memory fake server behind the real reader.
const KEY = crypto.randomBytes(32).toString('hex');
const SENT = '<sent-1@uberbond.example.invalid>';
const SENT_TWO = '<sent-2@uberbond.example.invalid>';
const SENDER = 'sales@uberbond.example.invalid';
const BUYER = 'buyer@clinic.example.invalid';
const dirs = [];

after(async () => {
  await Promise.all(dirs.map(dir => fs.rm(dir, { recursive: true, force: true })));
});

function rfc822({ from = `Buyer <${BUYER}>`, to = SENDER, subject = 'Re: quick question', messageId = '', inReplyTo = '', references = '', contentType = 'text/plain; charset=utf-8', transferEncoding = '', body }) {
  const headers = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`];
  if (messageId) headers.push(`Message-ID: <${messageId}>`);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);
  headers.push(`Content-Type: ${contentType}`);
  if (transferEncoding) headers.push(`Content-Transfer-Encoding: ${transferEncoding}`);
  return `${headers.join('\r\n')}\r\n\r\n${body}\r\n`;
}

// An ARF feedback report. The machine-readable part carries Original-Mail-From only when the caller supplies it.
function feedbackReportRaw({ inReplyTo = SENT, originalMailFrom = null, boundary = 'fbl' } = {}) {
  return [
    'From: Feedback Loop <staff@feedback.example.invalid>',
    `To: ${SENDER}`,
    'Subject: FW: Email abuse report',
    'Message-ID: <fbl-review@feedback.example.invalid>',
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    `Content-Type: multipart/report; report-type=feedback-report; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=us-ascii',
    '',
    'This is an email abuse report for a message you sent.',
    `--${boundary}`,
    'Content-Type: message/feedback-report',
    '',
    'Feedback-Type: abuse',
    'User-Agent: FBL/1.0',
    'Version: 1',
    ...(originalMailFrom ? [`Original-Mail-From: <${originalMailFrom}>`] : []),
    `Original-Rcpt-To: <${BUYER}>`,
    '',
    `--${boundary}--`,
    ''
  ].join('\r\n');
}

// A delivery status notice. The notice names its original through a top-level References header.
function dsnRaw({ from = 'Mail Delivery <MAILER-DAEMON@mail.example.invalid>', references = '', inReplyTo = '', finalRecipient = BUYER, action = 'failed', status = '5.1.1' } = {}) {
  return [
    `From: ${from}`,
    `To: ${SENDER}`,
    'Subject: Delivery Status Notification (Failure)',
    'Message-ID: <dsn-review@mail.example.invalid>',
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references ? [`References: ${references}`] : []),
    'Content-Type: multipart/report; report-type=delivery-status; boundary="rpt-r"',
    '',
    '--rpt-r',
    'Content-Type: text/plain; charset=utf-8',
    '',
    `Delivery to ${BUYER} failed: address not found.`,
    '--rpt-r',
    'Content-Type: message/delivery-status',
    '',
    ...(finalRecipient ? [`Final-Recipient: rfc822; ${finalRecipient}`] : []),
    ...(action ? [`Action: ${action}`] : []),
    ...(status ? [`Status: ${status}`] : []),
    '--rpt-r--',
    ''
  ].join('\r\n');
}

// Fields the reader does not yet expose are supplied on the parsed object, as the reader does for the rest of the shape.
function parsedMessage(uid, raw, extra = {}) {
  return { uid, ...parseRawEmail(raw), ...extra };
}

function scripted(steps) {
  const queue = [...steps];
  return async () => {
    const step = queue.length > 1 ? queue.shift() : queue[0];
    if (step instanceof Error) throw step;
    return step;
  };
}

const success = (messages, { uidValidity = 1001, lastUid = 0 } = {}) => ({
  ok: true, status: 'UBERIMAP_FETCH_CONFIRMED', uidValidity, messages, lastUid
});

function imapAccount({ slot, email = `${slot.replace(/[^a-z0-9]/gi, '')}@uberbond.example.invalid`, lastImapUid = 0 }) {
  const built = buildEncryptedImapAccount({
    slot, email, host: 'imap.example.invalid', port: 993, secure: true, username: email, password: 'pw-review',
    evidenceRef: 'test:inbound-review', authorized: true, termsCompatible: true
  }, KEY);
  assert.equal(built.ok, true);
  return { ...built.account, lastImapUid };
}

// The sending mailbox for an outbound slot. Its provider is not polled by the reply path, so no Gmail call can occur.
const sendingAccount = (slot = 'imap-slot-sent', email = SENDER) => ({
  id: `acct-${slot}`, slot, email, provider: 'smtp-relay', connected: true
});

async function storeWith({ accounts = [], prospects = [], messages = [] } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-inbound-review-'));
  dirs.push(dir);
  const store = new Store(dir);
  await store.init();
  for (const account of accounts) await store.add('accounts', account);
  for (const row of prospects) await store.add('prospects', row);
  for (const message of messages) await store.add('messages', message);
  return store;
}

function pipelineFor(store, { imapPoll, outbound = {}, thresholds } = {}) {
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
    imapRetryDelaysMs: [0, 0],
    imapSleep: async () => {}
  });
}

const prospect = {
  id: 'pros-1', company: 'Clinic', website: 'https://clinic.example.invalid', domain: 'clinic.example.invalid',
  contact: { email: BUYER, source: 'website' }, status: 'sent', inbox: 'imap-slot-sent'
};
const secondProspect = {
  id: 'pros-2', company: 'Second Clinic', website: 'https://second.example.invalid', domain: 'second.example.invalid',
  contact: { email: 'second@second.example.invalid', source: 'website' }, status: 'sent', inbox: 'imap-slot-sent'
};
const sentMessage = { id: 'msg-1', prospectId: 'pros-1', to: BUYER, rfcMessageId: SENT, inbox: 'imap-slot-sent' };
const sentMessageTwo = { id: 'msg-2', prospectId: 'pros-2', to: 'second@second.example.invalid', rfcMessageId: SENT_TWO, inbox: 'imap-slot-sent' };

const logsOf = async (store, type) => (await store.list('auditLog')).filter(row => row.type === type);
const escalationsOf = async store => logsOf(store, 'inbound_operator_escalation');
const healthOf = (store, inbox) => store.findOne('senderHealth', { inbox });

// ---------- F-02: a feedback report counts only when its linked message is verified ----------

test('F-02: the ARF Original-Mail-From is read from the feedback-report part', () => {
  const parsed = parseRawEmail(feedbackReportRaw({ originalMailFrom: SENDER }));
  assert.equal(parsed.originalMailFrom, SENDER);
  assert.equal(parseRawEmail(feedbackReportRaw({})).originalMailFrom, '');
});

test('F-02: a forged feedback report that only names an outbound Message-ID is not a complaint and holds nothing', async () => {
  const store = await storeWith({
    accounts: [imapAccount({ slot: 'imap-slot-f2a' }), sendingAccount()], prospects: [prospect], messages: [sentMessage]
  });
  await pipelineFor(store, {
    imapPoll: scripted([success([parsedMessage(1, feedbackReportRaw({ inReplyTo: SENT }), { reportType: 'feedback-report' })], { lastUid: 1 })])
  }).pollReplies();
  assert.equal((await store.list('replies')).length, 0, 'the unverified report is not a classified reply');
  assert.equal((await store.list('suppressions')).length, 0, 'no address is suppressed by an unverified report');
  assert.equal(await healthOf(store, 'imap-slot-sent'), null, 'the sending slot is not charged or held');
  assert.equal((await store.list('prospects'))[0].status, 'sent');
  const [unlinked] = await store.list('unlinkedReplies');
  assert.equal(unlinked.reasonCode, 'UNVERIFIED_FEEDBACK_REPORT');
  assert.deepEqual((await escalationsOf(store)).map(row => [row.detail.kind, row.detail.reasonCode]), [['complaint', 'UNLINKED_FEEDBACK_REPORT']]);
});

test('F-02: a feedback report whose Original-Mail-From names another sender is not charged to the slot', async () => {
  const store = await storeWith({
    accounts: [imapAccount({ slot: 'imap-slot-f2b' }), sendingAccount()], prospects: [prospect], messages: [sentMessage]
  });
  await pipelineFor(store, {
    imapPoll: scripted([success([parsedMessage(1, feedbackReportRaw({ inReplyTo: SENT, originalMailFrom: 'other@elsewhere.example.invalid' }), { reportType: 'feedback-report' })], { lastUid: 1 })])
  }).pollReplies();
  assert.equal(await healthOf(store, 'imap-slot-sent'), null);
  assert.equal((await store.list('suppressions')).length, 0);
  assert.equal((await store.list('unlinkedReplies'))[0].reasonCode, 'UNVERIFIED_FEEDBACK_REPORT');
});

test('F-02 control: a feedback report whose Original-Mail-From matches the linked sending address is a verified complaint', async () => {
  const store = await storeWith({
    accounts: [imapAccount({ slot: 'imap-slot-f2c' }), sendingAccount()], prospects: [prospect], messages: [sentMessage]
  });
  const thresholds = { complaintPauseThreshold: 5, hardBouncePauseThreshold: 2, failurePauseThreshold: 3 };
  await pipelineFor(store, {
    imapPoll: scripted([success([parsedMessage(1, feedbackReportRaw({ inReplyTo: SENT, originalMailFrom: SENDER }), { reportType: 'feedback-report' })], { lastUid: 1 })]),
    thresholds
  }).pollReplies();
  assert.equal((await store.list('replies'))[0].classification.label, 'complaint');
  const health = await healthOf(store, 'imap-slot-sent');
  assert.equal(health.complaintsToday, 1);
  assert.equal(health.paused, true);
  assert.equal(health.pauseReason, 'inbound-complaint-hold');
  assert.deepEqual((await escalationsOf(store)).map(row => [row.detail.kind, row.detail.reasonCode]), [['complaint', 'MACHINE_FEEDBACK_REPORT']]);
});

// ---------- F-03: a delivery notice is recognised by the classifier rule, not by the local part alone ----------

test('F-03: a forged mailer-daemon at another domain that sends a non-delivery multipart/report is not a hard bounce', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-f3a' }), sendingAccount()], prospects: [prospect], messages: [sentMessage] });
  const raw = [
    'From: MAILER-DAEMON@evil.example.net', `To: ${SENDER}`, 'Subject: Read receipt', `In-Reply-To: ${SENT}`,
    'Content-Type: multipart/report; report-type=disposition-notification; boundary="mdn"', '',
    '--mdn', 'Content-Type: text/plain; charset=us-ascii', '', 'The message was displayed.', '--mdn--', ''
  ].join('\r\n');
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]) }).pollReplies();
  const health = await healthOf(store, 'imap-slot-sent');
  assert.ok(!health || !health.hardBouncesToday, 'the forged notice does not increment hardBouncesToday');
  assert.equal((await store.list('outboundEvents')).filter(row => row.eventType === 'hard_bounce').length, 0);
  assert.equal((await store.list('suppressions')).length, 0);
  assert.notEqual((await store.list('prospects'))[0].status, 'bounce');
});

test('F-03 hardening: a plain mailer-daemon without structured recipient proof cannot charge a bounce', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-f3b' }), sendingAccount()], prospects: [prospect], messages: [sentMessage] });
  const raw = [
    'From: MAILER-DAEMON@uberbond.example.invalid', `To: ${SENDER}`, 'Subject: Undelivered Mail Returned to Sender', `In-Reply-To: ${SENT}`,
    'Content-Type: text/plain; charset=us-ascii', '', 'Delivery to the recipient failed permanently.', ''
  ].join('\r\n');
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]) }).pollReplies();
  assert.equal((await store.list('replies')).length, 0);
  assert.equal(await healthOf(store, 'imap-slot-sent'), null);
  assert.equal((await store.list('outboundEvents')).length, 0);
  assert.equal((await store.list('prospects'))[0].status, 'sent');
  assert.equal((await store.list('unlinkedReplies'))[0].reasonCode, 'UNVERIFIED_DELIVERY_RECIPIENT_OR_STATUS');
});

// ---------- F-05: quoted-printable bodies are decoded as UTF-8 bytes, using the declared charset ----------

// Byte-level quoted-printable: every byte outside printable ASCII is escaped, so UTF-8 sequences survive intact.
function qpEncode(buffer) {
  let out = '';
  for (const byte of buffer) {
    out += byte === 61 || byte < 32 || byte > 126 ? `=${byte.toString(16).toUpperCase().padStart(2, '0')}` : String.fromCharCode(byte);
  }
  return out;
}

test('F-05: a QP-encoded UTF-8 Arabic opt-out has the same intent as the base64 encoding of the same phrase', async () => {
  const phrase = 'الغاء اشتراكي من فضلكم.';
  const bytes = Buffer.from(phrase, 'utf8');
  const qp = parseRawEmail(rfc822({
    messageId: 'qp-ar-1@clinic.example.invalid', inReplyTo: SENT, contentType: 'text/plain; charset=UTF-8',
    transferEncoding: 'quoted-printable', body: qpEncode(bytes)
  }));
  const b64 = parseRawEmail(rfc822({
    messageId: 'b64-ar-1@clinic.example.invalid', inReplyTo: SENT, contentType: 'text/plain; charset=UTF-8',
    transferEncoding: 'base64', body: bytes.toString('base64')
  }));
  assert.equal(qp.body, phrase, 'the QP body decodes to the UTF-8 text, not Latin-1 bytes');
  assert.equal(qp.body, b64.body);
  const qpIntent = detectUnsubscribeIntent({ body: qp.body });
  assert.equal(qpIntent.intent, true);
  assert.deepEqual(qpIntent, detectUnsubscribeIntent({ body: b64.body }));
});

test('F-05: a QP-encoded Arabic opt-out in a linked thread is recorded as an opt-out and suppresses the recipient', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-f5' }), sendingAccount()], prospects: [prospect], messages: [sentMessage] });
  const raw = rfc822({
    messageId: 'qp-ar-2@clinic.example.invalid', inReplyTo: SENT, contentType: 'text/plain; charset=UTF-8',
    transferEncoding: 'quoted-printable', body: qpEncode(Buffer.from('الغاء اشتراكي من فضلكم.', 'utf8'))
  });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]) }).pollReplies();
  assert.equal((await store.list('replies'))[0].classification.label, 'optout');
  assert.equal((await suppressionLookup(store, { email: BUYER })).suppressed, true);
});

// ---------- F-08: an ambiguous delivery notice is attributed to nobody ----------

test('F-08: a notice that names two distinct stored outbound messages is recorded unlinked and charges neither prospect', async () => {
  const store = await storeWith({
    accounts: [imapAccount({ slot: 'imap-slot-f8' }), sendingAccount()], prospects: [prospect, secondProspect], messages: [sentMessage, sentMessageTwo]
  });
  const raw = dsnRaw({ references: `${SENT} ${SENT_TWO}` });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]) }).pollReplies();
  assert.equal(await healthOf(store, 'imap-slot-sent'), null, 'no sender health is charged for an ambiguous notice');
  assert.equal((await store.list('outboundEvents')).length, 0);
  assert.deepEqual((await store.list('prospects')).map(row => row.status), ['sent', 'sent']);
  assert.equal((await store.list('replies')).length, 0);
  const [unlinked] = await store.list('unlinkedReplies');
  assert.equal(unlinked.reasonCode, 'AMBIGUOUS_OUTBOUND_MATCH');
});

test('F-08 control: a notice that names exactly one stored outbound message is linked and counted once', async () => {
  const store = await storeWith({
    accounts: [imapAccount({ slot: 'imap-slot-f8b' }), sendingAccount()], prospects: [prospect, secondProspect], messages: [sentMessage, sentMessageTwo]
  });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, dsnRaw({ references: SENT }))], { lastUid: 1 })]) }).pollReplies();
  assert.equal((await store.list('replies'))[0].prospectId, 'pros-1');
  assert.equal((await healthOf(store, 'imap-slot-sent')).hardBouncesToday, 1);
});


test('H09 security: machine-readable Final-Recipient, Action and Status are parsed from the DSN part', () => {
  const parsed = parseRawEmail(dsnRaw({ references: SENT }));
  assert.deepEqual(parsed.deliveryFinalRecipients, [BUYER]);
  assert.deepEqual(parsed.deliveryActions, ['failed']);
  assert.deepEqual(parsed.deliveryStatuses, ['5.1.1']);
  const fakeBody = [
    'From: MAILER-DAEMON@mail.example.invalid', 'To: sales@uberbond.example.invalid',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="x"', '',
    '--x', 'Content-Type: text/plain', '',
    `Final-Recipient: rfc822; ${BUYER}`, 'Action: failed', 'Status: 5.1.1', '--x--'
  ].join('\r\n');
  assert.deepEqual(parseRawEmail(fakeBody).deliveryFinalRecipients, [], 'human-readable text is not DSN machine evidence');
});

test('H09 security: a forged DSN referencing the sent Message-ID but naming a different recipient is review-only', async () => {
  const store = await storeWith({
    accounts: [imapAccount({ slot: 'imap-slot-h09-forged' }), sendingAccount()],
    prospects: [prospect], messages: [sentMessage]
  });
  await pipelineFor(store, {
    imapPoll: scripted([success([
      parsedMessage(1, dsnRaw({ references: SENT, finalRecipient: 'wrong@other.example.invalid' }))
    ], { lastUid: 1 })])
  }).pollReplies();
  assert.equal((await store.list('replies')).length, 0);
  assert.equal((await store.list('suppressions')).length, 0);
  assert.equal((await store.list('outboundEvents')).length, 0);
  assert.equal(await healthOf(store, 'imap-slot-sent'), null);
  assert.equal((await store.list('prospects'))[0].status, 'sent');
  assert.equal((await store.list('unlinkedReplies'))[0].reasonCode, 'UNVERIFIED_DELIVERY_RECIPIENT_OR_STATUS');
});

test('H09 security: missing Final-Recipient, transient 4.x and delayed notice never trigger a hard bounce', async () => {
  const changes = [
    {finalRecipient: null},
    {action: 'delayed',status: '4.2.2'},
    {action: 'failed',status: '4.2.2'},
    {action: 'delivered',status: '2.0.0'}
  ];
  for (const [index, override] of changes.entries()) {
    const store = await storeWith({
      accounts: [imapAccount({ slot: 'imap-slot-h09-negative-' + index }), sendingAccount()],
      prospects: [prospect], messages: [sentMessage]
    });
    await pipelineFor(store, { imapPoll: scripted([success([
      parsedMessage(1, dsnRaw({ references: SENT, ...override }))
    ], { lastUid: 1 })]) }).pollReplies();
    assert.equal((await store.list('replies')).length, 0, 'unverified report cannot create reply on case ' + index);
    assert.equal(await healthOf(store, 'imap-slot-sent'), null, 'unverified report cannot charge sender on case ' + index);
    assert.equal((await store.list('suppressions')).length, 0);
    assert.equal((await store.list('prospects'))[0].status, 'sent');
  }
});

// H09: repeated *identical* machine fields must not be silently collapsed by Set.
// Multiple recipient-record fields cannot authorize a sender hard-bounce health charge.
test('H09 security: duplicate identical DSN fields or recipient blocks remain review-only', async () => {
  const scenarios = [
    [`Final-Recipient: rfc822; ${BUYER}`],
    ['Action: failed'],
    ['Status: 5.1.1'],
    [`Final-Recipient: rfc822; ${BUYER}`, 'Action: failed', 'Status: 5.1.1']
  ];
  for (const [index, lines] of scenarios.entries()) {
    const store = await storeWith({
      accounts: [imapAccount({ slot: 'imap-slot-h09-duplicated-' + index }), sendingAccount()],
      prospects: [prospect], messages: [sentMessage]
    });
    const raw = dsnRaw({ references: SENT }).replace('--rpt-r--', `${lines.join('\r\n')}\r\n--rpt-r--`);
    const parsed = parsedMessage(1, raw);
    const fieldSizes = [parsed.deliveryFinalRecipients.length, parsed.deliveryActions.length, parsed.deliveryStatuses.length];
    assert.equal(fieldSizes.filter(n => n === 2).length, lines.length, 'must preserve duplicate field occurrences');
    await pipelineFor(store, { imapPoll: scripted([success([parsed], { lastUid: 1 })]) }).pollReplies();
    assert.equal((await store.list('replies')).length, 0, 'cannot produce trusted reply ' + index);
    assert.equal((await store.list('suppressions')).length, 0, 'cannot suppress buyer ' + index);
    assert.equal((await store.list('outboundEvents')).length, 0, 'cannot emit bounce ' + index);
    assert.equal(await healthOf(store, 'imap-slot-sent'), null, 'cannot charge sending health ' + index);
    assert.equal((await store.list('prospects'))[0].status, 'sent');
    assert.equal((await store.list('unlinkedReplies'))[0].reasonCode, 'UNVERIFIED_DELIVERY_RECIPIENT_OR_STATUS');
  }
});

// ---------- F-09: a MIME-quarantined reply is stored for review with no automatic label ----------

test('F-09: a quarantined reply in a linked thread is stored with a review flag, labelled for manual review, and never suppressed', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-f9' }), sendingAccount()], prospects: [prospect], messages: [sentMessage] });
  const raw = rfc822({ messageId: 'big-1@clinic.example.invalid', inReplyTo: SENT, body: 'x'.repeat(270000) });
  const parsed = parsedMessage(1, raw);
  assert.equal(parsed.mimeQuarantine, 'MIME_BODY_TOO_LARGE', 'the fixture really exceeds the body cap');
  await pipelineFor(store, { imapPoll: scripted([success([parsed], { lastUid: 1 })]) }).pollReplies();
  const [reply] = await store.list('replies');
  assert.equal(reply.reviewFlag, 'MIME_QUARANTINED');
  assert.equal(reply.classification.label, 'manual_review');
  assert.equal((await store.list('suppressions')).length, 0);
  assert.deepEqual((await escalationsOf(store)).map(row => row.detail.kind), ['human_response']);
});

test('F-09: a quarantined message from an unlinked sender is kept with a review flag and no preview of the withheld body', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-f9b' }), sendingAccount()], prospects: [prospect], messages: [sentMessage] });
  const raw = rfc822({ from: 'Stranger <stranger@elsewhere.example.invalid>', messageId: 'big-2@elsewhere.example.invalid', body: 'z'.repeat(270000) });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]) }).pollReplies();
  const [unlinked] = await store.list('unlinkedReplies');
  assert.equal(unlinked.reviewFlag, 'MIME_QUARANTINED');
  assert.equal(unlinked.bodyPreview, '');
  assert.equal((await store.list('suppressions')).length, 0);
});

// ---------- F-10: a thread-linked opt-out suppresses the sending address as well as the prospect contact ----------

test('F-10: a thread-linked opt-out from a different address suppresses both the prospect contact and the sending address', async () => {
  const store = await storeWith({ accounts: [imapAccount({ slot: 'imap-slot-f10' }), sendingAccount()], prospects: [prospect], messages: [sentMessage] });
  const assistant = 'front-desk@clinic.example.invalid';
  const raw = rfc822({ from: `Front Desk <${assistant}>`, messageId: 'assist-1@clinic.example.invalid', inReplyTo: SENT, body: 'Please stop sending me these.' });
  await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, raw)], { lastUid: 1 })]) }).pollReplies();
  const suppressions = (await store.list('suppressions')).map(row => [row.value, row.reason, row.scope]).sort();
  assert.deepEqual(suppressions, [[assistant, 'optout', 'all-slots'], [BUYER, 'optout', 'all-slots']].sort());
  assert.equal((await suppressionLookup(store, { email: assistant })).suppressed, true);
});

// ---------- F-07: a UIDVALIDITY change keeps the poll boundary, so earlier unpolled mail is still searched ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const imapSinceDate = ms => {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
};
const dayStart = ms => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

// A minimal IMAP server behind the real reader. It honours SINCE on internal dates, so a boundary that moved too far
// forward genuinely hides an older message, as a real mailbox would.
function fakeImapServer({ uidValidity, messages }) {
  const searches = [];
  const respond = (command, tag) => {
    if (command.startsWith('LOGIN')) return `${tag} OK LOGIN completed\r\n`;
    if (command === 'SELECT INBOX') return `* ${messages.length} EXISTS\r\n* OK [UIDVALIDITY ${uidValidity}] ok\r\n${tag} OK SELECT completed\r\n`;
    const since = command.match(/^UID SEARCH SINCE (\d{2})-([A-Za-z]{3})-(\d{4})$/);
    if (since) {
      const sinceDay = Date.UTC(Number(since[3]), MONTHS.indexOf(since[2]), Number(since[1]));
      searches.push(command);
      const uids = messages.filter(row => dayStart(row.date) >= sinceDay).map(row => row.uid);
      return `* SEARCH${uids.length ? ` ${uids.join(' ')}` : ''}\r\n${tag} OK SEARCH completed\r\n`;
    }
    const fetch = command.match(/^UID FETCH (\d+) \(BODY\.PEEK\[\]\)$/);
    if (fetch) {
      const row = messages.find(item => item.uid === Number(fetch[1]));
      if (!row) return `${tag} NO no such message\r\n`;
      return `* 1 FETCH (UID ${row.uid} BODY[] {${Buffer.byteLength(row.raw, 'utf8')}}\r\n${row.raw})\r\n${tag} OK FETCH completed\r\n`;
    }
    if (command === 'LOGOUT') return `* BYE bye\r\n${tag} OK LOGOUT completed\r\n`;
    return `${tag} BAD unexpected\r\n`;
  };
  const connectFactory = async () => {
    const socket = new EventEmitter();
    socket.write = chunk => {
      const line = String(chunk).replace(/\r\n$/, '');
      const space = line.indexOf(' ');
      const tag = line.slice(0, space);
      const reply = respond(line.slice(space + 1), tag);
      setImmediate(() => socket.emit('data', Buffer.from(reply, 'latin1')));
    };
    socket.end = () => {};
    socket.destroy = () => {};
    return socket;
  };
  return { connectFactory, searches };
}

test('F-07: after a UIDVALIDITY change, an opt-out received before the change is still found on the next poll', async () => {
  const seededPoll = Date.now() - 2 * 86400000;
  const optOut = rfc822({ messageId: 'pre-change-optout@clinic.example.invalid', inReplyTo: SENT, body: 'Please unsubscribe me from this list.' });
  const server = fakeImapServer({ uidValidity: 2002, messages: [{ uid: 1, date: seededPoll + 3600000, raw: optOut }] });
  const account = { ...imapAccount({ slot: 'imap-slot-f7' }), lastReplyPoll: seededPoll, lastImapUidValidity: 1001 };
  const store = await storeWith({ accounts: [account, sendingAccount()], prospects: [prospect], messages: [sentMessage] });
  const pipeline = pipelineFor(store, {
    imapPoll: ({ account: live, encryptionKey, limit }) => pollImapForwardingAccount({
      account: live, encryptionKey, limit,
      readerFactory: options => createUberImapReader({ ...options, connectFactory: server.connectFactory })
    })
  });
  await pipeline.pollReplies();
  const afterChange = (await store.findOne('accounts', { id: account.id }));
  assert.equal(afterChange.lastImapUidValidity, 2002, 'the new validity is recorded');
  assert.equal(afterChange.lastReplyPoll, seededPoll, 'the poll boundary is not advanced past unseen mail');
  await pipeline.pollReplies();
  assert.equal(server.searches.length, 1);
  assert.equal(server.searches[0], `UID SEARCH SINCE ${imapSinceDate(seededPoll)}`, 'the re-scan starts at the earlier boundary');
  assert.equal((await store.list('replies')).length, 1, 'the pre-change opt-out is recorded');
  assert.deepEqual((await store.list('suppressions')).map(row => [row.value, row.reason]), [[BUYER, 'optout']]);
});

// ---------- Real PostgreSQL: the suppression and unlinked rows these fixes write ----------

test('Postgres: a thread-linked opt-out suppresses both addresses, and an ambiguous notice leaves no health charge', async () => {
  await withDisposablePostgres(async url => {
    const store = createStore({ storeBackend: 'postgres', databaseUrl: url, databaseSsl: false });
    await store.init();
    try {
      for (const account of [imapAccount({ slot: 'imap-slot-pg' }), sendingAccount()]) await store.add('accounts', account);
      for (const row of [prospect, secondProspect]) await store.add('prospects', row);
      for (const message of [sentMessage, sentMessageTwo]) await store.add('messages', message);
      const assistant = 'front-desk@clinic.example.invalid';
      const optOut = rfc822({ from: `Front Desk <${assistant}>`, messageId: 'pg-assist-1@clinic.example.invalid', inReplyTo: SENT, body: 'Please stop sending me these.' });
      await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(1, optOut)], { lastUid: 1 })]) }).pollReplies();
      const suppressed = (await store.list('suppressions')).map(row => row.value).sort();
      assert.deepEqual(suppressed, [assistant, BUYER].sort());
      const ambiguous = dsnRaw({ references: `${SENT} ${SENT_TWO}` });
      await pipelineFor(store, { imapPoll: scripted([success([parsedMessage(2, ambiguous)], { lastUid: 2 })]) }).pollReplies();
      assert.equal(await healthOf(store, 'imap-slot-sent'), null);
      assert.deepEqual((await store.list('unlinkedReplies')).map(row => row.reasonCode), ['AMBIGUOUS_OUTBOUND_MATCH']);
      assert.deepEqual((await store.list('prospects')).map(row => row.status).sort(), ['replied', 'sent']);
    } finally {
      await store.close?.();
    }
  });
});

// ---------- F-12 (semantic canonicalizer order) lives in tests/semantic-reuse-canonical-order.test.mjs ----------

// ---------- Parser shape: the new review fields are present, bounded and derived from the message only ----------

test('parser: an ARF feedback report exposes its machine-readable original sender without trusting the header block', () => {
  const parsed = parseRawEmail(feedbackReportRaw({ originalMailFrom: 'SALES@uberbond.example.invalid' }));
  assert.equal(parsed.reportType, 'feedback-report');
  assert.equal(parsed.originalMailFrom, 'sales@uberbond.example.invalid');
  assert.equal(parsed.from, 'Feedback Loop <staff@feedback.example.invalid>');
});
