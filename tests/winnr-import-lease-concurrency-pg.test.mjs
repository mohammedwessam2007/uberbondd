import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';
import { PostgresStore } from '../src/store.mjs';
import { buildEncryptedSmtpAccount } from '../src/uberfleet.mjs';
import {
  planWinnrProductionImport,
  executeWinnrProductionImport,
  WINNR_PRODUCTION_IMPORT_CONFIRMATION,
  WINNR_PRODUCTION_KEY_LABEL,
  WINNR_IMPORT_HOLD_REASON
} from '../src/winnr-production-import.mjs';

// Lease behaviour of the production Winnr importer across INDEPENDENT PostgreSQL clients. Every client here owns its own
// pg Pool, so there is no shared store object, no shared in-process single-flight guard and no shared client. Each importer
// has its own lease owner. Every server is disposable and synthetic: reserved *.test names, random credentials, no provider,
// mailbox, DNS or payment system is contacted.

const NOW = new Date('2026-10-14T09:00:00.000Z');
const LEASE = 'winnrProductionImportLease';
const LEASE_WAIT_MS = 2000;
const ROLES = ['hello', 'team', 'connect', 'partnerships', 'growth'];
const STARTUP = Array.from({ length: 10 }, (_, i) => `startup${String(i + 1).padStart(2, '0')}.test`);
const PILOT_DOMAIN = 'pilot-probe.test';
const SMTP_HOST = 'smtp.relay.test';
const IMAP_HOST = 'imap.relay.test';
const WORKSPACE = 'workspace-lease-proof-1';
const ROUTE_REF = 'receipt:route-evidence-lease-proof-1';
const KEY = crypto.randomBytes(32).toString('hex');
const EXPECTED_TEXT = JSON.stringify({ startupDomains: STARTUP, pilotDomains: [PILOT_DOMAIN] });

const iso = ms => new Date(ms).toISOString();
const minutes = n => n * 60 * 1000;
const secret = () => crypto.randomBytes(18).toString('hex');
const reviewedCommit = () => crypto.randomBytes(20).toString('hex');
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);
const byId = (a, b) => String(a.id).localeCompare(String(b.id));
const domainOf = value => String(value ?? '').split('@')[1] || '';
const onStartup = row => STARTUP.includes(domainOf(row.email));
const onPilot = row => domainOf(row.email) === PILOT_DOMAIN;

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
    approvalRef: 'owner-approval-lease-proof-1',
    reviewedCommit: reviewedCommit(),
    expiresAt: iso(NOW.getTime() + minutes(60)),
    expectedAccountCount: 50,
    routeAuthorized: true,
    termsCompatible: true,
    ...overrides
  };
}

function scenario() {
  const rows = buildRows();
  return { rows, csv: buildCsv(rows), providerDomains: buildProviderDomains(), providerMailboxes: buildProviderMailboxes(rows) };
}

function planFor(s) {
  return planWinnrProductionImport({
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
    now: NOW
  });
}

// The approval names the digest of the one plan it approves.
function executeArgs(store, plan, leaseOwner) {
  return {
    store,
    plan,
    executionGate: { ...buildGate(), planDigest: plan.planDigest },
    now: NOW,
    leaseOwner,
    encryptionKeyHex: KEY
  };
}

// Each connection is an independent PostgresStore on its own pg Pool, the way two separate processes would hold one.
async function connect(url, applicationName, opened) {
  const pool = new Pool({ connectionString: url, application_name: applicationName, max: 4 });
  pool.on('error', () => {});
  const store = new PostgresStore({ pool, ssl: false });
  opened.push(store);
  await store.init();
  return store;
}

async function closeAll(opened) {
  await Promise.all(opened.map(store => store.pool.end().catch(() => {})));
}

// The pilot rows exist before any import, as they do in production. The import must leave them exactly as found.
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

// Everything the import could change: accounts, sender holds, settings and the audit log.
async function dump(store) {
  return JSON.stringify({
    accounts: (await store.list('accounts')).sort(byId),
    senderHealth: (await store.list('senderHealth')).sort(byId),
    settings: await store.getSettings(),
    auditLog: (await store.list('auditLog')).sort(byId)
  });
}

async function assertFullyApplied(store) {
  const accounts = (await store.list('accounts')).filter(onStartup);
  assert.equal(accounts.length, 100, 'fifty SMTP and fifty IMAP accounts, no duplicates');
  const holds = (await store.list('senderHealth')).filter(row => STARTUP.includes(domainOf(String(row.inbox).replace(/^winnr:/, ''))));
  assert.equal(holds.length, 50);
  assert.ok(holds.every(row => row.paused === true && row.pauseReason === WINNR_IMPORT_HOLD_REASON), 'every planned sender is held');
  const receipts = (await store.list('auditLog')).filter(row => row.type === 'WINNR_PRODUCTION_IMPORT');
  assert.equal(receipts.length, 1, 'exactly one import receipt was logged');
}

