#!/usr/bin/env node
// Authentication-only probe for a Winnr credential export. It needs no encryption key, no database and no Winnr API
// token. It takes a CSV that was already exported, checks every row, then for each mailbox:
//   SMTP: TLS to port 465, EHLO, AUTH, NOOP, QUIT. Never MAIL FROM, RCPT TO or DATA.
//   IMAP: TLS to port 993, LOGIN, LOGOUT. Never SELECT, SEARCH, FETCH or STORE.
// It writes a receipt with digests and classes only: no addresses, no passwords, no hostnames.
//
// Usage:
//   node scripts/winnr-auth-probe-only.mjs --csv=<file outside repo> --owner-ref=<authorization reference> \
//     --exclude-domain=<pilot domain> [--exclude-domain=...] --receipt-out=<file> [--concurrency=4] \
//     [--timeout-ms=15000] --shred
// --shred overwrites the CSV with random bytes and deletes it when the run ends, whether or not every probe succeeded.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUberSmtpSubmissionTransport } from '../src/ubersmtp-submission-adapter.mjs';
import { probeImapLoginWithCredential } from '../src/winnr-imap-login-probe.mjs';
import { winnrCredentialRows } from '../src/uberwinnr-credential-import.mjs';
import { boundedMap, findDuplicateAddresses, SMTP_NETWORK_CLASSES } from '../src/winnr-fleet-control-plane.mjs';

export const WINNR_AUTH_PROBE_ONLY_VERSION = 'uberbond.winnr-auth-probe-only.v1';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const digest16 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
const lower = value => String(value ?? '').trim().toLowerCase();
const IMAP_NETWORK = new Set(['TRANSPORT_UNREACHABLE']);

