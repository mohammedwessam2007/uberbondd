import crypto from 'node:crypto';
import { decryptJson } from './crypto.mjs';

// Pure fleet control-plane logic for the Winnr Startup fleet. Nothing here contacts a provider, opens a socket,
// writes a store or decrypts a credential for output. Callers pass in facts they already observed.
//
// Central rule: a successful credential import is not eligibility. An account is outbound-eligible only when the
// provider reports it active, its SMTP and IMAP checks were actually accepted, it is not paused, its domain is
// control-confirmed, it has exactly one local SMTP and one local IMAP record, and an explicit campaign authority
// has been granted. No campaign authority is granted by this module or by any runner in this repository.

export const WINNR_FLEET_CONTROL_VERSION = 'uberbond.winnr-fleet-control-plane.v1';

// Transport-level causes. These describe a path that did not complete, not a rejected password.
export const SMTP_NETWORK_CLASSES = Object.freeze(new Set([
  'CONNECT_TIMEOUT', 'RESPONSE_TIMEOUT', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH',
  'ENETUNREACH', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'
]));
export const CONTROL_CONFIRMED_OWNERSHIP = Object.freeze(['OWNER_CONFIRMED', 'PROVIDER_CONTROL_CONFIRMED']);

const PROVIDER_MAILBOX_FIELDS = ['id', 'domain', 'full_address', 'status', 'smtp_host', 'smtp_port', 'imap_host', 'imap_port'];
const PROVIDER_DOMAIN_FIELDS = ['id', 'name', 'status', 'dns_provider', 'registrar', 'tags'];
const PILOT_TAG = 'pre-warmed';

const sha = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
export const digestFull = value => sha(value);
export const digest16 = value => sha(value).slice(0, 16);
const lower = value => String(value ?? '').trim().toLowerCase();

// A listing is only a fleet view when the provider says it holds everything. Anything else is a partial read.
export function assertCompleteListing(result, label = 'list') {
  if (result?.pagination?.has_more === false) return { ok: true };
  return { ok: false, reasonCodes: [`${label}-listing-incomplete-or-unknown`] };
}

// Provider response schema drift: required fields must be present on every record, or the read is refused.
export function assertProviderSchema({ domains = [], mailboxes = [] } = {}) {
  const reasonCodes = [];
  for (const row of domains) for (const field of PROVIDER_DOMAIN_FIELDS) if (!(field in row)) reasonCodes.push(`provider-domain-missing-${field}`);
  for (const row of mailboxes) for (const field of PROVIDER_MAILBOX_FIELDS) if (!(field in row)) reasonCodes.push(`provider-mailbox-missing-${field}`);
  return reasonCodes.length ? { ok: false, reasonCodes: [...new Set(reasonCodes)] } : { ok: true, reasonCodes: [] };
}

// Failure classes for provider API responses. Each class maps to one operator action. None of them is retried
// automatically, because a write whose outcome is unknown must not be repeated blindly.
export function classifyWinnrProviderFailure({ ok = false, status = '', reasonCodes = [], receipt = null } = {}) {
  if (ok) return 'NONE';
  const codes = reasonCodes.map(code => String(code));
  // The adapter reports the provider's own error code when one is present, so the HTTP status is read from the receipt.
  const http = Number(receipt?.httpStatus) || Number(codes.map(code => code.match(/^http-(\d{3})$/)?.[1]).find(Boolean)) || 0;
  if (http === 401) return 'TOKEN_INVALID_EXPIRED_OR_NOT_INJECTED';
  if (http === 403) return 'PERMISSION_DENIED';
  if (http === 429 || status === 'UBERWINNR_RATE_LIMITED') return 'RATE_LIMITED_NO_AUTO_RETRY';
  if (http >= 500 && http <= 599) return 'PROVIDER_UNAVAILABLE';
  if (codes.includes('provider-network-error')) return 'NETWORK_OR_PROXY_REFUSED';
  if (status === 'UBERWINNR_WRITE_OUTCOME_UNCERTAIN') return 'WRITE_OUTCOME_UNCERTAIN_DO_NOT_RETRY';
  if (status === 'UBERWINNR_WRITE_REFUSED' || status === 'UBERWINNR_WRITE_REFUSED_OR_FAILED') return 'WRITE_NOT_AUTHORIZED_OR_FAILED';
  return 'UNCLASSIFIED';
}

