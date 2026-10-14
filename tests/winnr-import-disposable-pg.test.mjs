import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';
import { PostgresStore, JsonStore } from '../src/store.mjs';
import { buildEncryptedSmtpAccount, selectFleetMailbox } from '../src/uberfleet.mjs';
import {
  planWinnrProductionImport,
  executeWinnrProductionImport,
  WINNR_PRODUCTION_IMPORT_CONFIRMATION,
  WINNR_PRODUCTION_KEY_LABEL,
  WINNR_IMPORT_HOLD_REASON,
  WINNR_IMPORT_RECEIPT_SETTING
} from '../src/winnr-production-import.mjs';

// Server-side Winnr import proven against a real, disposable PostgreSQL server. Every test starts its own server through
// withDisposablePostgres, which stops it and removes its data directory when the test returns. All rows are synthetic:
// reserved *.test names and random credentials generated per run. No provider, mailbox server, DNS record or payment
// system is contacted, and no credential is printed.

const NOW = new Date('2026-10-14T09:00:00.000Z');
const LATER = new Date('2026-10-14T09:05:00.000Z');
const ROLES = ['hello', 'team', 'connect', 'partnerships', 'growth'];
const STARTUP = Array.from({ length: 10 }, (_, i) => `startup${String(i + 1).padStart(2, '0')}.test`);
const PILOT_DOMAIN = 'pilot-probe.test';
const SMTP_HOST = 'smtp.relay.test';
const IMAP_HOST = 'imap.relay.test';
const WORKSPACE = 'workspace-pg-proof-1';
const ROUTE_REF = 'receipt:route-evidence-pg-proof-1';
const OWNER = 'run-pg-proof-owner-1';
const KEY = crypto.randomBytes(32).toString('hex');
const LEASE = 'winnrProductionImportLease';
const EXPECTED_TEXT = JSON.stringify({ startupDomains: STARTUP, pilotDomains: [PILOT_DOMAIN] });

const secret = () => crypto.randomBytes(18).toString('hex');
const reviewedCommit = () => crypto.randomBytes(20).toString('hex');
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);

function buildRows() {
  const rows = [];
  for (const domain of STARTUP) {
    for (const role of ROLES) {
      rows.push({ email: `${role}@${domain}`, fromName: capitalize(role), domain, password: secret(), imapPassword: secret() });
    }
  }
  return rows;
}

function buildCsv(rows) {
  const header = 'from_email,from_name,domain,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password';
  const lines = rows.map(r => [
    r.email, r.fromName, r.domain, r.email, r.password, SMTP_HOST, 465, IMAP_HOST, 993, r.email, r.imapPassword
  ].join(','));
  return [header, ...lines].join('\n') + '\n';
}

function buildProviderDomains() {
  const startup = STARTUP.map((name, i) => ({ id: `dom-${i + 1}`, name, status: 'active', tags: [] }));
  return [...startup, { id: 'dom-pilot', name: PILOT_DOMAIN, status: 'active', tags: ['pre-warmed'] }];
}

// The provider reports the three leased pilot mailboxes as well, so the pilot count can be checked against it.
function buildProviderMailboxes(rows) {
  const startup = rows.map((r, i) => ({
    id: `mbx-${i + 1}`, domain: r.domain, full_address: r.email, status: 'active',
    smtp_host: SMTP_HOST, smtp_port: 465, imap_host: IMAP_HOST, imap_port: 993
  }));
  const pilot = ['hello', 'team', 'connect'].map(role => ({
    id: `mbx-pilot-${role}`, domain: PILOT_DOMAIN, full_address: `${role}@${PILOT_DOMAIN}`, status: 'active',
    smtp_host: SMTP_HOST, smtp_port: 465, imap_host: IMAP_HOST, imap_port: 993
  }));
  return [...startup, ...pilot];
}

