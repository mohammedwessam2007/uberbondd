// Hostile coverage for inbound reply governance: suppression normalization, opt-out routing, delivery-notice recognition,
// DSN attribution, MIME poison bounds, IMAP UID replay, unlinked human replies and retention holds. Every fixture is
// synthetic RFC 822 text on example.com / example.net. Stores and IMAP sockets are in-memory fakes; nothing leaves the process.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ConflictError, Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import {
  classifyInboundEvent, detectUnsubscribeIntent, isDeliveryNotice, attributeDeliveryNotice,
  routeUnsubscribeIntent, parseInboundMime
} from '../src/inbound-classify.mjs';
import {
  propagateSuppression, recordInboundHealthEvent, buildOperatorEscalation, recordOperatorEscalation,
  suppressionKeyOf, suppressionMatches, buildUnlinkedHumanReplyEscalation
} from '../src/inbound-suppression-propagation.mjs';
import { planInboundRetention, setInboundRetentionControl } from '../src/inbound-retention.mjs';
import { createUberImapReader, parseRawEmail, buildEncryptedImapAccount, UBERIMAP_MIME_LIMITS } from '../src/uberimap.mjs';

// In-memory stand-in for the store methods the inbound modules call. Duplicate ids and duplicate suppression values raise
// ConflictError, as the real store does, so replay paths are exercised faithfully.
class MemoryStore {
  constructor() { this.tables = {}; this.calls = []; this.staleView = null; }
  rows(key) { this.tables[key] ||= []; return this.tables[key]; }
  async add(key, item) {
    const rows = this.rows(key);
    if (rows.some(row => row.id === item.id) || (key === 'suppressions' && rows.some(row => row.value === item.value))) {
      throw new ConflictError(`duplicate ${key}`);
    }
    rows.push(structuredClone(item));
    return structuredClone(item);
  }
  async list(key, { filters = {}, limit = Infinity } = {}) {
    return this.rows(key)
      .filter(row => Object.entries(filters).every(([field, value]) => row[field] === value))
      .slice(0, limit).map(row => structuredClone(row));
  }
  async findOne(key, filters = {}) { return (await this.list(key, { filters, limit: 1 }))[0] || null; }
  async get(key, id) { return structuredClone(this.rows(key).find(row => row.id === id) || null); }
  async patch(key, id, patch) {
    const row = this.rows(key).find(item => item.id === id);
    if (!row) return null;
    Object.assign(row, structuredClone(patch));
    return structuredClone(row);
  }
  async log(type, detail = {}) { return this.add('auditLog', { id: `log-${this.rows('auditLog').length + 1}`, type, detail }); }
  async recordOutboundEvent(input = {}) {
    this.calls.push({ method: 'recordOutboundEvent', inbox: input.inbox });
    let row = this.rows('senderHealth').find(item => item.inbox === input.inbox);
    if (!row) { row = { id: `sender_${input.inbox}`, inbox: input.inbox, paused: false, pauseReason: '' }; this.rows('senderHealth').push(row); }
    return this.staleView ? structuredClone(this.staleView) : structuredClone(row);
  }
  async setSenderPaused(inbox, paused, reason = '') {
    this.calls.push({ method: 'setSenderPaused', inbox, paused, reason });
    const row = this.rows('senderHealth').find(item => item.inbox === inbox);
    if (row) Object.assign(row, { paused: Boolean(paused), pauseReason: String(reason || '') });
    return row ? structuredClone(row) : null;
  }
}

const CRLF = '\r\n';
const rfc822 = lines => lines.join(CRLF);

// ---------- 1. Hard pause is preserved; a stale health view never demotes it ----------

test('a complaint never overwrites an owner hard pause, even when the health view returned by the write is stale', async () => {
  const store = new MemoryStore();
  store.rows('senderHealth').push({ id: 'sender_slot-a', inbox: 'slot-a', paused: true, pauseReason: 'owner-hard-pause' });
  store.staleView = { inbox: 'slot-a', paused: false, pauseReason: '' };
  const result = await recordInboundHealthEvent(store, { eventType: 'complaint', inbox: 'slot-a', externalId: 'msg-hard-1', thresholds: {} });
  assert.equal(result.held, false);
  assert.equal(store.calls.filter(call => call.method === 'setSenderPaused').length, 0, 'the paused sender is never re-held');
  assert.equal(store.rows('senderHealth')[0].pauseReason, 'owner-hard-pause');
});

test('a complaint on an unpaused sender still places the hold', async () => {
  const store = new MemoryStore();
  const result = await recordInboundHealthEvent(store, { eventType: 'complaint', inbox: 'slot-b', externalId: 'msg-hold-1', thresholds: {} });
  assert.equal(result.held, true);
  assert.equal(store.rows('senderHealth')[0].pauseReason, 'inbound-complaint-hold');
});

// ---------- 3. Plus-tag, domain-case and alias suppression ----------

