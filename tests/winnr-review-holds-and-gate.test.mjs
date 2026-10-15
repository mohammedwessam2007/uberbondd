import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';
import { JsonStore, PostgresStore } from '../src/store.mjs';
import { buildEncryptedSmtpAccount, selectFleetMailbox } from '../src/uberfleet.mjs';
import { buildEncryptedImapAccount } from '../src/uberimap.mjs';
import { stageImportedAccounts } from '../src/winnr-fleet-control-plane.mjs';
import {
  runWinnrSmtpReadinessProbe,
  probeWinnrImapReadiness,
  SMTP_PROBE_FAILURE_PAUSE_REASON
} from '../src/winnr-smtp-readiness.mjs';
import {
  planWinnrProductionImport,
  executeWinnrProductionImport,
  WINNR_PRODUCTION_IMPORT_CONFIRMATION,
  WINNR_PRODUCTION_KEY_LABEL
} from '../src/winnr-production-import.mjs';

// Review holds and execution gate, proven on synthetic fixtures only.
//
// F1: staging an import must never clear or relabel a protective hold on an existing sender.
// F2: the production import must re-check route authority and terms compatibility at execution, not only at planning.
// F3: the IMAP readiness probe must refuse before opening any socket when the route or the connected flag is absent.
//
// No provider, mailbox server or DNS record is contacted. Every socket is loopback. Credentials are random per run.

const KEY = crypto.randomBytes(32).toString('hex');
const EVIDENCE = 'fixture:review-holds-and-gate';
const NOW = new Date('2026-10-14T09:00:00.000Z');
const DOMAIN = 'startup-review.test';
const READY_PROBE = Object.freeze({
  classification: 'READY', providerCalls: 1, providerSessionReceiptId: 'fixture-receipt-review-1',
  providerResponseDigest: 'a'.repeat(64), reasonCodes: []
});

const emailOf = local => `${local}@${DOMAIN}`;
const smtpSlotOf = local => `winnr:${emailOf(local)}`;

function smtpAccountFor(local) {
  const built = buildEncryptedSmtpAccount({
    slot: smtpSlotOf(local), email: emailOf(local), host: 'smtp.relay.test', port: 465, secure: true,
    username: emailOf(local), password: `smtp-${local}-fixture`, sendingDomainId: 'dom-review', sendingMailboxId: `mb-${local}`,
    sendingWorkspaceId: 'workspace-review', routeEvidenceRef: EVIDENCE, routeAuthorized: true, termsCompatible: true,
    plannedDailyCap: 2, plannedHourlyCap: 1, minGapSeconds: 900
  }, KEY);
  assert.equal(built.ok, true, built.reasonCodes?.join(','));
  return built.account;
}

function imapAccountFor(local) {
  const built = buildEncryptedImapAccount({
    slot: `winnr-imap:${emailOf(local)}`, email: emailOf(local), host: 'imap.relay.test', port: 993, secure: true,
    username: emailOf(local), password: `imap-${local}-fixture`, evidenceRef: EVIDENCE, authorized: true, termsCompatible: true
  }, KEY);
  assert.equal(built.ok, true, built.reasonCodes?.join(','));
  return built.account;
}

// One prepared row as compileWinnrCredentialImport returns it.
function stagedRow(local) {
  return { smtpAccount: smtpAccountFor(local), imapAccount: imapAccountFor(local) };
}

function holdRow(inbox, pauseReason) {
  return {
    id: `sender_${inbox}`, inbox, paused: true, pauseReason, hardBouncesToday: 0, complaintsToday: 1,
    failureStreak: 0, healthDate: '2026-10-14', createdAt: NOW.toISOString()
  };
}

async function freshJsonStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'winnr-review-holds-'));
  const store = new JsonStore(dir);
  await store.init();
  return { store, dir };
}

const healthOf = async (store, inbox) => (await store.list('senderHealth')).find(row => row.inbox === inbox) || null;

// The same selector the outbound path uses, over the store as it stands.
async function selectableNow(store, slot) {
  const accounts = (await store.list('accounts')).filter(account => account.slot === slot);
  return selectFleetMailbox({
    prospectId: 'review-holds-and-gate', accounts, senderHealth: await store.list('senderHealth'), provider: 'smtp-relay', date: NOW
  });
}

// F1 -----------------------------------------------------------------------------------------------------------------

