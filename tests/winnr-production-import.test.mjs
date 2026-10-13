import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  planWinnrProductionImport,
  executeWinnrProductionImport,
  rollbackWinnrProductionImport,
  WINNR_PRODUCTION_IMPORT_CONFIRMATION,
  WINNR_IMPORT_HOLD_REASON,
  WINNR_IMPORT_ROLLBACK_REASON,
  WINNR_PRODUCTION_KEY_LABEL
} from '../src/winnr-production-import.mjs';
import { buildEncryptedSmtpAccount, selectFleetMailbox } from '../src/uberfleet.mjs';
import { assertPublicSafe } from '../src/winnr-public-artifact-guard.mjs';

// Fixtures use reserved names (*.test) and secrets generated inside each test. Nothing here is printed.

const NOW = new Date('2026-10-13T12:00:00.000Z');
const ROLES = ['hello', 'team', 'connect', 'partnerships', 'growth'];
const STARTUP_DOMAINS = Array.from({ length: 10 }, (_, i) => `startup${String(i + 1).padStart(2, '0')}.test`);
const PILOT_DOMAIN = 'pilot-probe.test';
const WORKSPACE = 'workspace-test-1';
const ROUTE_REF = 'receipt:route-evidence-test-1';
const OWNER = 'run-test-owner-1';
const SETTINGS_LEASE = 'winnrProductionImportLease';
const SETTINGS_RECEIPT = 'winnrProductionImportReceipt';
const SETTINGS_ROLLBACK_RECEIPT = 'winnrProductionImportRollbackReceipt';

const hex = bytes => crypto.randomBytes(bytes).toString('hex');
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);

function buildRows() {
  const rows = [];
  for (const domain of STARTUP_DOMAINS) {
    for (const role of ROLES) {
      rows.push({
        email: `${role}@${domain}`,
        fromName: capitalize(role),
        domain,
        password: hex(18),
        imapPassword: hex(18)
      });
    }
  }
  return rows;
}

function buildCsv(rows) {
  const header = 'from_email,from_name,domain,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password';
  const lines = rows.map(r => [
    r.email, r.fromName, r.domain, r.email, r.password,
    'smtp.relay.test', 465, 'imap.relay.test', 993, r.email, r.imapPassword
  ].join(','));
  return [header, ...lines].join('\n') + '\n';
}

function buildProviderDomains() {
  const startup = STARTUP_DOMAINS.map((name, i) => ({
    id: `dom-${i + 1}`, name, status: 'active', dns_provider: 'test-dns', registrar: 'test-registrar', tags: []
  }));
  return [...startup, { id: 'dom-pilot', name: PILOT_DOMAIN, status: 'active', dns_provider: 'test-dns', registrar: 'test-registrar', tags: ['pre-warmed'] }];
}

function buildProviderMailboxes(rows) {
  return rows.map((r, i) => ({
    id: `mbx-${i + 1}`,
    domain: r.domain,
    full_address: r.email,
    status: 'active',
    smtp_host: 'smtp.relay.test',
    smtp_port: 465,
    imap_host: 'imap.relay.test',
    imap_port: 993
  }));
}

function buildGate(now, overrides = {}) {
  return {
    mode: 'PRODUCTION_IMPORT',
    confirmation: WINNR_PRODUCTION_IMPORT_CONFIRMATION,
    approvalRef: 'approval-test-1',
    reviewedCommit: hex(20),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    expectedAccountCount: 50,
    routeAuthorized: true,
    termsCompatible: true,
    ...overrides
  };
}

function scenario() {
  const rows = buildRows();
  return {
    now: NOW,
    key: hex(32),
    rows,
    csv: buildCsv(rows),
    expectedText: JSON.stringify({ startupDomains: STARTUP_DOMAINS, pilotDomains: [PILOT_DOMAIN] }),
    providerDomains: buildProviderDomains(),
    providerMailboxes: buildProviderMailboxes(rows),
    gate: buildGate(NOW)
  };
}

function planFor(s, overrides = {}) {
  return planWinnrProductionImport({
    csvText: s.csv,
    expectedInventoryText: s.expectedText,
    encryptionKeyHex: s.key,
    keyLabel: WINNR_PRODUCTION_KEY_LABEL,
    storeBackend: 'postgres',
    workspaceId: WORKSPACE,
    routeEvidenceRef: ROUTE_REF,
    providerDomains: s.providerDomains,
    providerMailboxes: s.providerMailboxes,
    executionGate: s.gate,
    now: s.now,
    ...overrides
  });
}

