import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Store, StoreError } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { buildEncryptedImapAccount, createUberImapReader, parseRawEmail, pollImapForwardingAccount } from '../src/uberimap.mjs';

const KEY = crypto.randomBytes(32).toString('hex');
const HOST_A = 'imap-a.reply-radar.test';
const HOST_B = 'imap-b.reply-radar.test';
const SENT_ID = '<sent-1@uberbond.test>';
const dirs = [];

after(async () => {
  await Promise.all(dirs.map(dir => fs.rm(dir, { recursive: true, force: true })));
});

// Scripted IMAP server behind connectFactory. The mailbox object is read on every
// command, so a test can change UIDVALIDITY or the message list between polls.
function scriptedImap(mailboxes) {
  const sessions = [];
  const connectFactory = async ({ host }) => {
    const mailbox = mailboxes[host];
    if (!mailbox) throw Object.assign(new Error('no route to test host'), { code: 'EHOSTUNREACH' });
    if (mailbox.refuse) throw Object.assign(new Error('connect refused by test server'), { code: 'ECONNREFUSED' });
    const socket = new EventEmitter();
    socket.commands = [];
    socket.write = line => {
      const text = String(line);
      socket.commands.push(text);
      const tag = text.match(/^(UB\d{4}) /)?.[1] || 'UB0000';
      const reply = respond(text.slice(tag.length + 1).trim(), tag, mailbox);
      queueMicrotask(() => socket.emit('data', Buffer.from(reply, 'latin1')));
    };
    socket.end = () => {};
    socket.destroy = () => {};
    sessions.push(socket);
    return socket;
  };
  return { connectFactory, sessions };
}

function respond(command, tag, mailbox) {
  const upper = command.toUpperCase();
  const uids = mailbox.messages.map(message => message.uid);
  if (upper.startsWith('LOGIN ')) return `${tag} OK LOGIN completed\r\n`;
  if (upper === 'SELECT INBOX') {
    const validity = mailbox.uidValidity ? `* OK [UIDVALIDITY ${mailbox.uidValidity}] UIDs valid\r\n` : '';
    return `* ${uids.length} EXISTS\r\n${validity}${tag} OK [READ-WRITE] SELECT completed\r\n`;
  }
  const range = upper.match(/^UID SEARCH UID (\d+):\*$/);
  if (range) {
    const start = Number(range[1]);
    let hits = uids.filter(uid => uid >= start);
    // RFC 3501: n:* with n above the largest UID still matches the largest message.
    if (!hits.length && uids.length) hits = [Math.max(...uids)];
    return `* SEARCH ${hits.join(' ')}\r\n${tag} OK SEARCH completed\r\n`;
  }
  if (upper.startsWith('UID SEARCH SINCE ')) return `* SEARCH ${uids.join(' ')}\r\n${tag} OK SEARCH completed\r\n`;
  const fetch = upper.match(/^UID FETCH (\d+) /);
  if (fetch) {
    const message = mailbox.messages.find(item => item.uid === Number(fetch[1]));
    if (!message) return `${tag} OK FETCH completed\r\n`;
    return `* 1 FETCH (UID ${message.uid} BODY[] {${Buffer.byteLength(message.raw)}}\r\n${message.raw}\r\n)\r\n${tag} OK FETCH completed\r\n`;
  }
  if (upper === 'LOGOUT') return `* BYE\r\n${tag} OK LOGOUT completed\r\n`;
  return `${tag} BAD unexpected test command\r\n`;
}

function mailboxWith(messages, uidValidity = 1001) {
  return { uidValidity, messages };
}

function rfc822({ from = 'Buyer <buyer@clinic.test>', subject = 'Re: quick question', messageId, inReplyTo = '', body }) {
  const headers = [`From: ${from}`, 'To: sales@uberbond.test', `Subject: ${subject}`, `Message-ID: <${messageId}>`];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  headers.push('Content-Type: text/plain; charset=utf-8');
  return `${headers.join('\r\n')}\r\n\r\n${body}\r\n`;
}

