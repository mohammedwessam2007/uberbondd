import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createStore } from '../src/store.mjs';
import { buildEncryptedSmtpAccount } from '../src/uberfleet.mjs';
import { buildEncryptedImapAccount as buildImap } from '../src/uberimap.mjs';
import { stageImportedAccounts, verifyStoreKeyCompatibility } from '../src/winnr-fleet-control-plane.mjs';
import { runWinnrSmtpReadinessProbe, SMTP_PROBE_FAILURE_PAUSE_REASON } from '../src/winnr-smtp-readiness.mjs';

// Runs only against a disposable database supplied by scripts/with-real-postgres.mjs. It never touches production.
// Without that database the suite reports an explicit skip, so it cannot pass by silently doing nothing.
const URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const skip = URL ? false : 'OMNIA_V9_TEST_DATABASE_URL not set -- Postgres fleet-store proof not run';

const KEY = crypto.randomBytes(32).toString('hex');
const OTHER = crypto.randomBytes(32).toString('hex');
const EVIDENCE = 'fixture:postgres-fleet-store';
const tag = crypto.randomBytes(4).toString('hex');
const LOCALS = ['hello', 'team'];

function prepared(local) {
  const email = `${local}-${tag}@fixture-startup.co`;
  const smtp = buildEncryptedSmtpAccount({
    slot: `winnr:${email}`, email, host: 'inbound.example.test', port: 465, secure: true,
    username: email, password: 'fixture-smtp-password', sendingDomainId: 'dom-fixture', sendingMailboxId: `mb-${local}`,
    sendingWorkspaceId: 'uberbond-outreach', routeEvidenceRef: EVIDENCE, routeAuthorized: true, termsCompatible: true,
    plannedDailyCap: 2, plannedHourlyCap: 1, minGapSeconds: 900
  }, KEY);
  const imap = buildImap({
    slot: `winnr-imap:${email}`, email, host: 'inbound.example.test', port: 993, secure: true,
    username: email, password: 'fixture-imap-password', evidenceRef: EVIDENCE, authorized: true, termsCompatible: true
  }, KEY);
  assert.equal(smtp.ok, true);
  assert.equal(imap.ok, true);
  return { email, smtpAccount: smtp.account, imapAccount: imap.account };
}

test('Postgres: staging keeps every SMTP sender paused and never stores a live unprobed account', { skip }, async () => {
  const store = createStore({ storeBackend: 'postgres', databaseUrl: URL, databaseSsl: false });
  await store.init();
  try {
    const rows = LOCALS.map(prepared);
    const staged = await stageImportedAccounts({ store, prepared: rows, pauseReason: SMTP_PROBE_FAILURE_PAUSE_REASON });
    assert.deepEqual(staged, { smtpStaged: 2, imapStaged: 2 });
    const accounts = await store.list('accounts');
    for (const row of rows) {
      const stored = accounts.find(a => a.slot === `winnr:${row.email}`);
      assert.ok(stored, 'SMTP account stored');
      assert.equal(stored.connected, true);
    }
    const health = await store.list('senderHealth');
    for (const row of rows) {
      const h = health.find(x => x.inbox === `winnr:${row.email}`);
      assert.equal(h?.paused, true, 'sender paused after staging');
      assert.equal(h?.pauseReason, SMTP_PROBE_FAILURE_PAUSE_REASON);
    }
  } finally {
    await store.close();
  }
});

test('Postgres: the key-compatibility guard refuses a store whose ciphertext needs another key', { skip }, async () => {
  const store = createStore({ storeBackend: 'postgres', databaseUrl: URL, databaseSsl: false });
  await store.init();
  try {
    const accounts = await store.list('accounts');
    const right = verifyStoreKeyCompatibility({ accounts: accounts.filter(a => a.tokens), encryptionKey: KEY });
    const wrong = verifyStoreKeyCompatibility({ accounts: accounts.filter(a => a.tokens), encryptionKey: OTHER });
    assert.equal(right.ok, true);
    assert.ok(right.decryptable >= 4);
    assert.equal(wrong.ok, false);
    assert.equal(wrong.decryptable, 0);
  } finally {
    await store.close();
  }
});

test('Postgres: the readiness probe keeps a failed sender paused and records its receipt (no network: probe injected)', { skip }, async () => {
  const store = createStore({ storeBackend: 'postgres', databaseUrl: URL, databaseSsl: false });
  await store.init();
  try {
    const probeFn = async () => ({ classification: 'UNCERTAIN', reasonCodes: ['smtp-session-probe-failed'], errorClass: 'CONNECT_TIMEOUT', errorStage: 'CONNECT', providerCalls: 1, messagesSent: 0, mailFromIssued: false, recipientsIssued: 0, dataIssued: false });
    const receipt = await runWinnrSmtpReadinessProbe({ store, encryptionKey: KEY, quarantineOrdinalsText: '', quarantineSlotsText: '', now: new Date(), probeFn });
    assert.equal(receipt.ok, false);
    assert.equal(receipt.messagesSent, 0);
    assert.equal(receipt.mailFromIssued, false);
    const settings = await store.getSettings();
    assert.equal(settings.winnrSmtpReadinessV1.status, receipt.status);
    const health = await store.list('senderHealth');
    const mine = health.find(h => h.inbox === `winnr:${LOCALS[0]}-${tag}@fixture-startup.co`);
    assert.equal(mine?.paused, true);
    assert.equal(mine?.pauseReason, SMTP_PROBE_FAILURE_PAUSE_REASON);
  } finally {
    await store.close();
  }
});
