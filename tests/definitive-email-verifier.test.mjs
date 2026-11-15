// Definitive Email Verifier (actors/definitive-email-verifier): hostile tests.
// SMTP is exercised against a scripted server on 127.0.0.1; DNS is stubbed. No external network.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { classifyOffline, dedupeKey, isDisposableDomain, parseAddress } from '../actors/definitive-email-verifier/src/address.mjs';
import { MAIL_STATUS, dohResolver, nativeResolver, trustedResolvers, witnessedMailLookup } from '../actors/definitive-email-verifier/src/dns.mjs';
import { RCPT, classifyRcptReply, parseReply, smtpProbe, smtpReachable } from '../actors/definitive-email-verifier/src/smtp.mjs';
import { BILLABLE, summarize, verifyRows } from '../actors/definitive-email-verifier/src/verify.mjs';
import { extractEmails, runVerificationSale } from '../actors/definitive-email-verifier/src/sale.mjs';

// ---- scripted SMTP server -------------------------------------------------
// behaviour(rcpt) -> reply string (may be multi-line) or null to hang.
function fakeSmtp({ greeting = '220 fake ESMTP', mailFrom = '250 2.1.0 ok', rcpt, ehlo = '250-fake\r\n250 PIPELINING', dropAfterGreeting = false } = {}) {
  const seen = [];
  const server = net.createServer(socket => {
    socket.setEncoding('latin1');
    socket.write(`${greeting}\r\n`);
    if (dropAfterGreeting) return socket.end(() => socket.destroy());
    let buf = '';
    socket.on('data', chunk => {
      buf += chunk; let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2); seen.push(line);
        if (/^EHLO/i.test(line)) socket.write(`${ehlo}\r\n`);
        else if (/^HELO/i.test(line)) socket.write('250 fake\r\n');
        else if (/^MAIL FROM/i.test(line)) socket.write(`${mailFrom}\r\n`);
        else if (/^RCPT TO:<(.*)>$/i.test(line)) { const r = rcpt(line.match(/<(.*)>/)[1]); if (r !== null) socket.write(`${r}\r\n`); }
        else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
        else if (/^DATA/i.test(line)) socket.write('354 go\r\n');
      }
    });
    socket.on('error', () => {});
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, seen, close: () => new Promise(r => server.close(r)) })));
}
const mxFor = hostsByDomain => async domain => hostsByDomain[domain] ?? { status: MAIL_STATUS.MX, hosts: [{ exchange: '127.0.0.1', priority: 1 }], witnesses: ['stub'] };
const strictRcpt = known => addr => (known.includes(addr) ? '250 2.1.5 ok' : '550-5.1.1 The email account that you tried to reach does not exist.\r\n550 5.1.1 try again');
const opts = (port, extra = {}) => ({ lookupMail: mxFor({}), smtpPort: port, heloName: '[127.0.0.1]', mailFrom: '', timeoutMs: 1500, now: () => '2026-11-15T00:00:00.000Z', ...extra });

// ---- address --------------------------------------------------------------
test('address parsing accepts ordinary addresses and refuses malformed ones with a reason', () => {
  assert.deepEqual(parseAddress(' <Jane.Doe+x@Example.COM> '), { ok: true, reason: null, local: 'Jane.Doe+x', domain: 'example.com', normalized: 'Jane.Doe+x@example.com' });
  assert.equal(parseAddress('mailto:a@b.co').normalized, 'a@b.co');
  assert.equal(parseAddress('user@bücher.de').domain, 'xn--bcher-kva.de');
  for (const [raw, reason] of [['', 'EMPTY'], ['a b@c.com', 'CONTAINS_WHITESPACE'], ['nope', 'MISSING_AT_OR_PART'], ['@c.com', 'MISSING_AT_OR_PART'], ['a..b@c.com', 'INVALID_LOCAL_PART'], ['.a@c.com', 'INVALID_LOCAL_PART'], ['"a b"@c.com', 'CONTAINS_WHITESPACE'], ['"ab"@c.com', 'QUOTED_LOCAL_UNSUPPORTED'], ['a@[1.2.3.4]', 'IP_LITERAL_UNSUPPORTED'], ['a@localhost', 'INVALID_DOMAIN'], ['a@-x.com', 'INVALID_DOMAIN'], ['a@x.c0m', 'INVALID_TLD'], [`${'a'.repeat(65)}@c.com`, 'INVALID_LOCAL_PART']]) assert.equal(parseAddress(raw).reason, reason, raw);
  assert.equal(parseAddress('a@b.com\r\nRCPT TO:<x@y.z>').ok, false, 'no CRLF can reach the SMTP session');
});
test('offline flags: role, free provider, disposable (including subdomains) and typo suggestion', () => {
  const f = a => classifyOffline(parseAddress(a));
  assert.equal(f('info@acme.com').role, true); assert.equal(f('sales.team@acme.com').role, true); assert.equal(f('jane@acme.com').role, false);
  assert.equal(f('jane@gmail.com').freeProvider, true);
  assert.equal(isDisposableDomain('mailinator.com'), true); assert.equal(isDisposableDomain('x.mailinator.com'), true); assert.equal(isDisposableDomain('gmail.com'), false);
  assert.equal(f('jane@gmial.com').didYouMean, 'jane@gmail.com'); assert.equal(f('jane@gmail.com').didYouMean, null);
  assert.equal(dedupeKey(parseAddress('Jane@Acme.com')), dedupeKey(parseAddress('jane@ACME.com')));
});