// Exporting credentials is a write-scoped action. Refuse it when the token is read-only.
export function assertExportAuthority({ permissions = [] } = {}) {
  const list = Array.isArray(permissions) ? permissions : [];
  if (!list.includes('write')) return { ok: false, reasonCodes: ['export-requires-write-scoped-token'] };
  return { ok: true, reasonCodes: [] };
}

// Duplicate addresses in one export make the link map ambiguous. Refuse rather than let the last row win.
export function findDuplicateAddresses(rows = []) {
  const seen = new Map();
  for (const row of rows) {
    const email = lower(row.email ?? row.from_email);
    seen.set(email, (seen.get(email) || 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([email]) => digest16(email));
}

// Before writing staging or production ciphertext into a store, every existing encrypted account must open with the
// supplied key. A mismatch means the store belongs to a different key environment, so the write is refused.
export function verifyStoreKeyCompatibility({ accounts = [], encryptionKey = '' } = {}) {
  let decryptable = 0;
  let undecryptable = 0;
  for (const account of accounts) {
    if (!account?.tokens) continue;
    try {
      decryptJson(account.tokens, encryptionKey);
      decryptable += 1;
    } catch {
      undecryptable += 1;
    }
  }
  return {
    ok: undecryptable === 0,
    decryptable,
    undecryptable,
    reasonCodes: undecryptable === 0 ? [] : ['existing-store-ciphertext-not-readable-with-key']
  };
}

function smtpState(result) {
  if (!result) return 'UNTESTED';
  if (result.evaluated === false) return 'HELD';
  if (result.confirmed === true || result.classification === 'READY') return 'READY';
  if (result.errorClass === 'AUTH_REJECTED') return 'AUTH_REJECTED';
  if (result.errorClass === 'TLS_FAILED') return 'TLS_FAILED';
  if (SMTP_NETWORK_CLASSES.has(result.errorClass)) return 'NETWORK_BLOCKED';
  return 'FAILED_UNCLASSIFIED';
}

function imapState(result) {
  if (!result) return 'UNTESTED';
  if (result.loginAccepted === true) return 'LOGIN_ACCEPTED';
  if (result.classification === 'AUTH_REJECTED') return 'AUTH_REJECTED';
  if (result.classification === 'TRANSPORT_UNREACHABLE') return 'NETWORK_BLOCKED';
  if (result.classification === 'TLS_OR_GREETING_FAILED') return 'TLS_FAILED';
  if (result.classification === 'CREDENTIAL_UNAVAILABLE') return 'CREDENTIAL_UNAVAILABLE';
  return 'FAILED_UNCLASSIFIED';
}

// Reconciles provider inventory with local state and recorded probe outcomes.
export function reconcileWinnrFleet({
  providerDomains = [],
  providerMailboxes = [],
  localAccounts = [],
  senderHealth = [],
  smtpReceipt = null,
  imapReceipt = null,
  domainOwnershipByName = {},
  snapshotTakenAt = null,
  now = new Date(),
  maxSnapshotAgeMs = 60 * 60 * 1000,
  campaignAuthorityGranted = false
} = {}) {
  const issues = [];
  const pilotDomainNames = new Set(providerDomains.filter(d => (d.tags || []).includes(PILOT_TAG)).map(d => lower(d.name)));
  const startupMailboxes = providerMailboxes.filter(m => !pilotDomainNames.has(lower(m.domain)));
  const pilotMailboxes = providerMailboxes.filter(m => pilotDomainNames.has(lower(m.domain)));
  const startupAddresses = new Set(startupMailboxes.map(m => lower(m.full_address)));

  const snapshotAgeMs = snapshotTakenAt ? new Date(now).getTime() - new Date(snapshotTakenAt).getTime() : null;
  const stale = snapshotAgeMs === null || snapshotAgeMs > maxSnapshotAgeMs;
  if (stale) issues.push({ code: 'PROVIDER_INVENTORY_STALE_OR_UNDATED' });

  const smtpLocal = localAccounts.filter(a => a?.provider === 'smtp-relay' && String(a?.slot || '').startsWith('winnr:'));
  const imapLocal = localAccounts.filter(a => a?.provider === 'imap-forwarding' && String(a?.slot || '').startsWith('winnr-imap:'));
  const smtpBySlot = new Map();
  for (const account of smtpLocal) smtpBySlot.set(account.slot, (smtpBySlot.get(account.slot) || 0) + 1);
  const imapBySlot = new Map();
  for (const account of imapLocal) imapBySlot.set(account.slot, (imapBySlot.get(account.slot) || 0) + 1);
  const pausedSlots = new Set(senderHealth.filter(h => h?.paused === true).map(h => String(h.inbox || '')));

  const smtpResults = new Map((smtpReceipt?.results || []).map(r => [r.slotDigest, r]));
  const imapResults = new Map((imapReceipt?.perAccount || []).map(r => [r.slotDigest, r]));
  const ownershipOk = domain => CONTROL_CONFIRMED_OWNERSHIP.includes(domainOwnershipByName[lower(domain)]);

  const perAccount = [];
  const counts = {
    startupMailboxes: startupMailboxes.length,
    startupMailboxesActive: 0,
    pilotMailboxes: pilotMailboxes.length,
    localSmtpAccounts: smtpLocal.length,
    localImapAccounts: imapLocal.length,
    missingLocalAccounts: 0,
    duplicateLocalAccounts: 0,
    orphanLocalAccounts: 0,
    smtp: { READY: 0, AUTH_REJECTED: 0, NETWORK_BLOCKED: 0, TLS_FAILED: 0, FAILED_UNCLASSIFIED: 0, HELD: 0, UNTESTED: 0 },
    imap: { LOGIN_ACCEPTED: 0, AUTH_REJECTED: 0, NETWORK_BLOCKED: 0, TLS_FAILED: 0, CREDENTIAL_UNAVAILABLE: 0, FAILED_UNCLASSIFIED: 0, UNTESTED: 0 },
    pausedSmtp: 0,
    domainsControlConfirmed: 0,
    infrastructureReady: 0,
    outboundEligible: 0
  };

  for (const mailbox of startupMailboxes) {
    const address = lower(mailbox.full_address);
    const smtpSlot = `winnr:${address}`;
    const imapSlot = `winnr-imap:${address}`;
    const providerActive = mailbox.status === 'active';
    if (providerActive) counts.startupMailboxesActive += 1;
    const smtpPresent = smtpBySlot.get(smtpSlot) === 1;
    const imapPresent = imapBySlot.get(imapSlot) === 1;
    if (!smtpPresent || !imapPresent) counts.missingLocalAccounts += 1;
    if ((smtpBySlot.get(smtpSlot) || 0) > 1 || (imapBySlot.get(imapSlot) || 0) > 1) counts.duplicateLocalAccounts += 1;
    const sSmtp = smtpState(smtpResults.get(digestFull(smtpSlot)));
    const sImap = imapState(imapResults.get(digest16(imapSlot)));
    counts.smtp[sSmtp] += 1;
    counts.imap[sImap] += 1;
    const paused = pausedSlots.has(smtpSlot);
    if (paused) counts.pausedSmtp += 1;
    const domainControlled = ownershipOk(mailbox.domain);
    if (domainControlled) counts.domainsControlConfirmed += 1;
    const reasons = [];
    if (!providerActive) reasons.push('provider-not-active');
    if (!smtpPresent || !imapPresent) reasons.push('local-account-missing-or-duplicated');
    if (sSmtp !== 'READY') reasons.push(`smtp-${sSmtp.toLowerCase()}`);
    if (sImap !== 'LOGIN_ACCEPTED') reasons.push(`imap-${sImap.toLowerCase()}`);
    if (paused) reasons.push('smtp-sender-paused');
    if (!domainControlled) reasons.push('domain-not-control-confirmed');
    const infrastructureReady = reasons.length === 0;
    if (infrastructureReady) counts.infrastructureReady += 1;
    const outbound = infrastructureReady && campaignAuthorityGranted === true;
    if (!campaignAuthorityGranted) reasons.push('campaign-authority-not-granted');
    if (outbound) counts.outboundEligible += 1;
    perAccount.push({
      mailboxDigest: digest16(address),
      domainDigest: digest16(lower(mailbox.domain)),
      providerActive,
      smtpState: sSmtp,
      imapState: sImap,
      paused,
      infrastructureReady,
      outboundEligible: outbound,
      eligibilityReasons: [...new Set(reasons)]
    });
  }

  // Local Winnr accounts that the provider does not list as Startup mailboxes are orphans, and a pilot slot in the
  // Startup set would be a leak. Both are reported and never silently adopted.
  for (const account of smtpLocal) {
    const address = lower(String(account.slot).slice('winnr:'.length));
    if (!startupAddresses.has(address) && !pilotMailboxes.some(m => lower(m.full_address) === address)) counts.orphanLocalAccounts += 1;
  }
  if (counts.orphanLocalAccounts > 0) issues.push({ code: 'ORPHAN_LOCAL_ACCOUNTS', count: counts.orphanLocalAccounts });
  if (counts.missingLocalAccounts > 0) issues.push({ code: 'MISSING_LOCAL_ACCOUNTS', count: counts.missingLocalAccounts });
  if (counts.duplicateLocalAccounts > 0) issues.push({ code: 'DUPLICATE_LOCAL_ACCOUNTS', count: counts.duplicateLocalAccounts });

  const smtpChecked = counts.smtp.READY + counts.smtp.AUTH_REJECTED + counts.smtp.NETWORK_BLOCKED + counts.smtp.TLS_FAILED + counts.smtp.FAILED_UNCLASSIFIED;
  const imapChecked = counts.imap.LOGIN_ACCEPTED + counts.imap.AUTH_REJECTED + counts.imap.NETWORK_BLOCKED + counts.imap.TLS_FAILED + counts.imap.FAILED_UNCLASSIFIED + counts.imap.CREDENTIAL_UNAVAILABLE;
  return Object.freeze({
    version: WINNR_FLEET_CONTROL_VERSION,
    status: stale ? 'STALE_PROVIDER_INVENTORY' : (issues.length ? 'RECONCILED_WITH_ISSUES' : 'RECONCILED'),
    counts,
    checks: { smtpChecked, imapChecked, smtpUntested: counts.smtp.UNTESTED, imapUntested: counts.imap.UNTESTED },
    issues,
    perAccount,
    messagesSent: 0,
    outboundAuthorityGranted: campaignAuthorityGranted === true,
    truthBoundary: 'Reconciliation describes recorded observations only. A TCP or TLS attempt is not an authentication; an accepted LOGIN or AUTH is not deliverability, reputation or outreach permission.'
  });
}

// Environment-confusion guard for the runner. Staging key material may only meet the isolated JSON store. The
// production key may only meet the PostgreSQL store it already protects. A production runtime refuses staging keys.
export function assertRunnerEnvironment({ keySource = '', storeBackend = '', productionRuntime = false } = {}) {
  const reasons = [];
  if (!['env', 'staging-file'].includes(keySource)) reasons.push('unknown-key-source');
  if (!['json', 'postgres'].includes(storeBackend)) reasons.push('unknown-store-backend');
  if (keySource === 'env' && storeBackend !== 'postgres') reasons.push('production-key-requires-postgres-store');
  if (keySource === 'staging-file' && storeBackend === 'postgres') reasons.push('staging-key-must-not-target-postgres');
  if (keySource === 'staging-file' && productionRuntime === true) reasons.push('staging-key-refused-in-production-runtime');
  return { ok: reasons.length === 0, reasonCodes: [...new Set(reasons)] };
}

// Stages prepared accounts so that no SMTP sender is ever selectable without a probe. The pause is written before the
// account record, so an interruption between the two writes leaves an account that is paused, never one that is live.
// Re-running is safe: upsert is keyed by the stable account id, and the pause reason is the probe's own.
export async function stageImportedAccounts({ store, prepared = [], pauseReason = '' } = {}) {
  let smtpStaged = 0;
  let imapStaged = 0;
  for (const row of prepared) {
    await store.setSenderPaused(row.smtpAccount.slot, true, pauseReason);
    await store.upsert('accounts', { ...row.smtpAccount, updatedAt: new Date().toISOString() });
    smtpStaged += 1;
    await store.upsert('accounts', { ...row.imapAccount, updatedAt: new Date().toISOString() });
    imapStaged += 1;
  }
  return { smtpStaged, imapStaged };
}

// Runs fn over items with at most `limit` in flight, preserving input order in the results. A rejection inside fn is
// captured as that item's result, so one failure never hides or cancels the others.
export async function boundedMap(items = [], limit = 4, fn) {
  const size = Math.max(1, Math.floor(Number(limit) || 1));
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { ok: true, value: await fn(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error: String(error?.code || error?.name || 'Error').slice(0, 80) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

// Resume selection: an account is skipped only when this run already holds a result for it that is still fresh.
// A stale or missing result is probed again. Authentication evidence must not be carried forward past its window.
export function selectAccountsToProbe({ accountSlots = [], checkpoint = {}, now = new Date(), maxAgeMs = 30 * 60 * 1000 } = {}) {
  const nowMs = new Date(now).getTime();
  const fresh = new Set(Object.entries(checkpoint || {})
    .filter(([, row]) => row && row.checkedAt && nowMs - new Date(row.checkedAt).getTime() <= maxAgeMs)
    .map(([slot]) => slot));
  return accountSlots.filter(slot => !fresh.has(slot));
}
