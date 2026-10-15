import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  planWinnrProductionImport,
  executeWinnrProductionImport,
  rollbackWinnrProductionImport,
  winnrProductionKeyCheck,
  WINNR_PRODUCTION_IMPORT_CONFIRMATION,
  WINNR_IMPORT_HOLD_REASON,
  WINNR_PRODUCTION_KEY_LABEL
} from '../src/winnr-production-import.mjs';
import { buildEncryptedSmtpAccount, selectFleetMailbox } from '../src/uberfleet.mjs';
import { decryptJson } from '../src/crypto.mjs';
import { assertPublicSafe } from '../src/winnr-public-artifact-guard.mjs';

// Synthetic fixtures only. Domains use the reserved example.invalid suffix. Secrets are generated per test and never
// printed. No network, no provider, no database: the store is an in-memory model with the same transaction semantics.

const NOW = new Date('2026-10-13T12:00:00.000Z');
const ROLES = ['hello', 'team', 'connect', 'partnerships', 'growth'];
const STARTUP_DOMAINS = Array.from({ length: 10 }, (_, i) => `startup${String(i + 1).padStart(2, '0')}.example.invalid`);
const PILOT_DOMAIN = 'pilot-probe.example.invalid';
const SMTP_HOST = 'smtp.relay.example.invalid';
const IMAP_HOST = 'imap.relay.example.invalid';
const WORKSPACE = 'workspace-hardening-1';
const ROUTE_REF = 'receipt:route-evidence-hardening-1';
const OWNER = 'run-hardening-owner-1';
const LEASE = 'winnrProductionImportLease';
const RECEIPT = 'winnrProductionImportReceipt';

const hex = bytes => crypto.randomBytes(bytes).toString('hex');
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);

function buildRows() {
  const rows = [];
  for (const domain of STARTUP_DOMAINS) {
    for (const role of ROLES) {
      rows.push({ email: `${role}@${domain}`, fromName: capitalize(role), domain, password: hex(18), imapPassword: hex(18) });
    }
  }
  return rows;
}

// overrides[index] replaces individual CSV fields for one row. Anything not overridden keeps the safe default.
function buildCsv(rows, overrides = {}) {
  const header = 'from_email,from_name,domain,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password';
  const lines = rows.map((r, i) => {
    const o = overrides[i] || {};
    const email = o.email ?? r.email;
    return [
      email, r.fromName, o.domain ?? r.domain, o.userName ?? email, r.password,
      o.smtpHost ?? SMTP_HOST, o.smtpPort ?? 465, o.imapHost ?? IMAP_HOST, o.imapPort ?? 993,
      o.imapUsername ?? email, r.imapPassword
    ].join(',');
  });
  return [header, ...lines].join('\n') + '\n';
}

function buildProviderDomains() {
  const startup = STARTUP_DOMAINS.map((name, i) => ({ id: `dom-${i + 1}`, name, status: 'active', tags: [] }));
  return [...startup, { id: 'dom-pilot', name: PILOT_DOMAIN, status: 'active', tags: ['pre-warmed'] }];
}

// Pilot identities are reported by the provider only when asked for. Their records use the pilot domain.
function buildProviderMailboxes(rows, { overrides = {}, pilotIdentities = 0 } = {}) {
  const startup = rows.map((r, i) => ({
    id: `mbx-${i + 1}`,
    domain: r.domain,
    full_address: r.email,
    status: 'active',
    smtp_host: SMTP_HOST,
    smtp_port: 465,
    imap_host: IMAP_HOST,
    imap_port: 993,
    ...(overrides[i] || {})
  }));
  const pilot = ['hello', 'team', 'connect'].slice(0, pilotIdentities).map((role, i) => ({
    id: `mbx-pilot-${i + 1}`,
    domain: PILOT_DOMAIN,
    full_address: `${role}@${PILOT_DOMAIN}`,
    status: 'active',
    smtp_host: SMTP_HOST,
    smtp_port: 465,
    imap_host: IMAP_HOST,
    imap_port: 993
  }));
  return [...startup, ...pilot];
}

function buildGate(now, overrides = {}) {
  return {
    mode: 'PRODUCTION_IMPORT',
    confirmation: WINNR_PRODUCTION_IMPORT_CONFIRMATION,
    approvalRef: 'approval-hardening-1',
    reviewedCommit: hex(20),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    expectedAccountCount: 50,
    routeAuthorized: true,
    termsCompatible: true,
    ...overrides
  };
}