test('suppression keys strip plus tags, lower-case the domain, and fold dots only for gmail.com and googlemail.com', () => {
  assert.equal(suppressionKeyOf('Jane+Promo@Example.COM'), 'jane@example.com');
  assert.equal(suppressionKeyOf('  Jane@Example.Com  '), 'jane@example.com');
  assert.equal(suppressionKeyOf('j.a.n.e+x@Gmail.com'), 'jane@gmail.com');
  assert.equal(suppressionKeyOf('j.a.n.e@googlemail.com'), 'jane@gmail.com');
  assert.equal(suppressionKeyOf('j.a.n.e@example.com'), 'j.a.n.e@example.com', 'dots are significant outside gmail');
});

test('a suppression recorded for one spelling blocks every plus-tag and case variant of the same mailbox', () => {
  assert.equal(suppressionMatches('JANE+news@example.com', ['jane@example.com']), true);
  assert.equal(suppressionMatches('jane+x+y@EXAMPLE.com', ['jane@example.com']), true);
  assert.equal(suppressionMatches('j.a.n.e@gmail.com', ['jane@gmail.com']), true);
  assert.equal(suppressionMatches('jane@googlemail.com', ['jane@gmail.com']), true);
});

test('suppression matching does not widen beyond the same mailbox', () => {
  assert.equal(suppressionMatches('jane@example.net', ['jane@example.com']), false);
  assert.equal(suppressionMatches('j.ane@example.com', ['jane@example.com']), false);
  assert.equal(suppressionMatches('jane2@example.com', ['jane@example.com']), false);
});

test('an opt-out written with a plus tag also records the base address, so the base address is blocked', async () => {
  const store = new MemoryStore();
  const result = await propagateSuppression(store, { email: 'Jane+Promo@Example.COM', reason: 'optout', sourceId: 'mid:<p@x>' });
  assert.equal(result.status, 'SUPPRESSED');
  const values = store.rows('suppressions').map(row => row.value).sort();
  assert.deepEqual(values, ['jane+promo@example.com', 'jane@example.com']);
  assert.equal(store.rows('suppressions').every(row => row.scope === 'all-slots'), true);
});

test('replaying a plus-tagged opt-out writes each row once', async () => {
  const store = new MemoryStore();
  await propagateSuppression(store, { email: 'Jane+Promo@Example.COM', reason: 'optout', sourceId: 'mid:<p@x>' });
  const replay = await propagateSuppression(store, { email: 'jane+promo@example.com', reason: 'optout', sourceId: 'mid:<p@x>' });
  assert.equal(replay.status, 'ALREADY_SUPPRESSED');
  assert.equal(store.rows('suppressions').length, 2);
});

// ---------- 4. Opt-out language, negation guard, and routing ----------

test('every clear English opt-out phrase in the reviewed list is a high-confidence body intent', () => {
  const phrases = [
    'Please unsubscribe me.', 'Remove me from this list.', 'Please stop emailing me.', 'Take me off your list.',
    'Do not contact me again.', 'No more emails, thanks.', 'I want to opt out.', 'Please stop.'
  ];
  for (const body of phrases) {
    const result = detectUnsubscribeIntent({ body });
    assert.equal(result.intent, true, `phrase must be an opt-out: ${body}`);
    assert.equal(result.confidence, 'high', body);
  }
});

test('negated opt-out language is not an opt-out, including a negation a few words before the phrase', () => {
  assert.equal(detectUnsubscribeIntent({ body: 'I do not want to unsubscribe, keep sending the report.' }).intent, false);
  assert.equal(detectUnsubscribeIntent({ body: 'I will not opt out of this.' }).intent, false);
  assert.equal(detectUnsubscribeIntent({ body: "Don't remove me, I am interested." }).intent, false);
});

test('a non-negated sentence that follows a negated one still counts as an opt-out', () => {
  assert.equal(detectUnsubscribeIntent({ body: 'I do not mind the price. Please unsubscribe me.' }).intent, true);
});

test('a List-Unsubscribe header alone is ambiguous: review when unlinked, opt-out only inside a linked thread', () => {
  const header = detectUnsubscribeIntent({ listUnsubscribe: '<mailto:stop@example.net>', body: 'Ok.' });
  assert.equal(routeUnsubscribeIntent(header, 'none'), 'REVIEW');
  assert.equal(routeUnsubscribeIntent(header, 'sender-address'), 'REVIEW');
  assert.equal(routeUnsubscribeIntent(header, 'thread'), 'OPT_OUT');
});

test('a clear opt-out is always routed to opt-out, and a subject-only signal is review when unlinked', () => {
  assert.equal(routeUnsubscribeIntent(detectUnsubscribeIntent({ body: 'Remove me.' }), 'none'), 'OPT_OUT');
  assert.equal(routeUnsubscribeIntent(detectUnsubscribeIntent({ subject: 'Unsubscribe', body: '' }), 'none'), 'REVIEW');
  assert.equal(routeUnsubscribeIntent(detectUnsubscribeIntent({ subject: 'Re: quick question', body: 'Tell me more.' }), 'none'), 'NONE');
  assert.equal(routeUnsubscribeIntent(undefined, 'thread'), 'NONE');
});

// ---------- 5. Delivery notices: RFC 3464 or the configured sending domain only ----------

test('a mailer-daemon at a foreign domain is not a delivery notice without an RFC 3464 report', () => {
  assert.equal(isDeliveryNotice({ from: 'Mail Delivery <mailer-daemon@evil.example.net>', contentType: 'text/plain', sendingDomain: 'mail.example.com' }), false);
  assert.equal(isDeliveryNotice({ fromEmail: 'postmaster@evil.example.net', contentType: 'text/plain' }), false);
});

