// Turns DNS and SMTP observations into one record per address.
//
// `verification` is the fact that was established; `status` is the sending
// advice built on it. Only three facts are billable, each one observed on the
// network rather than inferred:
//   MAILBOX_CONFIRMED      the server accepted this address and refused a random one
//   MAILBOX_REJECTED       the server refused this address as a non-existent mailbox
//   DOMAIN_CANNOT_RECEIVE  two independent DNS resolvers agree the domain takes no mail
import crypto from 'node:crypto';
import { classifyOffline, dedupeKey, parseAddress } from './address.mjs';
import { MAIL_STATUS } from './dns.mjs';
import { RCPT, smtpProbe } from './smtp.mjs';

export const VERIFIER_VERSION = 'definitive-email-verifier/1.0.0';
export const BILLABLE = Object.freeze(new Set(['MAILBOX_CONFIRMED', 'MAILBOX_REJECTED', 'DOMAIN_CANNOT_RECEIVE']));
const smtpEvidence = r => (r ? { code: r.code, enhanced: r.enhanced || null, text: r.text.slice(0, 120) } : null);
const randomLocal = () => `zz-no-such-user-${crypto.randomBytes(6).toString('hex')}`;

function record(row, parsed, offline, fields) {
  const flags = { role: offline?.role ?? false, freeProvider: offline?.freeProvider ?? false, disposable: offline?.disposable ?? false, catchAll: fields.verification === 'CATCH_ALL_DOMAIN', mailboxFull: fields.verification === 'MAILBOX_FULL' };
  let status = fields.status;
  if (status === 'deliverable' && (flags.disposable || flags.role)) status = 'risky';
  return {
    email: row.email, normalized: parsed?.normalized ?? null, status, verification: fields.verification,
    definitive: BILLABLE.has(fields.verification), reasons: [...new Set([fields.verification, ...(fields.reasons ?? []), ...(flags.disposable ? ['DISPOSABLE_DOMAIN'] : []), ...(flags.role ? ['ROLE_ADDRESS'] : [])])],
    flags, didYouMean: offline?.didYouMean ?? null, mx: fields.mx ?? null, smtp: fields.smtp ?? null, catchAllProbe: fields.catchAllProbe ?? null, checkedAt: fields.checkedAt, verifier: VERIFIER_VERSION
  };
}