function buildGate(overrides = {}) {
  return {
    mode: 'PRODUCTION_IMPORT',
    confirmation: WINNR_PRODUCTION_IMPORT_CONFIRMATION,
    approvalRef: 'owner-approval-pg-proof-1',
    reviewedCommit: reviewedCommit(),
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    expectedAccountCount: 50,
    routeAuthorized: true,
    termsCompatible: true,
    ...overrides
  };
}

// One synthetic export and its provider inventory. Each call returns fresh credentials, so two scenarios never share a digest.
function scenario() {
  const rows = buildRows();
  return { rows, csv: buildCsv(rows), providerDomains: buildProviderDomains(), providerMailboxes: buildProviderMailboxes(rows) };
}

function planArgs(s, overrides = {}) {
  return {
    csvText: s.csv,
    expectedInventoryText: EXPECTED_TEXT,
    encryptionKeyHex: KEY,
    keyLabel: WINNR_PRODUCTION_KEY_LABEL,
    storeBackend: 'postgres',
    workspaceId: WORKSPACE,
    routeEvidenceRef: ROUTE_REF,
    providerDomains: s.providerDomains,
    providerMailboxes: s.providerMailboxes,
    executionGate: buildGate(),
    expectedPilotMailboxCount: 3,
    now: NOW,
    ...overrides
  };
}

// An approval names the digest of the one plan it approves. Nothing else in the gate is changed.
function approvalFor(plan, overrides = {}) {
  return { ...buildGate(), planDigest: plan.planDigest, ...overrides };
}

function executeArgs(store, plan, extra = {}) {
  return {
    store,
    plan,
    executionGate: approvalFor(plan),
    now: NOW,
    leaseOwner: OWNER,
    encryptionKeyHex: KEY,
    ...extra
  };
}

// Pilot rows exist before the import, as they do in production. The import must leave them exactly as it found them.
async function seedPilot(store) {
  for (const role of ['hello', 'team', 'connect']) {
    const email = `${role}@${PILOT_DOMAIN}`;
    const built = buildEncryptedSmtpAccount({
      slot: `winnr:${email}`, email, provider: 'smtp-relay', host: SMTP_HOST, username: email, password: secret(),
      sendingDomainId: 'dom-pilot', sendingMailboxId: `mbx-pilot-${role}`, sendingWorkspaceId: WORKSPACE,
      routeEvidenceRef: ROUTE_REF, routeAuthorized: true, termsCompatible: true, plannedDailyCap: 2
    }, KEY).account;
    await store.upsert('accounts', built);
    await store.upsert('senderHealth', {
      id: `pilot-health-${role}`, inbox: `winnr:${email}`, paused: false, hardBouncesToday: 0, complaintsToday: 0,
      failureStreak: 0, healthDate: '2026-10-13', createdAt: NOW.toISOString()
    });
  }
}

async function openStore(url) {
  const store = new PostgresStore({ databaseUrl: url, ssl: false });
  await store.init();
  await seedPilot(store);
  return store;
}

const byId = (a, b) => String(a.id).localeCompare(String(b.id));
const domainOf = value => String(value ?? '').split('@')[1] || '';
const onStartup = row => STARTUP.includes(domainOf(row.email));
const onPilot = row => domainOf(row.email) === PILOT_DOMAIN;

async function startupAccounts(store) {
  return (await store.list('accounts')).filter(onStartup);
}

// Sender holds on the Startup domains. A hold's inbox is the SMTP account slot, which is "winnr:" plus the address.
async function startupHolds(store) {
  return (await store.list('senderHealth')).filter(row => STARTUP.includes(domainOf(String(row.inbox).replace(/^winnr:/, ''))));
}

// Everything the import could change: accounts, sender holds, settings and the audit log.
async function dump(store) {
  return JSON.stringify({
    accounts: (await store.list('accounts')).sort(byId),
    senderHealth: (await store.list('senderHealth')).sort(byId),
    settings: await store.getSettings(),
    auditLog: (await store.list('auditLog')).sort(byId)
  });
}

