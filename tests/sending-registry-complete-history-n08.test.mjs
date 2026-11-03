import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/store.mjs';
import { loadSendingDomain, listSendingDomains } from '../src/sending-domain-registry.mjs';
import { loadSendingMailbox, listSendingMailboxesForDomain } from '../src/sending-mailbox-registry.mjs';
import { loadCompleteSendingRegistryEvents, MAX_SENDING_REGISTRY_AUDIT_EVENTS } from '../src/sending-registry-complete-history.mjs';

const base = Date.parse('2026-10-14T15:00:00Z');
const observedAt = new Date(base + 100_000);
const targetDomain = 'n08-domain';
const targetMailbox = 'n08-mailbox';

function audit(type, index, detail) {
  return {
    id: `n08-${type}-${String(index).padStart(7, '0')}`,
    type,
    createdAt: new Date(base + index * 10).toISOString(),
    detail: { ...detail, timestamp: new Date(base + index * 10).toISOString() }
  };
}

function fixtureRows(type) {
  const field = type === 'sending_domain_event' ? 'domainId' : 'mailboxId';
  const target = type === 'sending_domain_event' ? targetDomain : targetMailbox;
  const rows = Array.from({ length: 6100 }, (_, i) =>
    audit(type, i, { kind: 'SIGNAL_RECORDED', [field]: `noise-${Math.floor(i / 4)}` }));
  const baseDetail = type === 'sending_domain_event'
    ? { kind: 'REGISTERED', domainId: targetDomain, workspaceId: 'workspace', domain: 'test.example.com', ownershipStatus: 'OWNER_CONFIRMED' }
    : { kind: 'REGISTERED', mailboxId: targetMailbox, workspaceId: 'workspace', address: 'mailbox@example.com', sendingDomainId: targetDomain };
  rows[2] = audit(type, 2, baseDetail);
  if (type === 'sending_domain_event') {
    rows[3] = audit(type, 3, { kind: 'DNS_VERIFIED', domainId: targetDomain, overallStatus: 'GREEN', reasonCodes: [] });
    rows[4] = audit(type, 4, { kind: 'MAILBOX_LINKED', domainId: targetDomain, mailboxId: targetMailbox });
    rows[5] = audit(type, 5, { kind: 'WARMUP_STATE_CHANGED', domainId: targetDomain, warmupState: 'WARMUP_COMPLETE' });
    rows[6] = audit(type, 6, { kind: 'OUTREACH_AUTHORIZED', domainId: targetDomain, authorizedBy: 'fixture-owner' });
  } else {
    rows[3] = audit(type, 3, { kind: 'AUTHENTICATION_CHECKED', mailboxId: targetMailbox, authenticationStatus: 'AUTHENTICATED' });
    rows[4] = audit(type, 4, { kind: 'WARMUP_STATUS_CHANGED', mailboxId: targetMailbox, warmupStatus: 'WARMUP_COMPLETE', currentDailyCap: 5 });
  }
  // Beyond both historical 1000 single-identity and 5000 fleet-list windows.
  rows[6077] = audit(type, 6077, { kind: 'PAUSED', [field]: target, reasonCodes: ['independent-safety-hold'], ownerRequired: true });
  return rows;
}