// A scenario bundles one synthetic export, its provider inventory and a production key. Options perturb one input.
function scenario({ csvOverrides = {}, providerOverrides = {}, pilotIdentities = 0, rowsOverride = null, gateOverrides = {} } = {}) {
  const rows = buildRows();
  const key = hex(32);
  return {
    now: NOW,
    key,
    rows,
    csv: buildCsv(rowsOverride ?? rows, csvOverrides),
    expectedText: JSON.stringify({ startupDomains: STARTUP_DOMAINS, pilotDomains: [PILOT_DOMAIN] }),
    providerDomains: buildProviderDomains(),
    providerMailboxes: buildProviderMailboxes(rows, { overrides: providerOverrides, pilotIdentities }),
    gate: buildGate(NOW, { ...gateOverrides })
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

// An approval names the digest of the one plan it approves. Nothing else in the gate is changed.
function approvalFor(s, plan, overrides = {}) {
  return { ...s.gate, planDigest: plan.planDigest, ...overrides };
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
      setSetting,
      async updateSettingAtomically(key, update) {
        return setSetting(key, await update(structuredClone(target.settings[key])));
      },
      async log(type, detail = {}) {
        target.auditLog.push({ id: `log-${target.auditLog.length + 1}`, type, detail: structuredClone(detail) });
      }
    };
  };
  return {
    state: base,
    // Test double only. It declares the PostgreSQL kind so the production gate can be exercised against the transactional
    // contract. createStore never returns this object, and no production code path receives it.
    backendKind: 'postgres',
    ...operations(base),
    async transaction(fn) {
      const staged = structuredClone(base);
      const result = await fn(operations(staged));
      for (const key of Object.keys(staged)) base[key] = staged[key];
      return result;
    }
  };
}

// Throws on the Nth upsert inside the transaction, to model an interruption between two writes.
function faultingView(store, failAt) {
  let upserts = 0;
  return {
    ...store,
    transaction: fn => store.transaction(tx => fn({
      ...tx,
      async upsert(key, item) {
        upserts += 1;
        if (upserts === failAt) throw Object.assign(new Error('injected store failure'), { code: 'INJECTED_STORE_FAILURE' });
        return tx.upsert(key, item);
      }
    }))
  };
}

