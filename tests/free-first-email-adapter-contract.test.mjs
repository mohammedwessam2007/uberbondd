import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FREE_FIRST_EMAIL_CAPABILITIES,
  createUnconfiguredFreeEmailAdapter,
  planFreeFirstEmailDispatch,
  resolveFreeFirstEmailAdapter,
  validateFreeFirstEmailAdapter
} from '../src/free-first-email-adapter-contract.mjs';

const when = new Date('2026-09-01T12:00:00.000Z');

function implementation(overrides = {}) {
  return {
    probe: async () => ({ ok: true }),
    send: async () => ({ ok: true, providerMessageId: 'provider-msg-1', receipt: { accepted: true } }),
    resolveUncertainSend: async () => ({ ok: true, state: 'NOT_FOUND' }),
    ...overrides
  };
}

test('unconfigured provider implements full contract but cannot perform external effects', async () => {
  const adapter = createUnconfiguredFreeEmailAdapter('brevo');
  assert.deepEqual(validateFreeFirstEmailAdapter(adapter), { ok: true, missing: [] });
  assert.deepEqual(FREE_FIRST_EMAIL_CAPABILITIES.filter(name => typeof adapter[name] !== 'function'), []);
  const send = await adapter.send({});
  assert.equal(send.ok, false);
  assert.equal(send.status, 'PROVIDER_AUTH_REQUIRED');
});

test('configured adapter cannot send without a purpose-bound reservation', async () => {
  const resolved = resolveFreeFirstEmailAdapter({ providerId: 'brevo', implementations: { brevo: implementation() }, now: () => when });
  assert.equal(resolved.ok, true);
  const sent = await resolved.adapter.send({ date: when });
  assert.equal(sent.ok, false);
  assert.equal(sent.status, 'VALID_RESERVATION_REQUIRED');
});

test('permissioned message can reserve and dispatch through the common contract', async () => {
  const resolved = resolveFreeFirstEmailAdapter({ providerId: 'brevo', implementations: { brevo: implementation() }, now: () => when });
  const reservation = await resolved.adapter.reserve({ messageId: 'msg-1', purpose: 'TRANSACTIONAL', date: when });
  assert.equal(reservation.ok, true);
  assert.equal(reservation.reservation.state, 'RESERVED');
  const sent = await resolved.adapter.send({ reservation: reservation.reservation, date: when });
  assert.equal(sent.ok, true);
  assert.equal(sent.status, 'OK');
  assert.equal(sent.providerMessageId, 'provider-msg-1');
});

test('cold purpose is refused before provider implementation is called', async () => {
  let calls = 0;
  const resolved = resolveFreeFirstEmailAdapter({
    providerId: 'brevo',
    implementations: { brevo: implementation({ send: async () => { calls += 1; return { ok: true, providerMessageId: 'should-not-exist' }; } }) },
    now: () => when
  });
  const reservation = await resolved.adapter.reserve({ messageId: 'msg-cold', purpose: 'COLD_B2B', date: when });
  assert.equal(reservation.ok, false);
  assert.equal(reservation.status, 'COLD_PROHIBITED');
  assert.equal(calls, 0);
});

test('provider exception becomes EXTERNAL_OUTCOME_UNKNOWN and is never failed over by the adapter', async () => {
  let sends = 0;
  const resolved = resolveFreeFirstEmailAdapter({
    providerId: 'brevo',
    implementations: {
      brevo: implementation({ send: async () => { sends += 1; throw new Error('timeout after submit'); } }),
      mailjet: implementation({ send: async () => { sends += 100; return { ok: true, providerMessageId: 'bad-failover' }; } })
    },
    now: () => when
  });
  const reservation = await resolved.adapter.reserve({ messageId: 'msg-uncertain', purpose: 'TRANSACTIONAL', date: when });
  const sent = await resolved.adapter.send({ reservation: reservation.reservation, date: when });
  assert.equal(sent.ok, false);
  assert.equal(sent.status, 'EXTERNAL_OUTCOME_UNKNOWN');
  assert.equal(sends, 1);
});

test('free-first planner reports a selected but unconfigured provider instead of inventing connectivity', () => {
  const plan = planFreeFirstEmailDispatch({ purpose: 'OPT_IN_MARKETING', date: when, implementations: {} });
  assert.equal(plan.ok, false);
  assert.equal(plan.status, 'SELECTED_FREE_PROVIDER_NOT_CONFIGURED');
  assert.equal(plan.provider, 'sender-net');
});

test('free-first planner never returns a provider for cold B2B', () => {
  const plan = planFreeFirstEmailDispatch({ purpose: 'COLD_B2B', date: when, implementations: { brevo: implementation() } });
  assert.equal(plan.ok, false);
  assert.equal(plan.route.status, 'NO_FREE_COLD_ROUTE');
  assert.equal(plan.adapter, null);
});
