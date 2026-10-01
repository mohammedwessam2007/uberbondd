import crypto from 'node:crypto';
import { buildEncryptedSmtpAccount } from './uberfleet.mjs';
import { buildEncryptedImapAccount } from './uberimap.mjs';

export const UBERWINNR_CREDENTIAL_IMPORT_VERSION = 'uberbond.uberwinnr-credential-import.v1';

const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const lower = (value, max = 2000) => clean(value, max).toLowerCase();
const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

function parseCsv(text = '') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

function objectsFromCsv(csvText = '') {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => lower(h, 120));
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])));
}

function normalizedRow(row = {}) {
  const email = lower(row.from_email || row.email || row.user_name || row.imap_username, 320);
  return {
    domain: lower(row.domain || email.split('@')[1], 253),
    email,
    fromName: clean(row.from_name || row.name, 200),
    username: clean(row.user_name || email, 500),
    password: String(row.password || row.imap_password || ''),
    smtpHost: clean(row.smtp_host, 253),
    smtpPort: Number(row.smtp_port || 465),
    imapHost: clean(row.imap_host, 253),
    imapPort: Number(row.imap_port || 993),
    imapUsername: clean(row.imap_username || email, 500),
    imapPassword: String(row.imap_password || row.password || ''),
    footer: clean(row.footer, 4000)
  };
}

export function compileWinnrCredentialImport({
  csvText = '',
  encryptionKey = '',
  workspaceId = '',
  linksByEmail = {},
  routeEvidenceRef = '',
  routeAuthorized = false,
  termsCompatible = false,
  plannedDailyCap = 2,
  plannedHourlyCap = 1,
  minGapSeconds = 900
} = {}) {
  const rawRows = objectsFromCsv(csvText);
  const prepared = [];
  const failures = [];
  if (!/^[a-f0-9]{64}$/i.test(String(encryptionKey || ''))) {
    return Object.freeze({
      version: UBERWINNR_CREDENTIAL_IMPORT_VERSION,
      status: 'IMPORT_REFUSED',
      inputRowCount: rawRows.length,
      preparedCount: 0,
      failureCount: rawRows.length || 1,
      prepared: [],
      failures: [{ index: null, email: null, reasonCodes: ['valid-encryption-key-required'] }],
      sourceDigest: `sha256:${sha256(csvText)}`,
      plaintextCredentialReturned: false,
      providerCalls: 0,
      messagesSent: 0,
      externalEffectAuthority: 'NONE',
      truthBoundary: 'Credential import is refused before secret handling unless a valid 32-byte hex encryption key is supplied.'
    });
  }

  for (let index = 0; index < rawRows.length; index += 1) {
    const row = normalizedRow(rawRows[index]);
    const reasons = [];
    if (!emailOk(row.email)) reasons.push('valid-email-required');
    if (!row.smtpHost) reasons.push('smtp-host-required');
    if (!row.imapHost) reasons.push('imap-host-required');
    if (!row.password || !row.imapPassword) reasons.push('credential-required');

    const links = linksByEmail?.[row.email] || {};
    if (!clean(links.sendingDomainId, 120)) reasons.push('sending-domain-link-required');
    if (!clean(links.sendingMailboxId, 120)) reasons.push('sending-mailbox-link-required');
    if (!clean(workspaceId, 120)) reasons.push('workspace-link-required');

    if (reasons.length) {
      failures.push({ index, email: row.email || null, reasonCodes: [...new Set(reasons)] });
      continue;
    }

    const smtp = buildEncryptedSmtpAccount({
      slot: `winnr:${row.email}`,
      email: row.email,
      provider: 'smtp-relay',
      host: row.smtpHost,
      port: row.smtpPort,
      secure: true,
      username: row.username,
      password: row.password,
      sendingDomainId: links.sendingDomainId,
      sendingMailboxId: links.sendingMailboxId,
      sendingWorkspaceId: workspaceId,
      routeEvidenceRef,
      routeAuthorized,
      termsCompatible,
      plannedDailyCap,
      plannedHourlyCap,
      minGapSeconds
    }, encryptionKey);

    const imap = buildEncryptedImapAccount({
      slot: `winnr-imap:${row.email}`,
      email: row.email,
      host: row.imapHost,
      port: row.imapPort,
      secure: true,
      username: row.imapUsername,
      password: row.imapPassword,
      evidenceRef: routeEvidenceRef,
      authorized: routeAuthorized,
      termsCompatible
    }, encryptionKey);

    if (!smtp.ok || !imap.ok) {
      failures.push({
        index,
        email: row.email,
        reasonCodes: [...new Set([...(smtp.reasonCodes || []), ...(imap.reasonCodes || [])])]
      });
      continue;
    }

    prepared.push(Object.freeze({
      email: row.email,
      domain: row.domain,
      fromName: row.fromName || null,
      footer: row.footer || null,
      smtpAccount: smtp.account,
      imapAccount: imap.account,
      plaintextCredentialReturned: false
    }));
  }

  return Object.freeze({
    version: UBERWINNR_CREDENTIAL_IMPORT_VERSION,
    status: failures.length ? (prepared.length ? 'PARTIAL_IMPORT_READY' : 'IMPORT_REFUSED') : 'IMPORT_READY',
    inputRowCount: rawRows.length,
    preparedCount: prepared.length,
    failureCount: failures.length,
    prepared,
    failures,
    sourceDigest: `sha256:${sha256(csvText)}`,
    plaintextCredentialReturned: false,
    providerCalls: 0,
    messagesSent: 0,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'This compiler converts an already-authorized Winnr generic credential export into encrypted UberFleet/UberIMAP account objects. It does not fetch credentials, persist accounts, mutate Winnr, authorize sending, or prove provider entitlement.'
  });
}