// Plan-time and execution-time refusals need no PostgreSQL. A JSON store is a real store that the import must refuse.
async function jsonStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'winnr-import-pg-proof-json-'));
  const store = new JsonStore(dir);
  await store.init();
  return { store, dir };
}

test('the import on PostgreSQL holds every planned sender, disconnects every IMAP account, leaves pilot rows untouched and selects no imported sender', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  try {
    const s = scenario();
    const pilotBefore = JSON.stringify((await store.list('accounts')).filter(onPilot).sort(byId));
    const plan = planWinnrProductionImport(planArgs(s));
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    assert.match(plan.planDigest, /^[a-f0-9]{64}$/);
    assert.equal(plan.rows.length, 50);

    const result = await executeWinnrProductionImport(executeArgs(store, plan));
    assert.equal(result.ok, true, result.reasonCodes.join(','));
    assert.equal(result.status, 'PRODUCTION_IMPORT_EXECUTED');

    const accounts = await startupAccounts(store);
    const smtp = accounts.filter(a => a.provider === 'smtp-relay');
    const imap = accounts.filter(a => a.provider === 'imap-forwarding');
    assert.equal(smtp.length, 50, 'fifty SMTP senders on the ten Startup domains');
    assert.equal(imap.length, 50, 'fifty IMAP accounts on the ten Startup domains');
    assert.ok(imap.every(a => a.connected === false), 'every IMAP account is disconnected');

    const holds = await startupHolds(store);
    assert.equal(holds.length, 50);
    assert.ok(holds.every(row => row.paused === true && row.pauseReason === WINNR_IMPORT_HOLD_REASON));

    const senderHealth = await store.list('senderHealth');
    const selectable = smtp.filter(account => selectFleetMailbox({
      prospectId: 'pg-proof', accounts: [account], senderHealth, provider: 'smtp-relay', date: NOW
    }).ok === true);
    assert.equal(selectable.length, 0, 'no imported sender is selectable');
    // Control: an unpaused pilot sender is selectable by the same selector, so the zero above is not vacuous.
    const control = selectFleetMailbox({
      prospectId: 'pg-control', accounts: (await store.list('accounts')).filter(onPilot), senderHealth, provider: 'smtp-relay', date: NOW
    });
    assert.equal(control.ok, true, 'an unpaused pilot sender is selectable by the same selector');

    assert.equal(JSON.stringify((await store.list('accounts')).filter(onPilot).sort(byId)), pilotBefore, 'pilot rows unchanged');
    const settings = await store.getSettings();
    assert.equal(settings[WINNR_IMPORT_RECEIPT_SETTING].status, 'PRODUCTION_IMPORT_EXECUTED');

    const publicText = JSON.stringify([plan.publicReceipt, result.publicReceipt]);
    assert.equal(publicText.includes('@'), false, 'no address in a public receipt');
    for (const domain of [...STARTUP, PILOT_DOMAIN]) assert.equal(publicText.includes(domain), false, 'no domain in a public receipt');
    for (const row of s.rows.slice(0, 5)) {
      assert.equal(publicText.includes(row.password), false, 'no password in a public receipt');
      assert.equal(JSON.stringify(result).includes(row.imapPassword), false, 'no IMAP password in the result');
    }
    assert.equal(result.publicReceipt.externalEffectAuthority, 'NONE');
    assert.equal(result.publicReceipt.messagesSent, 0);
    assert.equal(result.publicReceipt.providerCalls, 0);
  } finally {
    await store.close();
  }
}));