test('a mailer-daemon or postmaster at the configured sending domain is a delivery notice', () => {
  assert.equal(isDeliveryNotice({ from: 'Mail Delivery <MAILER-DAEMON@mail.example.com>', sendingDomain: 'mail.example.com' }), true);
  assert.equal(isDeliveryNotice({ fromEmail: 'postmaster@mail.example.com', sendingDomain: 'Mail.Example.com' }), true);
  assert.equal(isDeliveryNotice({ fromEmail: 'alice@mail.example.com', sendingDomain: 'mail.example.com' }), false, 'only the two system senders count');
});

test('a multipart/report with report-type delivery-status is a delivery notice from any domain', () => {
  const contentType = 'multipart/report; report-type=delivery-status; boundary="d1"';
  assert.equal(isDeliveryNotice({ from: 'gateway@relay.example.net', contentType }), true);
});

test('a feedback report from a foreign system sender is not a delivery notice; the sending-domain path still applies at home', () => {
  const contentType = 'multipart/report; report-type=feedback-report; boundary="f1"';
  assert.equal(isDeliveryNotice({ from: 'mailer-daemon@example.net', contentType }), false);
  assert.equal(isDeliveryNotice({ from: 'mailer-daemon@mail.example.com', contentType, sendingDomain: 'mail.example.com' }), true);
});

test('classifyInboundEvent treats a foreign mailer-daemon subject as unverified, never as a bounce', () => {
  const result = classifyInboundEvent({ headers: { from: 'mailer-daemon@evil.example.net', subject: 'Undelivered Mail' } });
  assert.notEqual(result.category, 'bounce');
  assert.equal(result.confidence, 'low');
});

test('classifyInboundEvent reads a real delivery notice as a bounce', () => {
  const headers = { from: 'mailer-daemon@evil.example.net', 'content-type': 'multipart/report; report-type=delivery-status; boundary="d"' };
  assert.deepEqual(classifyInboundEvent({ headers, body: 'Delivery failed.' }), { category: 'bounce', confidence: 'high' });
  assert.deepEqual(
    classifyInboundEvent({ headers: { from: 'mailer-daemon@mail.example.com', subject: 'Undelivered Mail' }, body: '', sendingDomain: 'mail.example.com' }),
    { category: 'bounce', confidence: 'high' }
  );
});

test('bounce-looking words from a person are not a bounce', () => {
  const result = classifyInboundEvent({ headers: { from: 'Ops <ops@example.net>', subject: 'Hi' }, body: 'Undelivered mail, please advise on the sheet.' });
  assert.notEqual(result.category, 'bounce');
});

// ---------- 6. DSN attribution across In-Reply-To, References and embedded Message-IDs ----------

test('a delivery notice links to the one stored outbound Message-ID named by any of its identity fields', () => {
  const linked = attributeDeliveryNotice({
    isNotice: true, inReplyTo: '<dsn-1@mail.example.com>', references: ['<dsn-0@mail.example.com>'],
    embeddedMessageIds: ['<out-7@example.net>'], outboundMessageIds: ['<out-7@example.net>', '<out-8@example.net>']
  });
  assert.deepEqual(linked, { status: 'LINKED', messageId: '<out-7@example.net>', candidateCount: 1, reasonCode: '' });
});

test('the same outbound ID named in several fields is still one link', () => {
  const linked = attributeDeliveryNotice({
    isNotice: true, inReplyTo: '<out-9@example.net>', references: '<out-9@example.net> <other@example.net>',
    embeddedMessageIds: ['<OUT-9@example.net>'], outboundMessageIds: ['out-9@example.net']
  });
  assert.equal(linked.status, 'LINKED');
  assert.equal(linked.messageId, 'out-9@example.net');
});

test('two distinct stored outbound messages named by one notice are never auto-attributed', () => {
  const ambiguous = attributeDeliveryNotice({
    isNotice: true, inReplyTo: '<out-1@example.net>', embeddedMessageIds: ['<out-2@example.net>'],
    outboundMessageIds: ['<out-1@example.net>', '<out-2@example.net>']
  });
  assert.equal(ambiguous.status, 'UNLINKED');
  assert.equal(ambiguous.reasonCode, 'AMBIGUOUS_OUTBOUND_MATCH');
  assert.equal(ambiguous.messageId, null);
});

test('an embedded ID that names no stored outbound message does not attribute the notice', () => {
  const forged = attributeDeliveryNotice({
    isNotice: true, inReplyTo: '<dsn@mail.example.com>', embeddedMessageIds: ['<never-sent@example.net>'],
    outboundMessageIds: ['<out-1@example.net>']
  });
  assert.equal(forged.status, 'UNLINKED');
  assert.equal(forged.reasonCode, 'NO_OUTBOUND_MATCH');
});

test('attribution refuses anything that is not a delivery notice', () => {
  const human = attributeDeliveryNotice({ isNotice: false, inReplyTo: '<out-1@example.net>', outboundMessageIds: ['<out-1@example.net>'] });
  assert.equal(human.status, 'NOT_A_DELIVERY_NOTICE');
  assert.equal(human.messageId, null);
});