// In-memory store with the same transaction semantics as the JSON store: writes are staged and committed only when the
// callback resolves. A throw discards every staged write, including settings.
function createFakeStore() {
  const base = { accounts: [], senderHealth: [], settings: {}, auditLog: [] };
  const operations = target => {
    const setSetting = async (key, value) => {
      target.settings[key] = structuredClone(value);
      return structuredClone(value);
    };
    return {
      async list(key) {
        if (!Array.isArray(target[key])) throw Object.assign(new Error('unknown collection'), { code: 'INVALID_COLLECTION' });
        return structuredClone(target[key]);
      },
      async get(key, id) {
        return structuredClone((target[key] || []).find(row => row.id === id) || null);
      },
      async upsert(key, item) {
        const rows = target[key];
        if (key === 'accounts' && rows.some(row => row.slot === item.slot && row.id !== item.id)) {
          throw Object.assign(new Error('duplicate account slot'), { code: 'CONFLICT' });
        }
        const copy = structuredClone(item);
        const index = rows.findIndex(row => row.id === item.id);
        if (index >= 0) rows[index] = copy;
        else rows.push(copy);
        return structuredClone(copy);
      },
      async getSettings() {
        return structuredClone(target.settings);
      },
      setSetting,
      async updateSettingAtomically(key, update) {
        return setSetting(key, await update(structuredClone(target.settings[key])));
      },
      async log(type, detail = {}) {
        target.auditLog.push({ id: `log-${target.auditLog.length + 1}`, type, detail: structuredClone(detail) });
      }
    };
  };
  const store = {
    state: base,
    ...operations(base),
    async transaction(fn) {
      const staged = structuredClone(base);
      const result = await fn(operations(staged));
      for (const key of Object.keys(staged)) base[key] = staged[key];
      return result;
    }
  };
  return store;
}

function identityLeaks(text, s) {
  for (const row of s.rows) {
    if (text.includes(row.password) || text.includes(row.imapPassword)) return 'password';
    if (text.includes(row.email)) return 'address';
  }
  for (const domain of [...STARTUP_DOMAINS, PILOT_DOMAIN]) {
    if (text.includes(domain)) return 'domain';
  }
  return '';
}

function assertRefused(plan, code) {
  assert.equal(plan.ok, false);
  assert.equal(plan.status, 'PRODUCTION_IMPORT_REFUSED');
  assert.deepEqual(plan.rows, []);
  assert.ok(plan.reasonCodes.includes(code), `expected ${code} in ${plan.reasonCodes.join(',')}`);
}

// ---- planning refusals ------------------------------------------------------

test('plan refuses a missing or wrong confirmation', () => {
  const s = scenario();
  assertRefused(planFor(s, { executionGate: { ...s.gate, confirmation: undefined } }), 'gate-confirmation-mismatch');
  assertRefused(planFor(s, { executionGate: { ...s.gate, confirmation: 'IMPORT-50' } }), 'gate-confirmation-mismatch');
});

test('plan refuses an expired gate', () => {
  const s = scenario();
  const expired = { ...s.gate, expiresAt: new Date(NOW.getTime() - 1000).toISOString() };
  assertRefused(planFor(s, { executionGate: expired }), 'gate-expired');
});

test('plan refuses a reviewed commit that is not a full lowercase 40-hex SHA', () => {
  const s = scenario();
  assertRefused(planFor(s, { executionGate: { ...s.gate, reviewedCommit: 'abc123' } }), 'gate-reviewed-commit-invalid');
  assertRefused(planFor(s, { executionGate: { ...s.gate, reviewedCommit: hex(20).toUpperCase() } }), 'gate-reviewed-commit-invalid');
});

test('plan refuses when the expected account count is not 50', () => {
  const s = scenario();
  assertRefused(planFor(s, { executionGate: { ...s.gate, expectedAccountCount: 49 } }), 'gate-expected-account-count-mismatch');
});

test('plan refuses the staging key label', () => {
  const s = scenario();
  assertRefused(planFor(s, { keyLabel: 'STAGING_KEY_FROM_STAGING_FILE' }), 'key-label-not-production');
});