// Parks one importer inside its own transaction, after its lease is written and before it reads any account. The lease is
// therefore uncommitted, which is the state a real in-flight run is in.
function parkHolder(store) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let markReached;
  const reached = new Promise(resolve => { markReached = resolve; });
  let parked = false;
  const parkedStore = Object.create(store);
  parkedStore.transaction = fn => store.transaction(tx => {
    const view = Object.create(tx);
    view.list = async (key, options) => {
      if (!parked && key === 'accounts') {
        parked = true;
        markReached();
        await gate;
      }
      return tx.list(key, options);
    };
    return fn(view);
  });
  return { store: parkedStore, reached, release };
}

function settledWithin(promise, ms) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), ms); });
  return Promise.race([promise.then(value => ({ timedOut: false, value })), timeout]).finally(() => clearTimeout(timer));
}

test('a second importer on an independent connection is refused with IMPORT_ALREADY_RUNNING while the holder is still in flight, and changes nothing', () => withDisposablePostgres(async url => {
  const opened = [];
  try {
    const seeder = await connect(url, 'winnr-seeder', opened);
    await seedPilot(seeder);
    const plan = planFor(scenario());
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    const holder = parkHolder(await connect(url, 'winnr-holder-a', opened));
    const challengerB = await connect(url, 'winnr-challenger-b', opened);
    const challengerC = await connect(url, 'winnr-challenger-c', opened);

    const holderRun = executeWinnrProductionImport(executeArgs(holder.store, plan, 'owner-holder-a'));
    const attempts = [];
    const verdicts = [];
    let before;
    let afterRefusals;
    try {
      await Promise.race([holder.reached, holderRun.then(r => { throw new Error(`holder finished before reaching its transaction: ${r.reasonCodes.join(',')}`); })]);
      before = await dump(seeder);
      // Challenger B has a different owner. Challenger C reuses the holder's owner string, which must not let it through.
      for (const [store, owner] of [[challengerB, 'owner-challenger-b'], [challengerC, 'owner-holder-a']]) {
        const pending = executeWinnrProductionImport(executeArgs(store, plan, owner));
        attempts.push(pending);
        verdicts.push(await settledWithin(pending, LEASE_WAIT_MS));
      }
      afterRefusals = await dump(seeder);
    } finally {
      holder.release();
    }
    const holderResult = await holderRun;
    await Promise.allSettled(attempts);

    for (const verdict of verdicts) {
      assert.equal(verdict.timedOut, false, 'a second importer is refused at once, not queued behind the holder transaction');
      assert.equal(verdict.value.ok, false, verdict.value.reasonCodes?.join(','));
      assert.deepEqual(verdict.value.reasonCodes, ['IMPORT_ALREADY_RUNNING']);
    }
    assert.equal(afterRefusals, before, 'the refused importers changed nothing while the holder was in flight');
    assert.equal(holderResult.ok, true, holderResult.reasonCodes.join(','));
    assert.equal(holderResult.status, 'PRODUCTION_IMPORT_EXECUTED');
    await assertFullyApplied(seeder);
  } finally {
    await closeAll(opened);
  }
}));

test('a committed fresh lease held by another connection refuses an independent importer with IMPORT_ALREADY_RUNNING and changes nothing', () => withDisposablePostgres(async url => {
  const opened = [];
  try {
    const seeder = await connect(url, 'winnr-seeder', opened);
    await seedPilot(seeder);
    const challenger = await connect(url, 'winnr-challenger', opened);
    const plan = planFor(scenario());
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    await seeder.setSetting(LEASE, { owner: 'owner-other-run', acquiredAt: iso(NOW.getTime() - minutes(1)), expiresAt: iso(NOW.getTime() + minutes(5)), released: false });
    const before = await dump(seeder);
    const result = await executeWinnrProductionImport(executeArgs(challenger, plan, 'owner-challenger'));
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasonCodes, ['IMPORT_ALREADY_RUNNING']);
    assert.equal(await dump(seeder), before, 'the refused importer changed nothing');
  } finally {
    await closeAll(opened);
  }
}));