// Whole-file validation. Any refusal stops the run before the first connection.
export function validateProbeRows({ rows = [], excludeDomains = [] } = {}) {
  const reasons = [];
  const excluded = new Set(excludeDomains.map(lower));
  const normalized = [];
  if (rows.length === 0) reasons.push('no-rows');
  for (const raw of rows) {
    const email = lower(raw.from_email);
    const domain = String(email.split('@')[1] || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { reasons.push('invalid-address'); continue; }
    if (excluded.has(domain)) reasons.push('excluded-domain-present');
    if (lower(raw.domain) !== domain) reasons.push('domain-column-address-mismatch');
    if (String(raw.smtp_port) !== '465') reasons.push('non-implicit-tls-smtp-port-refused');
    if (String(raw.imap_port) !== '993') reasons.push('non-implicit-tls-imap-port-refused');
    if (lower(raw.user_name) !== email) reasons.push('username-not-address');
    if (!raw.password || !raw.imap_password) reasons.push('credential-missing');
    if (!raw.smtp_host || !raw.imap_host) reasons.push('host-missing');
    normalized.push({ email, domain, smtpHost: String(raw.smtp_host || ''), imapHost: String(raw.imap_host || ''), username: email, password: String(raw.password || ''), imapPassword: String(raw.imap_password || '') });
  }
  if (findDuplicateAddresses(normalized).length) reasons.push('duplicate-mailbox-address');
  const unique = [...new Set(reasons)];
  return unique.length ? { ok: false, reasonCodes: unique, rows: [] } : { ok: true, reasonCodes: [], rows: normalized };
}

function smtpClassOf(result) {
  if (result?.confirmed === true) return 'AUTH_CONFIRMED';
  const cls = String(result?.errorClass || 'UNCONFIRMED');
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

function countBy(items, pick) {
  return items.reduce((acc, item) => { const k = pick(item); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
}

export async function runAuthProbeOnly({
  csvText = '',
  ownerAuthorizationRef = '',
  excludeDomains = [],
  concurrency = 4,
  timeoutMs = 15000,
  smtpTransportFactory = createUberSmtpSubmissionTransport,
  imapProbe = probeImapLoginWithCredential,
  now = new Date()
} = {}) {
  const base = { version: WINNR_AUTH_PROBE_ONLY_VERSION, checkedAt: now.toISOString(), messagesSent: 0, mailFromIssued: false, recipientsIssued: 0, dataIssued: false, credentialsPersisted: false, credentialsLogged: false };
  if (!String(ownerAuthorizationRef || '').trim()) return Object.freeze({ ...base, ok: false, status: 'REFUSED', reasonCodes: ['owner-authorization-ref-required'], accountCount: 0 });

  const validated = validateProbeRows({ rows: winnrCredentialRows(csvText), excludeDomains });
  if (!validated.ok) return Object.freeze({ ...base, ok: false, status: 'REFUSED_BEFORE_ANY_CONNECTION', reasonCodes: validated.reasonCodes, accountCount: 0 });

  const probed = await boundedMap(validated.rows, concurrency, async row => {
    let smtp;
    const transport = smtpTransportFactory({
      host: row.smtpHost, port: 465, secure: true, username: row.username, password: row.password,
      connectTimeoutMs: timeoutMs, commandTimeoutMs: timeoutMs * 2,
      authorized: true, termsCompatible: true, evidenceRef: ownerAuthorizationRef
    });
    if (!transport?.ok || typeof transport.probe !== 'function') {
      smtp = { cls: 'REFUSED_BY_TRANSPORT', accepted: false };
    } else {
      const r = await transport.probe();
      smtp = { cls: smtpClassOf(r), accepted: r?.confirmed === true, messagesSent: r?.messagesSent ?? 0 };
    }
    const imap = await imapProbe({ host: row.imapHost, port: 993, secure: true, username: row.username, password: row.imapPassword, timeoutMs });
    return {
      mailboxDigest: digest16(row.email),
      domainDigest: digest16(row.domain),
      smtpClass: smtp.cls,
      smtpAccepted: smtp.accepted,
      smtpMessagesSent: smtp.messagesSent,
      imapClass: imapClassOf(imap),
      imapAccepted: imap.loginAccepted === true,
      imapErrorClass: imap.errorClass || null
    };
  });

  const failures = probed.filter(r => !r.ok).length;
  const rows = probed.map((r, i) => (r.ok ? r.value : { mailboxDigest: digest16(validated.rows[i].email), domainDigest: digest16(validated.rows[i].domain), smtpClass: 'PROBE_CRASHED', smtpAccepted: false, imapClass: 'PROBE_CRASHED', imapAccepted: false, imapErrorClass: r.error }));
  const smtpAccepted = rows.filter(r => r.smtpAccepted).length;
  const imapAccepted = rows.filter(r => r.imapAccepted).length;
  return Object.freeze({
    ...base,
    ok: smtpAccepted === rows.length && imapAccepted === rows.length,
    status: smtpAccepted === rows.length && imapAccepted === rows.length ? 'AUTHENTICATED_ALL' : 'NOT_ALL_AUTHENTICATED',
    reasonCodes: [],
    ownerAuthorizationRef: String(ownerAuthorizationRef).slice(0, 200),
    accountCount: rows.length,
    probeCrashes: failures,
    smtp: { accepted: smtpAccepted, classCounts: countBy(rows, r => r.smtpClass) },
    imap: { accepted: imapAccepted, classCounts: countBy(rows, r => r.imapClass) },
    networkBlocked: { smtp: rows.filter(r => r.smtpClass === 'NETWORK_BLOCKED').length, imap: rows.filter(r => r.imapClass === 'NETWORK_BLOCKED').length },
    rows,
    truthBoundary: 'Authentication acceptance only: the server accepted the AUTH or LOGIN command. It is not deliverability, reputation, placement, or permission to contact anyone. Accounts stay paused until a separate eligibility decision.'
  });
}

// Overwrites then removes a file. Overwriting first limits what a recoverable filesystem block can reveal.
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
  const args = { exclude: [] };
  for (const arg of process.argv.slice(2)) {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (key === 'exclude-domain') args.exclude.push(value);
    else if (key === 'shred') args.shred = true;
    else args[key] = value || true;
  }
  const csvPath = String(args.csv || '');
  let exitCode = 1;
  try {
    if (!csvPath) throw new Error('--csv is required');
    if (isInsideRepo(csvPath)) throw new Error('the credential CSV must be outside the repository');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const receipt = await runAuthProbeOnly({
      csvText,
      ownerAuthorizationRef: String(args['owner-ref'] || ''),
      excludeDomains: args.exclude,
      concurrency: Number(args.concurrency) || 4,
      timeoutMs: Number(args['timeout-ms']) || 15000
    });
    const text = `${JSON.stringify(receipt, null, 2)}\n`;
    if (args['receipt-out']) fs.writeFileSync(String(args['receipt-out']), text, { mode: 0o600 });
    process.stdout.write(JSON.stringify({ status: receipt.status, reasonCodes: receipt.reasonCodes, accountCount: receipt.accountCount, smtpAccepted: receipt.smtp?.accepted ?? 0, imapAccepted: receipt.imap?.accepted ?? 0, networkBlocked: receipt.networkBlocked ?? null, classCounts: { smtp: receipt.smtp?.classCounts ?? null, imap: receipt.imap?.classCounts ?? null } }) + '\n');
    exitCode = receipt.ok ? 0 : 3;
  } catch (error) {
    process.stderr.write(`winnr-auth-probe-only: ${String(error?.message || error).slice(0, 200)}\n`);
  } finally {
    if (args.shred && csvPath) {
      try { shredFile(csvPath); } catch (error) { process.stderr.write(`shred failed: ${String(error?.code || 'ERROR')}\n`); exitCode = 4; }
    }
    process.exitCode = exitCode;
  }
}