test('plan refuses the JSON file store backend', () => {
  const s = scenario();
  assertRefused(planFor(s, { storeBackend: 'json' }), 'store-backend-not-postgres');
});

test('plan refuses a pilot row present in the export', () => {
  const s = scenario();
  const rows = s.rows.map((r, i) => (i === 0 ? { ...r, email: `hello@${PILOT_DOMAIN}`, domain: PILOT_DOMAIN } : r));
  assertRefused(planFor({ ...s, csv: buildCsv(rows) }), 'pilot-domain-present');
});

test('plan refuses a duplicate address in the export and reports it through the duplicate check', () => {
  const s = scenario();
  const rows = [...s.rows];
  rows[49] = { ...rows[0] };
  const plan = planFor({ ...s, csv: buildCsv(rows) });
  assertRefused(plan, 'duplicate-address-in-export');
  assert.equal(plan.counts.duplicateIdentityCount, 1);
});

test('plan refuses when the export does not match the provider inventory', () => {
  const s = scenario();
  const providerMailboxes = s.providerMailboxes.map((m, i) => (i === 49 ? { ...m, full_address: `extra@${STARTUP_DOMAINS[9]}` } : m));
  assertRefused(planFor({ ...s, providerMailboxes }), 'csv-address-not-in-provider');
});

test('plan refuses a missing expected inventory', () => {
  const s = scenario();
  const plan = planFor(s, { expectedInventoryText: JSON.stringify({ startupDomains: [], pilotDomains: [PILOT_DOMAIN] }) });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.rows, []);
  // Digits in public codes are normalised to N, so the count-mismatch code is the same for any count.
  assert.ok(plan.reasonCodes.includes('inventory-startup-domain-count-not-N'), plan.reasonCodes.join(','));
});

test('a refused plan and its public receipt carry no identity from the fixture', () => {
  const s = scenario();
  const plan = planFor(s, { keyLabel: 'STAGING_KEY_FROM_STAGING_FILE' });
  assert.equal(plan.ok, false);
  assertPublicSafe(plan.publicReceipt);
  assert.equal(identityLeaks(JSON.stringify(plan), s), '');
});

test('a successful plan yields 50 private rows with lower-cased identities, held IMAP accounts and no plaintext', () => {
  const s = scenario();
  const plan = planFor(s);
  assert.equal(plan.ok, true, plan.reasonCodes.join(','));
  assert.equal(plan.status, 'PRODUCTION_IMPORT_PLAN_READY');
  assert.equal(plan.rows.length, 50);
  assert.equal(plan.counts.prepared, 50);
  for (const row of plan.rows) {
    // The private rows carry the identity on purpose: execution needs it. They must never carry a password in clear.
    assert.equal(row.identity, row.identity.toLowerCase());
    assert.equal(row.smtpAccount.provider, 'smtp-relay');
    assert.equal(row.imapAccount.provider, 'imap-forwarding');
    assert.equal(row.imapAccount.connected, false);
  }
  const rowsText = JSON.stringify(plan.rows);
  for (const row of s.rows) {
    assert.equal(rowsText.includes(row.password), false, 'SMTP password must not appear in plan rows');
    assert.equal(rowsText.includes(row.imapPassword), false, 'IMAP password must not appear in plan rows');
  }
  assertPublicSafe(plan.publicReceipt);
  assert.equal(identityLeaks(JSON.stringify(plan.publicReceipt), s), '');
});

test('plan returns no sendable rows without the production key', () => {
  const s = scenario();
  const plan = planFor(s, { encryptionKeyHex: 'not-a-key' });
  assertRefused(plan, 'encryption-key-hex-required');
});

// ---- execution --------------------------------------------------------------