// Records every account write that lands before the hold it depends on.
function orderingView(store, violations, counter) {
  return {
    ...store,
    transaction: fn => store.transaction(tx => fn({
      ...tx,
      async upsert(key, item) {
        if (key === 'accounts') {
          counter.checks += 1;
          if (item.provider === 'smtp-relay') {
            const health = (await tx.list('senderHealth')).find(row => row.inbox === item.slot);
            if (!health || health.paused !== true) violations.push(item.slot);
          } else if (item.provider === 'imap-forwarding' && item.connected !== false) {
            violations.push(item.slot);
          }
        }
        return tx.upsert(key, item);
      }
    }))
  };
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

function seedPilot(store, key, roles = ['hello', 'team', 'connect']) {
  for (const role of roles) {
    const email = `${role}@${PILOT_DOMAIN}`;
    const built = buildEncryptedSmtpAccount({
      slot: `winnr:${email}`, email, provider: 'smtp-relay', host: SMTP_HOST, username: email, password: hex(18),
      sendingDomainId: 'dom-pilot', sendingMailboxId: `mbx-pilot-${role}`, sendingWorkspaceId: WORKSPACE,
      routeEvidenceRef: ROUTE_REF, routeAuthorized: true, termsCompatible: true
    }, key).account;
    store.state.accounts.push(built);
    store.state.senderHealth.push({
      id: `pilot-health-${role}`, inbox: `winnr:${email}`, paused: false, hardBouncesToday: 0, complaintsToday: 0,
      failureStreak: 0, healthDate: '2026-10-13', createdAt: NOW.toISOString()
    });
  }
}

function executeArgs(store, s, plan, extra = {}) {
  return { store, plan, executionGate: approvalFor(s, plan), now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key, ...extra };
}

// ---- route facts: host, port, TLS mode and provider identity -----------------

test('a plaintext SMTP port is refused even when the provider reports the same port', () => {
  const s = scenario({ csvOverrides: { 0: { smtpPort: 587 } }, providerOverrides: { 0: { smtp_port: 587 } } });
  const plan = planFor(s);
  assertRefused(plan, 'smtp-port-not-implicit-tls');
  assert.equal(identityLeaks(JSON.stringify(plan), s), '');
});

test('an SMTP port that differs from the provider record is refused', () => {
  const s = scenario({ csvOverrides: { 3: { smtpPort: 465 } }, providerOverrides: { 3: { smtp_port: 25 } } });
  assertRefused(planFor(s), 'smtp-port-provider-mismatch');
});

test('a plaintext IMAP port (143) is refused even when the provider reports it', () => {
  const s = scenario({ csvOverrides: { 1: { imapPort: 143 } }, providerOverrides: { 1: { imap_port: 143 } } });
  assertRefused(planFor(s), 'imap-port-not-implicit-tls');
});

test('an SMTP host that differs from the provider record is refused', () => {
  const s = scenario({ csvOverrides: { 2: { smtpHost: 'other.relay.example.invalid' } } });
  assertRefused(planFor(s), 'smtp-host-provider-mismatch');
});

test('an IMAP login that is not the mailbox address is refused', () => {
  const s = scenario({ csvOverrides: { 4: { imapUsername: 'someone@startup01.example.invalid' } } });
  assertRefused(planFor(s), 'imap-username-not-address');
});

test('an IP-literal host is refused as an invalid route host', () => {
  const s = scenario({
    csvOverrides: { 0: { smtpHost: '192.0.2.10' } },
    providerOverrides: { 0: { smtp_host: '192.0.2.10' } }
  });
  assertRefused(planFor(s), 'route-host-invalid');
});

test('a successful plan proves implicit TLS on every row and seals 50 identities under the production key', () => {
  const s = scenario();
  const plan = planFor(s);
  assert.equal(plan.ok, true, plan.reasonCodes.join(','));
  assert.equal(plan.counts.credentialIdentitiesSealed, 50);
  for (const row of plan.rows) {
    assert.equal(row.smtpAccount.smtpRoute.secure, true);
    assert.equal(row.smtpAccount.smtpRoute.port, 465);
    assert.equal(row.imapAccount.imapRoute.secure, true);
    assert.equal(row.imapAccount.imapRoute.port, 993);
    // Ciphertext opens under the production key and does not open under any other key.
    assert.equal(decryptJson(row.smtpAccount.tokens, s.key).kind, 'smtp-basic');
    assert.throws(() => decryptJson(row.smtpAccount.tokens, hex(32)));
    assert.throws(() => decryptJson(row.imapAccount.tokens, hex(32)));
  }
  assert.match(plan.sourceHash16, /^[0-9a-f]{16}$/);
  assert.match(plan.destinationHash16, /^[0-9a-f]{16}$/);
  assert.equal(plan.publicReceipt.sourceHash16, plan.sourceHash16);
  assertPublicSafe(plan.publicReceipt);
  assert.equal(identityLeaks(JSON.stringify(plan.publicReceipt), s), '');
});

// ---- export shape: missing, unexpected, pilot and duplicate rows --------------

test('a missing row is refused, not silently imported as 49 identities', () => {
  const s = scenario({ rowsOverride: buildRows().slice(0, 49) });
  assertRefused(planFor(s), 'mailbox-count-not-N');
});

test('a row on an unexpected domain is refused', () => {
  const s = scenario({ csvOverrides: { 0: { email: 'hello@extra.example.invalid', domain: 'extra.example.invalid' } } });
  assertRefused(planFor(s), 'unexpected-domain');
});

test('a row with an unexpected role is refused', () => {
  const s = scenario({ csvOverrides: { 0: { email: `support@${STARTUP_DOMAINS[0]}` } } });
  assertRefused(planFor(s), 'unexpected-role');
});

test('the planner returns a refusal and never throws on malformed inputs', () => {
  const s = scenario();
  const junk = [
    { csvText: null, providerMailboxes: null },
    { csvText: 42, providerDomains: 'x' },
    { expectedInventoryText: '{', providerMailboxes: [{}] },
    { executionGate: 'not-an-object' },
    { now: 'not-a-date' }
  ];
  for (const overrides of junk) {
    const plan = planFor(s, overrides);
    assert.equal(plan.ok, false);
    assert.ok(Array.isArray(plan.reasonCodes));
    assert.deepEqual(plan.rows, []);
  }
});

// ---- expected pilot mailbox count ---------------------------------------------

test('the expected pilot mailbox count must match the provider', () => {
  const s = scenario({ pilotIdentities: 3 });
  assertRefused(planFor(s, { expectedPilotMailboxCount: 2 }), 'pilot-mailbox-count-mismatch');
  const ok = planFor(s, { expectedPilotMailboxCount: 3 });
  assert.equal(ok.ok, true, ok.reasonCodes.join(','));
  assert.equal(ok.expectedPilotMailboxCount, 3);
});

test('a negative or non-integer expected pilot mailbox count is refused', () => {
  const s = scenario({ pilotIdentities: 3 });
  assertRefused(planFor(s, { expectedPilotMailboxCount: -1 }), 'pilot-mailbox-count-invalid');
  assertRefused(planFor(s, { expectedPilotMailboxCount: 1.5 }), 'pilot-mailbox-count-invalid');
});

// ---- production key provenance -------------------------------------------------

test('a key check that belongs to a different key is refused, and neither key appears in the plan', () => {
  const s = scenario();
  const otherKey = hex(32);
  const plan = planFor(s, { executionGate: { ...s.gate, encryptionKeyCheck: winnrProductionKeyCheck(otherKey) } });
  assertRefused(plan, 'encryption-key-check-mismatch');
  const text = JSON.stringify(plan);
  assert.equal(text.includes(s.key), false);
  assert.equal(text.includes(otherKey), false);
});

test('the matching key check is accepted and is a 16-character value that does not reveal the key', () => {
  const s = scenario();
  const check = winnrProductionKeyCheck(s.key);
  assert.match(check, /^[0-9a-f]{16}$/);
  assert.equal(s.key.includes(check), false);
  assert.equal(winnrProductionKeyCheck(s.key), check);
  assert.notEqual(winnrProductionKeyCheck(hex(32)), check);
  assert.equal(winnrProductionKeyCheck('not-a-key'), '');
  const plan = planFor(s, { executionGate: { ...s.gate, encryptionKeyCheck: check } });
  assert.equal(plan.ok, true, plan.reasonCodes.join(','));
});

// ---- staging or unreadable ciphertext in the store -------------------------------

test('a store row whose ciphertext is not an encrypted blob refuses the import and writes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  store.state.accounts.push({
    id: 'smtp-malformed-legacy', slot: 'winnr:legacy@legacy.example.invalid', email: 'legacy@legacy.example.invalid',
    provider: 'smtp-relay', connected: true, tokens: 'not-an-encrypted-blob'
  });
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport(executeArgs(store, s, planFor(s)));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('STAGING_OR_UNREADABLE_CIPHERTEXT_PRESENT'));
  assert.deepEqual(store.state, before);
});