test('an approval for plan digest X cannot execute plan digest Y, and writes nothing when refused', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  try {
    const planX = planWinnrProductionImport(planArgs(scenario()));
    const planY = planWinnrProductionImport(planArgs(scenario()));
    assert.equal(planX.ok, true, planX.reasonCodes.join(','));
    assert.equal(planY.ok, true, planY.reasonCodes.join(','));
    assert.notEqual(planX.planDigest, planY.planDigest, 'different exports yield different plan digests');

    const before = await dump(store);
    const refused = await executeWinnrProductionImport(executeArgs(store, planY, { executionGate: approvalFor(planX) }));
    assert.equal(refused.ok, false);
    assert.equal(refused.status, 'PRODUCTION_IMPORT_REFUSED');
    assert.ok(refused.reasonCodes.includes('approval-plan-digest-mismatch'), refused.reasonCodes.join(','));
    assert.equal(await dump(store), before, 'the refused execution changed nothing');
    assert.equal((await startupAccounts(store)).length, 0);

    // An approval whose digest is null is not an approval for any plan.
    const nullDigest = await executeWinnrProductionImport(executeArgs(store, planY, { executionGate: approvalFor(planY, { planDigest: null }) }));
    assert.ok(nullDigest.reasonCodes.includes('approval-plan-digest-mismatch'));
    assert.equal((await startupAccounts(store)).length, 0);

    // Control: the approval that names plan Y executes plan Y.
    const accepted = await executeWinnrProductionImport(executeArgs(store, planY));
    assert.equal(accepted.ok, true, accepted.reasonCodes.join(','));
    assert.equal(accepted.status, 'PRODUCTION_IMPORT_EXECUTED');
    assert.equal((await startupAccounts(store)).length, 100);
  } finally {
    await store.close();
  }
}));

test('an expired approval is refused before any write, including at the exact expiry instant, and one millisecond later is accepted', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    const before = await dump(store);

    const past = await executeWinnrProductionImport(executeArgs(store, plan, {
      executionGate: approvalFor(plan, { expiresAt: new Date(NOW.getTime() - 1000).toISOString() })
    }));
    assert.equal(past.ok, false);
    assert.ok(past.reasonCodes.includes('gate-expired'), past.reasonCodes.join(','));

    const instant = await executeWinnrProductionImport(executeArgs(store, plan, {
      executionGate: approvalFor(plan, { expiresAt: NOW.toISOString() })
    }));
    assert.equal(instant.ok, false);
    assert.ok(instant.reasonCodes.includes('gate-expired'), 'expiry is inclusive of the current instant');
    assert.equal(await dump(store), before, 'neither expired execution wrote anything');

    // Control: one millisecond before expiry is still a live approval, so the refusals above are about the instant.
    const live = await executeWinnrProductionImport(executeArgs(store, plan, {
      executionGate: approvalFor(plan, { expiresAt: new Date(NOW.getTime() + 1).toISOString() })
    }));
    assert.equal(live.ok, true, live.reasonCodes.join(','));
    assert.equal(live.status, 'PRODUCTION_IMPORT_EXECUTED');
  } finally {
    await store.close();
  }
}));

test('a repeat execution finds the plan already held, writes nothing and leaves the PostgreSQL store byte-identical', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    const first = await executeWinnrProductionImport(executeArgs(store, plan));
    assert.equal(first.status, 'PRODUCTION_IMPORT_EXECUTED', first.reasonCodes.join(','));
    const afterFirst = await dump(store);

    // A later clock makes any stray write visible: a write would stamp the new time into the store.
    const second = await executeWinnrProductionImport(executeArgs(store, plan, { now: LATER }));
    assert.equal(second.ok, true, second.reasonCodes.join(','));
    assert.equal(second.status, 'PRODUCTION_IMPORT_ALREADY_PRESENT');
    assert.equal(second.counts.writtenRows, 0);
    assert.equal(second.counts.committedWrites, 0, 'no row, setting or log entry was written');
    // Holds are asserted on every run, as before; a hold already in place is asserted, not rewritten.
    assert.equal(second.counts.pauseWrites, 50);
    assert.equal(second.counts.smtpAccountWrites, 0);
    assert.equal(second.counts.imapAccountWrites, 0);
    assert.equal(await dump(store), afterFirst, 'the store is byte-identical after the repeat');
  } finally {
    await store.close();
  }
}));