test('execute on 50 rows: every SMTP sender is held, every IMAP account is disconnected, no mailbox is selectable', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  const result = await executeWinnrProductionImport({
    store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(result.ok, true, result.reasonCodes.join(','));
  assert.equal(result.status, 'PRODUCTION_IMPORT_EXECUTED');
  assert.equal(result.counts.writtenRows, 50);
  assert.equal(result.counts.pauseWrites, 50);
  assert.equal(result.counts.smtpAccountWrites, 50);
  assert.equal(result.counts.imapAccountWrites, 50);

  const health = new Map(store.state.senderHealth.map(h => [h.inbox, h]));
  for (const row of s.rows) {
    const smtpSlot = `winnr:${row.email}`;
    const imapSlot = `winnr-imap:${row.email}`;
    const sender = health.get(smtpSlot);
    assert.equal(sender?.paused, true, `sender ${smtpSlot} must be paused`);
    assert.equal(sender.pauseReason, WINNR_IMPORT_HOLD_REASON);
    const smtpAccount = store.state.accounts.find(a => a.slot === smtpSlot && a.provider === 'smtp-relay');
    assert.ok(smtpAccount, 'SMTP account present');
    const imapAccount = store.state.accounts.find(a => a.slot === imapSlot && a.provider === 'imap-forwarding');
    assert.ok(imapAccount, 'IMAP account present');
    assert.equal(imapAccount.connected, false);
  }
  assert.equal(store.state.accounts.length, 100);

  for (const account of store.state.accounts) {
    const r = selectFleetMailbox({
      prospectId: 'prospect-test', accounts: [account], senderHealth: store.state.senderHealth, provider: 'smtp-relay', date: NOW
    });
    assert.equal(r.ok, false, `account ${account.slot} must not be selectable`);
  }
  const all = selectFleetMailbox({
    prospectId: 'prospect-test', accounts: store.state.accounts, senderHealth: store.state.senderHealth, provider: 'smtp-relay', date: NOW
  });
  assert.equal(all.ok, false);
  assert.equal(all.status, 'UBERFLEET_NO_ELIGIBLE_MAILBOX');
});

test('execute releases its lease and stores a public receipt with an audit entry', async () => {
  const s = scenario();
  const store = createFakeStore();
  const result = await executeWinnrProductionImport({
    store, plan: planFor(s), executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(result.ok, true);
  assert.equal(result.receiptStored, true);
  const lease = store.state.settings[SETTINGS_LEASE];
  assert.equal(lease.released, true);
  assert.equal(lease.owner, OWNER);
  assert.ok(store.state.settings[SETTINGS_RECEIPT]);
  assert.equal(store.state.auditLog.filter(e => e.type === 'WINNR_PRODUCTION_IMPORT').length, 1);
});

test('an idempotent re-run writes no new accounts, re-asserts every hold, and reports every row as already present', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  await executeWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  const accountsBefore = structuredClone(store.state.accounts);
  const healthBefore = structuredClone(store.state.senderHealth);
  const second = await executeWinnrProductionImport({
    store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(second.ok, true, second.reasonCodes.join(','));
  assert.equal(second.status, 'PRODUCTION_IMPORT_ALREADY_PRESENT');
  assert.equal(second.counts.writtenRows, 0);
  assert.equal(second.counts.alreadyPresentRows, 50);
  // Holds are re-asserted on every run, so an operator change since the last run is put back under hold.
  assert.equal(second.counts.pauseWrites, 50);
  assert.equal(second.counts.smtpAccountWrites, 0);
  assert.equal(second.counts.imapAccountWrites, 0);
  assert.deepEqual(store.state.accounts, accountsBefore);
  assert.deepEqual(store.state.senderHealth, healthBefore);
});

test('an existing identity with different credentials refuses the whole batch and changes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  const conflicting = buildEncryptedSmtpAccount({
    slot: `winnr:${s.rows[0].email}`, email: s.rows[0].email, provider: 'smtp-relay', host: 'smtp.relay.test',
    username: s.rows[0].email, password: hex(18), sendingDomainId: 'dom-old', sendingMailboxId: 'mbx-old',
    sendingWorkspaceId: WORKSPACE, routeEvidenceRef: ROUTE_REF, routeAuthorized: true, termsCompatible: true
  }, s.key).account;
  store.state.accounts.push(conflicting);
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport({
    store, plan: planFor(s), executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'PRODUCTION_IMPORT_REFUSED');
  assert.ok(result.reasonCodes.includes('CREDENTIAL_CONTRADICTION'));
  assert.deepEqual(store.state, before);
  assert.equal(identityLeaks(JSON.stringify(result), s), '');
});

test('a store holding ciphertext from another key refuses with STAGING_OR_UNREADABLE_CIPHERTEXT_PRESENT and changes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  const otherKey = hex(32);
  const stray = buildEncryptedSmtpAccount({
    slot: 'winnr:stray@legacy.test', email: 'stray@legacy.test', provider: 'smtp-relay', host: 'smtp.relay.test',
    username: 'stray@legacy.test', password: hex(18), sendingDomainId: 'dom-legacy', sendingMailboxId: 'mbx-legacy',
    sendingWorkspaceId: 'workspace-legacy', routeEvidenceRef: ROUTE_REF, routeAuthorized: true, termsCompatible: true
  }, otherKey).account;
  store.state.accounts.push(stray);
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport({
    store, plan: planFor(s), executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('STAGING_OR_UNREADABLE_CIPHERTEXT_PRESENT'));
  assert.deepEqual(store.state, before);
});

test('a fresh lease held by another owner refuses with IMPORT_ALREADY_RUNNING and changes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  store.state.settings[SETTINGS_LEASE] = {
    owner: 'other-run-owner', acquiredAt: '2026-10-13T11:59:00.000Z', expiresAt: '2026-10-13T12:05:00.000Z', released: false
  };
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport({
    store, plan: planFor(s), executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['IMPORT_ALREADY_RUNNING']);
  assert.deepEqual(store.state, before);
});

test('an expired lease from another owner is taken over', async () => {
  const s = scenario();
  const store = createFakeStore();
  store.state.settings[SETTINGS_LEASE] = {
    owner: 'other-run-owner', acquiredAt: '2026-10-13T11:00:00.000Z', expiresAt: '2026-10-13T11:10:00.000Z', released: false
  };
  const result = await executeWinnrProductionImport({
    store, plan: planFor(s), executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(result.ok, true, result.reasonCodes.join(','));
  assert.equal(store.state.settings[SETTINGS_LEASE].owner, OWNER);
  assert.equal(store.state.settings[SETTINGS_LEASE].released, true);
  assert.equal(store.state.accounts.length, 100);
});

test('an injected fault after 7 writes rolls back every write, the lease and the receipt', async () => {
  const s = scenario();
  const store = createFakeStore();
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport({
    store, plan: planFor(s), executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key, faultAfterWrites: 7
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'PRODUCTION_IMPORT_ROLLED_BACK');
  assert.ok(result.reasonCodes.includes('FAULT_INJECTED_AFTER_WRITES'));
  assert.deepEqual(store.state, before);
  assert.equal(store.state.settings[SETTINGS_LEASE], undefined);
  assert.equal(store.state.accounts.length, 0);
  assert.equal(store.state.senderHealth.length, 0);
  assert.equal(identityLeaks(JSON.stringify(result), s), '');
});

test('execute refuses a plan that this module did not issue', async () => {
  const s = scenario();
  const store = createFakeStore();
  const forged = { ok: true, status: 'PRODUCTION_IMPORT_PLAN_READY', rows: planFor(s).rows, storeBackend: 'postgres' };
  const result = await executeWinnrProductionImport({
    store, plan: forged, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('plan-not-issued-by-planner'));
  assert.equal(store.state.accounts.length, 0);
});

test('execute refuses a plan whose ciphertext does not open with the supplied key', async () => {
  const s = scenario();
  const store = createFakeStore();
  const result = await executeWinnrProductionImport({
    store, plan: planFor(s), executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: hex(32)
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('PLAN_CIPHERTEXT_NOT_READABLE_WITH_KEY'));
  assert.equal(store.state.accounts.length, 0);
});

test('execute refuses an expired gate at execution time', async () => {
  const s = scenario();
  const store = createFakeStore();
  const later = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
  const result = await executeWinnrProductionImport({
    store, plan: planFor(s), executionGate: s.gate, now: later, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('gate-expired'));
  assert.equal(store.state.accounts.length, 0);
});

// ---- rollback ---------------------------------------------------------------

test('rollback keeps every sender paused under the rollback reason, disconnects IMAP, and deletes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  await executeWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  const accountsBefore = structuredClone(store.state.accounts);
  const rollback = await rollbackWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW });
  assert.equal(rollback.ok, true, rollback.reasonCodes.join(','));
  assert.equal(rollback.status, 'PRODUCTION_IMPORT_ROLLED_BACK');
  assert.equal(rollback.counts.verifiedSmtpRolledBack, 50);
  assert.equal(rollback.counts.verifiedImapHeld, 50);

  assert.equal(store.state.accounts.length, 100);
  assert.deepEqual(store.state.accounts.map(a => a.id).sort(), accountsBefore.map(a => a.id).sort());
  for (const before of accountsBefore) {
    const after = store.state.accounts.find(a => a.id === before.id);
    assert.deepEqual(after.tokens, before.tokens, 'credential ciphertext must be untouched');
  }
  for (const row of s.rows) {
    const sender = store.state.senderHealth.find(h => h.inbox === `winnr:${row.email}`);
    assert.equal(sender.paused, true);
    assert.equal(sender.pauseReason, WINNR_IMPORT_ROLLBACK_REASON);
    const imap = store.state.accounts.find(a => a.slot === `winnr-imap:${row.email}`);
    assert.equal(imap.connected, false);
  }
  assert.ok(store.state.settings[SETTINGS_ROLLBACK_RECEIPT]);
});

test('a second rollback changes no sender, account or credential', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  await executeWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  await rollbackWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW });
  const senders = structuredClone(store.state.senderHealth);
  const accounts = structuredClone(store.state.accounts);
  const second = await rollbackWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW });
  assert.equal(second.ok, true);
  assert.equal(second.counts.senderPauseWrites, 0);
  assert.equal(second.counts.imapHoldWrites, 0);
  assert.deepEqual(store.state.senderHealth, senders);
  assert.deepEqual(store.state.accounts, accounts);
});