// ---- duplicate store rows -----------------------------------------------------------

test('duplicate sender-health rows for a planned inbox refuse the import and change nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  const inbox = `winnr:${s.rows[0].email}`;
  store.state.senderHealth.push({ id: 'dup-a', inbox, paused: false }, { id: 'dup-b', inbox, paused: false });
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport(executeArgs(store, s, planFor(s)));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('STORE_ROWS_DUPLICATED_FOR_IDENTITY'));
  assert.deepEqual(store.state, before);
});

test('a duplicate account row that appears after a successful import refuses the next run', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  const first = await executeWinnrProductionImport(executeArgs(store, s, plan));
  assert.equal(first.ok, true, first.reasonCodes.join(','));
  const original = store.state.accounts.find(account => account.slot === `winnr:${s.rows[0].email}`);
  store.state.accounts.push({ ...structuredClone(original), slot: `winnr:copy-${s.rows[0].email}` });
  const before = structuredClone(store.state);
  const second = await executeWinnrProductionImport(executeArgs(store, s, plan));
  assert.equal(second.ok, false);
  assert.ok(second.reasonCodes.includes('STORE_ROWS_DUPLICATED_FOR_IDENTITY'));
  assert.deepEqual(store.state, before);
});

// ---- identity-based idempotence and stable slot mapping -----------------------------

test('two plans from the same inputs map every identity to the same slots, and a re-run changes no account', async () => {
  const s = scenario();
  const store = createFakeStore();
  const planA = planFor(s);
  const planB = planFor(s);
  const mapping = plan => plan.rows.map(row => [row.identity, row.smtpAccount.slot, row.smtpAccount.id, row.imapAccount.slot, row.imapAccount.id]);
  assert.deepEqual(mapping(planA), mapping(planB));
  const first = await executeWinnrProductionImport(executeArgs(store, s, planA));
  assert.equal(first.ok, true, first.reasonCodes.join(','));
  assert.equal(first.publicReceipt.destinationHash16, planA.destinationHash16);
  const accountsBefore = structuredClone(store.state.accounts);
  const second = await executeWinnrProductionImport(executeArgs(store, s, planB));
  assert.equal(second.ok, true, second.reasonCodes.join(','));
  assert.equal(second.status, 'PRODUCTION_IMPORT_ALREADY_PRESENT');
  assert.equal(second.counts.smtpAccountWrites, 0);
  assert.equal(second.counts.imapAccountWrites, 0);
  assert.deepEqual(store.state.accounts, accountsBefore);
});