test('N08 JsonStore recovers >6100 interleaved events and latest domain/mailbox PAUSE in both single and fleet paths', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'phoenix-high-n08-'));
  try {
    const store = new JsonStore(dir);
    await store.init();
    store.data.auditLog = [...fixtureRows('sending_domain_event'), ...fixtureRows('sending_mailbox_event')];
    await store.save();
    const domain = await loadSendingDomain(store, targetDomain, { date: observedAt });
    assert.equal(domain.state, 'PAUSED');
    assert.equal(domain.coldOutreachBlocked, true);
    assert.deepEqual(domain.mailboxState.linkedMailboxIds, [targetMailbox]);
    const mailbox = await loadSendingMailbox(store, targetMailbox, { date: observedAt });
    assert.equal(mailbox.paused, true);
    assert.equal(mailbox.currentDailyCap, 5, 'historical evidence preserved, not treated as authority');
    const domains = await listSendingDomains(store, { date: observedAt });
    assert.equal(domains.length, 1);
    assert.equal(domains[0].state, 'PAUSED');
    const mailboxes = await listSendingMailboxesForDomain(store, targetDomain, { date: observedAt });
    assert.equal(mailboxes.length, 1);
    assert.equal(mailboxes[0].paused, true);
    assert.equal(mailboxes[0].pauseReasonCodes[0], 'independent-safety-hold');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('N08 refuses silent truncation, racing count, invalid count and malformed audit rows', async () => {
  const row = audit('sending_domain_event', 0, { kind: 'REGISTERED', domainId: targetDomain });
  const truncated = { count: async () => 2, list: async () => [row] };
  await assert.rejects(loadSendingDomain(truncated, targetDomain), /incomplete-or-raced/);
  let calls = 0;
  const raced = { count: async () => ++calls, list: async () => [row] };
  await assert.rejects(loadSendingDomain(raced, targetDomain), /incomplete-or-raced/);
  const oversized = { count: async () => MAX_SENDING_REGISTRY_AUDIT_EVENTS + 1, list: async () => { throw new Error('must-not-read'); } };
  await assert.rejects(loadSendingDomain(oversized, targetDomain), /too-large-or-invalid-count/);
  const malformed = { count: async () => 1, list: async () => [{ ...row, type: 'wrong-type' }] };
  await assert.rejects(loadSendingDomain(malformed, targetDomain), /malformed-row/);
  await assert.rejects(loadSendingMailbox({ list: async () => [] }, targetMailbox), /verification-unavailable/);
});

test('N08 conservative tie ordering never allows ambiguous same-timestamp RESUME to discard PAUSE', async () => {
  const start = audit('sending_domain_event', 0, { kind: 'REGISTERED', domainId: targetDomain, workspaceId: 'workspace', domain: 'test.example.com', ownershipStatus: 'OWNER_CONFIRMED' });
  const resume = audit('sending_domain_event', 1, { kind: 'RESUMED', domainId: targetDomain, resumedBy: 'fixture-owner' });
  const pause = audit('sending_domain_event', 1, { kind: 'PAUSED', domainId: targetDomain, reasonCodes: ['uncertain-order'] });
  resume.id = 'a-resume';
  pause.id = 'z-pause';
  const rows = [start, pause, resume];
  const store = { count: async () => rows.length, list: async () => rows };
  const events = await loadCompleteSendingRegistryEvents(store, 'sending_domain_event');
  assert.equal(events.at(-1).kind, 'PAUSED');
});

test('N08 disposable real PostgreSQL count/list recovers latest PAUSE beyond 6000 events for both registries', {
  skip: process.env.N08_TEST_DATABASE_URL ? false : 'N08_TEST_DATABASE_URL absent: real PG not executed'
}, async () => {
  // This is an ephemeral CI PostgreSQL instance, never a production URL.
  const { PostgresStore } = await import('../src/store.mjs');
  const store = new PostgresStore({ databaseUrl: process.env.N08_TEST_DATABASE_URL, ssl: false });
  try {
    await store.pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
      id text PRIMARY KEY, type text NOT NULL, created_at timestamptz NOT NULL,
      detail jsonb, data jsonb NOT NULL
    )`);
    await store.pool.query('TRUNCATE audit_log');
    const all = [...fixtureRows('sending_domain_event'), ...fixtureRows('sending_mailbox_event')];
    await store.pool.query(`INSERT INTO audit_log (id, type, created_at, detail, data)
      SELECT x->>'id', x->>'type', (x->>'createdAt')::timestamptz,
        x->'detail', x
      FROM jsonb_array_elements($1::jsonb) x`, [JSON.stringify(all)]);
    assert.equal(await store.count('auditLog', { type: 'sending_domain_event' }), 6100);
    assert.equal(await store.count('auditLog', { type: 'sending_mailbox_event' }), 6100);
    const domain = await loadSendingDomain(store, targetDomain, { date: observedAt });
    assert.equal(domain.state, 'PAUSED');
    assert.equal(domain.coldOutreachBlocked, true);
    const mailbox = await loadSendingMailbox(store, targetMailbox, { date: observedAt });
    assert.equal(mailbox.paused, true);
    const domainFleet = await listSendingDomains(store, { date: observedAt });
    assert.equal(domainFleet.length, 1);
    assert.equal(domainFleet[0].state, 'PAUSED');
    const mailFleet = await listSendingMailboxesForDomain(store, targetDomain, { date: observedAt });
    assert.equal(mailFleet.length, 1);
    assert.equal(mailFleet[0].paused, true);
  } finally {
    await store.close();
  }
});