test('rollback is not blocked by an expired approval, because holding senders is the fail-safe direction', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  await executeWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  const later = new Date(NOW.getTime() + 5 * 60 * 60 * 1000);
  const rollback = await rollbackWinnrProductionImport({
    store, plan, executionGate: buildGate(NOW), now: later
  });
  assert.equal(rollback.ok, true, rollback.reasonCodes.join(','));
});

test('rollback refuses a plan that this module did not issue', async () => {
  const s = scenario();
  const store = createFakeStore();
  const result = await rollbackWinnrProductionImport({
    store, plan: { ok: true, rows: planFor(s).rows }, executionGate: s.gate, now: NOW
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('plan-not-issued-by-planner'));
});

// ---- receipts ---------------------------------------------------------------

test('every stored receipt passes the public artifact guard and carries no identity from the fixture', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  const executed = await executeWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  const rolledBack = await rollbackWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW });
  for (const receipt of [executed.publicReceipt, rolledBack.publicReceipt, store.state.settings[SETTINGS_RECEIPT], store.state.settings[SETTINGS_ROLLBACK_RECEIPT]]) {
    assert.doesNotThrow(() => assertPublicSafe(receipt));
    assert.equal(identityLeaks(JSON.stringify(receipt), s), '');
  }
  assert.equal(identityLeaks(JSON.stringify(store.state.auditLog), s), '');
  assert.equal(identityLeaks(JSON.stringify(executed.counts), s), '');
});

