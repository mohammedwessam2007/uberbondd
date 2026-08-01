import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchReservation, CANONICAL_DISPATCH_AUDIT_EVENTS } from '../src/dispatch-adapter.mjs';
import { JsonStore } from '../src/store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-dispatch-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

async function reserve(store, overrides = {}) {
  const result = await store.reserveOutboundSend({
    idempotencyKey: `idem_${Math.random()}`, inbox: 'a', recipientEmail: 'buyer@acme.com',
    dailyCap: 100, hourlyCap: 100, minGapSeconds: 0, ...overrides
  });
  assert.equal(result.ok, true);
  return result.reservation;
}

test('P0-002 acceptance: no provider + simulation false produces zero sent reservations and a canonical blocker', async () => {
  const store = await makeStore();
  const reservation = await reserve(store);
  const outcome = await dispatchReservation(store, reservation, { provider: null, simulation: false });
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.reason, 'no-live-provider');
  const stored = await store.get('outboundReservations', reservation.id);
  assert.equal(stored.status, 'blocked');
  const events = await store.list('outboundEvents');
  assert.equal(events.some(e => e.eventType === 'sent'), false);
  const audit = await store.list('auditLog');
  assert.ok(audit.some(row => row.type === CANONICAL_DISPATCH_AUDIT_EVENTS.BLOCKED_NO_PROVIDER));
});

test('simulation writes a distinctly-named simulated_sent event, never a real sent event', async () => {
  const store = await makeStore();
  const reservation = await reserve(store, { idempotencyKey: 'idem_sim' });
  const outcome = await dispatchReservation(store, reservation, { provider: null, simulation: true });
  assert.equal(outcome.status, 'simulated_sent');
  const events = await store.list('outboundEvents');
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'simulated_sent');
  assert.equal(events.some(e => e.eventType === 'sent'), false);
});

test('a reserved (.example) recipient domain is blocked outside simulation even with a real provider', async () => {
  const store = await makeStore();
  const reservation = await reserve(store, { idempotencyKey: 'idem_reserved', recipientEmail: 'partnerships@company-01.example' });
  const provider = { send: async () => ({ messageId: 'should-not-be-called' }) };
  const outcome = await dispatchReservation(store, reservation, { provider, simulation: false });
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.reason, 'reserved-domain-outside-simulation');
});

test('a real provider send is recorded as a genuine sent event', async () => {
  const store = await makeStore();
  const reservation = await reserve(store, { idempotencyKey: 'idem_live' });
  const provider = { send: async () => ({ messageId: 'msg_1' }) };
  const outcome = await dispatchReservation(store, reservation, { provider, simulation: false });
  assert.equal(outcome.status, 'sent');
  const events = await store.list('outboundEvents');
  assert.equal(events[0].eventType, 'sent');
});

test('a throwing provider marks the reservation uncertain, never sent', async () => {
  const store = await makeStore();
  const reservation = await reserve(store, { idempotencyKey: 'idem_fail' });
  const provider = { send: async () => { throw new Error('smtp timeout'); } };
  const outcome = await dispatchReservation(store, reservation, { provider, simulation: false });
  assert.equal(outcome.status, 'uncertain');
  const stored = await store.get('outboundReservations', reservation.id);
  assert.equal(stored.status, 'uncertain');
});

test('P0-004 acceptance: ten concurrent workers race for one recipient and exactly one reservation succeeds', async () => {
  const store = await makeStore();
  const attempts = Array.from({ length: 10 }, () => store.reserveOutboundSend({
    idempotencyKey: 'canon-send:opp_shared_recipient', inbox: 'a', recipientEmail: 'buyer@acme.com',
    dailyCap: 100, hourlyCap: 100, minGapSeconds: 0
  }));
  const results = await Promise.all(attempts);
  const succeeded = results.filter(r => r.ok);
  const rejected = results.filter(r => !r.ok);
  assert.equal(succeeded.length, 1);
  assert.equal(rejected.length, 9);
  assert.ok(rejected.every(r => r.reason.startsWith('duplicate-')));
  const reservations = await store.list('outboundReservations');
  assert.equal(reservations.length, 1, 'never a process-local guard -- the store itself is the only authority, so exactly one durable row exists');
});