test('a notice whose embedded original is a feedback-report style Message-ID links through the parser output', () => {
  const parsed = parseRawEmail(rfc822([
    'From: Mail Delivery <mailer-daemon@mail.example.com>',
    'Message-ID: <dsn-42@mail.example.com>',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="d42"',
    '',
    '--d42',
    'Content-Type: text/plain',
    '',
    'Delivery failed.',
    '--d42',
    'Content-Type: message/rfc822',
    '',
    'Message-ID: <out-42@example.net>',
    'Subject: Original',
    '',
    '--d42--',
    ''
  ]));
  const attribution = attributeDeliveryNotice({
    isNotice: isDeliveryNotice({ fromEmail: parsed.fromEmail, contentType: parsed.contentType, reportType: parsed.reportType, sendingDomain: 'mail.example.com' }),
    inReplyTo: parsed.inReplyTo, references: parsed.references, embeddedMessageIds: parsed.embeddedMessageIds,
    outboundMessageIds: ['<out-42@example.net>']
  });
  assert.equal(attribution.status, 'LINKED');
  assert.equal(attribution.messageId, '<out-42@example.net>');
});

// ---------- 7. MIME poison: bounded depth, part count and bytes; quarantine, never throw ----------

function nestedMultipart(depth) {
  let inner = 'Content-Type: text/plain\r\n\r\nDEEP-SECRET-TEXT';
  for (let i = 0; i < depth; i += 1) {
    inner = `Content-Type: multipart/mixed; boundary="b${i}"\r\n\r\n--b${i}\r\n${inner}\r\n--b${i}--\r\n`;
  }
  return `From: Lead <lead@example.net>\r\nMessage-ID: <deep@example.net>\r\nContent-Type: multipart/mixed; boundary="top"\r\n\r\n--top\r\n${inner}\r\n--top--\r\n`;
}

test('a nested multipart deeper than the limit is quarantined with no body text', () => {
  const parsed = parseRawEmail(nestedMultipart(UBERIMAP_MIME_LIMITS.maxDepth + 4));
  assert.equal(parsed.mimeQuarantine, 'MIME_DEPTH_EXCEEDED');
  assert.equal(parsed.body, '');
  assert.equal(parsed.id, '<deep@example.net>', 'the identity fields are still read');
});

test('a multipart with more parts than the limit is quarantined', () => {
  const parts = Array.from({ length: UBERIMAP_MIME_LIMITS.maxParts + 50 }, () => '--p\r\nContent-Type: text/plain\r\n\r\nx\r\n').join('');
  const parsed = parseRawEmail(`From: a@example.net\r\nContent-Type: multipart/mixed; boundary="p"\r\n\r\n${parts}--p--\r\n`);
  assert.equal(parsed.mimeQuarantine, 'MIME_PART_LIMIT');
  assert.equal(parsed.body, '');
});

test('an oversized decoded body is quarantined rather than truncated into a reply', () => {
  const big = 'a'.repeat(UBERIMAP_MIME_LIMITS.maxBodyBytes + 5000);
  const parsed = parseRawEmail(`From: a@example.net\r\nContent-Type: text/plain\r\n\r\n${big}\r\n`);
  assert.equal(parsed.mimeQuarantine, 'MIME_BODY_TOO_LARGE');
  assert.equal(parsed.body, '');
});

test('a multipart without a boundary is malformed and quarantined', () => {
  const parsed = parseRawEmail('From: a@example.net\r\nContent-Type: multipart/mixed\r\n\r\nhello there');
  assert.equal(parsed.mimeQuarantine, 'MIME_BOUNDARY_MISSING');
  assert.equal(parsed.body, '');
});

test('a well-formed plain reply carries no quarantine and keeps its body', () => {
  const parsed = parseRawEmail('Message-ID: <r1@example.com>\r\nFrom: Lead <lead@example.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nYes, send details.\r\n');
  assert.equal(parsed.mimeQuarantine, null);
  assert.match(parsed.body, /send details/);
});

test('a text/plain part inside multipart/alternative is read, and a text/html-only message yields no body', () => {
  const alt = parseRawEmail(rfc822([
    'From: a@example.net', 'Content-Type: multipart/alternative; boundary="a1"', '', '--a1',
    'Content-Type: text/plain', '', 'Plain answer here.', '--a1', 'Content-Type: text/html', '', '<p>Html answer</p>', '--a1--', ''
  ]));
  assert.match(alt.body, /Plain answer here/);
  const htmlOnly = parseRawEmail(rfc822([
    'From: a@example.net', 'Content-Type: multipart/alternative; boundary="h1"', '', '--h1',
    'Content-Type: text/html', '', '<p>Only html</p>', '--h1--', ''
  ]));
  assert.equal(htmlOnly.body, '');
  assert.equal(htmlOnly.mimeQuarantine, null);
});