// rows: [{ email }]. Returns records in input order. Duplicates point at the first occurrence.
export async function verifyRows(rows, { lookupMail, smtpAvailable = true, probe = smtpProbe, heloName, mailFrom, smtpPort = 25, timeoutMs = 15000, domainConcurrency = 10, batchSize = 8, maxHosts = 2, now = () => new Date().toISOString(), onRecord = null }) {
  const out = new Array(rows.length);
  const emit = async (i, rec) => { out[i] = rec; if (onRecord) await onRecord(rec, i); };
  const seen = new Map(); const byDomain = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const parsed = parseAddress(rows[i].email);
    if (!parsed.ok) { await emit(i, record(rows[i], null, null, { status: 'undeliverable', verification: 'INVALID_SYNTAX', reasons: [parsed.reason], checkedAt: now() })); continue; }
    const key = dedupeKey(parsed);
    if (seen.has(key)) { await emit(i, { ...record(rows[i], parsed, classifyOffline(parsed), { status: 'duplicate', verification: 'DUPLICATE', checkedAt: now() }), duplicateOfIndex: seen.get(key) }); continue; }
    seen.set(key, i);
    if (!byDomain.has(parsed.domain)) byDomain.set(parsed.domain, []);
    byDomain.get(parsed.domain).push({ i, parsed, offline: classifyOffline(parsed) });
  }

  async function handleDomain(domain, items) {
    const mail = await lookupMail(domain);
    const mx = { status: mail.status, host: mail.hosts?.[0]?.exchange ?? null, witnesses: mail.witnesses ?? [] };
    const all = async fields => { for (const it of items) await emit(it.i, record(rows[it.i], it.parsed, it.offline, { ...fields, mx, checkedAt: now() })); };
    if ([MAIL_STATUS.NXDOMAIN, MAIL_STATUS.NO_MAIL, MAIL_STATUS.NULL_MX].includes(mail.status)) return all({ status: 'undeliverable', verification: 'DOMAIN_CANNOT_RECEIVE', reasons: [`DNS_${mail.status}`] });
    if (mail.status === MAIL_STATUS.DNS_ERROR) return all({ status: 'unknown', verification: 'DNS_UNRESOLVED', reasons: [String(mail.error ?? 'DNS_ERROR')] });
    if (!smtpAvailable) return all({ status: 'unknown', verification: 'SMTP_UNAVAILABLE', reasons: ['PORT_25_NOT_REACHABLE_FROM_THIS_RUN'] });

    let catchAll = null; // null unknown, true/false once a random address has been answered
    let catchAllReply = null;
    for (let start = 0; start < items.length; start += batchSize) {
      const batch = items.slice(start, start + batchSize);
      const random = `${randomLocal()}@${domain}`;
      const recipients = [...batch.map(b => b.parsed.normalized), ...(catchAll === null ? [random] : [])];
      let session = null;
      for (const host of mail.hosts.slice(0, maxHosts)) {
        session = await probe({ host: host.exchange, port: smtpPort, heloName, mailFrom, recipients, timeoutMs });
        if (session.replies.size) break;
      }
      const randomReply = session?.replies.get(random);
      if (randomReply) { catchAllReply = randomReply; if (randomReply.verdict === RCPT.ACCEPTED) catchAll = true; else if (randomReply.verdict === RCPT.REJECTED_MAILBOX) catchAll = false; }
      for (const it of batch) {
        const reply = session?.replies.get(it.parsed.normalized);
        const base = { mx: { ...mx, host: session?.host ?? mx.host }, smtp: smtpEvidence(reply), catchAllProbe: smtpEvidence(catchAllReply), checkedAt: now() };
        let fields;
        if (!reply) fields = { status: 'unknown', verification: 'SMTP_NO_ANSWER', reasons: [String(session?.error ?? 'NO_REPLY')] };
        else if (reply.verdict === RCPT.REJECTED_MAILBOX) fields = { status: 'undeliverable', verification: 'MAILBOX_REJECTED' };
        else if (reply.verdict === RCPT.MAILBOX_FULL) fields = { status: 'risky', verification: 'MAILBOX_FULL' };
        else if (reply.verdict === RCPT.ACCEPTED && catchAll === false) fields = { status: 'deliverable', verification: 'MAILBOX_CONFIRMED' };
        else if (reply.verdict === RCPT.ACCEPTED && catchAll === true) fields = { status: 'risky', verification: 'CATCH_ALL_DOMAIN' };
        else if (reply.verdict === RCPT.ACCEPTED) fields = { status: 'unknown', verification: 'ACCEPTED_UNCONFIRMED', reasons: ['CATCH_ALL_PROBE_INCONCLUSIVE'] };
        else fields = { status: 'unknown', verification: `SMTP_${reply.verdict}` };
        await emit(it.i, record(rows[it.i], it.parsed, it.offline, { ...base, ...fields }));
      }
    }
  }

  const queue = [...byDomain.entries()]; let stop = false;
  const worker = async () => { while (queue.length && !stop) { const [domain, items] = queue.shift(); try { await handleDomain(domain, items); } catch (e) { if (e?.code === 'STOP') { stop = true; return; } throw e; } } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(domainConcurrency, queue.length)) }, worker));
  return { records: out, stopped: stop };
}

export function summarize(records) {
  const done = records.filter(Boolean); const count = k => done.filter(r => r.status === k).length;
  const unique = done.filter(r => r.status !== 'duplicate');
  const billable = done.filter(r => r.definitive).length;
  const pct = n => (unique.length ? Math.round((1000 * n) / unique.length) / 10 : 0);
  return {
    verifier: VERIFIER_VERSION, rowsIn: records.length, rowsProcessed: done.length, uniqueAddresses: unique.length, duplicates: count('duplicate'),
    deliverable: count('deliverable'), undeliverable: count('undeliverable'), risky: count('risky'), unknown: count('unknown'),
    billableResults: billable, freeResults: done.length - billable,
    percentOfUnique: { deliverable: pct(count('deliverable')), undeliverable: pct(count('undeliverable')), risky: pct(count('risky')), unknown: pct(count('unknown')) },
    byVerification: Object.fromEntries([...new Set(done.map(r => r.verification))].sort().map(v => [v, done.filter(r => r.verification === v).length])),
    note: 'Counts describe this list at check time. "unknown" and "risky" are not predictions of bounce.'
  };
}
