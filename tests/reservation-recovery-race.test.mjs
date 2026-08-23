import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { recoverStaleOutboundReservations } from '../src/reservation-recovery.mjs';

const NOW = new Date('2026-07-13T10:00:00.000Z');
const STALE = new Date(NOW.getTime() - 31 * 60 * 1000).toISOString();

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-recovery-race-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function seed(store, status = 'dispatching') {
  const reserved = await store.reserveOutboundSend({
    idempotencyKey: `race:${status}`,
    prospectId: `p-${status}`,
    campaignId: 'camp',
    inbox: 'A',
    recipientEmail: `${status}@example.test`,
    dailyCap: 999,
    hourlyCap: 999,
    minGapSeconds: 0,
    now: STALE
  });
  if (status === 'dispatching') {
    await store.patch('outboundReservations', reserved.reservation.id, {
      status: 'dispatching',
      dispatchedAt: STALE
    });
  }
  return store.get('outboundReservations', reserved.reservation.id);
}

function withListRace(store, { status, advance }) {
  let raced = false;
  return new Proxy(store, {
    get(target, property) {
      if (property === 'list') {
        return async (key, options = {}) => {
          const rows = await target.list(key, options);
          if (!raced && key === 'outboundReservations' && options?.filters?.status === status && rows.length) {
            raced = true;
            await advance(target, rows[0]);
          }
          return rows;
        };
      }
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

test('recovery cannot downgrade a reservation that became sent after the sweep snapshot', async () => {
  const store = await tempStore();
  const row = await seed(store, 'dispatching');
  const raced = withListRace(store, {
    status: 'dispatching',
    advance: async (target, snapshot) => {
      await target.markOutboundReservation(snapshot.id, 'sent', {
        sentAt: NOW.toISOString(),
        gmailId: 'gmail-confirmed-send'
      });
    }
  });

  const result = await recoverStaleOutboundReservations({ store: raced, date: NOW, timeoutMs: 30 * 60 * 1000 });
  const final = await store.get('outboundReservations', row.id);

  assert.equal(final.status, 'sent', 'confirmed provider success must outrank the stale dispatching snapshot');
  assert.equal(final.gmailId, 'gmail-confirmed-send');
  assert.equal(result.counts.quarantined, 0, 'the stale snapshot must not create a false uncertain transition');
  assert.equal(result.counts.alreadyTerminal, 1);
  assert.equal(result.decisions[0]?.reason, 'status-changed-before-recovery');
  assert.equal(result.decisions[0]?.observedCurrentStatus, 'sent');
});

test('recovery cannot cancel a reservation that advanced from reserved to dispatching after the sweep snapshot', async () => {
  const store = await tempStore();
  const row = await seed(store, 'reserved');
  const raced = withListRace(store, {
    status: 'reserved',
    advance: async (target, snapshot) => {
      await target.patch('outboundReservations', snapshot.id, {
        status: 'dispatching',
        dispatchedAt: NOW.toISOString()
      });
    }
  });

  const result = await recoverStaleOutboundReservations({ store: raced, date: NOW, timeoutMs: 30 * 60 * 1000 });
  const final = await store.get('outboundReservations', row.id);

  assert.equal(final.status, 'dispatching', 'a provider-attempt-capable state must never be cancelled from a stale reserved snapshot');
  assert.equal(result.counts.recoverable, 0);
  assert.equal(result.counts.skipped, 1);
  assert.equal(result.decisions[0]?.reason, 'status-changed-before-recovery');
  assert.equal(result.decisions[0]?.observedCurrentStatus, 'dispatching');
});
