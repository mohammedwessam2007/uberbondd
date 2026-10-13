import { decryptJson } from './crypto.mjs';
import { compileWinnrCredentialImport, winnrCredentialRows } from './uberwinnr-credential-import.mjs';
import { parseExpectedInventory, gateCsvInventory, gateProviderInventory, gateCsvAgainstProvider } from './winnr-inventory-gate.mjs';
import { findDuplicateAddresses, verifyStoreKeyCompatibility } from './winnr-fleet-control-plane.mjs';
import { assertPublicSafe, sanitizedErrorCode } from './winnr-public-artifact-guard.mjs';

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

const EXPECTED_ACCOUNT_COUNT = 50;
const KEY_RE = /^[a-f0-9]{64}$/i;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const SMTP_PROVIDER = 'smtp-relay';
const IMAP_PROVIDER = 'imap-forwarding';

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

class ImportRefusal extends Error {
  constructor(code) {
    super('winnr-production-import-refused');
    this.name = 'ImportRefusal';
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
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
function buildPublicReceipt({ kind, status, reasonCodes = [], counts = {}, recordedAt = '' }) {
  const receipt = {
    version: WINNR_PRODUCTION_IMPORT_VERSION,
    kind,
    status,
    reasonCodes: publicCodes(reasonCodes),
    counts: { ...counts },
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
  now = new Date()
} = {}) {
  const nowMs = toMs(now);
  const recordedAt = Number.isFinite(nowMs) ? isoOf(nowMs) : '';
  const reasons = [];
  const counts = { rows: 0, prepared: 0, failed: 0, duplicateIdentityCount: 0, providerRecordCount: 0 };
  let planRows = [];
  try {
    reasons.push(...validateExecutionGate(executionGate, nowMs));
    if (executionGate?.routeAuthorized !== true) reasons.push('gate-route-authorization-required');
    if (executionGate?.termsCompatible !== true) reasons.push('gate-terms-compatibility-required');
    if (keyLabel !== WINNR_PRODUCTION_KEY_LABEL) reasons.push('key-label-not-production');
    if (!KEY_RE.test(String(encryptionKeyHex ?? ''))) reasons.push('encryption-key-hex-required');
    if (storeBackend !== 'postgres') reasons.push('store-backend-not-postgres');
    if (!isNonEmpty(workspaceId)) reasons.push('workspace-link-required');
    if (!isNonEmpty(routeEvidenceRef)) reasons.push('route-evidence-required');

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
  const plan = deepFreeze({
    ok,
    status,
    reasonCodes,
    counts: { ...counts },
    rows: ok ? planRows : [],
    storeBackend: ok ? 'postgres' : '',
    version: WINNR_PRODUCTION_IMPORT_VERSION,
    publicReceipt: buildPublicReceipt({ kind: 'PLAN', status, reasonCodes, counts, recordedAt })
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
    if (accountByKey.has(`${SMTP_PROVIDER}|${row.smtpAccount.slot}`)) counts.verifiedSmtpAccounts += 1;
    else reasonCodes.push('SMTP_ACCOUNT_ABSENT');
    const imap = accountByKey.get(`${IMAP_PROVIDER}|${row.imapAccount.slot}`);
    if (imap && imap.connected === false) counts.verifiedImapHeld += 1;
    else reasonCodes.push('IMAP_ACCOUNT_NOT_HELD');
  }
  return { ok: reasonCodes.length === 0, reasonCodes: publicCodes(reasonCodes), counts };
}

export async function executeWinnrProductionImport({
  store,
  plan,
  executionGate = null,
  now = new Date(),
  leaseOwner = '',
  encryptionKeyHex = '',
  faultAfterWrites = 0
} = {}) {
  const nowMs = toMs(now);
  const iso = Number.isFinite(nowMs) ? isoOf(nowMs) : '';
  const reasons = validateExecutionGate(executionGate, nowMs);
  if (!KEY_RE.test(String(encryptionKeyHex ?? ''))) reasons.push('encryption-key-hex-required');
  if (!isNonEmpty(leaseOwner)) reasons.push('lease-owner-required');
  if (!Number.isInteger(faultAfterWrites) || faultAfterWrites < 0) reasons.push('fault-after-writes-invalid');
  if (!store || typeof store.transaction !== 'function') reasons.push('store-transaction-required');
  if (!ISSUED_PLANS.has(plan)) reasons.push('plan-not-issued-by-planner');
  else if (plan.ok !== true || plan.status !== 'PRODUCTION_IMPORT_PLAN_READY') reasons.push('plan-not-ready');
  if (plan?.storeBackend !== 'postgres') reasons.push('plan-store-backend-not-postgres');
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

    const healthByInbox = new Map((await tx.list('senderHealth')).map(row => [String(row?.inbox ?? ''), row]));

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
    for (let index = 0; index < planRows.length; index += 1) {
      const row = planRows[index];
      const action = actions[index];
      let rowWrote = false;
      // Every planned SMTP sender is held on every run, including senders that are already present. A present
      // sender that lacks a hold is exactly the case a missing pause would leave selectable.
      const inbox = String(row.smtpAccount.slot);
      beforeWrite();
      await tx.upsert('senderHealth', heldSenderRecord(healthByInbox.get(inbox), inbox, WINNR_IMPORT_HOLD_REASON, iso, day));
      pauseWrites += 1;
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
      } else {
        // A present IMAP account must still end disconnected. Patch only the connection flag and keep its credential.
        const existingImap = bySlot.get(String(row.imapAccount.slot)) || byId.get(String(row.imapAccount.id));
        if (existingImap && existingImap.connected !== false) {
          beforeWrite();
          await tx.upsert('accounts', { ...existingImap, connected: false, updatedAt: iso });
          imapAccountWrites += 1;
          rowWrote = true;
        }
      }
      if (rowWrote) writtenRows += 1;
      else alreadyPresentRows += 1;
    }

    // Verify inside the transaction, before commit. A mismatch throws, so the whole batch rolls back and nothing
    // selectable is left behind. The post-commit read-back below is a second, independent check.
    const preCommit = await verifyHeldState(tx, planRows);
    if (!preCommit.ok) throw new ImportRefusal('PRE_COMMIT_VERIFY_FAILED');

    await tx.setSetting(WINNR_IMPORT_LEASE_SETTING, { owner: leaseOwner, released: true, releasedAt: iso, expiresAt: iso });
    return {
      committedWrites: writes,
      writtenRows,
      alreadyPresentRows,
      pauseWrites,
      smtpAccountWrites,
      imapAccountWrites
    };
  };

  let report;
  try {
    report = await store.transaction(runImport);
  } catch (error) {
    if (error instanceof ImportRefusal) return refusal('EXECUTE', 'PRODUCTION_IMPORT_REFUSED', [error.code], iso);
    return refusal('EXECUTE', 'PRODUCTION_IMPORT_ROLLED_BACK', ['IMPORT_TRANSACTION_ROLLED_BACK', sanitizedErrorCode(error)], iso);
  }

  // Read-back after commit. A failed check reports and changes nothing further.
  const verification = await verifyHeldState(store, planRows);
  const counts = {
    rows: EXPECTED_ACCOUNT_COUNT,
    committedWrites: report.committedWrites,
    writtenRows: report.writtenRows,
    alreadyPresentRows: report.alreadyPresentRows,
    pauseWrites: report.pauseWrites,
    smtpAccountWrites: report.smtpAccountWrites,
    imapAccountWrites: report.imapAccountWrites,
    ...verification.counts
  };
  if (!verification.ok) {
    return {
      ok: false,
      status: 'PRODUCTION_IMPORT_POST_VERIFY_FAILED',
      reasonCodes: verification.reasonCodes,
      counts,
      publicReceipt: buildPublicReceipt({ kind: 'EXECUTE', status: 'PRODUCTION_IMPORT_POST_VERIFY_FAILED', reasonCodes: verification.reasonCodes, counts, recordedAt: iso }),
      receiptStored: false
    };
  }

  const status = report.writtenRows === 0 ? 'PRODUCTION_IMPORT_ALREADY_PRESENT' : 'PRODUCTION_IMPORT_EXECUTED';
  const receipt = buildPublicReceipt({ kind: 'EXECUTE', status, reasonCodes: [], counts, recordedAt: iso });
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
export async function rollbackWinnrProductionImport({ store, plan, executionGate = null, now = new Date() } = {}) {
  const nowMs = toMs(now);
  const iso = Number.isFinite(nowMs) ? isoOf(nowMs) : '';
  // Expiry is not enforced here. Holding senders is the fail-safe direction, so an expired approval must not block it.
  const reasons = validateExecutionGate(executionGate, nowMs, { enforceExpiry: false });
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