function dsnRaw({ from = 'Mail Delivery Subsystem <MAILER-DAEMON@googlemail.test>' } = {}) {
  return [
    `From: ${from}`,
    'To: sales@uberbond.test',
    'Subject: Delivery Status Notification (Failure)',
    'Message-ID: <dsn-1@googlemail.test>',
    `In-Reply-To: ${SENT_ID}`,
    'Content-Type: multipart/report; report-type=delivery-status; boundary="rpt-1"',
    '',
    '--rpt-1',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Delivery to buyer@clinic.test failed: address not found.',
    '--rpt-1',
    'Content-Type: message/delivery-status',
    '',
    'Final-Recipient: rfc822; buyer@clinic.test',
    'Action: failed',
    'Status: 5.1.1',
    '--rpt-1--',
    ''
  ].join('\r\n');
}

function imapAccount({ slot, host, email, lastImapUid = 0, lastImapUidValidity = 0 }) {
  const built = buildEncryptedImapAccount({
    slot, email, host, port: 993, secure: true,
    username: 'reply-radar-test', password: crypto.randomBytes(16).toString('hex'),
    evidenceRef: 'test:reply-radar', authorized: true, termsCompatible: true
  }, KEY);
  assert.equal(built.ok, true);
  return { ...built.account, lastImapUid, ...(lastImapUidValidity ? { lastImapUidValidity } : {}) };
}

async function storeWith({ accounts = [], prospects = [], messages = [] } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-reply-radar-'));
  dirs.push(dir);
  const store = new Store(dir);
  await store.init();
  for (const account of accounts) await store.add('accounts', account);
  for (const prospect of prospects) await store.add('prospects', prospect);
  for (const message of messages) await store.add('messages', message);
  return store;
}

// A collection the JSON store has not created yet throws on list; treat it as empty.
async function rowsOf(store, key) {
  try { return await store.list(key); } catch { return []; }
}

async function logsOf(store, type) {
  return (await rowsOf(store, 'auditLog')).filter(entry => entry.type === type);
}

async function accountBySlot(store, slot) {
  return (await store.list('accounts')).find(account => account.slot === slot);
}

const cfg = {
  encryptionKey: KEY,
  ai: { provider: 'rules' },
  outbound: { hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 }
};

function pipelineFor(store, connectFactory) {
  return new Pipeline(store, cfg, {
    imapPoll: ({ account, encryptionKey, limit }) => pollImapForwardingAccount({
      account, encryptionKey, limit,
      readerFactory: options => createUberImapReader({ ...options, connectFactory, timeoutMs: 2000 })
    })
  });
}

function readerFor(connectFactory) {
  return createUberImapReader({
    host: HOST_A, port: 993, secure: true, username: 'reply-radar-test', password: 'reply-radar-test',
    authorized: true, termsCompatible: true, evidenceRef: 'test:reply-radar', connectFactory, timeoutMs: 2000
  });
}

const prospect = {
  id: 'pros-1', company: 'Clinic', website: 'https://clinic.test', domain: 'clinic.test',
  contact: { email: 'buyer@clinic.test', source: 'website' }, status: 'sent'
};
const sentMessage = { id: 'msg-1', prospectId: 'pros-1', rfcMessageId: SENT_ID, inbox: 'imap-slot-sent' };

const humanReply = (messageId, body) => rfc822({ messageId, inReplyTo: SENT_ID, body });

test('parseRawEmail reports the top-level media type, lower-cased or empty', () => {
  assert.equal(parseRawEmail(dsnRaw()).contentType, 'multipart/report');
  assert.equal(parseRawEmail(humanReply('plain-1@clinic.test', 'Hello.')).contentType, 'text/plain');
  assert.equal(parseRawEmail('From: someone@example.test\r\n\r\nno content type header').contentType, '');
});

test('ascending pagination takes the oldest unseen UIDs and skips none', async () => {
  const messages = [1, 2, 3, 4, 5, 6, 7].map(uid => ({ uid, raw: rfc822({ messageId: `m${uid}@elsewhere.test`, body: `body ${uid}` }) }));
  const fake = scriptedImap({ [HOST_A]: mailboxWith(messages) });
  const reader = readerFor(fake.connectFactory);
  let after = 0;
  const batches = [];
  const cursors = [];
  const more = [];
  for (let i = 0; i < 4; i += 1) {
    const page = await reader.fetchRecent({ afterUid: after, limit: 2, expectedUidValidity: 1001 });
    assert.equal(page.ok, true);
    batches.push(page.messages.map(message => message.uid));
    cursors.push(page.lastUid);
    more.push(page.hasMore);
    after = page.lastUid;
  }
  assert.deepEqual(batches, [[1, 2], [3, 4], [5, 6], [7]]);
  assert.deepEqual(cursors, [2, 4, 6, 7]);
  assert.deepEqual(more, [true, true, true, false]);
});