test('a planned slot held by a different identity refuses with ACCOUNT_IDENTITY_COLLISION and changes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  const intruder = buildEncryptedSmtpAccount({
    slot: `winnr:${s.rows[0].email}`, email: `growth@${STARTUP_DOMAINS[9]}`, provider: 'smtp-relay', host: SMTP_HOST,
    username: `growth@${STARTUP_DOMAINS[9]}`, password: hex(18), sendingDomainId: 'dom-x', sendingMailboxId: 'mbx-x',
    sendingWorkspaceId: WORKSPACE, routeEvidenceRef: ROUTE_REF, routeAuthorized: true, termsCompatible: true
  }, s.key).account;
  store.state.accounts.push(intruder);
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport(executeArgs(store, s, planFor(s)));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('ACCOUNT_IDENTITY_COLLISION'));
  assert.deepEqual(store.state, before);
});

// ---- pilot rows -----------------------------------------------------------------------

test('pilot rows are preserved unchanged, counted, and never imported as cold senders', async () => {
  const s = scenario({ pilotIdentities: 3 });
  const store = createFakeStore();
  seedPilot(store, s.key);
  const pilotBefore = structuredClone({
    accounts: store.state.accounts.filter(a => a.email.endsWith(`@${PILOT_DOMAIN}`)),
    senderHealth: store.state.senderHealth.filter(h => h.inbox.endsWith(`@${PILOT_DOMAIN}`))
  });
  const plan = planFor(s, { expectedPilotMailboxCount: 3 });
  assert.equal(plan.ok, true, plan.reasonCodes.join(','));
  assert.equal(plan.rows.some(row => row.identity.endsWith(`@${PILOT_DOMAIN}`)), false);
  const result = await executeWinnrProductionImport(executeArgs(store, s, plan));
  assert.equal(result.ok, true, result.reasonCodes.join(','));
  assert.deepEqual({
    accounts: store.state.accounts.filter(a => a.email.endsWith(`@${PILOT_DOMAIN}`)),
    senderHealth: store.state.senderHealth.filter(h => h.inbox.endsWith(`@${PILOT_DOMAIN}`))
  }, pilotBefore);
  assert.equal(result.counts.pilotRowsBefore, 6);
  assert.equal(result.counts.pilotRowsAfter, 6);
  assert.equal(result.counts.pilotSnapshotChanged, 0);
  assert.equal(result.counts.pilotIdentities, 3);
  assert.equal(result.publicReceipt.counts.pilotSnapshotChanged, 0);
});

test('a store holding a different number of pilot identities refuses the execution before any write', async () => {
  const s = scenario({ pilotIdentities: 3 });
  const store = createFakeStore();
  seedPilot(store, s.key, ['hello', 'team']);
  const before = structuredClone(store.state);
  const plan = planFor(s, { expectedPilotMailboxCount: 3 });
  assert.equal(plan.ok, true, plan.reasonCodes.join(','));
  const result = await executeWinnrProductionImport(executeArgs(store, s, plan));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('PILOT_MAILBOX_COUNT_MISMATCH'));
  assert.deepEqual(store.state, before);
});

test('a pilot row changed inside the transaction refuses the import and rolls every write back', async () => {
  const s = scenario({ pilotIdentities: 3 });
  const store = createFakeStore();
  seedPilot(store, s.key);
  const before = structuredClone(store.state);
  let mutated = false;
  const tampering = {
    ...store,
    transaction: fn => store.transaction(tx => fn({
      ...tx,
      async upsert(key, item) {
        if (!mutated) {
          mutated = true;
          const pilotRow = (await tx.list('senderHealth')).find(row => row.inbox.endsWith(`@${PILOT_DOMAIN}`));
          await tx.upsert('senderHealth', { ...pilotRow, paused: true });
        }
        return tx.upsert(key, item);
      }
    }))
  };
  const result = await executeWinnrProductionImport(executeArgs(tampering, s, planFor(s, { expectedPilotMailboxCount: 3 })));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('PILOT_ROWS_CHANGED'));
  assert.deepEqual(store.state, before);
});

// ---- eligibility after import -------------------------------------------------------

test('an eligible sender on a Startup domain that the plan does not name refuses the import', async () => {
  const s = scenario();
  const store = createFakeStore();
  store.state.accounts.push(buildEncryptedSmtpAccount({
    slot: `winnr:legacy@${STARTUP_DOMAINS[2]}`, email: `legacy@${STARTUP_DOMAINS[2]}`, provider: 'smtp-relay',
    host: SMTP_HOST, username: `legacy@${STARTUP_DOMAINS[2]}`, password: hex(18), sendingDomainId: 'dom-legacy',
    sendingMailboxId: 'mbx-legacy', sendingWorkspaceId: WORKSPACE, routeEvidenceRef: ROUTE_REF,
    routeAuthorized: true, termsCompatible: true
  }, s.key).account);
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport(executeArgs(store, s, planFor(s)));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('ELIGIBLE_SENDER_AFTER_IMPORT'));
  assert.deepEqual(store.state, before);
});

