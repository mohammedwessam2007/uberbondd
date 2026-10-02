// Generic, read-only prospect contact-history compiler (prospect preflight).
//
// It answers, for one exact recipient email and its exact domain, whether the
// production ledgers already hold anything that must stop a cold first touch.
//
// Design rules (all of them fail closed):
//   - It never writes, never calls a provider, never contacts anyone.
//   - A collection that could not be read, or that returned something that is
//     not a list, is CHECK_FAILED. It is never treated as "no rows".
//   - A clean answer needs EVERY required collection read successfully.
//   - Aggregate endpoints are not accepted as exact absence: input must be raw
//     rows of the named collection, supplied through `reads`.
//   - Suppression matching is the UNION of the two matchers the repository
//     already ships (exact email / exact domain / "@domain" suffix), so the
//     stricter semantics always win.
//   - It returns a minimal typed result: no message bodies, no unrelated rows,
//     no secrets.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const CONTACT_HISTORY_SCHEMA = 'uberbond.prospect-contact-history.v1';
// Provenance label an intake result carries when its contact history came from a
// digest-bound ledger read instead of a hand-set attestation.
export const CONTACT_HISTORY_RUNTIME_PROVENANCE = 'RUNTIME_RECEIPT';

export const REQUIRED_COLLECTIONS = Object.freeze([
  'suppressions', 'prospects', 'outboundReservations', 'outboundEvents', 'replies'
]);
// Read when available. They can only add blocking findings; their absence does
// not weaken a clean verdict because the required collections already cover
// the same recipient through other keys.
export const SUPPLEMENTARY_COLLECTIONS = Object.freeze(['messages', 'providerEvents']);

export const RESULT_STATUS = Object.freeze({
  CLEAN: 'CLEAN',
  HIT: 'HIT',
  CHECK_FAILED: 'CHECK_FAILED',
  UNKNOWN: 'UNKNOWN'
});

// A prospect record in one of these states has never been contacted by us.
// Every other value (sent, replied, send-uncertain, suppressed, bounce,
// complaint, anything new or unrecognised) blocks.
const BENIGN_PROSPECT_STATUSES = new Set([
  '', 'new', 'imported', 'discovered', 'crawling', 'saved', 'ready', 'research-complete', 'rejected'
]);
const OPEN_RESERVATION_STATUSES = new Set(['reserved', 'dispatching', 'sent', 'uncertain']);

const emailOf = value => {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return match ? match[0] : '';
};
export const domainOfEmail = email => {
  const at = String(email || '').lastIndexOf('@');
  return at < 0 ? '' : String(email).slice(at + 1).trim().toLowerCase().replace(/^www\./, '');
};
const domainOfSite = site => {
  const raw = String(site || '').trim().toLowerCase();
  if (!raw) return '';
  try { return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./, ''); }
  catch { return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
};

export function suppressionMatches(row, email, domain) {
  const value = String(row?.value || '').trim().toLowerCase();
  if (!value) return false;
  return value === email || value === domain || email.endsWith(`@${value.replace(/^@/, '')}`);
}

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizeRead(read) {
  if (!read || typeof read !== 'object') return { ok: false, error: 'READ_MISSING', rows: [] };
  if (read.ok !== true) return { ok: false, error: String(read.error || 'READ_FAILED').slice(0, 120), rows: [] };
  if (!Array.isArray(read.rows)) return { ok: false, error: 'READ_NOT_A_LIST', rows: [] };
  return { ok: true, error: null, rows: read.rows };
}

/**
 * @param {object} input
 * @param {string} input.email   exact recipient email as published
 * @param {string} [input.domain] exact domain; must equal the email domain
 * @param {Record<string,{ok:boolean,rows?:object[],error?:string}>} input.reads raw per-collection reads
 * @param {Date|string} [input.now]
 */