test('F1: staging leaves a complaint-held sender paused under the complaint reason, unselectable, and a probe run does not lift it', async () => {
  const { store, dir } = await freshJsonStore();
  try {
    await store.upsert('accounts', smtpAccountFor('complaint'));
    await store.upsert('senderHealth', holdRow(smtpSlotOf('complaint'), 'inbound-complaint-hold'));

    await stageImportedAccounts({
      store, prepared: [stagedRow('complaint'), stagedRow('clean')], pauseReason: SMTP_PROBE_FAILURE_PAUSE_REASON
    });

    const held = await healthOf(store, smtpSlotOf('complaint'));
    assert.equal(held.paused, true, 'the complaint hold is still in place after staging');
    assert.equal(held.pauseReason, 'inbound-complaint-hold', 'the complaint reason survives staging');
    assert.equal((await selectableNow(store, smtpSlotOf('complaint'))).ok, false, 'the complaint-held sender is not selectable');

    // The probe's own pause-reason rule is what would lift a sender. A relabelled complaint hold would be lifted here.
    const probed = [];
    const receipt = await runWinnrSmtpReadinessProbe({
      store, encryptionKey: KEY, quarantineOrdinalsText: '', quarantineSlotsText: '', now: NOW,
      probeFn: async ({ account }) => { probed.push(account.slot); return READY_PROBE; }
    });
    assert.deepEqual(probed, [smtpSlotOf('clean')], 'the probe contacts only the clean new account');
    assert.equal(receipt.skippedProtectiveAccounts, 1, 'the complaint-held sender is skipped as a protective hold');
    assert.equal((await healthOf(store, smtpSlotOf('complaint'))).paused, true, 'the probe does not lift the complaint hold');
    assert.equal((await selectableNow(store, smtpSlotOf('complaint'))).ok, false, 'still unselectable after the probe');
    // Control: the clean sender was probed and is selectable, so the refusals above are about the hold.
    assert.equal((await selectableNow(store, smtpSlotOf('clean'))).ok, true, 'control: the probed clean sender is selectable');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

for (const reason of ['hard-bounce-threshold', 'winnr-gmail-placement-red-2026-10-02', 'operator-manual-hold']) {
  test(`F1: staging keeps a sender held under "${reason}" paused under that reason and unselectable`, async () => {
    const { store, dir } = await freshJsonStore();
    try {
      await store.upsert('accounts', smtpAccountFor('protected'));
      await store.upsert('senderHealth', holdRow(smtpSlotOf('protected'), reason));

      await stageImportedAccounts({ store, prepared: [stagedRow('protected')], pauseReason: SMTP_PROBE_FAILURE_PAUSE_REASON });

      const health = await healthOf(store, smtpSlotOf('protected'));
      assert.equal(health.paused, true);
      assert.equal(health.pauseReason, reason, 'the protective reason is not overwritten by the import reason');
      assert.equal((await selectableNow(store, smtpSlotOf('protected'))).ok, false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}

test('F1: a clean new Startup account is held first under the import reason and has no selectable capacity (cap 0)', async () => {
  const { store, dir } = await freshJsonStore();
  try {
    await stageImportedAccounts({ store, prepared: [stagedRow('fresh')], pauseReason: SMTP_PROBE_FAILURE_PAUSE_REASON });

    const health = await healthOf(store, smtpSlotOf('fresh'));
    assert.equal(health.paused, true, 'held first');
    assert.equal(health.pauseReason, SMTP_PROBE_FAILURE_PAUSE_REASON, 'held under the import reason');
    const choice = await selectableNow(store, smtpSlotOf('fresh'));
    assert.equal(choice.ok, false, 'a held new account is not selectable, so its effective cap is zero');
    assert.deepEqual(choice.reasonCodes, ['no-healthy-connected-provider-matched-mailbox']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('F1 (PostgreSQL): a complaint-held sender survives staging and the readiness probe on a real store', () => withDisposablePostgres(async url => {
  const store = new PostgresStore({ databaseUrl: url, ssl: false });
  await store.init();
  try {
    await store.upsert('accounts', smtpAccountFor('pg-complaint'));
    await store.upsert('senderHealth', holdRow(smtpSlotOf('pg-complaint'), 'inbound-complaint-hold'));

    await stageImportedAccounts({
      store, prepared: [stagedRow('pg-complaint'), stagedRow('pg-clean')], pauseReason: SMTP_PROBE_FAILURE_PAUSE_REASON
    });

    const held = await healthOf(store, smtpSlotOf('pg-complaint'));
    assert.equal(held.paused, true);
    assert.equal(held.pauseReason, 'inbound-complaint-hold', 'the complaint reason is stored unchanged after staging');

    const probed = [];
    const receipt = await runWinnrSmtpReadinessProbe({
      store, encryptionKey: KEY, quarantineOrdinalsText: '', quarantineSlotsText: '', now: NOW,
      probeFn: async ({ account }) => { probed.push(account.slot); return READY_PROBE; }
    });
    assert.deepEqual(probed, [smtpSlotOf('pg-clean')], 'the probe contacts only the clean new account');
    assert.equal(receipt.skippedProtectiveAccounts, 1);
    assert.equal((await healthOf(store, smtpSlotOf('pg-complaint'))).paused, true, 'the stored complaint hold is not lifted');
    assert.equal((await selectableNow(store, smtpSlotOf('pg-complaint'))).ok, false, 'the complaint-held sender is not selectable');
    assert.equal((await selectableNow(store, smtpSlotOf('pg-clean'))).ok, true, 'control: the probed clean sender is selectable');
  } finally {
    await store.close();
  }
}));

// F2 -----------------------------------------------------------------------------------------------------------------

const WORKSPACE = 'workspace-review-gate-1';
const ROUTE_REF = 'receipt:route-evidence-review-gate-1';
const SMTP_HOST = 'smtp.gate.test';
const IMAP_HOST = 'imap.gate.test';
const PILOT_DOMAIN = 'pilot-gate.test';
const STARTUP = Array.from({ length: 10 }, (_, i) => `startup${String(i + 1).padStart(2, '0')}.test`);
const ROLES = ['hello', 'team', 'connect', 'partnerships', 'growth'];
const EXPECTED_TEXT = JSON.stringify({ startupDomains: STARTUP, pilotDomains: [PILOT_DOMAIN] });
const secret = () => crypto.randomBytes(18).toString('hex');
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);
const domainOf = value => String(value ?? '').split('@')[1] || '';
const byId = (a, b) => String(a.id).localeCompare(String(b.id));
const onStartup = row => STARTUP.includes(domainOf(row.email));

function scenario() {
  const rows = [];
  for (const domain of STARTUP) {
    for (const role of ROLES) rows.push({ email: `${role}@${domain}`, fromName: capitalize(role), domain, password: secret(), imapPassword: secret() });
  }
  const header = 'from_email,from_name,domain,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password';
  const lines = rows.map(r => [r.email, r.fromName, r.domain, r.email, r.password, SMTP_HOST, 465, IMAP_HOST, 993, r.email, r.imapPassword].join(','));
  const startup = STARTUP.map((name, i) => ({ id: `dom-${i + 1}`, name, status: 'active', tags: [] }));
  const providerMailboxes = [
    ...rows.map((r, i) => ({ id: `mbx-${i + 1}`, domain: r.domain, full_address: r.email, status: 'active', smtp_host: SMTP_HOST, smtp_port: 465, imap_host: IMAP_HOST, imap_port: 993 })),
    ...['hello', 'team', 'connect'].map(role => ({ id: `mbx-pilot-${role}`, domain: PILOT_DOMAIN, full_address: `${role}@${PILOT_DOMAIN}`, status: 'active', smtp_host: SMTP_HOST, smtp_port: 465, imap_host: IMAP_HOST, imap_port: 993 }))
  ];
  return {
    csv: [header, ...lines].join('\n') + '\n',
    providerDomains: [...startup, { id: 'dom-pilot', name: PILOT_DOMAIN, status: 'active', tags: ['pre-warmed'] }],
    providerMailboxes
  };
}

function gate(overrides = {}) {
  return {
    mode: 'PRODUCTION_IMPORT',
    confirmation: WINNR_PRODUCTION_IMPORT_CONFIRMATION,
    approvalRef: 'owner-approval-review-gate-1',
    reviewedCommit: crypto.randomBytes(20).toString('hex'),
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    expectedAccountCount: 50,
    routeAuthorized: true,
    termsCompatible: true,
    ...overrides
  };
}

function planArgs(s) {
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
    executionGate: gate(),
    expectedPilotMailboxCount: 3,
    now: NOW
  };
}

// An approval names its plan. Everything else in the gate is the caller's, so a test can change one field at a time.
function approvalFor(plan, overrides = {}) {
  return { ...gate(), planDigest: plan.planDigest, ...overrides };
}

function executeArgs(store, plan, extra = {}) {
  return { store, plan, executionGate: approvalFor(plan), now: NOW, leaseOwner: 'run-review-gate-owner-1', encryptionKeyHex: KEY, ...extra };
}

async function openPostgres(url) {
  const store = new PostgresStore({ databaseUrl: url, ssl: false });
  await store.init();
  // Three pilot senders exist before the import. The import must leave them alone.
  for (const role of ['hello', 'team', 'connect']) {
    const email = `${role}@${PILOT_DOMAIN}`;
    const built = buildEncryptedSmtpAccount({
      slot: `winnr:${email}`, email, provider: 'smtp-relay', host: SMTP_HOST, username: email, password: secret(),
      sendingDomainId: 'dom-pilot', sendingMailboxId: `mbx-pilot-${role}`, sendingWorkspaceId: WORKSPACE,
      routeEvidenceRef: ROUTE_REF, routeAuthorized: true, termsCompatible: true, plannedDailyCap: 2
    }, KEY).account;
    await store.upsert('accounts', built);
  }
  return store;
}

// Everything the import could change. A refused execution must leave this byte-identical.
async function dump(store) {
  return JSON.stringify({
    accounts: (await store.list('accounts')).sort(byId),
    senderHealth: (await store.list('senderHealth')).sort(byId),
    settings: await store.getSettings(),
    auditLog: (await store.list('auditLog')).sort(byId)
  });
}

test('F2: an approval whose route or terms authority was withdrawn after planning is refused at execution, with zero accounts written', () => withDisposablePostgres(async url => {
  const store = await openPostgres(url);
  try {
    const plan = planWinnrProductionImport(planArgs(scenario()));
    assert.equal(plan.ok, true, plan.reasonCodes.join(','));
    const before = await dump(store);

    const revoked = await executeWinnrProductionImport(executeArgs(store, plan, {
      executionGate: approvalFor(plan, { routeAuthorized: false })
    }));
    assert.equal(revoked.ok, false);
    assert.equal(revoked.status, 'PRODUCTION_IMPORT_REFUSED');
    assert.ok(revoked.reasonCodes.includes('route-authorization-withdrawn'), revoked.reasonCodes.join(','));
    assert.equal(await dump(store), before, 'the refused execution changed nothing');
    assert.equal((await store.list('accounts')).filter(onStartup).length, 0, 'zero Startup accounts written');

    const incompatible = await executeWinnrProductionImport(executeArgs(store, plan, {
      executionGate: approvalFor(plan, { termsCompatible: false })
    }));
    assert.equal(incompatible.ok, false);
    assert.ok(incompatible.reasonCodes.includes('terms-incompatible'), incompatible.reasonCodes.join(','));
    assert.equal(await dump(store), before, 'the terms-refused execution changed nothing');
    assert.equal((await store.list('accounts')).filter(onStartup).length, 0, 'still zero Startup accounts written');

    // Control: the same plan executes when the route and terms authority still hold at execution.
    const accepted = await executeWinnrProductionImport(executeArgs(store, plan));
    assert.equal(accepted.ok, true, accepted.reasonCodes.join(','));
    assert.equal(accepted.status, 'PRODUCTION_IMPORT_EXECUTED');
    assert.equal((await store.list('accounts')).filter(onStartup).length, 100, 'fifty SMTP and fifty IMAP accounts after the control');
  } finally {
    await store.close();
  }
}));

// F3 -----------------------------------------------------------------------------------------------------------------

// A loopback listener that counts every connection and records every byte. It answers CAPABILITY and LOGIN so that a
// command which reaches it is visible in the record rather than hanging the probe.
async function startLoopbackTrap() {
  const received = [];
  const sockets = new Set();
  let connections = 0;
  const server = net.createServer(socket => {
    connections += 1;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', chunk => {
      const text = chunk.toString('latin1');
      received.push(text);
      if (/WR0001 CAPABILITY/.test(text)) socket.write('* CAPABILITY IMAP4rev1\r\nWR0001 OK CAPABILITY completed\r\n');
      if (/WR0002 LOGIN/.test(text)) socket.write('WR0002 NO [AUTHENTICATIONFAILED] refused\r\n');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    connections: () => connections,
    received: () => received.join(''),
    close: () => new Promise(resolve => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    })
  };
}

// Every connection the probe asks for is routed to the loopback trap. The requested host and port are recorded.
function recordingFactory(trap) {
  const calls = [];
  const factory = async options => {
    calls.push({ host: options?.host, port: options?.port });
    return net.connect({ host: '127.0.0.1', port: trap.port });
  };
  return { calls, factory };
}

function imapAccountWithRoute(route, { connected = true } = {}) {
  const account = imapAccountFor('probe');
  account.connected = connected;
  if (route === undefined) delete account.imapRoute;
  else account.imapRoute = route;
  return account;
}

test('F3: an IMAP account with no route opens no socket and sends no LOGIN', async () => {
  const trap = await startLoopbackTrap();
  try {
    const { calls, factory } = recordingFactory(trap);
    const account = imapAccountWithRoute(undefined);
    const result = await probeWinnrImapReadiness({ account, encryptionKey: KEY, connectFactory: factory, timeoutMs: 1000 });
    assert.equal(result.ok, false);
    assert.equal(result.classification, 'IMAP_ROUTE_ABSENT');
    assert.deepEqual(result.commandsIssued, []);
    assert.equal(calls.length, 0, 'no connection was requested');
    assert.equal(trap.connections(), 0, 'the loopback listener saw no connection');
    assert.equal(trap.received(), '', 'no CAPABILITY or LOGIN bytes were sent');
  } finally {
    await trap.close();
  }
});

test('F3: an IMAP route with an empty, missing or portless host or port opens no socket and sends no LOGIN', async () => {
  const trap = await startLoopbackTrap();
  try {
    const { calls, factory } = recordingFactory(trap);
    const badRoutes = [
      { host: '', port: trap.port, secure: false },
      { port: trap.port, secure: false },
      { host: '   ', port: trap.port, secure: false },
      { host: '127.0.0.1', secure: false },
      { host: '127.0.0.1', port: 0, secure: false }
    ];
    for (const route of badRoutes) {
      const result = await probeWinnrImapReadiness({ account: imapAccountWithRoute(route), encryptionKey: KEY, connectFactory: factory, timeoutMs: 1000 });
      assert.equal(result.ok, false, JSON.stringify(route));
      assert.equal(result.classification, 'IMAP_ROUTE_ABSENT', JSON.stringify(route));
      assert.deepEqual(result.commandsIssued, []);
    }
    assert.equal(calls.length, 0, 'no connection was requested for any bad route');
    assert.equal(trap.connections(), 0, 'the loopback listener saw no connection');
    assert.equal(trap.received(), '', 'no CAPABILITY or LOGIN bytes were sent');
  } finally {
    await trap.close();
  }
});

test('F3: a disconnected IMAP account opens no socket even with a complete route', async () => {
  const trap = await startLoopbackTrap();
  try {
    const { calls, factory } = recordingFactory(trap);
    const route = { host: '127.0.0.1', port: trap.port, secure: false };
    const result = await probeWinnrImapReadiness({
      account: imapAccountWithRoute(route, { connected: false }), encryptionKey: KEY, connectFactory: factory, timeoutMs: 1000
    });
    assert.equal(result.ok, false);
    assert.equal(result.classification, 'ACCOUNT_NOT_CONNECTED');
    assert.deepEqual(result.commandsIssued, []);
    assert.equal(calls.length, 0, 'no connection was requested');
    assert.equal(trap.connections(), 0, 'the loopback listener saw no connection');
    assert.equal(trap.received(), '', 'no CAPABILITY or LOGIN bytes were sent');
  } finally {
    await trap.close();
  }
});

test('F3 control: a connected account with an explicit host and port reaches the loopback listener at that route', async () => {
  const trap = await startLoopbackTrap();
  try {
    const { calls, factory } = recordingFactory(trap);
    const route = { host: '127.0.0.1', port: trap.port, secure: false };
    const result = await probeWinnrImapReadiness({ account: imapAccountWithRoute(route), encryptionKey: KEY, connectFactory: factory, timeoutMs: 2000 });
    assert.equal(calls.length, 1, 'exactly one connection was requested');
    assert.deepEqual(calls[0], { host: '127.0.0.1', port: trap.port }, 'the requested route is the account route');
    assert.equal(trap.connections(), 1);
    assert.match(trap.received(), /WR0001 CAPABILITY/);
    assert.equal(result.classification, 'AUTH_REJECTED', 'the fake listener refused LOGIN, so the probe ends at LOGIN');
    assert.deepEqual(result.commandsIssued, ['CAPABILITY', 'LOGIN']);
  } finally {
    await trap.close();
  }
});