// ---- dns ------------------------------------------------------------------
const stubDns = table => ({ resolveMx: async d => { const v = table[d]?.mx; if (v instanceof Error) throw v; if (!v) throw Object.assign(new Error('x'), { code: 'ENODATA' }); return v; }, resolve4: async d => { const v = table[d]?.a; if (v instanceof Error) throw v; if (!v) throw Object.assign(new Error('x'), { code: 'ENODATA' }); return v; }, resolve6: async () => { throw Object.assign(new Error('x'), { code: 'ENODATA' }); } });
const err = code => Object.assign(new Error(code), { code });
test('native resolver: MX sorted, null MX, implicit A, no mail, NXDOMAIN and errors are distinct', async () => {
  const r = nativeResolver({ dns: stubDns({ 'mx.test': { mx: [{ exchange: 'b.mx.test.', priority: 20 }, { exchange: 'A.mx.test', priority: 5 }] }, 'null.test': { mx: [{ exchange: '', priority: 0 }] }, 'a.test': { a: ['1.2.3.4'] }, 'none.test': {}, 'gone.test': { mx: err('ENOTFOUND') }, 'broken.test': { mx: err('ESERVFAIL') } }) });
  assert.deepEqual((await r.resolveMail('mx.test')).hosts.map(h => h.exchange), ['a.mx.test', 'b.mx.test']);
  assert.equal((await r.resolveMail('null.test')).status, MAIL_STATUS.NULL_MX);
  assert.equal((await r.resolveMail('a.test')).status, MAIL_STATUS.IMPLICIT_A);
  assert.equal((await r.resolveMail('none.test')).status, MAIL_STATUS.NO_MAIL);
  assert.equal((await r.resolveMail('gone.test')).status, MAIL_STATUS.NXDOMAIN);
  assert.equal((await r.resolveMail('broken.test')).status, MAIL_STATUS.DNS_ERROR);
});
test('DoH resolver parses MX, NXDOMAIN, null MX, A fallback and transport failure', async () => {
  const answers = { 'mx.test|MX': { Status: 0, Answer: [{ type: 15, data: '10 mx2.test.' }, { type: 15, data: '5 mx1.test.' }] }, 'gone.test|MX': { Status: 3 }, 'null.test|MX': { Status: 0, Answer: [{ type: 15, data: '0 .' }] }, 'a.test|MX': { Status: 0 }, 'a.test|A': { Status: 0, Answer: [{ type: 1, data: '1.2.3.4' }] }, 'none.test|MX': { Status: 0 }, 'none.test|A': { Status: 0 }, 'none.test|AAAA': { Status: 0 }, 'cname.test|MX': { Status: 0, Answer: [{ type: 5, data: 'x.' }] }, 'cname.test|A': { Status: 0 }, 'cname.test|AAAA': { Status: 0 } };
  const fetchImpl = async url => { const u = new URL(url); const k = `${u.searchParams.get('name')}|${u.searchParams.get('type')}`; if (k.startsWith('down')) throw new Error('net'); return { ok: true, json: async () => answers[k] }; };
  const r = dohResolver({ fetchImpl });
  assert.deepEqual((await r.resolveMail('mx.test')).hosts.map(h => h.exchange), ['mx1.test', 'mx2.test']);
  assert.equal((await r.resolveMail('gone.test')).status, MAIL_STATUS.NXDOMAIN);
  assert.equal((await r.resolveMail('null.test')).status, MAIL_STATUS.NULL_MX);
  assert.equal((await r.resolveMail('a.test')).status, MAIL_STATUS.IMPLICIT_A);
  assert.equal((await r.resolveMail('none.test')).status, MAIL_STATUS.NO_MAIL);
  assert.equal((await r.resolveMail('cname.test')).status, MAIL_STATUS.NO_MAIL, 'a CNAME answer is not an MX record');
  assert.equal((await r.resolveMail('down.test')).status, MAIL_STATUS.DNS_ERROR);
});
test('a resolver that wrongly answers "no data" for a known mail domain is not trusted', async () => {
  const lying = nativeResolver({ dns: stubDns({}) }); // says ENODATA for everything, like the build host did for gmail.com
  const honest = { name: 'honest', resolveMail: async () => ({ status: MAIL_STATUS.MX, hosts: [{ exchange: 'm', priority: 1 }], via: 'honest' }) };
  assert.deepEqual((await trustedResolvers([lying, honest])).map(r => r.name), ['honest']);
  assert.throws(() => witnessedMailLookup([]), /NO_TRUSTED_DNS_RESOLVER/);
});
test('a negative DNS answer needs two agreeing witnesses; otherwise it is an error, never "cannot receive"', async () => {
  const fixed = (name, status) => ({ name, resolveMail: async () => ({ status, hosts: status === MAIL_STATUS.MX ? [{ exchange: 'm', priority: 1 }] : [], via: name }) });
  const look = (...rs) => witnessedMailLookup(rs)('d.test');
  assert.equal((await look(fixed('a', MAIL_STATUS.NXDOMAIN), fixed('b', MAIL_STATUS.NXDOMAIN))).status, MAIL_STATUS.NXDOMAIN);
  assert.deepEqual((await look(fixed('a', MAIL_STATUS.NXDOMAIN), fixed('b', MAIL_STATUS.NO_MAIL))).witnesses, ['a', 'b']);
  assert.equal((await look(fixed('a', MAIL_STATUS.NO_MAIL), fixed('b', MAIL_STATUS.MX))).status, MAIL_STATUS.MX, 'a positive second witness overrules a negative first');
  assert.equal((await look(fixed('a', MAIL_STATUS.NXDOMAIN), fixed('b', MAIL_STATUS.DNS_ERROR))).status, MAIL_STATUS.DNS_ERROR);
  assert.equal((await look(fixed('a', MAIL_STATUS.DNS_ERROR), fixed('b', MAIL_STATUS.NXDOMAIN))).status, MAIL_STATUS.DNS_ERROR);
  assert.equal((await look(fixed('a', MAIL_STATUS.NXDOMAIN))).status, MAIL_STATUS.DNS_ERROR, 'a single witness cannot establish a negative');
  assert.equal((await look(fixed('a', MAIL_STATUS.DNS_ERROR), fixed('b', MAIL_STATUS.MX))).status, MAIL_STATUS.MX);
});