test('a successful import reports zero eligible senders after import, checked with selectFleetMailbox', async () => {
  const s = scenario();
  const store = createFakeStore();
  const result = await executeWinnrProductionImport(executeArgs(store, s, planFor(s)));
  assert.equal(result.ok, true, result.reasonCodes.join(','));
  assert.equal(result.counts.eligibleAfterImport, 0);
  assert.equal(result.counts.scopedSmtpAccounts, 50);
  assert.equal(result.publicReceipt.counts.eligibleAfterImport, 0);
  const choice = selectFleetMailbox({
    prospectId: 'prospect-hardening', accounts: store.state.accounts, senderHealth: store.state.senderHealth,
    provider: 'smtp-relay', date: NOW
  });
  assert.equal(choice.ok, false);
  assert.equal(choice.status, 'UBERFLEET_NO_ELIGIBLE_MAILBOX');
});

// ---- receipts: source and destination --------------------------------------------------

test('receipts record source and destination digests as 16-hex values with counts, and no secrets', async () => {
  const s = scenario({ pilotIdentities: 3 });
  const store = createFakeStore();
  seedPilot(store, s.key);
  const plan = planFor(s, { expectedPilotMailboxCount: 3 });
  const result = await executeWinnrProductionImport(executeArgs(store, s, plan));
  assert.equal(result.ok, true, result.reasonCodes.join(','));
  assert.equal(result.publicReceipt.sourceHash16, plan.sourceHash16);
  assert.match(result.publicReceipt.destinationHash16, /^[0-9a-f]{16}$/);
  assert.equal(result.publicReceipt.destinationHash16, plan.destinationHash16);
  assert.equal(result.counts.sourceRows, 50);
  assert.equal(result.counts.destinationRows, 50);
  assert.equal(result.counts.accountsBefore, 3);
  assert.equal(result.counts.accountsAfter, 103);
  assert.deepEqual(store.state.settings[RECEIPT], result.publicReceipt);
  assert.doesNotThrow(() => assertPublicSafe(result.publicReceipt));
  assert.equal(identityLeaks(JSON.stringify(result.publicReceipt), s), '');
  assert.equal(JSON.stringify(result.publicReceipt).includes(s.key), false);
});

// ---- interruption, rollback and retry ------------------------------------------------

test('an interruption at any write rolls back the whole import, leaves no planned sender selectable, and a retry completes', async () => {
  for (const failAt of [1, 2, 50, 51, 100, 150]) {
    const s = scenario();
    const store = createFakeStore();
    const plan = planFor(s);
    const before = structuredClone(store.state);
    const interrupted = await executeWinnrProductionImport(executeArgs(faultingView(store, failAt), s, plan));
    assert.equal(interrupted.ok, false, `failAt ${failAt}`);
    assert.equal(interrupted.status, 'PRODUCTION_IMPORT_ROLLED_BACK', `failAt ${failAt}`);
    assert.ok(interrupted.reasonCodes.includes('INJECTED_STORE_FAILURE'), `failAt ${failAt}`);
    assert.deepEqual(store.state, before, `failAt ${failAt}`);
    for (const row of plan.rows) {
      const sender = store.state.senderHealth.find(h => h.inbox === row.smtpAccount.slot);
      assert.ok(!sender || sender.paused === true, `failAt ${failAt}: sender must not be unpaused`);
      assert.equal(store.state.accounts.some(a => a.slot === row.smtpAccount.slot || a.slot === row.imapAccount.slot), false);
    }
    const retry = await executeWinnrProductionImport(executeArgs(store, s, plan));
    assert.equal(retry.ok, true, `failAt ${failAt}: ${retry.reasonCodes.join(',')}`);
    assert.equal(retry.counts.writtenRows, 50);
    assert.equal(store.state.accounts.length, 100);
  }
});

test('every account write lands only after the hold for the same identity is already in place', async () => {
  const s = scenario();
  const store = createFakeStore();
  const violations = [];
  const counter = { checks: 0 };
  const result = await executeWinnrProductionImport(executeArgs(orderingView(store, violations, counter), s, planFor(s)));
  assert.equal(result.ok, true, result.reasonCodes.join(','));
  assert.equal(counter.checks, 100);
  assert.deepEqual(violations, []);
});