test('a lease left expired by a crashed holder is recovered by exactly one of two independent new owners', () => withDisposablePostgres(async url => {
  const opened = [];
  try {
    const seeder = await connect(url, 'winnr-seeder', opened);
    await seedPilot(seeder);
    const challengerB = await connect(url, 'winnr-recovery-b', opened);
    const challengerC = await connect(url, 'winnr-recovery-c', opened);
    const plan = planFor(scenario());
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    await seeder.setSetting(LEASE, { owner: 'owner-crashed-holder', acquiredAt: iso(NOW.getTime() - minutes(20)), expiresAt: iso(NOW.getTime() - minutes(10)), released: false });

    const [b, c] = await Promise.all([
      executeWinnrProductionImport(executeArgs(challengerB, plan, 'owner-recovery-b')),
      executeWinnrProductionImport(executeArgs(challengerC, plan, 'owner-recovery-c'))
    ]);
    const executed = [b, c].filter(result => result.status === 'PRODUCTION_IMPORT_EXECUTED');
    assert.equal(executed.length, 1, 'exactly one new owner applies the recovered plan');
    const other = [b, c].find(result => result !== executed[0]);
    const otherRefused = other.ok === false && other.reasonCodes.length === 1 && other.reasonCodes[0] === 'IMPORT_ALREADY_RUNNING';
    assert.ok(other.status === 'PRODUCTION_IMPORT_ALREADY_PRESENT' || otherRefused, `second owner must be a no-op: ${other.status} ${other.reasonCodes.join(',')}`);
    const lease = (await seeder.getSettings())[LEASE];
    assert.equal(lease.released, true, 'the recovered lease is released');
    assert.equal(lease.owner, executed[0] === b ? 'owner-recovery-b' : 'owner-recovery-c', 'the lease records the owner that recovered it');
    await assertFullyApplied(seeder);
  } finally {
    await closeAll(opened);
  }
}));

test('a holder whose connection dies mid-run leaves no committed lease or partial state, and a new owner applies the plan exactly once', () => withDisposablePostgres(async url => {
  const opened = [];
  try {
    const seeder = await connect(url, 'winnr-seeder', opened);
    await seedPilot(seeder);
    const holder = parkHolder(await connect(url, 'winnr-holder-crash', opened));
    const recovery = await connect(url, 'winnr-recovery', opened);
    const plan = planFor(scenario());
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    const before = await dump(seeder);
    const pilotBefore = JSON.stringify((await seeder.list('accounts')).filter(onPilot).sort(byId));

    const crashingRun = executeWinnrProductionImport(executeArgs(holder.store, plan, 'owner-crashed-holder'));
    try {
      await Promise.race([holder.reached, crashingRun.then(r => { throw new Error(`holder finished before reaching its transaction: ${r.reasonCodes.join(',')}`); })]);
      // The process dies while its transaction is open. The server ends the backend, so nothing it wrote can commit.
      const killed = await seeder.pool.query("SELECT count(*)::int AS n FROM (SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'winnr-holder-crash' AND pid <> pg_backend_pid()) t");
      assert.ok(killed.rows[0].n >= 1, 'the holder backend was terminated');
    } finally {
      holder.release();
    }
    const crashed = await crashingRun;
    assert.equal(crashed.ok, false, 'the dead holder did not report success');
    assert.equal(await dump(seeder), before, 'the dead holder left no committed lease, hold, account or receipt');

    const recovered = await executeWinnrProductionImport(executeArgs(recovery, plan, 'owner-recovery'));
    assert.equal(recovered.ok, true, recovered.reasonCodes.join(','));
    assert.equal(recovered.status, 'PRODUCTION_IMPORT_EXECUTED');
    assert.equal(recovered.counts.writtenRows, 50, 'the new owner wrote the plan once');
    const lease = (await seeder.getSettings())[LEASE];
    assert.equal(lease.owner, 'owner-recovery');
    assert.equal(lease.released, true);
    await assertFullyApplied(seeder);
    assert.equal(JSON.stringify((await seeder.list('accounts')).filter(onPilot).sort(byId)), pilotBefore, 'pilot rows are untouched');
  } finally {
    await closeAll(opened);
  }
}));

test('two independent connections racing for one plan cannot both commit: exactly one run writes, the other changes nothing', () => withDisposablePostgres(async url => {
  const opened = [];
  try {
    const seeder = await connect(url, 'winnr-seeder', opened);
    await seedPilot(seeder);
    const racerB = await connect(url, 'winnr-race-b', opened);
    const racerC = await connect(url, 'winnr-race-c', opened);
    const plan = planFor(scenario());
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));

    const [b, c] = await Promise.all([
      executeWinnrProductionImport(executeArgs(racerB, plan, 'owner-race-b')),
      executeWinnrProductionImport(executeArgs(racerC, plan, 'owner-race-c'))
    ]);
    const writers = [b, c].filter(result => result.counts?.committedWrites > 0);
    assert.equal(writers.length, 1, 'exactly one run committed writes');
    assert.equal(writers[0].status, 'PRODUCTION_IMPORT_EXECUTED');
    const loser = [b, c].find(result => result !== writers[0]);
    const loserChangedNothing = loser.status === 'PRODUCTION_IMPORT_ALREADY_PRESENT'
      || (loser.ok === false && loser.reasonCodes.length === 1 && loser.reasonCodes[0] === 'IMPORT_ALREADY_RUNNING');
    assert.ok(loserChangedNothing, `the other run must change nothing: ${loser.status} ${loser.reasonCodes.join(',')}`);
    await assertFullyApplied(seeder);
  } finally {
    await closeAll(opened);
  }
}));