test('a poll with nothing newer than the cursor re-ingests nothing', async () => {
  const fake = scriptedImap({ [HOST_A]: mailboxWith([{ uid: 7, raw: rfc822({ messageId: 'old@elsewhere.test', body: 'old' }) }]) });
  const page = await readerFor(fake.connectFactory).fetchRecent({ afterUid: 7, limit: 100, expectedUidValidity: 1001 });
  assert.equal(page.ok, true);
  assert.deepEqual(page.messages, []);
  assert.equal(page.lastUid, 7);
  assert.equal(fake.sessions[0].commands.some(command => /UID FETCH/i.test(command)), false);
});

test('a changed UIDVALIDITY fetches nothing and reports the new validity', async () => {
  const fake = scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: rfc822({ messageId: 'a@elsewhere.test', body: 'a' }) }], 2002) });
  const page = await readerFor(fake.connectFactory).fetchRecent({ afterUid: 5, limit: 100, expectedUidValidity: 1001 });
  assert.equal(page.ok, true);
  assert.equal(page.status, 'UBERIMAP_UIDVALIDITY_CHANGED');
  assert.equal(page.uidValidity, 2002);
  assert.deepEqual(page.messages, []);
  assert.equal(page.lastUid, 0);
  assert.equal(fake.sessions[0].commands.some(command => /UID (FETCH|SEARCH)/i.test(command)), false);
});

test('a mailbox that stops reporting UIDVALIDITY fails closed when one is expected', async () => {
  const fake = scriptedImap({ [HOST_A]: { uidValidity: 0, messages: [{ uid: 1, raw: rfc822({ messageId: 'n@elsewhere.test', body: 'n' }) }] } });
  const page = await readerFor(fake.connectFactory).fetchRecent({ afterUid: 0, limit: 100, expectedUidValidity: 1001 });
  assert.equal(page.ok, false);
  assert.equal(page.status, 'UBERIMAP_UIDVALIDITY_UNAVAILABLE');
  assert.deepEqual(page.messages, []);
  assert.equal(fake.sessions[0].commands.some(command => /UID FETCH/i.test(command)), false);
});

test('one account whose connection fails does not stop the other, and keeps its own cursor', async () => {
  const refusing = imapAccount({ slot: 'imap-slot-refused', host: HOST_A, email: 'refused@uberbond.test', lastImapUid: 3 });
  const healthy = imapAccount({ slot: 'imap-slot-healthy', host: HOST_B, email: 'healthy@uberbond.test' });
  const store = await storeWith({ accounts: [refusing, healthy] });
  const fake = scriptedImap({
    [HOST_A]: { refuse: true, uidValidity: 1001, messages: [] },
    [HOST_B]: mailboxWith([{ uid: 1, raw: rfc822({ from: 'stranger@elsewhere.test', messageId: 'x1@elsewhere.test', body: 'hello there' }) }])
  });
  await pipelineFor(store, fake.connectFactory).pollReplies();
  const unlinked = await rowsOf(store, 'unlinkedReplies');
  assert.deepEqual(unlinked.map(row => row.id), ['unlinked:mid:<x1@elsewhere.test>']);
  assert.equal((await accountBySlot(store, 'imap-slot-refused')).lastImapUid, 3);
  assert.equal((await accountBySlot(store, 'imap-slot-healthy')).lastImapUid, 1);
  const errors = await logsOf(store, 'imap_reply_poll_error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].detail.accountId, refusing.id);
  assert.equal(errors[0].detail.errorClass, 'ECONNREFUSED');
  assert.equal(JSON.stringify(errors[0].detail).includes('refused by test server'), false);
});

test('a write failure mid-batch keeps the cursor at the last recorded UID', async () => {
  const account = imapAccount({ slot: 'imap-slot-batch', host: HOST_A, email: 'batch@uberbond.test' });
  const store = await storeWith({ accounts: [account] });
  const storeAdd = store.add.bind(store);
  store.add = (key, item) => (key === 'unlinkedReplies' && item.externalId === 'mid:<b2@elsewhere.test>'
    ? Promise.reject(new Error('simulated write failure'))
    : storeAdd(key, item));
  const messages = [1, 2, 3].map(uid => ({ uid, raw: rfc822({ from: `s${uid}@elsewhere.test`, messageId: `b${uid}@elsewhere.test`, body: `note ${uid}` }) }));
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith(messages) }).connectFactory).pollReplies();
  const recorded = (await rowsOf(store, 'unlinkedReplies')).map(row => row.externalId);
  assert.deepEqual(recorded, ['mid:<b1@elsewhere.test>']);
  assert.equal((await accountBySlot(store, 'imap-slot-batch')).lastImapUid, 1);
  const errors = await logsOf(store, 'imap_reply_poll_error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].detail.errorClass, 'ERROR');
});