test('a store without transaction support is refused before any write', async () => {
  const s = scenario();
  const store = createFakeStore();
  delete store.transaction;
  const result = await executeWinnrProductionImport(executeArgs(store, s, planFor(s)));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('store-transaction-required'));
  assert.equal(store.state.accounts.length, 0);
  assert.equal(store.state.senderHealth.length, 0);
});

test('an empty lease owner is refused before any write', async () => {
  const s = scenario();
  const store = createFakeStore();
  const result = await executeWinnrProductionImport(executeArgs(store, s, planFor(s), { leaseOwner: '' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('lease-owner-required'));
  assert.equal(store.state.accounts.length, 0);
});

// ---- concurrency ------------------------------------------------------------------------

test('a second execution on the same store while one is in flight is refused, and the first completes', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  let markReached;
  const reached = new Promise(resolve => { markReached = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let parked = false;
  const parkingView = {
    ...store,
    transaction: fn => store.transaction(tx => fn({
      ...tx,
      async upsert(key, item) {
        if (!parked) {
          parked = true;
          markReached();
          await gate;
        }
        return tx.upsert(key, item);
      }
    }))
  };
  const first = executeWinnrProductionImport(executeArgs(parkingView, s, plan));
  await reached;
  const before = structuredClone(store.state);
  const second = await executeWinnrProductionImport(executeArgs(parkingView, s, plan));
  assert.equal(second.ok, false);
  assert.deepEqual(second.reasonCodes, ['IMPORT_ALREADY_RUNNING']);
  assert.deepEqual(store.state, before);
  const rollbackWhileRunning = await rollbackWinnrProductionImport({ store: parkingView, plan, executionGate: approvalFor(s, plan), now: NOW });
  assert.equal(rollbackWhileRunning.ok, false);
  assert.ok(rollbackWhileRunning.reasonCodes.includes('IMPORT_ALREADY_RUNNING'));
  release();
  const firstResult = await first;
  assert.equal(firstResult.ok, true, firstResult.reasonCodes.join(','));
  const after = await executeWinnrProductionImport(executeArgs(parkingView, s, plan));
  assert.equal(after.ok, true, after.reasonCodes.join(','));
  assert.equal(after.status, 'PRODUCTION_IMPORT_ALREADY_PRESENT');
});

test('two concurrent executions through separate store views are serialised by the store: one imports, the other changes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  const queue = { tail: Promise.resolve() };
  const serialised = view => ({
    ...view,
    transaction: fn => {
      const run = queue.tail.then(() => view.transaction(fn));
      queue.tail = run.catch(() => {});
      return run;
    }
  });
  const [a, b] = await Promise.all([
    executeWinnrProductionImport(executeArgs(serialised(store), s, plan)),
    executeWinnrProductionImport(executeArgs(serialised(store), s, plan))
  ]);
  assert.equal(a.ok, true, a.reasonCodes.join(','));
  assert.equal(b.ok, true, b.reasonCodes.join(','));
  assert.deepEqual([a.status, b.status].sort(), ['PRODUCTION_IMPORT_ALREADY_PRESENT', 'PRODUCTION_IMPORT_EXECUTED']);
  assert.equal(store.state.accounts.length, 100);
  assert.equal(store.state.senderHealth.length, 50);
  assert.equal(store.state.settings[LEASE].released, true);
});

// ---- bypass resistance ------------------------------------------------------------------

test('the issued plan is frozen, so its rows cannot be widened after planning', () => {
  const s = scenario();
  const plan = planFor(s);
  assert.throws(() => plan.rows.push({ identity: 'extra@example.invalid' }), TypeError);
  assert.throws(() => { plan.rows[0].imapAccount.connected = true; }, TypeError);
  assert.equal(plan.rows[0].imapAccount.connected, false);
});

test('an operator unpause of an imported sender is held again by the next run', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  await executeWinnrProductionImport(executeArgs(store, s, plan));
  for (const row of s.rows) {
    const sender = store.state.senderHealth.find(h => h.inbox === `winnr:${row.email}`);
    assert.equal(sender.paused, true);
    assert.equal(sender.pauseReason, WINNR_IMPORT_HOLD_REASON);
  }
  // Operator unpauses one sender. The next run must hold it again rather than leave it selectable.
  const target = store.state.senderHealth.find(h => h.inbox === `winnr:${s.rows[7].email}`);
  target.paused = false;
  delete target.pauseReason;
  const rerun = await executeWinnrProductionImport(executeArgs(store, s, plan));
  assert.equal(rerun.ok, true, rerun.reasonCodes.join(','));
  assert.equal(store.state.senderHealth.find(h => h.inbox === target.inbox).paused, true);
});

// ---- explicit approval binding and declared backend identity -------------------------

test('an approval without a planDigest is refused for execution and for rollback with approval-plan-digest-missing, and changes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  const plan = planFor(s);
  assert.match(plan.planDigest, /^[0-9a-f]{64}$/, 'a ready plan issues a 64-hex digest for its approval to name');
  const before = structuredClone(store.state);

  const omitted = await executeWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key });
  assert.equal(omitted.ok, false);
  assert.equal(omitted.status, 'PRODUCTION_IMPORT_REFUSED');
  assert.ok(omitted.reasonCodes.includes('approval-plan-digest-missing'), omitted.reasonCodes.join(','));

  const nulled = await executeWinnrProductionImport({
    store, plan, executionGate: { ...s.gate, planDigest: null }, now: NOW, leaseOwner: OWNER, encryptionKeyHex: s.key
  });
  // A null digest is a value that names no plan. It fails closed as a mismatch, not as an absent field.
  assert.equal(nulled.ok, false);
  assert.ok(nulled.reasonCodes.includes('approval-plan-digest-mismatch'), nulled.reasonCodes.join(','));

  const rolledBack = await rollbackWinnrProductionImport({ store, plan, executionGate: s.gate, now: NOW });
  assert.equal(rolledBack.ok, false);
  assert.equal(rolledBack.status, 'PRODUCTION_IMPORT_ROLLBACK_REFUSED');
  assert.ok(rolledBack.reasonCodes.includes('approval-plan-digest-missing'), rolledBack.reasonCodes.join(','));

  assert.deepEqual(store.state, before, 'no refused execution or rollback changed the store');
  assert.equal(identityLeaks(JSON.stringify([omitted, nulled, rolledBack]), s), '');

  // Control: the same plan executes once its approval names the digest.
  const accepted = await executeWinnrProductionImport(executeArgs(store, s, plan));
  assert.equal(accepted.ok, true, accepted.reasonCodes.join(','));
  assert.equal(accepted.status, 'PRODUCTION_IMPORT_EXECUTED');
});

