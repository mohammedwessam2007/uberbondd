import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { runWinnrSmtpReadinessProbe, SMTP_PROBE_FAILURE_PAUSE_REASON } from '../src/winnr-smtp-readiness.mjs';

// A readiness probe must never clear a hold that landed while it was in flight. Before the fix the probe decided from
// its start-of-run snapshot, so a rollback written during the probe was overwritten and the sender was unpaused.

const KEY = crypto.randomBytes(32).toString('hex');
const SLOT = 'winnr:race@fixture.test';
const ROLLBACK = 'WINNR_PRODUCTION_IMPORT_ROLLED_BACK';

function memoryStore({ health = [] } = {}) {
  const state = {
    accounts: [{ id: 'smtp-race', slot: SLOT, provider: 'smtp-relay', connected: true, email: 'race@fixture.test' }],
    senderHealth: health.map(row => ({ ...row }))
  };
  return {
    state,
    async list(key) { return structuredClone(state[key] || []); },
    async setSenderPaused(inbox, paused, reason = '') {
      const row = state.senderHealth.find(item => item.inbox === inbox);
      if (row) Object.assign(row, { paused: Boolean(paused), pauseReason: String(reason || '') });
      else state.senderHealth.push({ id: `sender_${inbox}`, inbox, paused: Boolean(paused), pauseReason: String(reason || '') });
    },
    async setSetting() { return null; },
    async log() { return null; }
  };
}

test('a rollback hold written while the probe is in flight is not cleared by a READY result', async () => {
  const store = memoryStore({ health: [{ inbox: SLOT, paused: true, pauseReason: SMTP_PROBE_FAILURE_PAUSE_REASON }] });
  const probeFn = async () => {
    // The rollback lands during the probe, after the probe's snapshot was taken.
    await store.setSenderPaused(SLOT, true, ROLLBACK);
    return { classification: 'READY', providerCalls: 1, providerSessionReceiptId: 'session-fixture-1', providerResponseDigest: 'digest-fixture-1', messagesSent: 0 };
  };
  const receipt = await runWinnrSmtpReadinessProbe({ store, encryptionKey: KEY, probeFn, now: new Date('2026-10-13T12:00:00.000Z') });
  assert.equal(receipt.ok !== undefined, true);
  const row = store.state.senderHealth.find(item => item.inbox === SLOT);
  assert.equal(row.paused, true, 'the sender stays paused');
  assert.equal(row.pauseReason, ROLLBACK, 'the rollback provenance survives');
});

test('an own probe pause is still cleared by a READY result when nothing else changed', async () => {
  const store = memoryStore({ health: [{ inbox: SLOT, paused: true, pauseReason: SMTP_PROBE_FAILURE_PAUSE_REASON }] });
  const probeFn = async () => ({ classification: 'READY', providerCalls: 1, providerSessionReceiptId: 'session-fixture-2', providerResponseDigest: 'digest-fixture-2', messagesSent: 0 });
  await runWinnrSmtpReadinessProbe({ store, encryptionKey: KEY, probeFn, now: new Date('2026-10-13T12:00:00.000Z') });
  const row = store.state.senderHealth.find(item => item.inbox === SLOT);
  assert.equal(row.paused, false, 'the probe still recovers a sender it paused itself');
});