test('re-polling the same UID records exactly one reply', async () => {
  const account = imapAccount({ slot: 'imap-slot-dup', host: HOST_A, email: 'dup@uberbond.test' });
  const store = await storeWith({ accounts: [account], prospects: [prospect], messages: [sentMessage] });
  const pipeline = pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: humanReply('dup-1@clinic.test', 'Thanks, I will look at this.') }]) }).connectFactory);
  await pipeline.pollReplies();
  // Simulate a cursor that was never persisted: the same UID is read again.
  await store.patch('accounts', account.id, { lastImapUid: 0 });
  await pipeline.pollReplies();
  const replies = await store.list('replies');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].prospectId, 'pros-1');
  assert.equal(replies[0].gmailId, 'mid:<dup-1@clinic.test>');
});

test('an unlinked reply is stored in unlinkedReplies and the cursor moves past it', async () => {
  const account = imapAccount({ slot: 'imap-slot-unlinked', host: HOST_A, email: 'unlinked@uberbond.test' });
  const store = await storeWith({ accounts: [account], prospects: [prospect], messages: [sentMessage] });
  const stranger = rfc822({ from: 'Stranger <stranger@elsewhere.test>', messageId: 'u4@elsewhere.test', body: 'Who are you?' });
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 4, raw: stranger }]) }).connectFactory).pollReplies();
  const unlinked = await store.list('unlinkedReplies');
  assert.equal(unlinked.length, 1);
  assert.equal(unlinked[0].id, 'unlinked:mid:<u4@elsewhere.test>');
  assert.equal(unlinked[0].fromEmail, 'stranger@elsewhere.test');
  assert.equal((await accountBySlot(store, 'imap-slot-unlinked')).lastImapUid, 4);
  assert.equal((await rowsOf(store, 'replies')).length, 0);
});

test('when the store refuses the unlinkedReplies collection, nothing is dropped: the cursor holds and the failure is logged by class only', async () => {
  const account = imapAccount({ slot: 'imap-slot-refused', host: HOST_A, email: 'refused@uberbond.test' });
  const store = await storeWith({ accounts: [account] });
  const storeAdd = store.add.bind(store);
  store.add = (key, item) => (key === 'unlinkedReplies'
    ? Promise.reject(new StoreError('Unknown collection: unlinkedReplies', 'INVALID_COLLECTION'))
    : storeAdd(key, item));
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: rfc822({ from: 'stranger@elsewhere.test', messageId: 'f1@elsewhere.test', body: 'hi' }) }]) }).connectFactory).pollReplies();
  assert.equal((await logsOf(store, 'imap_unlinked_reply')).length, 0, 'no audit-log fallback write');
  assert.equal((await accountBySlot(store, 'imap-slot-refused')).lastImapUid ?? 0, 0, 'the cursor does not advance past an unrecorded message');
  const errors = await logsOf(store, 'imap_reply_poll_error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].detail.errorClass, 'INVALID_COLLECTION');
  assert.equal(JSON.stringify(errors[0]).includes('Unknown collection'), false, 'the message text is never logged');
});

