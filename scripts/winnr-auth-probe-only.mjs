#!/usr/bin/env node
// Authentication-only probe for a Winnr credential export. No encryption key, no database, no Winnr API token.
// For each mailbox in the export:
//   SMTP: TLS to port 465, EHLO, AUTH, NOOP, QUIT. Never MAIL FROM, RCPT TO or DATA.
//   IMAP: TLS to port 993, LOGIN, LOGOUT. Never SELECT, SEARCH, FETCH or STORE.
//
// Output discipline (public CI logs and artifacts are readable by anyone):
//   - The public receipt is built from an explicit allowlist: counts, fixed class names and reason codes only.
//     It passes an independent tripwire (src/winnr-public-artifact-guard.mjs) before anything is written.
//   - Account-level classes go to a separate private detail file, which is never uploaded. It holds no address,
//     no domain name, and no password.
//   - No exception message is read or printed. A failure is reduced to a fixed class code.
//   - The expected inventory is refused unless it matches exactly. The probe makes no connection before the gate passes.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUberSmtpSubmissionTransport } from '../src/ubersmtp-submission-adapter.mjs';
import { probeImapLoginWithCredential } from '../src/winnr-imap-login-probe.mjs';
import { winnrCredentialRows } from '../src/uberwinnr-credential-import.mjs';
import { boundedMap, SMTP_NETWORK_CLASSES } from '../src/winnr-fleet-control-plane.mjs';
import { parseExpectedInventory, gateCsvInventory, WINNR_STARTUP_MAILBOX_COUNT, WINNR_STARTUP_DOMAIN_COUNT, WINNR_STARTUP_ROLES } from '../src/winnr-inventory-gate.mjs';
import { assertPublicSafe, sanitizedErrorCode } from '../src/winnr-public-artifact-guard.mjs';

export const WINNR_AUTH_PROBE_ONLY_VERSION = 'uberbond.winnr-auth-probe-only.v2';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAP_NETWORK = new Set(['TRANSPORT_UNREACHABLE']);

export const SMTP_CLASSES = Object.freeze(['AUTH_CONFIRMED', 'AUTH_REJECTED', 'NETWORK_BLOCKED', 'TLS_FAILED', 'FAILED_UNCLASSIFIED', 'REFUSED_BY_TRANSPORT', 'PROBE_EXCEPTION']);
export const IMAP_CLASSES = Object.freeze(['LOGIN_ACCEPTED', 'AUTH_REJECTED', 'NETWORK_BLOCKED', 'TLS_FAILED', 'FAILED_UNCLASSIFIED', 'PROBE_EXCEPTION']);

