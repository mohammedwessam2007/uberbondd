import crypto from 'node:crypto';
import { decryptJson } from './crypto.mjs';
import { compileWinnrCredentialImport, winnrCredentialRows } from './uberwinnr-credential-import.mjs';
import { parseExpectedInventory, gateCsvInventory, gateProviderInventory, gateCsvAgainstProvider } from './winnr-inventory-gate.mjs';
import { findDuplicateAddresses, verifyStoreKeyCompatibility } from './winnr-fleet-control-plane.mjs';
import { assertPublicSafe, sanitizedErrorCode } from './winnr-public-artifact-guard.mjs';
import { selectFleetMailbox } from './uberfleet.mjs';

// Production import of the 50 Winnr Startup mailbox credentials into the PostgreSQL store.
//
// Plan -> execute -> verify. The plan is pure: it reads only its arguments and returns private rows plus a public
// receipt. Execution holds every imported SMTP sender paused under WINNR_IMPORT_HOLD_REASON and every IMAP account
// connected:false, so nothing imported here is selectable for outbound mail. Rollback keeps the same holds and never
// deletes an account or a credential.
//
// Private plan rows contain encrypted credentials only. Public receipts contain counts and fixed reason codes. No
// receipt may carry an address, a domain name, a password, a digest, a commit hash or a provider URL.

export const WINNR_PRODUCTION_IMPORT_VERSION = 'uberbond.winnr-production-import.v1';
export const WINNR_PRODUCTION_IMPORT_CONFIRMATION = 'IMPORT-50-WINNR-STARTUP';
export const WINNR_PRODUCTION_KEY_LABEL = 'PRODUCTION_KEY_FROM_TOKEN_ENCRYPTION_KEY';
export const WINNR_IMPORT_HOLD_REASON = 'WINNR_PRODUCTION_IMPORT_HOLD';
export const WINNR_IMPORT_ROLLBACK_REASON = 'WINNR_PRODUCTION_IMPORT_ROLLED_BACK';
export const WINNR_IMPORT_RECEIPT_SETTING = 'winnrProductionImportReceipt';
export const WINNR_IMPORT_ROLLBACK_RECEIPT_SETTING = 'winnrProductionImportRollbackReceipt';
export const WINNR_IMPORT_LEASE_SETTING = 'winnrProductionImportLease';
export const WINNR_IMPORT_LEASE_TTL_MS = 10 * 60 * 1000;
export const WINNR_PRODUCTION_KEY_CHECK_LABEL = 'winnr-production-key-check-v1';

const EXPECTED_ACCOUNT_COUNT = 50;
const KEY_RE = /^[a-f0-9]{64}$/i;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const SMTP_PROVIDER = 'smtp-relay';
const IMAP_PROVIDER = 'imap-forwarding';
const DIGEST_CONTEXT = 'uberbond.winnr-production-import.digest.v1';
// Implicit TLS only. The import always seals secure:true, so the port must be the one where TLS starts on connect.
const IMPLICIT_TLS_PORTS = Object.freeze({ smtp: '465', imap: '993' });
const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
// Running executions per store object. A second call on the same store while one is in flight is refused.
const RUNNING_IMPORT_STORES = new WeakSet();

// Plans are accepted for execution only when this module issued them in the current process. The plan and its rows
// are frozen, so a caller cannot swap in its own account objects after planning.
const ISSUED_PLANS = new WeakSet();

const lower = value => String(value ?? '').trim().toLowerCase();
const isNonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const toMs = value => (value instanceof Date ? value.getTime() : new Date(value).getTime());
const isoOf = ms => new Date(ms).toISOString();
// Every reason code that reaches a plan, refusal or receipt passes through here. Digits are replaced by N: a code such as
// "...-not-50" would otherwise match the guard's opaque-token pattern (32+ characters with both letters and digits).
const publicCodes = list => [...new Set(list.map(code => String(code).replace(/[0-9]+/g, 'N')))];
const domainOf = value => {
  const text = lower(value);
  const at = text.lastIndexOf('@');
  return at >= 0 ? text.slice(at + 1) : '';
};

// Keyed digests for receipts. The key is the production encryption key, so a digest cannot be recomputed from public
// inputs, and only 16 hex characters are ever published. The word "digest" is kept out of receipt keys because the
// public artifact guard refuses it.
function keyedDigest16(keyHex, label, value) {
  const subkey = crypto.createHmac('sha256', Buffer.from(String(keyHex), 'hex')).update(DIGEST_CONTEXT).digest();
  return crypto.createHmac('sha256', subkey).update(`${label}\n${value}`).digest('hex').slice(0, 16);
}

// Binds an approval to one plan's exact content. The full 64-character value stays on the private plan object and is
// never placed in a public receipt.
function planDigestOf(keyHex, value) {
  const subkey = crypto.createHmac('sha256', Buffer.from(String(keyHex), 'hex')).update(DIGEST_CONTEXT).digest();
  return crypto.createHmac('sha256', subkey).update(`plan\n${value}`).digest('hex');
}

// Proves which key an approval was issued for without revealing it. Returns '' when the key is not 64 hex characters.
export function winnrProductionKeyCheck(encryptionKeyHex = '') {
  if (!KEY_RE.test(String(encryptionKeyHex ?? ''))) return '';
  return keyedDigest16(encryptionKeyHex, 'key-check', WINNR_PRODUCTION_KEY_CHECK_LABEL);
}

// Deterministic serialisation, so two reads of the same rows in a different order compare equal.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

class ImportRefusal extends Error {
  constructor(code, reasonCodes = []) {
    super('winnr-production-import-refused');
    this.name = 'ImportRefusal';
    this.code = code;
    this.reasonCodes = [code, ...reasonCodes];
  }
}