export function compileContactHistory({ email, domain, reads = {}, now = new Date() } = {}) {
  const exactEmail = emailOf(email);
  const emailDomain = domainOfEmail(exactEmail);
  const exactDomain = String(domain || emailDomain || '').trim().toLowerCase().replace(/^www\./, '');
  const checkedAt = new Date(now).toISOString();
  const base = {
    schema: CONTACT_HISTORY_SCHEMA,
    checkedAt,
    emailChecked: exactEmail,
    domainChecked: exactDomain,
    readOnly: true,
    externalEffects: 0,
    sendAuthority: false
  };

  if (!exactEmail || !exactDomain || exactDomain !== emailDomain || String(email || '').trim().toLowerCase() !== exactEmail) {
    return {
      ...base,
      status: RESULT_STATUS.CHECK_FAILED,
      overallContactHistoryHit: null,
      reasonCodes: ['invalid-or-mismatched-email-domain-input'],
      checks: {},
      findings: []
    };
  }

  const checks = {};
  const findings = [];
  const reasonCodes = [];
  const normalized = {};
  for (const name of [...REQUIRED_COLLECTIONS, ...SUPPLEMENTARY_COLLECTIONS]) {
    normalized[name] = normalizeRead(reads[name]);
  }
  for (const name of REQUIRED_COLLECTIONS) {
    const read = normalized[name];
    checks[name] = { required: true, read: read.ok, rowsExamined: read.rows.length, error: read.error };
    if (!read.ok) reasonCodes.push(`required-collection-unreadable:${name}`);
  }
  for (const name of SUPPLEMENTARY_COLLECTIONS) {
    const read = normalized[name];
    checks[name] = { required: false, read: read.ok, rowsExamined: read.rows.length, error: read.error };
  }
  const failed = REQUIRED_COLLECTIONS.filter(name => !normalized[name].ok);

  // Collect prospect ids tied to this recipient or domain so replies and sent
  // messages (which carry a prospect id, not an email) can be linked.
  const linkedProspectIds = new Set();
  for (const row of normalized.prospects.rows) {
    const rowEmail = emailOf(row?.contact?.email);
    const rowDomain = domainOfSite(row?.website || row?.domain);
    const sameEmail = rowEmail === exactEmail;
    const sameDomain = rowEmail ? domainOfEmail(rowEmail) === exactDomain || rowDomain === exactDomain : rowDomain === exactDomain;
    if (!sameEmail && !sameDomain) continue;
    if (row?.id) linkedProspectIds.add(String(row.id));
    const status = String(row?.status || '').trim().toLowerCase();
    const blocking = !BENIGN_PROSPECT_STATUSES.has(status);
    findings.push({
      collection: 'prospects', match: sameEmail ? 'EXACT_EMAIL' : 'SAME_DOMAIN',
      severity: blocking ? 'BLOCKING' : 'INFORMATIONAL',
      detail: { id: row?.id || null, status, createdAt: row?.createdAt || null }
    });
  }

  for (const row of normalized.suppressions.rows) {
    if (!suppressionMatches(row, exactEmail, exactDomain)) continue;
    findings.push({
      collection: 'suppressions', match: String(row.value || '').toLowerCase() === exactEmail ? 'EXACT_EMAIL' : 'DOMAIN_OR_SUFFIX',
      severity: 'BLOCKING',
      detail: { value: String(row.value || '').toLowerCase(), reason: String(row.reason || '').slice(0, 80), createdAt: row.createdAt || null }
    });
  }

  for (const row of normalized.outboundReservations.rows) {
    const rowEmail = emailOf(row?.recipientEmail);
    const sameEmail = rowEmail === exactEmail;
    const sameDomain = rowEmail && domainOfEmail(rowEmail) === exactDomain;
    const linked = row?.prospectId && linkedProspectIds.has(String(row.prospectId));
    if (!sameEmail && !sameDomain && !linked) continue;
    const status = String(row?.status || '').toLowerCase();
    findings.push({
      collection: 'outboundReservations', match: sameEmail ? 'EXACT_EMAIL' : (sameDomain ? 'SAME_DOMAIN' : 'LINKED_PROSPECT'),
      // Every reservation, whatever its state, is a prior-contact attempt or
      // an unresolved effect; cancelled ones are still history worth showing.
      severity: OPEN_RESERVATION_STATUSES.has(status) || !status ? 'BLOCKING' : 'INFORMATIONAL',
      detail: { id: row?.id || null, status, kind: row?.kind || null, followup: Number(row?.followup || 0), reservedAt: row?.reservedAt || null }
    });
  }

  for (const row of normalized.outboundEvents.rows) {
    const rowEmail = emailOf(row?.recipientEmail);
    const sameEmail = rowEmail === exactEmail;
    const sameDomain = rowEmail && domainOfEmail(rowEmail) === exactDomain;
    const linked = row?.prospectId && linkedProspectIds.has(String(row.prospectId));
    if (!sameEmail && !sameDomain && !linked) continue;
    findings.push({
      collection: 'outboundEvents', match: sameEmail ? 'EXACT_EMAIL' : (sameDomain ? 'SAME_DOMAIN' : 'LINKED_PROSPECT'),
      severity: 'BLOCKING',
      detail: { id: row?.id || null, eventType: row?.eventType || null, occurredAt: row?.occurredAt || null }
    });
  }

  for (const row of normalized.replies.rows) {
    const fromEmail = emailOf(row?.from);
    const sameEmail = fromEmail === exactEmail;
    const sameDomain = fromEmail && domainOfEmail(fromEmail) === exactDomain;
    const linked = row?.prospectId && linkedProspectIds.has(String(row.prospectId));
    if (!sameEmail && !sameDomain && !linked) continue;
    findings.push({
      collection: 'replies', match: sameEmail ? 'EXACT_EMAIL' : (sameDomain ? 'SAME_DOMAIN' : 'LINKED_PROSPECT'),
      severity: 'BLOCKING',
      detail: { id: row?.id || null, label: row?.classification?.label || null, receivedAt: row?.receivedAt || null }
    });
  }

  if (normalized.messages.ok) {
    for (const row of normalized.messages.rows) {
      if (!(row?.prospectId && linkedProspectIds.has(String(row.prospectId)))) continue;
      findings.push({ collection: 'messages', match: 'LINKED_PROSPECT', severity: 'BLOCKING', detail: { id: row?.id || null, kind: row?.kind || null, sentAt: row?.sentAt || null } });
    }
  }
  if (normalized.providerEvents.ok) {
    for (const row of normalized.providerEvents.rows) {
      const rowEmail = emailOf(row?.leadEmail);
      if (rowEmail !== exactEmail && !(rowEmail && domainOfEmail(rowEmail) === exactDomain)) continue;
      findings.push({ collection: 'providerEvents', match: rowEmail === exactEmail ? 'EXACT_EMAIL' : 'SAME_DOMAIN', severity: 'BLOCKING', detail: { id: row?.id || null, eventType: row?.eventType || null } });
    }
  }

  const blocking = findings.filter(item => item.severity === 'BLOCKING');
  let status;
  let overallContactHistoryHit;
  if (blocking.length) {
    // A confirmed hit is a hit even when other reads failed.
    status = RESULT_STATUS.HIT;
    overallContactHistoryHit = true;
    reasonCodes.push(...new Set(blocking.map(item => `contact-history-hit:${item.collection}:${item.match}`)));
  } else if (failed.length) {
    status = RESULT_STATUS.CHECK_FAILED;
    overallContactHistoryHit = null;
  } else {
    status = RESULT_STATUS.CLEAN;
    overallContactHistoryHit = false;
  }
  const result = { ...base, status, overallContactHistoryHit, reasonCodes, checks, findings };
  return { ...result, receiptDigest: digest({ ...result, receiptDigest: undefined }) };
}