test('a sender unpaused by an operator is held again by the next run, which is the one write a repeat may make', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    assert.equal((await executeWinnrProductionImport(executeArgs(store, plan))).ok, true);
    const inbox = `winnr:${plan.rows[7].identity}`;
    const target = (await store.list('senderHealth')).find(row => row.inbox === inbox);
    assert.ok(target, 'the planned sender has a hold row');
    assert.equal(target.paused, true, 'the planned sender starts held');
    await store.upsert('senderHealth', { ...target, paused: false, pauseReason: '' });

    const rerun = await executeWinnrProductionImport(executeArgs(store, plan, { now: LATER }));
    assert.equal(rerun.ok, true, rerun.reasonCodes.join(','));
    assert.equal(rerun.status, 'PRODUCTION_IMPORT_ALREADY_PRESENT');
    assert.equal(rerun.counts.committedWrites, 1, 'only the one unpaused sender is written again');
    const held = (await store.list('senderHealth')).find(row => row.id === target.id);
    assert.equal(held.paused, true);
    assert.equal(held.pauseReason, WINNR_IMPORT_HOLD_REASON);
  } finally {
    await store.close();
  }
}));

test('two connections executing one plan at the same time apply it exactly once', () => withDisposablePostgres(async url => {
  const storeA = await openStore(url);
  const storeB = await openStore(url);
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    const [a, b] = await Promise.all([
      executeWinnrProductionImport(executeArgs(storeA, plan)),
      executeWinnrProductionImport(executeArgs(storeB, plan))
    ]);
    assert.deepEqual([a.status, b.status].sort(), ['PRODUCTION_IMPORT_ALREADY_PRESENT', 'PRODUCTION_IMPORT_EXECUTED']);
    assert.equal((await startupAccounts(storeA)).length, 100, 'fifty SMTP and fifty IMAP accounts, no duplicates');
    assert.equal((await startupHolds(storeA)).length, 50);
    const imports = (await storeA.list('auditLog')).filter(row => row.type === 'WINNR_PRODUCTION_IMPORT');
    assert.equal(imports.length, 1, 'exactly one import receipt was logged');
    assert.equal((await storeA.getSettings())[LEASE].released, true, 'the lease is released');
  } finally {
    await storeA.close();
    await storeB.close();
  }
}));

// Regression for an uncaught exception seen during server teardown. close() resolves once each pooled client has been asked
// to end, not once its socket has closed, so the server's termination message can reach an idle client afterwards. That
// error is emitted on the pool; with no pool listener it crashed the process, and the disposable-server harness attributed
// it to whichever test was running. The forced emit below is the same event, delivered deterministically.
test('an idle pooled connection terminated by the server after close() is absorbed by the pool', () => withDisposablePostgres(async url => {
  const clients = [];
  const store = new PostgresStore({ databaseUrl: url, ssl: false });
  store.pool.on('connect', client => clients.push(client));
  try {
    await store.init();
    await Promise.all([1, 2, 3].map(() => store.transaction(tx => tx.list('accounts'))));
  } finally {
    await store.close();
  }
  assert.ok(clients.length >= 2, 'several pooled connections were opened');
  for (const client of clients) {
    const termination = Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' });
    assert.doesNotThrow(() => client.emit('error', termination), 'the termination reaches the pool, which must not crash');
  }
}));

test('a plan issued for PostgreSQL is refused against a JSON store with a backend mismatch, and nothing is written to either store', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  const { store: json, dir } = await jsonStore();
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));

    const mismatch = await executeWinnrProductionImport(executeArgs(json, plan));
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.status, 'PRODUCTION_IMPORT_REFUSED');
    assert.ok(mismatch.reasonCodes.includes('store-backend-mismatch'), mismatch.reasonCodes.join(','));
    assert.equal((await json.list('accounts')).length, 0, 'the JSON store received no account');
    assert.equal((await json.list('senderHealth')).length, 0, 'the JSON store received no hold');
    assert.equal((await startupAccounts(store)).length, 0, 'PostgreSQL received nothing from the refused run');

    // Control: the same plan executes against the PostgreSQL store it was planned for.
    const accepted = await executeWinnrProductionImport(executeArgs(store, plan));
    assert.equal(accepted.ok, true, accepted.reasonCodes.join(','));
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}));