// ---- smtp reply classification -------------------------------------------
test('reply classification: policy language never becomes a mailbox verdict', () => {
  const c = (code, text) => classifyRcptReply(parseReply([`${code} ${text}`]));
  assert.equal(c(250, '2.1.5 OK'), RCPT.ACCEPTED);
  assert.equal(c(550, '5.1.1 The email account that you tried to reach does not exist'), RCPT.REJECTED_MAILBOX);
  assert.equal(c(550, 'User unknown in virtual mailbox table'), RCPT.REJECTED_MAILBOX);
  assert.equal(c(550, '5.4.1 Recipient address rejected: Access denied. AS(201806281)'), RCPT.REJECTED_MAILBOX);
  assert.equal(c(550, '5.5.0 Requested action not taken: mailbox unavailable'), RCPT.REJECTED_MAILBOX);
  assert.equal(c(554, "delivery error: dd This user doesn't have a yahoo.com account"), RCPT.REJECTED_MAILBOX);
  assert.equal(c(550, '5.7.1 Service unavailable; client host blocked using Spamhaus'), RCPT.BLOCKED);
  assert.equal(c(550, 'Recipient address rejected: your IP is on a blocklist'), RCPT.BLOCKED);
  assert.equal(c(554, '5.7.1 Relay access denied'), RCPT.BLOCKED);
  assert.equal(c(550, 'relay not permitted'), RCPT.BLOCKED);
  assert.equal(c(530, 'Must issue a STARTTLS command first'), RCPT.BLOCKED);
  assert.equal(c(451, '4.7.1 Greylisted, try again later'), RCPT.TEMPFAIL);
  assert.equal(c(452, '4.2.2 Mailbox full'), RCPT.TEMPFAIL);
  assert.equal(c(552, '5.2.2 Mailbox full'), RCPT.MAILBOX_FULL);
  assert.equal(c(550, 'Message rejected'), RCPT.AMBIGUOUS);
  assert.equal(c(550, '5.4.1 something unrelated'), RCPT.AMBIGUOUS);
  assert.equal(c(354, 'go ahead'), RCPT.AMBIGUOUS);
  const multi = parseReply(['550-5.1.1 The email account', '550-that you tried to reach', '550 5.1.1 does not exist']);
  assert.deepEqual([multi.code, multi.enhanced], [550, '5.1.1']);
});