test('a UIDVALIDITY change records nothing, resets the cursor, and keys the next poll by the new validity', async () => {
  const account = imapAccount({ slot: 'imap-slot-validity', host: HOST_A, email: 'validity@uberbond.test', lastImapUid: 5, lastImapUidValidity: 1001 });
  const store = await storeWith({ accounts: [account] });
  const mailbox = mailboxWith([
    { uid: 1, raw: rfc822({ from: 'one@elsewhere.test', messageId: 'v1@elsewhere.test', body: 'one' }) },
    { uid: 2, raw: rfc822({ from: 'two@elsewhere.test', messageId: 'v2@elsewhere.test', body: 'two' }) }
  ], 2002);
  const fake = scriptedImap({ [HOST_A]: mailbox });
  const pipeline = pipelineFor(store, fake.connectFactory);

  await pipeline.pollReplies();
  assert.equal((await rowsOf(store, 'unlinkedReplies')).length, 0);
  assert.equal((await rowsOf(store, 'replies')).length, 0);
  assert.equal(fake.sessions[0].commands.some(command => /UID FETCH/i.test(command)), false);
  let stored = await accountBySlot(store, 'imap-slot-validity');
  assert.equal(stored.lastImapUid, 0);
  assert.equal(stored.lastImapUidValidity, 2002);
  assert.equal((await logsOf(store, 'imap_uidvalidity_changed')).length, 1);

  await pipeline.pollReplies();
  const ids = (await rowsOf(store, 'unlinkedReplies')).map(row => row.id).sort();
  assert.deepEqual(ids, ['unlinked:mid:<v1@elsewhere.test>', 'unlinked:mid:<v2@elsewhere.test>']);
  stored = await accountBySlot(store, 'imap-slot-validity');
  assert.equal(stored.lastImapUid, 2);
  assert.equal(stored.lastImapUidValidity, 2002);
});

test('a human reply that quotes "address not found" is an ordinary reply with no suppression or pause', async () => {
  const account = imapAccount({ slot: 'imap-slot-human', host: HOST_A, email: 'human@uberbond.test' });
  const store = await storeWith({ accounts: [account], prospects: [prospect], messages: [sentMessage] });
  const quoting = humanReply('human-q@clinic.test', 'You wrote address not found in your note. I am checking on my side and will reply later.');
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: quoting }]) }).connectFactory).pollReplies();
  const replies = await store.list('replies');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].prospectId, 'pros-1');
  assert.notEqual(replies[0].classification.label, 'bounce');
  assert.equal((await rowsOf(store, 'suppressions')).length, 0);
  assert.equal((await rowsOf(store, 'outboundEvents')).length, 0);
  assert.equal((await rowsOf(store, 'senderHealth')).some(item => item.paused === true), false);
  assert.equal((await store.list('prospects'))[0].status, 'replied');
});

test('a genuine mailer-daemon DSN with the same text is a bounce with suppression and a hard_bounce event', async () => {
  const account = imapAccount({ slot: 'imap-slot-dsn', host: HOST_A, email: 'dsn@uberbond.test' });
  const store = await storeWith({ accounts: [account], prospects: [prospect], messages: [sentMessage] });
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: dsnRaw() }]) }).connectFactory).pollReplies();
  const replies = await store.list('replies');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].classification.label, 'bounce');
  assert.equal((await store.list('prospects'))[0].status, 'bounce');
  const suppressions = await store.list('suppressions');
  assert.equal(suppressions.length, 1);
  assert.equal(suppressions[0].value, 'buyer@clinic.test');
  assert.equal(suppressions[0].reason, 'bounce');
  const events = await store.list('outboundEvents');
  assert.deepEqual(events.map(event => event.eventType), ['hard_bounce']);
  // The hard bounce is charged to the mailbox that sent the original message, never to the IMAP mailbox that received the notice.
  assert.equal(events[0].inbox, 'imap-slot-sent');
});

test('a multipart/report notice from a sender that is not mailer-daemon or postmaster is not a delivery notice', async () => {
  const account = imapAccount({ slot: 'imap-slot-report', host: HOST_A, email: 'report@uberbond.test' });
  const store = await storeWith({ accounts: [account], prospects: [prospect], messages: [sentMessage] });
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: dsnRaw({ from: 'Relay Service <bounces@relay.reply-radar.test>' }) }]) }).connectFactory).pollReplies();
  assert.equal((await store.list('replies'))[0].classification.label, 'manual_review');
  assert.equal((await store.list('outboundEvents')).length, 0, 'no hard bounce is charged');
  assert.equal((await store.list('suppressions')).length, 0, 'no suppression is written');
});