test('a single-part top-level HTML reply is still read, so an opt-out in it is not lost', () => {
  const parsed = parseRawEmail(rfc822([
    'From: Lead <lead@example.net>', 'Content-Type: text/html; charset=utf-8', '', '<p>Please unsubscribe me.</p>', ''
  ]));
  assert.match(parsed.body, /unsubscribe me/);
  assert.equal(parsed.mimeQuarantine, null);
  assert.equal(detectUnsubscribeIntent({ body: parsed.body }).intent, true);
});

test('hostile raw input never throws out of the parser', () => {
  const samples = [Buffer.from([0xff, 0xfe, 0x00, 0x0a, 0x0d]), '', '\r\n\r\n', 'Content-Type: multipart/x; boundary="\r\n\r\n--\r\n', 'x'.repeat(20000)];
  for (const sample of samples) {
    assert.doesNotThrow(() => parseRawEmail(sample));
  }
});

test('parseInboundMime quarantines an over-deep payload and withholds its body', () => {
  let payload = { mimeType: 'text/plain', body: { data: Buffer.from('deep').toString('base64url') } };
  for (let i = 0; i < 40; i += 1) payload = { mimeType: 'multipart/mixed', parts: [payload] };
  const result = parseInboundMime(payload, { maxMimeDepth: 5 });
  assert.equal(result.quarantined, true);
  assert.equal(result.quarantineReason, 'MIME_DEPTH_EXCEEDED');
  assert.equal(result.body, '');
});

test('parseInboundMime quarantines an oversized payload and a clean payload stays unquarantined', () => {
  const big = Buffer.from('x'.repeat(9000)).toString('base64url');
  const over = parseInboundMime({ mimeType: 'text/plain', body: { data: big } }, { maxDecodedBodyBytes: 5000 });
  assert.equal(over.quarantined, true);
  assert.equal(over.body, '');
  const clean = parseInboundMime({ mimeType: 'text/plain', body: { data: Buffer.from('hello').toString('base64url') } });
  assert.equal(clean.quarantined, false);
  assert.equal(clean.body, 'hello');
});

// ---------- 8. UID replay and UIDVALIDITY ----------

function imapSocket(transcript) {
  const socket = new EventEmitter();
  socket.writes = [];
  socket.write = line => {
    socket.writes.push(String(line));
    const tag = String(line).match(/^(UB\d{4})/)?.[1];
    const reply = transcript(String(line), tag);
    queueMicrotask(() => socket.emit('data', Buffer.from(reply, 'latin1')));
  };
  socket.end = () => {};
  socket.destroy = () => {};
  return socket;
}

function imapReader(socket) {
  return createUberImapReader({
    host: 'imap.example.net', port: 993, secure: true, username: 'user', password: 'pass', authorized: true,
    termsCompatible: true, evidenceRef: 'test', connectFactory: async () => socket, timeoutMs: 1000
  });
}

const messageBody = uid => `From: lead@example.net\r\nMessage-ID: <uid-${uid}@example.net>\r\n\r\nbody ${uid}`;