// ---- smtp session ---------------------------------------------------------
test('probe speaks EHLO, MAIL, RCPT, QUIT and never DATA; multi-line replies are read whole', async () => {
  const s = await fakeSmtp({ rcpt: strictRcpt(['real@d.test']) });
  const r = await smtpProbe({ host: '127.0.0.1', port: s.port, heloName: '[127.0.0.1]', mailFrom: '', recipients: ['real@d.test', 'ghost@d.test'], timeoutMs: 1500 });
  await new Promise(res => setTimeout(res, 30)); await s.close();
  assert.equal(r.stage, 'DONE');
  assert.equal(r.replies.get('real@d.test').verdict, RCPT.ACCEPTED);
  assert.equal(r.replies.get('ghost@d.test').verdict, RCPT.REJECTED_MAILBOX);
  assert.deepEqual(s.seen, ['EHLO [127.0.0.1]', 'MAIL FROM:<>', 'RCPT TO:<real@d.test>', 'RCPT TO:<ghost@d.test>', 'QUIT']);
  assert.ok(!s.seen.some(l => /^DATA/i.test(l)));
});
test('probe failure modes end cleanly: refused greeting, refused sender, hang, dropped connection, closed port, junk', async () => {
  const run = async (cfg, extra = {}) => { const s = await fakeSmtp(cfg); const r = await smtpProbe({ host: '127.0.0.1', port: s.port, heloName: 'h.test', mailFrom: '', recipients: ['a@d.test'], timeoutMs: 400, ...extra }); await s.close(); return r; };
  assert.equal((await run({ greeting: '554 5.7.1 no service for you', rcpt: () => '250 ok' })).error, 'GREETING_REFUSED');
  assert.equal((await run({ mailFrom: '550 5.7.1 sender rejected', rcpt: () => '250 ok' })).error, 'MAIL_FROM_REFUSED');
  const hung = await run({ rcpt: () => null }); assert.equal(hung.error, 'TIMEOUT'); assert.equal(hung.replies.size, 0);
  assert.ok((await run({ dropAfterGreeting: true, rcpt: () => '250 ok' })).error);
  assert.equal((await run({ greeting: 'HTTP/1.1 400 Bad Request', rcpt: () => '250 ok' })).error, 'PROTOCOL');
  const helo = await run({ ehlo: '502 not implemented', rcpt: () => '250 ok' }); assert.equal(helo.stage, 'DONE', 'falls back to HELO');
  const closed = await smtpProbe({ host: '127.0.0.1', port: 1, heloName: 'h.test', mailFrom: '', recipients: ['a@d.test'], timeoutMs: 400 });
  assert.equal(closed.reached, false);
  assert.equal(await smtpReachable(['127.0.0.1'], { port: 1, timeoutMs: 300 }), false);
  const s = await fakeSmtp({ rcpt: () => '250 ok' }); assert.equal(await smtpReachable(['127.0.0.1'], { port: s.port, timeoutMs: 500 }), true); await s.close();
});