test('a human reply that quotes "spam complaint" records no complaint event and no sender pause', async () => {
  const account = imapAccount({ slot: 'imap-slot-complaint', host: HOST_A, email: 'complaint@uberbond.test' });
  const store = await storeWith({ accounts: [account], prospects: [prospect], messages: [sentMessage] });
  const quoting = humanReply('human-c@clinic.test', 'Someone forwarded a spam complaint template to me. Not a complaint from me.');
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: quoting }]) }).connectFactory).pollReplies();
  assert.equal((await store.list('replies')).length, 1);
  assert.notEqual((await store.list('replies'))[0].classification.label, 'complaint');
  assert.equal((await rowsOf(store, 'outboundEvents')).length, 0);
  assert.equal((await rowsOf(store, 'senderHealth')).some(item => item.paused === true), false);
  assert.equal((await rowsOf(store, 'suppressions')).length, 0);
});

// Regression tests for defects reproduced in the adversarial review of this branch.

test('a reply recorded before a crash has its opt-out side effects finished by the next poll', async () => {
  const account = imapAccount({ slot: 'imap-slot-replay', host: HOST_A, email: 'replay@uberbond.test' });
  const store = await storeWith({ accounts: [account], prospects: [prospect], messages: [sentMessage] });
  // The row an earlier run wrote before its side effects. Its completion marker was never set.
  await store.add('replies', {
    id: 'reply-replay-1', prospectId: 'pros-1', gmailId: 'mid:<replay-1@clinic.test>', threadId: '',
    from: 'Buyer', subject: 'Re', body: 'Unsubscribe me please.', classification: { label: 'optout', confidence: 0.9 },
    sideEffectsDone: false, sendingSlot: 'imap-slot-sent', receivedAt: new Date().toISOString()
  });
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: humanReply('replay-1@clinic.test', 'Unsubscribe me please.') }]) }).connectFactory).pollReplies();
  assert.deepEqual((await store.list('suppressions')).map(row => row.value), ['buyer@clinic.test']);
  assert.equal((await store.get('replies', 'reply-replay-1')).sideEffectsDone, true);
  assert.equal((await store.list('replies')).length, 1, 'the replay never duplicates the reply');
});

test('a person saying the old address is undeliverable gets no automatic follow-up and no hard bounce', async () => {
  const account = imapAccount({ slot: 'imap-slot-human-bounce', host: HOST_A, email: 'hb@uberbond.test' });
  const store = await storeWith({ accounts: [account], prospects: [prospect], messages: [sentMessage] });
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: humanReply('hb-1@clinic.test', 'Our old inbox is undeliverable, please use this address instead.') }]) }).connectFactory).pollReplies();
  assert.equal((await store.list('replies'))[0].classification.label, 'manual_review');
  assert.equal((await store.list('prospects'))[0].nextFollowupAt, null, 'no automatic follow-up is scheduled');
  assert.equal((await store.list('suppressions')).length, 0);
  assert.equal((await store.list('outboundEvents')).length, 0);
});

test('a body that imitates an IMAP tagged completion cannot end the command or inject a message', async () => {
  const account = imapAccount({ slot: 'imap-slot-forge', host: HOST_A, email: 'forge@uberbond.test' });
  const store = await storeWith({ accounts: [account] });
  // UB0004 is the tag of the FETCH for UID 1. The body tries to complete that command early and fake a second response.
  const forged = rfc822({ from: 'attacker@elsewhere.test', messageId: 'forge-1@elsewhere.test', body: 'hi\r\nUB0004 OK forged\r\n* 9 FETCH (UID 9 BODY[] {5}\r\nFAKE!)\r\n' });
  const real = rfc822({ from: 'real@elsewhere.test', messageId: 'forge-2@elsewhere.test', body: 'the real one' });
  await pipelineFor(store, scriptedImap({ [HOST_A]: mailboxWith([{ uid: 1, raw: forged }, { uid: 2, raw: real }]) }).connectFactory).pollReplies();
  const unlinked = await rowsOf(store, 'unlinkedReplies');
  assert.deepEqual(unlinked.map(row => row.externalId).sort(), ['mid:<forge-1@elsewhere.test>', 'mid:<forge-2@elsewhere.test>']);
  assert.equal(unlinked.find(row => row.externalId === 'mid:<forge-2@elsewhere.test>').bodyPreview.includes('the real one'), true);
  assert.equal((await accountBySlot(store, 'imap-slot-forge')).lastImapUid, 2);
});