test('a caller-asserted storeBackend is refused at execution, even when it names PostgreSQL, and nothing is written', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    const before = await dump(store);

    const asserted = await executeWinnrProductionImport(executeArgs(store, plan, { storeBackend: 'postgres' }));
    assert.equal(asserted.ok, false);
    assert.ok(asserted.reasonCodes.includes('caller-asserted-backend-refused'), asserted.reasonCodes.join(','));
    assert.equal(await dump(store), before, 'the refused execution changed nothing');

    // Control: the same plan, without an asserted backend, executes against the store that is actually PostgreSQL.
    const accepted = await executeWinnrProductionImport(executeArgs(store, plan));
    assert.equal(accepted.ok, true, accepted.reasonCodes.join(','));
  } finally {
    await store.close();
  }
}));

test('a fault after seven writes rolls back holds, accounts, lease and receipt together on PostgreSQL, and a clean retry applies', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    const before = await dump(store);

    const failed = await executeWinnrProductionImport(executeArgs(store, plan, { faultAfterWrites: 7 }));
    assert.equal(failed.ok, false);
    assert.equal(failed.status, 'PRODUCTION_IMPORT_ROLLED_BACK');
    assert.equal(await dump(store), before, 'the rollback restored the store byte-for-byte, including the lease');
    assert.equal((await startupAccounts(store)).length, 0, 'no account survived the rollback');
    assert.equal((await startupHolds(store)).length, 0, 'no hold survived the rollback');
    assert.equal((await store.getSettings())[WINNR_IMPORT_RECEIPT_SETTING], undefined, 'no receipt survived the rollback');

    const retried = await executeWinnrProductionImport(executeArgs(store, plan));
    assert.equal(retried.ok, true, retried.reasonCodes.join(','));
    assert.equal(retried.status, 'PRODUCTION_IMPORT_EXECUTED');
    assert.equal((await startupAccounts(store)).length, 100);
  } finally {
    await store.close();
  }
}));

test('an approval without a planDigest is refused on PostgreSQL with approval-plan-digest-missing, and writes nothing', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    const before = await dump(store);

    const omitted = await executeWinnrProductionImport(executeArgs(store, plan, { executionGate: buildGate() }));
    assert.equal(omitted.ok, false);
    assert.equal(omitted.status, 'PRODUCTION_IMPORT_REFUSED');
    assert.ok(omitted.reasonCodes.includes('approval-plan-digest-missing'), omitted.reasonCodes.join(','));
    assert.equal(await dump(store), before, 'the refused execution changed nothing');
    assert.equal((await startupAccounts(store)).length, 0);

    // Control: the same plan, with its digest named, executes.
    const accepted = await executeWinnrProductionImport(executeArgs(store, plan));
    assert.equal(accepted.ok, true, accepted.reasonCodes.join(','));
  } finally {
    await store.close();
  }
}));

test('the declared backendKind is read-only on PostgresStore and JsonStore, and the import reads that declaration', () => withDisposablePostgres(async url => {
  const store = await openStore(url);
  const { store: json, dir } = await jsonStore();
  try {
    assert.equal(store.backendKind, 'postgres');
    assert.equal(json.backendKind, 'json');
    assert.throws(() => { store.backendKind = 'json'; }, TypeError);
    assert.throws(() => { json.backendKind = 'postgres'; }, TypeError);
    assert.equal(store.backendKind, 'postgres');
    assert.equal(json.backendKind, 'json');
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}));