test('an approval that names the digest of another plan is refused with approval-plan-digest-mismatch and changes nothing', async () => {
  const s = scenario();
  const store = createFakeStore();
  const planX = planFor(s);
  const planY = planFor(s);
  assert.notEqual(planX.planDigest, planY.planDigest, 'two plans from separate sealings never share a digest');
  const before = structuredClone(store.state);
  const result = await executeWinnrProductionImport(executeArgs(store, s, planY, {
    executionGate: approvalFor(s, planX)
  }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('approval-plan-digest-mismatch'), result.reasonCodes.join(','));
  assert.deepEqual(store.state, before);
});

test('a store whose declared backendKind is unrecognised or empty, or that declares none, is refused for execution and rollback', async () => {
  const s = scenario();
  const plan = planFor(s);
  const cases = [
    { label: 'unknown kind', kind: 'memory', code: 'store-backend-kind-unrecognised' },
    { label: 'empty kind', kind: '', code: 'store-backend-kind-unrecognised' },
    { label: 'non-production kind', kind: 'json', code: 'store-backend-mismatch' }
  ];
  for (const { label, kind, code } of cases) {
    const store = createFakeStore();
    store.backendKind = kind;
    const before = structuredClone(store.state);
    const executed = await executeWinnrProductionImport(executeArgs(store, s, plan));
    assert.equal(executed.ok, false, label);
    assert.ok(executed.reasonCodes.includes(code), `${label}: ${executed.reasonCodes.join(',')}`);
    const rolledBack = await rollbackWinnrProductionImport({ store, plan, executionGate: approvalFor(s, plan), now: NOW });
    assert.equal(rolledBack.ok, false, label);
    assert.ok(rolledBack.reasonCodes.includes(code), `${label} rollback: ${rolledBack.reasonCodes.join(',')}`);
    assert.deepEqual(store.state, before, `${label}: no write`);
  }

  // A store that declares no backend at all: the only identity the gate reads is absent.
  const anonymous = createFakeStore();
  delete anonymous.backendKind;
  const before = structuredClone(anonymous.state);
  const refused = await executeWinnrProductionImport(executeArgs(anonymous, s, plan));
  assert.equal(refused.ok, false);
  assert.ok(refused.reasonCodes.includes('store-backend-kind-unrecognised'), refused.reasonCodes.join(','));
  assert.deepEqual(anonymous.state, before, 'no backendKind: no write');

  // Control: the same plan on a store that declares the PostgreSQL kind executes.
  const declared = createFakeStore();
  const accepted = await executeWinnrProductionImport(executeArgs(declared, s, plan));
  assert.equal(accepted.ok, true, accepted.reasonCodes.join(','));
});