// ---- verdicts -------------------------------------------------------------
test('strict server: confirmed, rejected, role, disposable, duplicate and malformed rows get the right verdicts', async () => {
  const s = await fakeSmtp({ rcpt: strictRcpt(['jane@d.test', 'info@d.test', 'x@mailinator.com']) });
  const rows = ['jane@d.test', 'ghost@d.test', 'info@d.test', 'JANE@D.TEST', 'not-an-email', 'x@mailinator.com'].map(email => ({ email }));
  const { records } = await verifyRows(rows, opts(s.port)); await s.close();
  const by = Object.fromEntries(records.map(r => [r.email, r]));
  assert.deepEqual([by['jane@d.test'].status, by['jane@d.test'].verification, by['jane@d.test'].definitive], ['deliverable', 'MAILBOX_CONFIRMED', true]);
  assert.deepEqual([by['ghost@d.test'].status, by['ghost@d.test'].verification, by['ghost@d.test'].definitive], ['undeliverable', 'MAILBOX_REJECTED', true]);
  assert.equal(by['ghost@d.test'].smtp.enhanced, '5.1.1');
  assert.deepEqual([by['info@d.test'].status, by['info@d.test'].definitive, by['info@d.test'].flags.role], ['risky', true, true]);
  assert.deepEqual([by['JANE@D.TEST'].status, by['JANE@D.TEST'].definitive, by['JANE@D.TEST'].duplicateOfIndex], ['duplicate', false, 0]);
  assert.deepEqual([by['not-an-email'].verification, by['not-an-email'].definitive], ['INVALID_SYNTAX', false]);
  assert.deepEqual([by['x@mailinator.com'].status, by['x@mailinator.com'].flags.disposable], ['risky', true]);
  assert.equal(records.length, rows.length);
});
test('catch-all server: accepted addresses are risky and never billable', async () => {
  const s = await fakeSmtp({ rcpt: () => '250 ok' });
  const { records } = await verifyRows([{ email: 'a@d.test' }, { email: 'b@d.test' }], opts(s.port)); await s.close();
  for (const r of records) assert.deepEqual([r.status, r.verification, r.definitive, r.flags.catchAll], ['risky', 'CATCH_ALL_DOMAIN', false, true]);
});
test('uncertainty stays unknown and free: greylisting, IP block, inconclusive catch-all probe, no answer, mailbox full', async () => {
  const one = async (rcpt, extra) => { const s = await fakeSmtp({ rcpt, ...extra }); const { records } = await verifyRows([{ email: 'a@d.test' }], opts(s.port)); await s.close(); return records[0]; };
  const grey = await one(() => '451 4.7.1 greylisted'); assert.deepEqual([grey.status, grey.verification, grey.definitive], ['unknown', 'SMTP_TEMPFAIL', false]);
  const blocked = await one(() => '550 5.7.1 blocked using spamhaus'); assert.deepEqual([blocked.status, blocked.definitive], ['unknown', false]);
  const unconfirmed = await one(a => (a === 'a@d.test' ? '250 ok' : '451 try later')); assert.deepEqual([unconfirmed.status, unconfirmed.verification, unconfirmed.definitive], ['unknown', 'ACCEPTED_UNCONFIRMED', false]);
  const silent = await one(() => '250 ok', { greeting: '554 go away' }); assert.deepEqual([silent.status, silent.verification, silent.definitive], ['unknown', 'SMTP_NO_ANSWER', false]);
  const full = await one(a => (a === 'a@d.test' ? '552 5.2.2 mailbox full' : '550 5.1.1 no such user')); assert.deepEqual([full.status, full.verification, full.definitive], ['risky', 'MAILBOX_FULL', false]);
});
test('DNS verdicts: dead domain is billable only as witnessed; DNS errors and missing SMTP are unknown and free', async () => {
  const lookup = mxFor({ 'dead.test': { status: MAIL_STATUS.NXDOMAIN, hosts: [], witnesses: ['a', 'b'] }, 'null.test': { status: MAIL_STATUS.NULL_MX, hosts: [], witnesses: ['a', 'b'] }, 'flaky.test': { status: MAIL_STATUS.DNS_ERROR, hosts: [], error: 'WITNESSES_DISAGREE', witnesses: ['a', 'b'] } });
  const { records } = await verifyRows(['a@dead.test', 'a@null.test', 'a@flaky.test', 'a@live.test'].map(email => ({ email })), { ...opts(1), lookupMail: lookup, smtpAvailable: false });
  assert.deepEqual(records.map(r => [r.status, r.verification, r.definitive]), [['undeliverable', 'DOMAIN_CANNOT_RECEIVE', true], ['undeliverable', 'DOMAIN_CANNOT_RECEIVE', true], ['unknown', 'DNS_UNRESOLVED', false], ['unknown', 'SMTP_UNAVAILABLE', false]]);
  assert.deepEqual(records[0].mx.witnesses, ['a', 'b']);
  assert.deepEqual([...BILLABLE].sort(), ['DOMAIN_CANNOT_RECEIVE', 'MAILBOX_CONFIRMED', 'MAILBOX_REJECTED']);
});
test('large domains are probed in batches and the catch-all question is asked once', async () => {
  const s = await fakeSmtp({ rcpt: strictRcpt(Array.from({ length: 20 }, (_, i) => `u${i}@d.test`)) });
  const rows = Array.from({ length: 20 }, (_, i) => ({ email: `u${i}@d.test` }));
  const { records } = await verifyRows(rows, opts(s.port, { batchSize: 8 })); await s.close();
  assert.ok(records.every(r => r.verification === 'MAILBOX_CONFIRMED'));
  assert.equal(s.seen.filter(l => /^RCPT TO:<zz-no-such-user-/.test(l)).length, 1);
  assert.equal(s.seen.filter(l => /^MAIL FROM/.test(l)).length, 3);
});