test('a server that echoes the cursor UID does not re-ingest it', async () => {
  const socket = imapSocket((line, tag) => {
    if (line.includes(' LOGIN ')) return `${tag} OK LOGIN completed\r\n`;
    if (line.includes(' SELECT ')) return `* 7 EXISTS\r\n* OK [UIDVALIDITY 1001] ok\r\n${tag} OK SELECT completed\r\n`;
    if (line.includes(' SEARCH ')) return `* SEARCH 7\r\n${tag} OK SEARCH completed\r\n`;
    if (line.includes(' LOGOUT')) return `* BYE\r\n${tag} OK LOGOUT completed\r\n`;
    throw new Error(`unexpected command: ${line}`);
  });
  const result = await imapReader(socket).fetchRecent({ afterUid: 7, limit: 100, expectedUidValidity: 1001 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages, []);
  assert.equal(result.lastUid, 7);
  assert.equal(socket.writes.some(line => /UID FETCH/.test(line)), false);
});

test('a repeated UID in one SEARCH answer is fetched once and in ascending order', async () => {
  const socket = imapSocket((line, tag) => {
    if (line.includes(' LOGIN ')) return `${tag} OK LOGIN completed\r\n`;
    if (line.includes(' SELECT ')) return `* 9 EXISTS\r\n* OK [UIDVALIDITY 1001] ok\r\n${tag} OK SELECT completed\r\n`;
    if (line.includes(' SEARCH ')) return `* SEARCH 6 5 6 8\r\n${tag} OK SEARCH completed\r\n`;
    const fetch = line.match(/UID FETCH (\d+) /);
    if (fetch) {
      const raw = messageBody(fetch[1]);
      return `* 1 FETCH (UID ${fetch[1]} BODY[] {${Buffer.byteLength(raw)}}\r\n${raw}\r\n)\r\n${tag} OK FETCH completed\r\n`;
    }
    if (line.includes(' LOGOUT')) return `* BYE\r\n${tag} OK LOGOUT completed\r\n`;
    throw new Error(`unexpected command: ${line}`);
  });
  const result = await imapReader(socket).fetchRecent({ afterUid: 4, limit: 100, expectedUidValidity: 1001 });
  assert.deepEqual(result.messages.map(message => message.uid), [5, 6, 8]);
  assert.equal(socket.writes.filter(line => /UID FETCH 6 /.test(line)).length, 1);
});

test('a UIDVALIDITY change fetches nothing and reports the new validity', async () => {
  const socket = imapSocket((line, tag) => {
    if (line.includes(' LOGIN ')) return `${tag} OK LOGIN completed\r\n`;
    if (line.includes(' SELECT ')) return `* 3 EXISTS\r\n* OK [UIDVALIDITY 2002] ok\r\n${tag} OK SELECT completed\r\n`;
    if (line.includes(' LOGOUT')) return `* BYE\r\n${tag} OK LOGOUT completed\r\n`;
    throw new Error(`unexpected command after a validity change: ${line}`);
  });
  const result = await imapReader(socket).fetchRecent({ afterUid: 2, limit: 100, expectedUidValidity: 1001 });
  assert.equal(result.status, 'UBERIMAP_UIDVALIDITY_CHANGED');
  assert.equal(result.uidValidity, 2002);
  assert.deepEqual(result.messages, []);
  assert.equal(socket.writes.some(line => /SEARCH|UID FETCH/.test(line)), false, 'no UID search or fetch after a reset');
});

test('an unreadable UID ends the batch and the cursor stays below it', async () => {
  const socket = imapSocket((line, tag) => {
    if (line.includes(' LOGIN ')) return `${tag} OK LOGIN completed\r\n`;
    if (line.includes(' SELECT ')) return `* 6 EXISTS\r\n* OK [UIDVALIDITY 1001] ok\r\n${tag} OK SELECT completed\r\n`;
    if (line.includes(' SEARCH ')) return `* SEARCH 4 5 6\r\n${tag} OK SEARCH completed\r\n`;
    if (line.includes('UID FETCH 4 ')) {
      const raw = messageBody(4);
      return `* 1 FETCH (UID 4 BODY[] {${Buffer.byteLength(raw)}}\r\n${raw}\r\n)\r\n${tag} OK FETCH completed\r\n`;
    }
    if (line.includes('UID FETCH 5 ')) return `${tag} NO FETCH failed\r\n`;
    if (line.includes(' LOGOUT')) return `* BYE\r\n${tag} OK LOGOUT completed\r\n`;
    throw new Error(`unexpected command: ${line}`);
  });
  const result = await imapReader(socket).fetchRecent({ afterUid: 3, limit: 100, expectedUidValidity: 1001 });
  assert.equal(result.status, 'UBERIMAP_FETCH_PARTIAL');
  assert.equal(result.failedUid, 5);
  assert.equal(result.lastUid, 4);
  assert.equal(socket.writes.some(line => /UID FETCH 6 /.test(line)), false, 'nothing after the failed UID is read');
});

// ---------- 9. Unlinked human replies get an owner escalation and no automatic action ----------

test('an unlinked human reply has its own operator escalation reason, not the generic one', () => {
  const escalation = buildOperatorEscalation({
    kind: 'human_response', externalId: 'imap:slot-x:v1001:12', replyId: 'reply-x', slot: 'slot-x',
    correlation: 'none', label: 'unlinked', reasonCode: 'UNLINKED_HUMAN_REPLY', at: '2026-10-14T00:00:00.000Z'
  });
  assert.equal(escalation.detail.reasonCode, 'UNLINKED_HUMAN_REPLY');
  assert.equal(escalation.detail.actionRequired, 'OWNER_MANUAL_REVIEW');
});

test('the unlinked human reply escalation carries no prospect, no body and no automatic action', async () => {
  const store = new MemoryStore();
  const escalation = buildUnlinkedHumanReplyEscalation({ externalId: 'imap:slot-x:v1001:13', slot: 'slot-x', at: '2026-10-14T00:00:00.000Z' });
  assert.equal(escalation.detail.kind, 'human_response');
  assert.equal(escalation.detail.reasonCode, 'UNLINKED_HUMAN_REPLY');
  assert.equal(escalation.detail.prospectId, '');
  assert.equal(escalation.detail.correlation, 'none');
  const result = await recordOperatorEscalation(store, escalation);
  assert.equal(result.status, 'RECORDED');
  assert.equal(store.rows('suppressions').length, 0, 'no suppression is written');
  assert.equal(store.rows('senderHealth').length, 0, 'no sender health change');
  assert.equal(JSON.stringify(store.rows('auditLog')).includes('Please send the sheet'), false);
  const again = await recordOperatorEscalation(store, escalation);
  assert.equal(again.status, 'ALREADY_RECORDED');
});

// ---------- 8b. Pipeline-level poison quarantine and replay (the real pollReplies loop, scripted IMAP reads) ----------

const KEY = crypto.randomBytes(32).toString('hex');
const pipelineDirs = [];
after(async () => {
  await Promise.all(pipelineDirs.map(dir => fs.rm(dir, { recursive: true, force: true })));
});

async function pipelineStore(accounts = []) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-governance-hostile-'));
  pipelineDirs.push(dir);
  const store = new Store(dir);
  await store.init();
  for (const account of accounts) await store.add('accounts', account);
  return store;
}