// Whole-file row checks that the inventory gate does not already cover: transport requirements and the username rule.
export function validateProbeRows(rows = []) {
  const reasons = [];
  const normalized = [];
  for (const raw of rows) {
    const email = String(raw.from_email || '').trim().toLowerCase();
    const domain = String(email.split('@')[1] || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { reasons.push('invalid-address'); continue; }
    if (String(raw.smtp_port) !== '465') reasons.push('non-implicit-tls-smtp-port-refused');
    if (String(raw.imap_port) !== '993') reasons.push('non-implicit-tls-imap-port-refused');
    if (!raw.password || !raw.imap_password) reasons.push('credential-missing');
    if (!raw.smtp_host || !raw.imap_host) reasons.push('host-missing');
    normalized.push({ email, domain, role: email.split('@')[0], smtpHost: String(raw.smtp_host || ''), imapHost: String(raw.imap_host || ''), username: email, password: String(raw.password || ''), imapPassword: String(raw.imap_password || '') });
  }
  const unique = [...new Set(reasons)];
  return unique.length ? { ok: false, reasonCodes: unique, rows: [] } : { ok: true, reasonCodes: [], rows: normalized };
}

function smtpClassOf(result) {
  if (result?.confirmed === true) return 'AUTH_CONFIRMED';
  const cls = String(result?.errorClass || '');
  if (cls === 'AUTH_REJECTED') return 'AUTH_REJECTED';
  if (SMTP_NETWORK_CLASSES.has(cls)) return 'NETWORK_BLOCKED';
  if (cls === 'TLS_FAILED' || cls === 'TLS_VERIFY_FAILED') return 'TLS_FAILED';
  return 'FAILED_UNCLASSIFIED';
}

function imapClassOf(result) {
  if (result?.loginAccepted === true) return 'LOGIN_ACCEPTED';
  if (result?.classification === 'AUTH_REJECTED') return 'AUTH_REJECTED';
  if (IMAP_NETWORK.has(result?.classification)) return 'NETWORK_BLOCKED';
  if (result?.classification === 'TLS_OR_GREETING_FAILED') return 'TLS_FAILED';
  return 'FAILED_UNCLASSIFIED';
}

function countBy(items, pick, vocabulary) {
  const out = Object.fromEntries(vocabulary.map(k => [k, 0]));
  for (const item of items) { const k = pick(item); out[k] = (out[k] || 0) + 1; }
  return out;
}

// Public receipt key names avoid the artifact guard's identity words (address, mailbox, authorization, ...). The guard
// refuses such keys even when their value is harmless, so the approval reference is published as approvalRef.
function refusal(status, reasonCodes, approvalRef = '') {
  return {
    version: WINNR_AUTH_PROBE_ONLY_VERSION,
    status,
    ok: false,
    reasonCodes: [...new Set(reasonCodes)],
    approvalRef: String(approvalRef || '').slice(0, 200),
    probed: 0,
    messagesSent: 0,
    mailFromIssued: false,
    recipientsIssued: 0,
    dataIssued: false,
    credentialsPersisted: false,
    credentialsLogged: false,
    identityFieldsPublished: false
  };
}

// Returns { publicReceipt, privateDetail }. publicReceipt is safe to publish. privateDetail must never be uploaded.
export async function runAuthProbeOnly({
  csvText = '',
  ownerAuthorizationRef = '',
  expectedInventoryText = '',
  concurrency = 4,
  timeoutMs = 15000,
  smtpTransportFactory = createUberSmtpSubmissionTransport,
  imapProbe = probeImapLoginWithCredential,
  now = new Date()
} = {}) {
  if (!String(ownerAuthorizationRef || '').trim()) {
    return { publicReceipt: refusal('REFUSED', ['owner-authorization-ref-required']), privateDetail: null };
  }
  const expected = parseExpectedInventory(expectedInventoryText);
  if (!expected.ok) {
    return { publicReceipt: refusal('REFUSED_BEFORE_ANY_CONNECTION', expected.reasonCodes, ownerAuthorizationRef), privateDetail: null };
  }
  let rows;
  try {
    rows = winnrCredentialRows(csvText);
  } catch {
    return { publicReceipt: refusal('REFUSED_BEFORE_ANY_CONNECTION', ['credential-export-unreadable'], ownerAuthorizationRef), privateDetail: null };
  }
  const gate = gateCsvInventory({ expected, rows });
  if (!gate.ok) {
    return { publicReceipt: refusal('REFUSED_BEFORE_ANY_CONNECTION', gate.reasonCodes, ownerAuthorizationRef), privateDetail: null };
  }
  const rowChecks = validateProbeRows(rows);
  if (!rowChecks.ok) {
    return { publicReceipt: refusal('REFUSED_BEFORE_ANY_CONNECTION', rowChecks.reasonCodes, ownerAuthorizationRef), privateDetail: null };
  }

  const domainOrder = new Map(expected.startupDomains.map((d, i) => [d, i]));
  const probed = await boundedMap(rowChecks.rows, concurrency, async row => {
    try {
      let smtp;
      const transport = smtpTransportFactory({
        host: row.smtpHost, port: 465, secure: true, username: row.username, password: row.password,
        connectTimeoutMs: timeoutMs, commandTimeoutMs: timeoutMs * 2,
        authorized: true, termsCompatible: true, evidenceRef: ownerAuthorizationRef
      });
      if (!transport?.ok || typeof transport.probe !== 'function') {
        smtp = { cls: 'REFUSED_BY_TRANSPORT', accepted: false, messagesSent: 0 };
      } else {
        const r = await transport.probe();
        smtp = { cls: smtpClassOf(r), accepted: r?.confirmed === true, messagesSent: Number(r?.messagesSent) || 0 };
      }
      const imap = await imapProbe({ host: row.imapHost, port: 993, secure: true, username: row.username, password: row.imapPassword, timeoutMs });
      return { role: row.role, domainIndex: domainOrder.get(row.domain) ?? -1, smtpClass: smtp.cls, smtpAccepted: smtp.accepted, smtpMessagesSent: smtp.messagesSent, imapClass: imapClassOf(imap), imapAccepted: imap.loginAccepted === true, exception: false };
    } catch (error) {
      // The exception object is not inspected beyond a fixed code, and nothing from it is recorded.
      sanitizedErrorCode(error);
      return { role: row.role, domainIndex: domainOrder.get(row.domain) ?? -1, smtpClass: 'PROBE_EXCEPTION', smtpAccepted: false, smtpMessagesSent: 0, imapClass: 'PROBE_EXCEPTION', imapAccepted: false, exception: true };
    }
  });

  const rowsOut = probed.map((r, i) => (r.ok ? r.value : { role: rowChecks.rows[i].role, domainIndex: -1, smtpClass: 'PROBE_EXCEPTION', smtpAccepted: false, smtpMessagesSent: 0, imapClass: 'PROBE_EXCEPTION', imapAccepted: false, exception: true }));
  const smtpAccepted = rowsOut.filter(r => r.smtpAccepted).length;
  const imapAccepted = rowsOut.filter(r => r.imapAccepted).length;
  const exceptions = rowsOut.filter(r => r.exception).length;
  const complete = rowsOut.length === WINNR_STARTUP_MAILBOX_COUNT && gate.ok;
  const allAccepted = complete && smtpAccepted === WINNR_STARTUP_MAILBOX_COUNT && imapAccepted === WINNR_STARTUP_MAILBOX_COUNT && exceptions === 0;
  const status = allAccepted ? 'AUTHENTICATED_ALL' : 'NOT_ALL_AUTHENTICATED';

  const publicReceipt = {
    version: WINNR_AUTH_PROBE_ONLY_VERSION,
    status,
    ok: allAccepted,
    checkedAt: now.toISOString(),
    reasonCodes: [],
    approvalRef: String(ownerAuthorizationRef).slice(0, 200),
    inventory: { startupDomains: WINNR_STARTUP_DOMAIN_COUNT, rolesPerDomain: WINNR_STARTUP_ROLES.length, expectedAccounts: WINNR_STARTUP_MAILBOX_COUNT, gatePassed: gate.ok, pilotDomainsExcluded: expected.pilotDomains.length },
    probed: rowsOut.length,
    probeExceptions: exceptions,
    smtp: { accepted: smtpAccepted, classCounts: countBy(rowsOut, r => r.smtpClass, SMTP_CLASSES) },
    imap: { accepted: imapAccepted, classCounts: countBy(rowsOut, r => r.imapClass, IMAP_CLASSES) },
    networkBlocked: { smtp: rowsOut.filter(r => r.smtpClass === 'NETWORK_BLOCKED').length, imap: rowsOut.filter(r => r.imapClass === 'NETWORK_BLOCKED').length },
    messagesSent: rowsOut.reduce((sum, r) => sum + r.smtpMessagesSent, 0),
    mailFromIssued: false,
    recipientsIssued: 0,
    dataIssued: false,
    credentialsPersisted: false,
    credentialsLogged: false,
    identityFieldsPublished: false,
    truthBoundary: 'Authentication acceptance only: the server accepted the AUTH or LOGIN command. Not deliverability, reputation, placement, or permission to contact anyone. Accounts stay paused until a separate eligibility decision.'
  };
  const privateDetail = {
    version: WINNR_AUTH_PROBE_ONLY_VERSION,
    note: 'PRIVATE. Never upload. Contains roles and domain positions only; no address, domain name or password.',
    rows: rowsOut.map(r => ({ role: r.role, domainIndex: r.domainIndex, smtpClass: r.smtpClass, imapClass: r.imapClass, smtpAccepted: r.smtpAccepted, imapAccepted: r.imapAccepted }))
  };
  return { publicReceipt, privateDetail };
}

// Overwrites then removes a file, best effort. This is not secure erasure on virtualised or journaled storage.
export function shredFile(file) {
  try {
    const size = fs.statSync(file).size;
    fs.writeFileSync(file, crypto.randomBytes(Math.max(size, 1)));
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function isInsideRepo(target) {
  const resolved = path.resolve(target);
  return resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    args[key] = rest.join('=') || true;
  }
  const csvPath = String(args.csv || '');
  const detailPath = String(args['detail-out'] || '');
  const receiptPath = String(args['receipt-out'] || '');
  const envName = String(args['expected-inventory-env'] || 'WINNR_EXPECTED_INVENTORY_JSON');
  let exitCode = 1;

  const writeReceipt = receipt => {
    if (receiptPath) fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    const summary = { status: receipt.status, ok: receipt.ok === true, reasonCodes: receipt.reasonCodes || [], probed: receipt.probed ?? 0, smtpAccepted: receipt.smtp?.accepted ?? 0, imapAccepted: receipt.imap?.accepted ?? 0 };
    assertPublicSafe(summary);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  };

  try {
    if (!csvPath) throw Object.assign(new Error('missing'), { code: 'CSV_ARGUMENT_MISSING' });
    if (isInsideRepo(csvPath)) throw Object.assign(new Error('x'), { code: 'CSV_INSIDE_REPOSITORY' });
    if (detailPath && isInsideRepo(detailPath)) throw Object.assign(new Error('x'), { code: 'DETAIL_PATH_MUST_BE_PRIVATE' });
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const { publicReceipt, privateDetail } = await runAuthProbeOnly({
      csvText,
      ownerAuthorizationRef: String(args['owner-ref'] || ''),
      expectedInventoryText: process.env[envName] || '',
      concurrency: Number(args.concurrency) || 4,
      timeoutMs: Number(args['timeout-ms']) || 15000
    });
    let publicOut = publicReceipt;
    try {
      assertPublicSafe(publicReceipt);
    } catch (error) {
      publicOut = { version: WINNR_AUTH_PROBE_ONLY_VERSION, status: 'PUBLIC_ARTIFACT_GUARD_REFUSED', ok: false, reasonCodes: [sanitizedErrorCode(error)] };
    }
    if (detailPath && privateDetail) fs.writeFileSync(detailPath, `${JSON.stringify(privateDetail)}\n`, { mode: 0o600 });
    writeReceipt(publicOut);
    exitCode = publicOut.ok === true ? 0 : 3;
  } catch (error) {
    const code = sanitizedErrorCode(error);
    try { writeReceipt({ version: WINNR_AUTH_PROBE_ONLY_VERSION, status: 'CRASHED', ok: false, reasonCodes: [code] }); } catch { /* receipt path unwritable */ }
    process.stderr.write(`winnr-auth-probe-only: ${code}\n`);
  } finally {
    if (args.shred && csvPath) {
      try { shredFile(csvPath); } catch { process.stderr.write('winnr-auth-probe-only: CREDENTIAL_FILE_CLEANUP_FAILED\n'); exitCode = 4; }
    }
    process.exitCode = exitCode;
  }
}