// Thrown from inside the transaction when the store already holds the plan. The throw rolls back the lease acquired at
// the start of the run, so a repeat execution changes no row, setting or log entry.
class ImportNoop extends Error {
  constructor(report) {
    super('winnr-production-import-noop');
    this.name = 'ImportNoop';
    this.report = report;
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

// Backend identity is the store's declared, read-only backendKind. It is never inferred with instanceof. A store that
// declares no recognised kind is refused; only 'postgres' is a production backend.
const PRODUCTION_BACKEND_KIND = 'postgres';
const RECOGNISED_BACKEND_KINDS = new Set(['postgres', 'json']);
function storeBackendReasons(store) {
  const kind = store?.backendKind;
  if (!RECOGNISED_BACKEND_KINDS.has(kind)) return ['store-backend-kind-unrecognised'];
  return kind === PRODUCTION_BACKEND_KIND ? [] : ['store-backend-mismatch'];
}

// An approval must name the digest of the plan it approves. An approval with no planDigest field is refused as missing.
// Any other value that is not this plan's digest (null, an empty string, another plan's digest) fails closed as a mismatch.
// This check is mandatory: no approval reaches a plan without naming it.
function approvalDigestReasons(executionGate, plan) {
  const named = executionGate?.planDigest;
  if (named === undefined) return ['approval-plan-digest-missing'];
  return named === plan?.planDigest ? [] : ['approval-plan-digest-mismatch'];
}

// Every gate reason comes from a closed vocabulary. An invalid clock is reported as a reason, never as a pass.
function validateExecutionGate(gate, nowMs, { enforceExpiry = true } = {}) {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return ['execution-gate-required'];
  const reasons = [];
  if (gate.mode !== 'PRODUCTION_IMPORT') reasons.push('gate-mode-mismatch');
  if (gate.confirmation !== WINNR_PRODUCTION_IMPORT_CONFIRMATION) reasons.push('gate-confirmation-mismatch');
  if (!isNonEmpty(gate.approvalRef)) reasons.push('gate-approval-ref-required');
  if (!COMMIT_RE.test(String(gate.reviewedCommit ?? ''))) reasons.push('gate-reviewed-commit-invalid');
  if (gate.expectedAccountCount !== EXPECTED_ACCOUNT_COUNT) reasons.push('gate-expected-account-count-mismatch');
  const expiresMs = typeof gate.expiresAt === 'string' && ISO_RE.test(gate.expiresAt) ? Date.parse(gate.expiresAt) : NaN;
  if (!Number.isFinite(expiresMs)) reasons.push('gate-expiry-invalid');
  if (!Number.isFinite(nowMs)) reasons.push('clock-invalid');
  else if (enforceExpiry && Number.isFinite(expiresMs) && expiresMs <= nowMs) reasons.push('gate-expired');
  return reasons;
}

// Public receipts are built from this fixed shape only. assertPublicSafe throws if a value or key leaks identity.
function buildPublicReceipt({ kind, status, reasonCodes = [], counts = {}, recordedAt = '', hashes = {} }) {
  const receipt = {
    version: WINNR_PRODUCTION_IMPORT_VERSION,
    kind,
    status,
    reasonCodes: publicCodes(reasonCodes),
    counts: { ...counts },
    sourceHash16: String(hashes.sourceHash16 ?? ''),
    destinationHash16: String(hashes.destinationHash16 ?? ''),
    externalEffectAuthority: 'NONE',
    providerCalls: 0,
    messagesSent: 0,
    plaintextCredentialReturned: false,
    recordedAt
  };
  assertPublicSafe(receipt);
  return receipt;
}

function refusal(kind, status, reasonCodes, recordedAt) {
  const codes = publicCodes(reasonCodes);
  return {
    ok: false,
    status,
    reasonCodes: codes,
    counts: {},
    publicReceipt: buildPublicReceipt({ kind, status, reasonCodes: codes, counts: {}, recordedAt }),
    receiptStored: false
  };
}

// Providers' domain ids and mailbox ids become the send-side links that compileWinnrCredentialImport requires.
function linksFromProvider({ providerDomains = [], providerMailboxes = [], expected }) {
  const pilot = new Set(expected.pilotDomains);
  const domainIdByName = new Map(providerDomains.map(d => [lower(d.name), String(d.id ?? '')]));
  const links = {};
  for (const mailbox of providerMailboxes) {
    const email = lower(mailbox.full_address);
    const addressDomain = email.split('@')[1] || '';
    if (pilot.has(addressDomain) || lower(mailbox.domain) !== addressDomain) continue;
    links[email] = {
      sendingDomainId: domainIdByName.get(addressDomain) || '',
      sendingMailboxId: String(mailbox.id ?? '')
    };
  }
  return links;
}

// Per-row route facts. The export's hosts and ports must equal the provider's own record for that address, the ports
// must be the implicit-TLS ports the import seals, and the IMAP login must be the mailbox address itself.
function routeFactReasons({ rows = [], providerMailboxes = [] } = {}) {
  const byAddress = new Map(providerMailboxes.map(mailbox => [lower(mailbox?.full_address), mailbox]));
  const reasons = [];
  for (const row of rows) {
    const email = lower(row.from_email ?? row.email);
    const provider = byAddress.get(email);
    if (!provider) {
      reasons.push('route-provider-record-missing');
      continue;
    }
    const smtpHost = lower(row.smtp_host);
    const imapHost = lower(row.imap_host);
    const smtpPort = String(row.smtp_port ?? '').trim();
    const imapPort = String(row.imap_port ?? '').trim();
    if (!HOST_RE.test(smtpHost) || !HOST_RE.test(imapHost)) reasons.push('route-host-invalid');
    if (smtpHost !== lower(provider.smtp_host)) reasons.push('smtp-host-provider-mismatch');
    if (imapHost !== lower(provider.imap_host)) reasons.push('imap-host-provider-mismatch');
    if (smtpPort !== IMPLICIT_TLS_PORTS.smtp) reasons.push('smtp-port-not-implicit-tls');
    if (imapPort !== IMPLICIT_TLS_PORTS.imap) reasons.push('imap-port-not-implicit-tls');
    if (smtpPort !== String(provider.smtp_port ?? '').trim()) reasons.push('smtp-port-provider-mismatch');
    if (imapPort !== String(provider.imap_port ?? '').trim()) reasons.push('imap-port-provider-mismatch');
    if (lower(row.imap_username || email) !== email) reasons.push('imap-username-not-address');
  }
  return [...new Set(reasons)];
}

function tlsRouteVerified(row) {
  return row.smtpAccount?.smtpRoute?.secure === true
    && Number(row.smtpAccount.smtpRoute.port) === Number(IMPLICIT_TLS_PORTS.smtp)
    && row.imapAccount?.imapRoute?.secure === true
    && Number(row.imapAccount.imapRoute.port) === Number(IMPLICIT_TLS_PORTS.imap);
}

// Only planner-issued, all-50-row plans may reach execution. A plan that is refused carries no rows at all.
export function planWinnrProductionImport({
  csvText = '',
  expectedInventoryText = '',
  encryptionKeyHex = '',
  keyLabel = '',
  storeBackend = '',
  workspaceId = '',
  routeEvidenceRef = '',
  providerDomains = [],
  providerMailboxes = [],
  executionGate = null,
  expectedPilotMailboxCount = null,
  now = new Date()
} = {}) {
  const nowMs = toMs(now);
  const recordedAt = Number.isFinite(nowMs) ? isoOf(nowMs) : '';
  const reasons = [];
  const counts = {
    rows: 0,
    prepared: 0,
    failed: 0,
    duplicateIdentityCount: 0,
    providerRecordCount: 0,
    startupDomains: 0,
    pilotDomains: 0,
    credentialIdentitiesSealed: 0
  };
  let planRows = [];
  let scopeFacts = null;
  let sealedIdentities = 0;
  try {
    reasons.push(...validateExecutionGate(executionGate, nowMs));
    if (executionGate?.routeAuthorized !== true) reasons.push('gate-route-authorization-required');
    if (executionGate?.termsCompatible !== true) reasons.push('gate-terms-compatibility-required');
    if (keyLabel !== WINNR_PRODUCTION_KEY_LABEL) reasons.push('key-label-not-production');
    if (!KEY_RE.test(String(encryptionKeyHex ?? ''))) reasons.push('encryption-key-hex-required');
    // When the approval carries a key check, the supplied key must be the approved one. Absent a check, the caller's
    // label is all that binds the key, so the production runner requires the check (see its own refusal).
    if (executionGate?.encryptionKeyCheck !== undefined && executionGate.encryptionKeyCheck !== winnrProductionKeyCheck(encryptionKeyHex)) {
      reasons.push('encryption-key-check-mismatch');
    }
    if (storeBackend !== 'postgres') reasons.push('store-backend-not-postgres');
    if (!isNonEmpty(workspaceId)) reasons.push('workspace-link-required');
    if (!isNonEmpty(routeEvidenceRef)) reasons.push('route-evidence-required');
    if (expectedPilotMailboxCount !== null && !(Number.isInteger(expectedPilotMailboxCount) && expectedPilotMailboxCount >= 0)) {
      reasons.push('pilot-mailbox-count-invalid');
    }

    const providersReadable = Array.isArray(providerDomains) && Array.isArray(providerMailboxes);
    if (!providersReadable) reasons.push('provider-inventory-required');
    counts.providerRecordCount = Array.isArray(providerMailboxes) ? providerMailboxes.length : 0;

    const expected = parseExpectedInventory(expectedInventoryText);
    if (!expected.ok) reasons.push(...expected.reasonCodes);

    const rows = winnrCredentialRows(csvText);
    counts.rows = rows.length;
    if (expected.ok && providersReadable) {
      const csvGate = gateCsvInventory({ expected, rows });
      if (!csvGate.ok) reasons.push(...csvGate.reasonCodes);
      const providerGate = gateProviderInventory({ expected, providerDomains, providerMailboxes });
      if (!providerGate.ok) reasons.push(...providerGate.reasonCodes);
      const crossGate = gateCsvAgainstProvider({ rows, providerMailboxes, expected });
      if (!crossGate.ok) reasons.push(...crossGate.reasonCodes);
      reasons.push(...routeFactReasons({ rows, providerMailboxes }));
      if (expectedPilotMailboxCount !== null) {
        // The pilot mailboxes the provider reports must be exactly the number the approval names.
        const pilot = new Set(expected.pilotDomains);
        const providerPilot = new Set(providerMailboxes.map(m => lower(m?.full_address)).filter(address => pilot.has(domainOf(address))));
        if (providerPilot.size !== expectedPilotMailboxCount) reasons.push('pilot-mailbox-count-mismatch');
      }
    }

    // Called here, not merely exported: a duplicated address makes the link map ambiguous.
    const duplicates = findDuplicateAddresses(rows);
    counts.duplicateIdentityCount = duplicates.length;
    if (duplicates.length) reasons.push('duplicate-address-in-export');

    if (reasons.length === 0) {
      const compiled = compileWinnrCredentialImport({
        csvText,
        encryptionKey: encryptionKeyHex,
        workspaceId,
        linksByEmail: expected.ok && providersReadable ? linksFromProvider({ providerDomains, providerMailboxes, expected }) : {},
        routeEvidenceRef,
        routeAuthorized: executionGate.routeAuthorized === true,
        termsCompatible: executionGate.termsCompatible === true
      });
      counts.prepared = compiled.preparedCount;
      counts.failed = compiled.failureCount;
      if (compiled.status !== 'IMPORT_READY' || compiled.preparedCount !== EXPECTED_ACCOUNT_COUNT || compiled.failureCount !== 0) {
        reasons.push('compile-not-ready-for-all-rows');
        for (const failure of compiled.failures) reasons.push(...failure.reasonCodes);
      } else {
        // IMAP accounts are held at plan time, so no write path can produce a connected IMAP account by accident.
        planRows = compiled.prepared.map(row => ({
          identity: lower(row.email),
          smtpAccount: row.smtpAccount,
          imapAccount: { ...row.imapAccount, connected: false }
        }));
        if (planRows.some(row => row.smtpAccount?.provider !== SMTP_PROVIDER || row.imapAccount?.provider !== IMAP_PROVIDER)) {
          reasons.push('plan-provider-shape-invalid');
        }
        if (planRows.some(row => !tlsRouteVerified(row))) reasons.push('plan-tls-mode-not-verified');
        // Every planned identity must open under the production key, for both its SMTP and its IMAP credential.
        try {
          for (const row of planRows) {
            openCredential(row.smtpAccount, encryptionKeyHex, 'smtp-basic');
            openCredential(row.imapAccount, encryptionKeyHex, 'imap-basic');
          }
          sealedIdentities = planRows.length;
        } catch {
          reasons.push('plan-ciphertext-not-sealed-under-key');
        }
        scopeFacts = { startupDomains: [...expected.startupDomains], pilotDomains: [...expected.pilotDomains] };
      }
    }
  } catch (error) {
    reasons.push('plan-internal-error', sanitizedErrorCode(error));
  }

  const ok = reasons.length === 0 && planRows.length === EXPECTED_ACCOUNT_COUNT;
  if (!ok && reasons.length === 0) reasons.push('plan-row-count-mismatch');
  const status = ok ? 'PRODUCTION_IMPORT_PLAN_READY' : 'PRODUCTION_IMPORT_REFUSED';
  const reasonCodes = publicCodes(reasons);
  if (ok) counts.prepared = planRows.length;
  // Scope facts and digests exist only for a ready plan. The destination digest is over identity-to-slot pairs, so an
  // execution that reads back exactly the planned mapping produces the same value.
  const issued = ok && scopeFacts ? {
    ...scopeFacts,
    sourceHash16: keyedDigest16(encryptionKeyHex, 'source', csvText),
    destinationHash16: keyedDigest16(encryptionKeyHex, 'destination', planRows.flatMap(row => [
      `${row.identity}|${row.smtpAccount.slot}`,
      `${row.identity}|${row.imapAccount.slot}`
    ]).sort().join('\n'))
  } : null;
  if (ok && issued) {
    counts.startupDomains = issued.startupDomains.length;
    counts.pilotDomains = issued.pilotDomains.length;
    counts.credentialIdentitiesSealed = sealedIdentities;
  }
  const hashes = { sourceHash16: issued?.sourceHash16 ?? '', destinationHash16: issued?.destinationHash16 ?? '' };
  // An approval that names this digest can execute only this exact plan. Execution refuses any other plan.
  const planDigest = issued ? planDigestOf(encryptionKeyHex, stableStringify({
    sourceHash16: issued.sourceHash16,
    destinationHash16: issued.destinationHash16,
    startupDomains: issued.startupDomains,
    pilotDomains: issued.pilotDomains,
    expectedPilotMailboxCount,
    workspaceId,
    routeEvidenceRef,
    rows: planRows
  })) : '';
  const plan = deepFreeze({
    ok,
    status,
    reasonCodes,
    counts: { ...counts },
    rows: ok ? planRows : [],
    storeBackend: ok ? 'postgres' : '',
    version: WINNR_PRODUCTION_IMPORT_VERSION,
    startupDomains: issued ? issued.startupDomains : [],
    pilotDomains: issued ? issued.pilotDomains : [],
    expectedPilotMailboxCount: ok ? expectedPilotMailboxCount : null,
    sourceHash16: hashes.sourceHash16,
    destinationHash16: hashes.destinationHash16,
    planDigest,
    publicReceipt: buildPublicReceipt({ kind: 'PLAN', status, reasonCodes, counts, recordedAt, hashes })
  });
  if (ok) ISSUED_PLANS.add(plan);
  return plan;
}

function openCredential(account, key, kind) {
  const secret = decryptJson(account.tokens, key);
  if (secret?.kind !== kind || !isNonEmpty(secret.username) || !String(secret.password || '')) {
    throw new ImportRefusal('PLAN_CREDENTIAL_SHAPE_INVALID');
  }
  return { username: String(secret.username), password: String(secret.password) };
}

// Decides, for one planned account, whether it is new, already present with identical credentials, or in conflict.
// Conflicts are never overwritten. Credentials are compared in memory and never returned.
function classifyExistingAccount({ account, credential, kind, key, bySlot, byId }) {
  const slotHit = bySlot.get(String(account.slot));
  const idHit = byId.get(String(account.id));
  if (!slotHit && !idHit) return 'WRITE';
  if ((slotHit && slotHit.id !== account.id) || (idHit && idHit !== slotHit)) return 'COLLISION';
  if (slotHit.provider !== account.provider) return 'CONTRADICTION';
  try {
    const secret = decryptJson(slotHit.tokens, key);
    const same = secret?.kind === kind && secret.username === credential.username && secret.password === credential.password;
    return same ? 'PRESENT' : 'CONTRADICTION';
  } catch {
    return 'CONTRADICTION';
  }
}

function heldSenderRecord(existing, inbox, reason, iso, day) {
  const base = existing
    ? { ...existing }
    : { id: `sender_${inbox}`, inbox, hardBouncesToday: 0, complaintsToday: 0, failureStreak: 0, healthDate: day, createdAt: iso };
  // Keep the reason a sender already carried (for example a complaint or bounce threshold). Provenance must survive a hold.
  const previousPauseReason = existing?.paused === true && existing.pauseReason && existing.pauseReason !== reason
    ? String(existing.pauseReason).slice(0, 200)
    : (existing?.previousPauseReason ?? null);
  return { ...base, paused: true, pauseReason: reason, previousPauseReason, updatedAt: iso };
}

async function verifyHeldState(store, planRows) {
  const accounts = await store.list('accounts');
  const health = await store.list('senderHealth');
  const healthByInbox = new Map(health.map(row => [String(row?.inbox ?? ''), row]));
  const accountByKey = new Map(accounts.map(row => [`${row?.provider}|${row?.slot}`, row]));
  const reasonCodes = [];
  const counts = { verifiedSmtpHeld: 0, verifiedSmtpAccounts: 0, verifiedImapHeld: 0 };
  for (const row of planRows) {
    const sender = healthByInbox.get(String(row.smtpAccount.slot));
    if (sender?.paused === true && sender.pauseReason === WINNR_IMPORT_HOLD_REASON) counts.verifiedSmtpHeld += 1;
    else reasonCodes.push('SMTP_SENDER_NOT_HELD');
    const smtpAccount = accountByKey.get(`${SMTP_PROVIDER}|${row.smtpAccount.slot}`);
    if (smtpAccount) counts.verifiedSmtpAccounts += 1;
    else reasonCodes.push('SMTP_ACCOUNT_ABSENT');
    // A slot must belong to the identity the plan mapped it to, never to another mailbox.
    if (smtpAccount && lower(smtpAccount.email) !== row.identity) reasonCodes.push('ACCOUNT_IDENTITY_MISMATCH');
    const imap = accountByKey.get(`${IMAP_PROVIDER}|${row.imapAccount.slot}`);
    if (imap && imap.connected === false) counts.verifiedImapHeld += 1;
    else reasonCodes.push('IMAP_ACCOUNT_NOT_HELD');
    if (imap && lower(imap.email) !== row.identity) reasonCodes.push('ACCOUNT_IDENTITY_MISMATCH');
  }
  return { ok: reasonCodes.length === 0, reasonCodes: publicCodes(reasonCodes), counts };
}

// Pilot rows are identified by their domain. Their snapshot is compared before and after the writes.
function pilotSnapshot({ accounts = [], senderHealth = [], pilotDomains = [] } = {}) {
  const pilot = new Set(pilotDomains);
  const pilotAccounts = accounts.filter(account => pilot.has(domainOf(account?.email)) || pilot.has(domainOf(account?.slot)));
  const pilotHealth = senderHealth.filter(health => pilot.has(domainOf(health?.inbox)));
  return {
    rows: pilotAccounts.length + pilotHealth.length,
    identities: new Set(pilotAccounts.map(account => lower(account.email)).filter(Boolean)).size,
    snapshot: stableStringify({
      accounts: pilotAccounts.map(stableStringify).sort(),
      senderHealth: pilotHealth.map(stableStringify).sort()
    })
  };
}

// Counts the sender accounts that selectFleetMailbox would still choose one at a time.
function eligibleCount(accounts, senderHealth, nowMs) {
  let eligible = 0;
  for (const account of accounts) {
    const result = selectFleetMailbox({
      prospectId: 'winnr-production-import-verify',
      accounts: [account],
      senderHealth,
      provider: SMTP_PROVIDER,
      date: new Date(nowMs)
    });
    if (result.ok === true) eligible += 1;
  }
  return eligible;
}

// Scope check after the held-state check: no pilot row changed, no pilot identity count drift, and no SMTP sender on
// a Startup domain or in the plan is selectable. Returns the read-back destination digest for the receipt.
async function verifyImportScope(store, { planRows, startupDomains, pilotDomains, pilotBefore, expectedPilotMailboxCount, key, nowMs }) {
  const accounts = await store.list('accounts');
  const senderHealth = await store.list('senderHealth');
  const reasonCodes = [];
  const pilotAfter = pilotSnapshot({ accounts, senderHealth, pilotDomains });
  if (pilotAfter.snapshot !== pilotBefore.snapshot) reasonCodes.push('PILOT_ROWS_CHANGED');
  if (expectedPilotMailboxCount !== null && pilotAfter.identities !== expectedPilotMailboxCount) reasonCodes.push('PILOT_MAILBOX_COUNT_CHANGED');

  const plannedSlots = new Set(planRows.flatMap(row => [String(row.smtpAccount.slot), String(row.imapAccount.slot)]));
  const startup = new Set(startupDomains);
  const scope = accounts.filter(account => String(account?.provider ?? '').toLowerCase() === SMTP_PROVIDER
    && (plannedSlots.has(String(account.slot)) || startup.has(domainOf(account.email))));
  const eligible = eligibleCount(scope, senderHealth, nowMs);
  if (eligible > 0) reasonCodes.push('ELIGIBLE_SENDER_AFTER_IMPORT');

  const bySlot = new Map(accounts.map(account => [String(account?.slot ?? ''), account]));
  const lines = [];
  for (const row of planRows) {
    const smtp = bySlot.get(String(row.smtpAccount.slot));
    const imap = bySlot.get(String(row.imapAccount.slot));
    if (smtp && imap) lines.push(`${lower(smtp.email)}|${smtp.slot}`, `${lower(imap.email)}|${imap.slot}`);
  }
  return {
    ok: reasonCodes.length === 0,
    reasonCodes: publicCodes(reasonCodes),
    destinationHash16: keyedDigest16(key, 'destination', lines.sort().join('\n')),
    counts: {
      eligibleAfterImport: eligible,
      scopedSmtpAccounts: scope.length,
      pilotRowsBefore: pilotBefore.rows,
      pilotRowsAfter: pilotAfter.rows,
      pilotSnapshotChanged: pilotAfter.snapshot === pilotBefore.snapshot ? 0 : 1,
      pilotIdentities: pilotAfter.identities,
      destinationRows: lines.length / 2,
      accountsAfter: accounts.length
    }
  };
}

// Read-only checks run inside the transaction before commit, and before a no-op is accepted. Any finding throws, so the
// whole transaction rolls back.
async function verifyBeforeCommit(tx, { planRows, plan, pilotBefore, key, nowMs }) {
  const preCommit = await verifyHeldState(tx, planRows);
  if (!preCommit.ok) throw new ImportRefusal('PRE_COMMIT_VERIFY_FAILED', preCommit.reasonCodes);
  const preScope = await verifyImportScope(tx, {
    planRows, startupDomains: plan.startupDomains, pilotDomains: plan.pilotDomains, pilotBefore,
    expectedPilotMailboxCount: plan.expectedPilotMailboxCount, key, nowMs
  });
  if (!preScope.ok) throw new ImportRefusal('PRE_COMMIT_VERIFY_FAILED', preScope.reasonCodes);
}

// True when any planned key appears on more than one row of the store.
function duplicatedFor(rows, field, wanted) {
  const counts = new Map();
  for (const row of rows) {
    const value = String(row?.[field] ?? '');
    if (wanted.has(value)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.values()].some(count => count > 1);
}

// Single-flight per store object. The store's own transaction lock serialises runs across processes; this refuses a
// second call on the same store while one is still in flight in this process.
export async function executeWinnrProductionImport(input = {}) {
  const store = input?.store;
  if (!store || typeof store !== 'object') return executeImportOnce(input);
  const nowMs = toMs(input.now ?? new Date());
  if (RUNNING_IMPORT_STORES.has(store)) {
    return refusal('EXECUTE', 'PRODUCTION_IMPORT_REFUSED', ['IMPORT_ALREADY_RUNNING'], Number.isFinite(nowMs) ? isoOf(nowMs) : '');
  }
  RUNNING_IMPORT_STORES.add(store);
  try {
    return await executeImportOnce(input);
  } finally {
    RUNNING_IMPORT_STORES.delete(store);
  }
}

async function executeImportOnce({
  store,
  plan,
  executionGate = null,
  now = new Date(),
  leaseOwner = '',
  encryptionKeyHex = '',
  faultAfterWrites = 0,
  storeBackend = undefined
} = {}) {
  const nowMs = toMs(now);
  const iso = Number.isFinite(nowMs) ? isoOf(nowMs) : '';
  const reasons = validateExecutionGate(executionGate, nowMs);
  if (!KEY_RE.test(String(encryptionKeyHex ?? ''))) reasons.push('encryption-key-hex-required');
  if (!isNonEmpty(leaseOwner)) reasons.push('lease-owner-required');
  if (!Number.isInteger(faultAfterWrites) || faultAfterWrites < 0) reasons.push('fault-after-writes-invalid');
  // The backend is the store's declared backendKind. Any backend the caller asserts is refused, even a correct one.
  if (storeBackend !== undefined) reasons.push('caller-asserted-backend-refused');
  reasons.push(...storeBackendReasons(store));
  if (!store || typeof store.transaction !== 'function') reasons.push('store-transaction-required');
  if (!ISSUED_PLANS.has(plan)) reasons.push('plan-not-issued-by-planner');
  else if (plan.ok !== true || plan.status !== 'PRODUCTION_IMPORT_PLAN_READY') reasons.push('plan-not-ready');
  if (plan?.storeBackend !== 'postgres') reasons.push('plan-store-backend-not-postgres');
  // Mandatory: the approval must name this plan's digest. An approval without one never executes a plan.
  reasons.push(...approvalDigestReasons(executionGate, plan));
  const planRows = Array.isArray(plan?.rows) ? plan.rows : [];
  if (planRows.length !== EXPECTED_ACCOUNT_COUNT) reasons.push('plan-row-count-mismatch');
  if (reasons.length) return refusal('EXECUTE', 'PRODUCTION_IMPORT_REFUSED', reasons, iso);

  const key = encryptionKeyHex;
  let planCredentials;
  try {
    // Decrypted in memory only, to compare against existing accounts. Never returned or logged.
    planCredentials = planRows.map(row => ({
      smtp: openCredential(row.smtpAccount, key, 'smtp-basic'),
      imap: openCredential(row.imapAccount, key, 'imap-basic')
    }));
  } catch {
    return refusal('EXECUTE', 'PRODUCTION_IMPORT_REFUSED', ['PLAN_CIPHERTEXT_NOT_READABLE_WITH_KEY'], iso);
  }

  const day = iso.slice(0, 10);

  // Everything below runs in one transaction. A throw from any write rolls back the lease, the pauses and the accounts
  // together. The lease is acquired before the identity reads, so a concurrent run serialises on it before it reads the
  // state it is about to compare.
  const runImport = async tx => {
    if (typeof tx.updateSettingAtomically !== 'function') throw new ImportRefusal('ATOMIC_SETTING_UNAVAILABLE');
    await tx.updateSettingAtomically(WINNR_IMPORT_LEASE_SETTING, current => {
      const fresh = Boolean(current) && current.released !== true && Date.parse(current.expiresAt) > nowMs;
      if (fresh && current.owner !== leaseOwner) throw new ImportRefusal('IMPORT_ALREADY_RUNNING');
      return { owner: leaseOwner, acquiredAt: iso, expiresAt: isoOf(nowMs + WINNR_IMPORT_LEASE_TTL_MS), released: false };
    });

    const existingAccounts = await tx.list('accounts');
    const compatibility = verifyStoreKeyCompatibility({ accounts: existingAccounts, encryptionKey: key });
    if (!compatibility.ok) throw new ImportRefusal('STAGING_OR_UNREADABLE_CIPHERTEXT_PRESENT');

    const existingHealth = await tx.list('senderHealth');
    // Schema uniqueness already rejects duplicates in PostgreSQL. This refuses them for any store that does not enforce it.
    const plannedIds = new Set(planRows.flatMap(row => [String(row.smtpAccount.id), String(row.imapAccount.id)]));
    const plannedSlots = new Set(planRows.flatMap(row => [String(row.smtpAccount.slot), String(row.imapAccount.slot)]));
    const plannedInboxes = new Set(planRows.map(row => String(row.smtpAccount.slot)));
    if (duplicatedFor(existingAccounts, 'slot', plannedSlots) || duplicatedFor(existingAccounts, 'id', plannedIds)
      || duplicatedFor(existingHealth, 'inbox', plannedInboxes)) {
      throw new ImportRefusal('STORE_ROWS_DUPLICATED_FOR_IDENTITY');
    }
    // Pilot rows are snapshotted before any write and compared again before commit.
    const pilotBefore = pilotSnapshot({ accounts: existingAccounts, senderHealth: existingHealth, pilotDomains: plan.pilotDomains });
    if (plan.expectedPilotMailboxCount !== null && pilotBefore.identities !== plan.expectedPilotMailboxCount) {
      throw new ImportRefusal('PILOT_MAILBOX_COUNT_MISMATCH');
    }

    const bySlot = new Map();
    const byId = new Map();
    for (const account of existingAccounts) {
      if (account?.slot) bySlot.set(String(account.slot), account);
      if (account?.id) byId.set(String(account.id), account);
    }
    const actions = planRows.map((row, index) => ({
      smtp: classifyExistingAccount({ account: row.smtpAccount, credential: planCredentials[index].smtp, kind: 'smtp-basic', key, bySlot, byId }),
      imap: classifyExistingAccount({ account: row.imapAccount, credential: planCredentials[index].imap, kind: 'imap-basic', key, bySlot, byId })
    }));
    if (actions.some(a => a.smtp === 'CONTRADICTION' || a.imap === 'CONTRADICTION')) throw new ImportRefusal('CREDENTIAL_CONTRADICTION');
    if (actions.some(a => a.smtp === 'COLLISION' || a.imap === 'COLLISION')) throw new ImportRefusal('ACCOUNT_IDENTITY_COLLISION');

    const healthByInbox = new Map(existingHealth.map(row => [String(row?.inbox ?? ''), row]));
    const isHeld = row => row?.paused === true && row.pauseReason === WINNR_IMPORT_HOLD_REASON;
    const existingImapFor = row => bySlot.get(String(row.imapAccount.slot)) || byId.get(String(row.imapAccount.id));
    const imapNeedsPatch = row => {
      const existing = existingImapFor(row);
      return Boolean(existing) && existing.connected !== false;
    };
    // Writes this run would make. Zero means the store already holds the plan, and the run must write nothing at all.
    const pendingWrites = planRows.reduce((total, row, index) => total
      + (isHeld(healthByInbox.get(String(row.smtpAccount.slot))) ? 0 : 1)
      + (actions[index].smtp === 'WRITE' ? 1 : 0)
      + (actions[index].imap === 'WRITE' ? 1 : 0)
      + (actions[index].imap === 'PRESENT' && imapNeedsPatch(row) ? 1 : 0), 0);
    if (pendingWrites === 0) {
      await verifyBeforeCommit(tx, { planRows, plan, pilotBefore, key, nowMs });
      throw new ImportNoop({
        committedWrites: 0,
        writtenRows: 0,
        alreadyPresentRows: planRows.length,
        pauseWrites: planRows.length,
        smtpAccountWrites: 0,
        imapAccountWrites: 0,
        accountsBefore: existingAccounts.length,
        pilotBefore
      });
    }

    let writes = 0;
    const beforeWrite = () => {
      if (faultAfterWrites > 0 && writes >= faultAfterWrites) {
        const fault = new Error('fault injected for atomicity test');
        fault.code = 'FAULT_INJECTED_AFTER_WRITES';
        throw fault;
      }
      writes += 1;
    };
    let pauseWrites = 0;
    let smtpAccountWrites = 0;
    let imapAccountWrites = 0;
    let writtenRows = 0;
    let alreadyPresentRows = 0;
    const imapPatched = planRows.map(() => false);
    // Pass 1, holds first: every planned SMTP sender is paused, and every present IMAP account is disconnected, before
    // any account is created. Every planned SMTP sender is asserted held on every run, including senders that are already
    // present, so an operator change since the last run is put back under hold. A hold that is already in place is
    // asserted but not rewritten, so a repeat run writes nothing.
    for (let index = 0; index < planRows.length; index += 1) {
      const row = planRows[index];
      const action = actions[index];
      const inbox = String(row.smtpAccount.slot);
      pauseWrites += 1;
      if (!isHeld(healthByInbox.get(inbox))) {
        beforeWrite();
        await tx.upsert('senderHealth', heldSenderRecord(healthByInbox.get(inbox), inbox, WINNR_IMPORT_HOLD_REASON, iso, day));
      }
      if (action.imap === 'PRESENT') {
        // A present IMAP account must still end disconnected. Patch only the connection flag and keep its credential.
        const existingImap = existingImapFor(row);
        if (imapNeedsPatch(row)) {
          beforeWrite();
          await tx.upsert('accounts', { ...existingImap, connected: false, updatedAt: iso });
          imapAccountWrites += 1;
          imapPatched[index] = true;
        }
      }
    }
    // Pass 2, account creation. Only reached once every hold above has been written in this transaction.
    for (let index = 0; index < planRows.length; index += 1) {
      const row = planRows[index];
      const action = actions[index];
      let rowWrote = imapPatched[index];
      if (action.smtp === 'WRITE') {
        beforeWrite();
        await tx.upsert('accounts', { ...row.smtpAccount, updatedAt: iso });
        smtpAccountWrites += 1;
        rowWrote = true;
      }
      if (action.imap === 'WRITE') {
        beforeWrite();
        await tx.upsert('accounts', { ...row.imapAccount, connected: false, updatedAt: iso });
        imapAccountWrites += 1;
        rowWrote = true;
      }
      if (rowWrote) writtenRows += 1;
      else alreadyPresentRows += 1;
    }

    // Verify inside the transaction, before commit. A mismatch throws, so the whole batch rolls back and nothing
    // selectable is left behind. The post-commit read-back below is a second, independent check.
    await verifyBeforeCommit(tx, { planRows, plan, pilotBefore, key, nowMs });

    await tx.setSetting(WINNR_IMPORT_LEASE_SETTING, { owner: leaseOwner, released: true, releasedAt: iso, expiresAt: iso });
    return {
      committedWrites: writes,
      writtenRows,
      alreadyPresentRows,
      pauseWrites,
      smtpAccountWrites,
      imapAccountWrites,
      accountsBefore: existingAccounts.length,
      pilotBefore
    };
  };

  let report;
  let noop = false;
  try {
    report = await store.transaction(runImport);
  } catch (error) {
    if (error instanceof ImportNoop) {
      report = error.report;
      noop = true;
    } else if (error instanceof ImportRefusal) {
      return refusal('EXECUTE', 'PRODUCTION_IMPORT_REFUSED', error.reasonCodes, iso);
    } else {
      return refusal('EXECUTE', 'PRODUCTION_IMPORT_ROLLED_BACK', ['IMPORT_TRANSACTION_ROLLED_BACK', sanitizedErrorCode(error)], iso);
    }
  }

  // Read-back after commit. A failed check reports and changes nothing further.
  const verification = await verifyHeldState(store, planRows);
  const postScope = await verifyImportScope(store, {
    planRows, startupDomains: plan.startupDomains, pilotDomains: plan.pilotDomains, pilotBefore: report.pilotBefore,
    expectedPilotMailboxCount: plan.expectedPilotMailboxCount, key, nowMs
  });
  const hashes = { sourceHash16: plan.sourceHash16, destinationHash16: postScope.destinationHash16 };
  const counts = {
    rows: EXPECTED_ACCOUNT_COUNT,
    sourceRows: plan.counts?.rows ?? 0,
    accountsBefore: report.accountsBefore,
    committedWrites: report.committedWrites,
    writtenRows: report.writtenRows,
    alreadyPresentRows: report.alreadyPresentRows,
    pauseWrites: report.pauseWrites,
    smtpAccountWrites: report.smtpAccountWrites,
    imapAccountWrites: report.imapAccountWrites,
    ...verification.counts,
    ...postScope.counts
  };
  const verifyCodes = [...verification.reasonCodes, ...postScope.reasonCodes];
  if (verifyCodes.length) {
    const codes = publicCodes(verifyCodes);
    return {
      ok: false,
      status: 'PRODUCTION_IMPORT_POST_VERIFY_FAILED',
      reasonCodes: codes,
      counts,
      publicReceipt: buildPublicReceipt({ kind: 'EXECUTE', status: 'PRODUCTION_IMPORT_POST_VERIFY_FAILED', reasonCodes: codes, counts, recordedAt: iso, hashes }),
      receiptStored: false
    };
  }

  const status = report.writtenRows === 0 ? 'PRODUCTION_IMPORT_ALREADY_PRESENT' : 'PRODUCTION_IMPORT_EXECUTED';
  const receipt = buildPublicReceipt({ kind: 'EXECUTE', status, reasonCodes: [], counts, recordedAt: iso, hashes });
  // A no-op wrote nothing, so it stores no receipt and logs nothing. The earlier receipt stays exactly as it was.
  if (noop) return { ok: true, status, reasonCodes: [], counts, publicReceipt: receipt, receiptStored: false };
  const reasonCodes = [];
  let receiptStored = true;
  try {
    await store.setSetting(WINNR_IMPORT_RECEIPT_SETTING, receipt);
    await store.log('WINNR_PRODUCTION_IMPORT', receipt);
  } catch (error) {
    receiptStored = false;
    reasonCodes.push('RECEIPT_NOT_STORED', sanitizedErrorCode(error));
  }
  return { ok: true, status, reasonCodes, counts, publicReceipt: receipt, receiptStored };
}

// Keeps every imported SMTP sender paused and every imported IMAP account disconnected. Nothing is deleted, and no
// credential is rewritten. Safe to run more than once: rows already in the rolled-back state are not written again.
export async function rollbackWinnrProductionImport(input = {}) {
  const store = input?.store;
  if (!store || typeof store !== 'object') return rollbackImportOnce(input);
  const nowMs = toMs(input.now ?? new Date());
  if (RUNNING_IMPORT_STORES.has(store)) {
    return refusal('ROLLBACK', 'PRODUCTION_IMPORT_ROLLBACK_REFUSED', ['IMPORT_ALREADY_RUNNING'], Number.isFinite(nowMs) ? isoOf(nowMs) : '');
  }
  RUNNING_IMPORT_STORES.add(store);
  try {
    return await rollbackImportOnce(input);
  } finally {
    RUNNING_IMPORT_STORES.delete(store);
  }
}

async function rollbackImportOnce({ store, plan, executionGate = null, now = new Date() } = {}) {
  const nowMs = toMs(now);
  const iso = Number.isFinite(nowMs) ? isoOf(nowMs) : '';
  // Expiry is not enforced here. Holding senders is the fail-safe direction, so an expired approval must not block it.
  const reasons = validateExecutionGate(executionGate, nowMs, { enforceExpiry: false });
  reasons.push(...storeBackendReasons(store), ...approvalDigestReasons(executionGate, plan));
  if (!store || typeof store.transaction !== 'function') reasons.push('store-transaction-required');
  if (!ISSUED_PLANS.has(plan)) reasons.push('plan-not-issued-by-planner');
  const planRows = Array.isArray(plan?.rows) ? plan.rows : [];
  if (planRows.length !== EXPECTED_ACCOUNT_COUNT) reasons.push('plan-row-count-mismatch');
  if (reasons.length) return refusal('ROLLBACK', 'PRODUCTION_IMPORT_ROLLBACK_REFUSED', reasons, iso);

  const day = iso.slice(0, 10);
  let report;
  try {
    report = await store.transaction(async tx => {
      const accounts = await tx.list('accounts');
      const health = await tx.list('senderHealth');
      const healthByInbox = new Map(health.map(row => [String(row?.inbox ?? ''), row]));
      const imapBySlot = new Map(accounts.filter(a => a?.provider === IMAP_PROVIDER).map(a => [String(a.slot), a]));
      let pauseWrites = 0;
      let imapHoldWrites = 0;
      let imapAccountsAbsent = 0;
      for (const row of planRows) {
        const inbox = String(row.smtpAccount.slot);
        const existing = healthByInbox.get(inbox);
        if (existing?.paused !== true || existing.pauseReason !== WINNR_IMPORT_ROLLBACK_REASON) {
          await tx.upsert('senderHealth', heldSenderRecord(existing, inbox, WINNR_IMPORT_ROLLBACK_REASON, iso, day));
          pauseWrites += 1;
        }
        const imap = imapBySlot.get(String(row.imapAccount.slot));
        if (!imap) {
          imapAccountsAbsent += 1;
          continue;
        }
        if (imap.connected !== false) {
          await tx.upsert('accounts', { ...imap, connected: false, updatedAt: iso });
          imapHoldWrites += 1;
        }
      }
      return { pauseWrites, imapHoldWrites, imapAccountsAbsent };
    });
  } catch (error) {
    return refusal('ROLLBACK', 'PRODUCTION_IMPORT_ROLLBACK_FAILED', ['ROLLBACK_TRANSACTION_FAILED', sanitizedErrorCode(error)], iso);
  }

  const accounts = await store.list('accounts');
  const health = await store.list('senderHealth');
  const healthByInbox = new Map(health.map(row => [String(row?.inbox ?? ''), row]));
  const imapBySlot = new Map(accounts.filter(a => a?.provider === IMAP_PROVIDER).map(a => [String(a.slot), a]));
  const verifyReasons = [];
  let verifiedSmtpRolledBack = 0;
  let verifiedImapHeld = 0;
  for (const row of planRows) {
    const sender = healthByInbox.get(String(row.smtpAccount.slot));
    if (sender?.paused === true && sender.pauseReason === WINNR_IMPORT_ROLLBACK_REASON) verifiedSmtpRolledBack += 1;
    else verifyReasons.push('SMTP_SENDER_NOT_ROLLED_BACK');
    const imap = imapBySlot.get(String(row.imapAccount.slot));
    if (imap && imap.connected !== false) verifyReasons.push('IMAP_ACCOUNT_STILL_CONNECTED');
    if (imap && imap.connected === false) verifiedImapHeld += 1;
  }
  const counts = {
    rows: EXPECTED_ACCOUNT_COUNT,
    senderPauseWrites: report.pauseWrites,
    imapHoldWrites: report.imapHoldWrites,
    imapAccountsAbsent: report.imapAccountsAbsent,
    verifiedSmtpRolledBack,
    verifiedImapHeld
  };
  if (verifyReasons.length) {
    const codes = publicCodes(verifyReasons);
    return {
      ok: false,
      status: 'PRODUCTION_IMPORT_ROLLBACK_VERIFY_FAILED',
      reasonCodes: codes,
      counts,
      publicReceipt: buildPublicReceipt({ kind: 'ROLLBACK', status: 'PRODUCTION_IMPORT_ROLLBACK_VERIFY_FAILED', reasonCodes: codes, counts, recordedAt: iso }),
      receiptStored: false
    };
  }

  const complete = report.imapAccountsAbsent === 0;
  const status = complete ? 'PRODUCTION_IMPORT_ROLLED_BACK' : 'PRODUCTION_IMPORT_ROLLBACK_INCOMPLETE';
  const reasonCodes = complete ? [] : ['IMAP_ACCOUNT_ABSENT'];
  const receipt = buildPublicReceipt({ kind: 'ROLLBACK', status, reasonCodes, counts, recordedAt: iso });
  let receiptStored = true;
  try {
    await store.setSetting(WINNR_IMPORT_ROLLBACK_RECEIPT_SETTING, receipt);
    await store.log('WINNR_PRODUCTION_IMPORT_ROLLBACK', receipt);
  } catch (error) {
    receiptStored = false;
    reasonCodes.push('RECEIPT_NOT_STORED', sanitizedErrorCode(error));
  }
  return { ok: complete, status, reasonCodes, counts, publicReceipt: receipt, receiptStored };
}