function forwardingAccount({ slot, lastImapUid = 0, lastImapUidValidity = 0 }) {
  const email = `${slot.replace(/[^a-z0-9]/gi, '')}@example.net`;
  const built = buildEncryptedImapAccount({
    slot, email, host: 'imap.example.net', port: 993, secure: true, username: email, password: 'pw-hostile',
    evidenceRef: 'test:governance-hostile', authorized: true, termsCompatible: true
  }, KEY);
  assert.equal(built.ok, true);
  return { ...built.account, lastImapUid, ...(lastImapUidValidity ? { lastImapUidValidity } : {}) };
}

function pipelineWithPoll(store, steps) {
  const queue = [...steps];
  const imapPoll = async () => (queue.length > 1 ? queue.shift() : queue[0]);
  return new Pipeline(store, {
    encryptionKey: KEY, ai: { provider: 'rules' },
    outbound: { hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 }
  }, {
    imapPoll,
    sendEmail: async () => { throw new Error('the reply path must never send mail'); },
    imapRetryDelaysMs: [0, 0],
    imapSleep: async () => {}
  });
}

const failedRead = (failedUid, uidValidity = 1001) => ({
  ok: true, status: 'UBERIMAP_FETCH_PARTIAL', uidValidity, messages: [], lastUid: failedUid - 1, failedUid
});

test('a UID that cannot be read is retried twice, then quarantined on the third failure and the cursor moves past it', async () => {
  const store = await pipelineStore([forwardingAccount({ slot: 'imap-slot-poison', lastImapUid: 3, lastImapUidValidity: 1001 })]);
  const pipeline = pipelineWithPoll(store, [failedRead(4)]);
  const accountRow = async () => (await store.list('accounts'))[0];

  await pipeline.pollReplies();
  assert.equal((await accountRow()).lastImapUid, 3, 'the first failure keeps the cursor below the unreadable UID');
  assert.deepEqual((await accountRow()).imapPoison, { uid: 4, count: 1 });

  await pipeline.pollReplies();
  assert.equal((await accountRow()).lastImapUid, 3);
  assert.deepEqual((await accountRow()).imapPoison, { uid: 4, count: 2 });

  await pipeline.pollReplies();
  assert.equal((await accountRow()).lastImapUid, 4, 'the third failure quarantines the UID, so the mailbox is not blocked');
  assert.equal((await accountRow()).imapPoison, null);
  const quarantined = (await store.list('auditLog')).filter(row => row.type === 'imap_uid_quarantined');
  assert.equal(quarantined.length, 1);
  assert.equal(quarantined[0].detail.uid, 4);
});

test('a Message-ID seen again after a UIDVALIDITY reset is recorded once', async () => {
  const store = await pipelineStore([forwardingAccount({ slot: 'imap-slot-mid-replay', lastImapUid: 0 })]);
  const raw = rfc822([
    'From: Stranger <stranger@elsewhere.example.net>', 'Message-ID: <dup-1@elsewhere.example.net>',
    'Subject: Question', 'Content-Type: text/plain; charset=utf-8', '', 'Where is the sheet?'
  ]);
  const message = { uid: 1, ...parseRawEmail(raw) };
  const pipeline = pipelineWithPoll(store, [
    { ok: true, status: 'UBERIMAP_FETCH_CONFIRMED', uidValidity: 1001, messages: [message], lastUid: 1 },
    { ok: true, status: 'UBERIMAP_UIDVALIDITY_CHANGED', uidValidity: 2002, messages: [], lastUid: 0 },
    { ok: true, status: 'UBERIMAP_FETCH_CONFIRMED', uidValidity: 2002, messages: [{ ...message, uid: 1 }], lastUid: 1 }
  ]);
  await pipeline.pollReplies();
  await pipeline.pollReplies();
  await pipeline.pollReplies();
  const unlinked = await store.list('unlinkedReplies');
  assert.equal(unlinked.length, 1, 'the same Message-ID is one record, not two');
  assert.equal(unlinked[0].externalId, 'mid:<dup-1@elsewhere.example.net>');
  assert.equal((await store.list('accounts'))[0].lastImapUidValidity, 2002);
});

// ---------- 10. Retention holds: explicit, reasoned, actor-bound, and never purged ----------

const NOW = Date.parse('2026-10-14T00:00:00.000Z');
const agedDays = days => new Date(NOW - days * 86400000).toISOString();

function seededRetentionStore() {
  const store = new MemoryStore();
  store.rows('unlinkedReplies').push(
    { id: 'unlinked:old-plain', receivedAt: agedDays(200) },
    { id: 'unlinked:old-held', receivedAt: agedDays(200) },
    { id: 'unlinked:old-escalated', receivedAt: agedDays(200) }
  );
  return store;
}

test('a legal hold set through the setter keeps its record out of the purge plan', async () => {
  const store = seededRetentionStore();
  const set = await setInboundRetentionControl(store, {
    collection: 'unlinkedReplies', id: 'unlinked:old-held', control: 'legalHold', value: true,
    reason: 'Counsel hold for complaint review', actor: 'mohamed'
  });
  assert.equal(set.ok, true);
  assert.equal(set.status, 'RETENTION_CONTROL_SET');
  const plan = planInboundRetention({ records: await store.list('unlinkedReplies'), windowDays: 90, nowMs: NOW });
  assert.deepEqual(plan.purgeIds, ['unlinked:old-escalated', 'unlinked:old-plain']);
  assert.equal(plan.retainedByReason.hold, 1);
  assert.equal(plan.deletesPerformed, 0);
  assert.equal(store.rows('unlinkedReplies').length, 3, 'planning and setting never remove a record');
});