test('the receipt written for a successful import records counts and fixed codes only', async () => {
  const s = scenario();
  const store = createFakeStore();
  await executeWinnrProductionImport({ store, plan: planFor(s), executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  const receipt = store.state.settings[SETTINGS_RECEIPT];
  assert.equal(receipt.externalEffectAuthority, 'NONE');
  assert.equal(receipt.messagesSent, 0);
  assert.equal(receipt.providerCalls, 0);
  assert.equal(receipt.plaintextCredentialReturned, false);
  assert.equal(receipt.counts.writtenRows, 50);
  assert.equal(receipt.counts.verifiedSmtpHeld, 50);
  assert.equal(receipt.counts.verifiedImapHeld, 50);
});

test('an error during a refused execution is reported as a fixed code, not as error text', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  const result = await executeWinnrProductionImport({
    store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key, faultAfterWrites: 3
  });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes('fault injected'), false);
  assert.equal(identityLeaks(JSON.stringify(result), s), '');
});

test('a present sender that lost its hold row is held again on the next run and never left selectable', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  await executeWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  store.state.senderHealth = [];
  const second = await executeWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  assert.equal(second.ok, true, second.reasonCodes.join(','));
  assert.equal(store.state.senderHealth.filter(row => row.paused === true && row.pauseReason === 'WINNR_PRODUCTION_IMPORT_HOLD').length, 50);
  assert.equal(second.counts.pauseWrites, 50);
});