// ---- billing --------------------------------------------------------------
test('billing: only proven results are charged; free rows are delivered free; summary adds up', async () => {
  const s = await fakeSmtp({ rcpt: strictRcpt(['jane@d.test']) });
  const charged = []; const free = [];
  const rows = ['jane@d.test', 'ghost@d.test', 'jane@d.test', 'bad', 'a@dead.test'].map(email => ({ email }));
  const lookupMail = mxFor({ 'dead.test': { status: MAIL_STATUS.NXDOMAIN, hosts: [], witnesses: ['a', 'b'] } });
  const { summary } = await runVerificationSale({ rows, verifyOptions: { ...opts(s.port), lookupMail }, pushCharged: async r => { charged.push(r.email); return { chargedCount: 1, eventChargeLimitReached: false }; }, pushFree: async r => { free.push(r.email); } });
  await s.close();
  assert.deepEqual(charged.sort(), ['a@dead.test', 'ghost@d.test', 'jane@d.test']);
  assert.deepEqual(free.sort(), ['bad', 'jane@d.test']);
  assert.deepEqual([summary.rowsIn, summary.rowsProcessed, summary.billableResults, summary.billedEvents, summary.freeResults, summary.duplicates, summary.rowsNotProcessed], [5, 5, 3, 3, 2, 1, 0]);
  assert.equal(summary.deliverable + summary.undeliverable + summary.risky + summary.unknown + summary.duplicates, 5);
});
test('billing: the run stops at the spending limit and an unstored record is not counted as delivered', async () => {
  const s = await fakeSmtp({ rcpt: strictRcpt([]) });
  const rows = Array.from({ length: 6 }, (_, i) => ({ email: `u@d${i}.test` })); let calls = 0;
  const { summary } = await runVerificationSale({ rows, verifyOptions: { ...opts(s.port), domainConcurrency: 1 }, pushCharged: async () => { calls += 1; return calls <= 2 ? { chargedCount: 1, eventChargeLimitReached: false } : { chargedCount: 0, eventChargeLimitReached: true }; }, pushFree: async () => {} });
  await s.close();
  assert.deepEqual([summary.billedEvents, summary.rowsProcessed, summary.rowsNotProcessed, summary.stoppedAtSpendingLimit, calls], [2, 2, 4, true, 3]);
});
test('billing: outside pay-per-event (chargedCount 0, no limit) the run completes and reports zero billed', async () => {
  const s = await fakeSmtp({ rcpt: strictRcpt([]) });
  const { summary } = await runVerificationSale({ rows: [{ email: 'a@d.test' }, { email: 'b@d.test' }], verifyOptions: opts(s.port), pushCharged: async () => ({ chargedCount: 0, eventChargeLimitReached: false }), pushFree: async () => {} });
  await s.close();
  assert.deepEqual([summary.rowsProcessed, summary.billableResults, summary.billedEvents, summary.stoppedAtSpendingLimit], [2, 2, 0, false]);
});
test('dataset field extraction handles nesting, arrays and junk', () => {
  assert.deepEqual(extractEmails({ email: ' a@b.co ' }, 'email'), ['a@b.co']);
  assert.deepEqual(extractEmails({ contact: { email: 'a@b.co' } }, 'contact.email'), ['a@b.co']);
  assert.deepEqual(extractEmails({ emails: ['a@b.co', '', null, 'c@d.co'] }, 'emails'), ['a@b.co', 'c@d.co']);
  assert.deepEqual(extractEmails({ people: [{ email: 'a@b.co' }, { email: 7 }, null] }, 'people.email'), ['a@b.co']);
  assert.deepEqual(extractEmails({}, 'email'), []);
  assert.deepEqual(summarize([]).uniqueAddresses, 0);
});