test('every hold write records the reason and actor in the audit log', async () => {
  const store = seededRetentionStore();
  await setInboundRetentionControl(store, {
    collection: 'unlinkedReplies', id: 'unlinked:old-held', control: 'retentionHold', value: true,
    reason: 'Retention review pending', actor: 'owner-ops'
  });
  const row = store.rows('unlinkedReplies').find(item => item.id === 'unlinked:old-held');
  assert.equal(row.retentionHold, true);
  const audit = store.rows('auditLog').find(item => item.type === 'inbound_retention_control');
  assert.ok(audit, 'an audit entry exists');
  assert.equal(audit.detail.actor, 'owner-ops');
  assert.equal(audit.detail.control, 'retentionHold');
  assert.equal(audit.detail.reason, 'Retention review pending');
});

test('a hold without a reason or an actor is refused and changes nothing', async () => {
  const store = seededRetentionStore();
  const noReason = await setInboundRetentionControl(store, {
    collection: 'unlinkedReplies', id: 'unlinked:old-held', control: 'legalHold', value: true, reason: '   ', actor: 'mohamed'
  });
  const noActor = await setInboundRetentionControl(store, {
    collection: 'unlinkedReplies', id: 'unlinked:old-held', control: 'legalHold', value: true, reason: 'Hold', actor: ''
  });
  assert.equal(noReason.ok, false);
  assert.deepEqual(noReason.reasonCodes, ['reason-required']);
  assert.equal(noActor.ok, false);
  assert.deepEqual(noActor.reasonCodes, ['actor-required']);
  assert.equal(store.rows('unlinkedReplies').find(item => item.id === 'unlinked:old-held').legalHold, undefined);
  assert.equal(store.rows('auditLog').length, 0);
});

test('an unknown control, collection, record, hold value or escalation status is refused', async () => {
  const store = seededRetentionStore();
  const base = { collection: 'unlinkedReplies', id: 'unlinked:old-held', reason: 'Review', actor: 'mohamed' };
  assert.deepEqual((await setInboundRetentionControl(store, { ...base, control: 'deleteNow', value: true })).reasonCodes, ['control-invalid']);
  assert.deepEqual((await setInboundRetentionControl(store, { ...base, collection: 'suppressions', control: 'legalHold', value: true })).reasonCodes, ['collection-invalid']);
  assert.deepEqual((await setInboundRetentionControl(store, { ...base, id: 'unlinked:absent', control: 'legalHold', value: true })).reasonCodes, ['record-not-found']);
  assert.deepEqual((await setInboundRetentionControl(store, { ...base, control: 'legalHold', value: 'true' })).reasonCodes, ['hold-value-invalid']);
  assert.deepEqual((await setInboundRetentionControl(store, { ...base, control: 'escalationStatus', value: 'maybe' })).reasonCodes, ['escalation-status-invalid']);
  assert.equal(store.rows('unlinkedReplies').every(item => item.legalHold === undefined && item.escalationStatus === undefined), true);
});

test('an escalation set open keeps the record; closing it makes the record purgeable again', async () => {
  const store = seededRetentionStore();
  const reason = 'Owner review of human reply';
  await setInboundRetentionControl(store, {
    collection: 'unlinkedReplies', id: 'unlinked:old-escalated', control: 'escalationStatus', value: 'open', reason, actor: 'mohamed'
  });
  let plan = planInboundRetention({ records: await store.list('unlinkedReplies'), windowDays: 90, nowMs: NOW });
  assert.equal(plan.purgeIds.includes('unlinked:old-escalated'), false);
  assert.equal(plan.retainedByReason['open-escalation'], 1);
  await setInboundRetentionControl(store, {
    collection: 'unlinkedReplies', id: 'unlinked:old-escalated', control: 'escalationStatus', value: 'closed', reason: 'Handled by owner', actor: 'mohamed'
  });
  plan = planInboundRetention({ records: await store.list('unlinkedReplies'), windowDays: 90, nowMs: NOW });
  assert.equal(plan.purgeIds.includes('unlinked:old-escalated'), true);
});

test('the planner fails closed on hold and escalation values it does not recognise', () => {
  const records = [
    { id: 'unlinked:a', receivedAt: agedDays(200), legalHold: 'TRUE' },
    { id: 'unlinked:b', receivedAt: agedDays(200), retentionHold: 'yes' },
    { id: 'unlinked:c', receivedAt: agedDays(200), escalationStatus: 'OPEN' },
    { id: 'unlinked:d', receivedAt: agedDays(200), escalationStatus: ' pending ' },
    { id: 'unlinked:e', receivedAt: agedDays(200), legalHold: false, retentionHold: 'false', escalationStatus: 'closed' }
  ];
  const plan = planInboundRetention({ records, windowDays: 90, nowMs: NOW });
  assert.deepEqual(plan.purgeIds, ['unlinked:e']);
  assert.equal(plan.retainedByReason.hold, 2);
  assert.equal(plan.retainedByReason['open-escalation'], 2);
});