/**
 * Read the required collections from a store. Every list() failure is captured
 * as an unread collection, never as an empty one. Strictly read-only: only
 * store.list is ever called.
 */
export async function readContactHistoryReads(store) {
  const reads = {};
  for (const name of [...REQUIRED_COLLECTIONS, ...SUPPLEMENTARY_COLLECTIONS]) {
    try {
      const rows = await store.list(name);
      reads[name] = Array.isArray(rows) ? { ok: true, rows } : { ok: false, error: 'READ_NOT_A_LIST' };
    } catch (error) {
      reads[name] = { ok: false, error: `READ_FAILED:${String(error?.code || error?.name || 'error').slice(0, 40)}` };
    }
  }
  return reads;
}

export async function checkContactHistory({ store, email, domain, now = new Date() } = {}) {
  if (!store || typeof store.list !== 'function') {
    return compileContactHistory({ email, domain, reads: {}, now });
  }
  return compileContactHistory({ email, domain, reads: await readContactHistoryReads(store), now });
}

/**
 * Receipt shape the prospect verifier consumes. A receipt is only usable when
 * it is exactly for the recipient being verified and is fresh.
 */
export function contactHistoryReceiptUsable(receipt, { email, domain, now = new Date(), maxAgeMs = 15 * 60 * 1000 } = {}) {
  const reasons = [];
  if (!receipt || receipt.schema !== CONTACT_HISTORY_SCHEMA) return { usable: false, reasons: ['contact-history-receipt-missing-or-wrong-schema'] };
  if (receipt.status !== RESULT_STATUS.CLEAN && receipt.status !== RESULT_STATUS.HIT) reasons.push(`contact-history-receipt-status-${String(receipt.status || 'unknown').toLowerCase()}`);
  if (String(receipt.emailChecked || '') !== String(email || '').trim().toLowerCase()) reasons.push('contact-history-receipt-email-mismatch');
  if (String(receipt.domainChecked || '') !== String(domain || '').trim().toLowerCase()) reasons.push('contact-history-receipt-domain-mismatch');
  const age = new Date(now).getTime() - new Date(receipt.checkedAt || 0).getTime();
  if (!Number.isFinite(age) || age < -60_000 || age > maxAgeMs) reasons.push('contact-history-receipt-stale-or-future');
  if (receipt.readOnly !== true) reasons.push('contact-history-receipt-not-read-only');
  const { receiptDigest, signature, ...rest } = receipt;
  if (receiptDigest !== digest({ ...rest, receiptDigest: undefined })) reasons.push('contact-history-receipt-digest-mismatch');
  return { usable: reasons.length === 0, reasons };
}

/**
 * Optional authenticity layer. A receipt computed live inside the process never
 * needs this; a receipt that crosses a boundary (stored, pasted, relayed) must
 * carry an HMAC over its digest from the server secret, otherwise a person or
 * another session could hand the pipeline a fabricated "clean".
 */
// The deployment secret is never used directly as an HMAC key: a purpose-bound
// subkey is derived so the same secret can also protect other things.
const signingKey = secret => createHmac('sha256', String(secret)).update('uberbond.prospect-contact-history.signing-key.v1').digest();

export function signContactHistoryReceipt(receipt, secret) {
  if (!secret || String(secret).length < 16) throw new TypeError('A signing secret of at least 16 characters is required');
  return { ...receipt, signature: createHmac('sha256', signingKey(secret)).update(`${CONTACT_HISTORY_SCHEMA}:${receipt.receiptDigest}`).digest('hex') };
}

export function verifyContactHistorySignature(receipt, secret) {
  if (!receipt?.signature || !secret) return false;
  const expected = createHmac('sha256', signingKey(secret)).update(`${CONTACT_HISTORY_SCHEMA}:${receipt.receiptDigest}`).digest();
  let given;
  try { given = Buffer.from(String(receipt.signature), 'hex'); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
