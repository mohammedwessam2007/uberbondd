import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalSandboxVerifier } from '../src/paypal-sandbox-adapter.mjs';
import { supportedPaymentProviders } from '../src/payment-provider-verifier-dispatch.mjs';
import { claimBillingEvents } from '../src/billing-webhook-repository.mjs';
import { runPaymentReconciliationTick } from '../src/payment-reconciliation-worker.mjs';

test('PayPal sandbox verifier declares immutable paypal-only provider scope', async () => {
  let calls = 0;
  const verifier = createPayPalSandboxVerifier({
    clientId: 'sandbox-id',
    clientSecret: 'sandbox-secret',
    fetchImpl: async () => { calls += 1; throw new Error('must not call foreign provider'); }
  });
  assert.deepEqual(supportedPaymentProviders(verifier), ['paypal']);
  assert.equal(Object.getOwnPropertyDescriptor(verifier, 'supportedProviders').writable, false);
  const foreign = await verifier({ provider: 'lemon_squeezy', objectId: 'order-1' });
  assert.equal(foreign.cleared, false);
  assert.equal(foreign.errorCode, 'payment-provider-outside-verifier-scope');
  assert.equal(calls, 0);
});

test('billing repository applies provider scope before every durable claim mutation', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('RETURNING b.provider_event_key')) return { rows: [] };
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const pool = { async connect() { return client; } };
  const rows = await claimBillingEvents(pool, { workerRef: 'scope-test', providers: ['paypal'] });
  assert.deepEqual(rows, []);
  const scoped = calls.filter(call => /billing_webhook_inbox/.test(call.sql));
  assert.equal(scoped.length, 3);
  assert.ok(scoped.every(call => call.sql.includes('provider=ANY')));
  assert.ok(scoped.every(call => call.params.some(value => Array.isArray(value) && value.length === 1 && value[0] === 'paypal')));
});

test('reconciliation backlog read is provider-scoped before claim attempts can be consumed', async () => {
  const queries = [];
  let connectCalls = 0;
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      return { rows: [] };
    },
    async connect() { connectCalls += 1; throw new Error('idle scoped worker must not claim'); }
  };
  const verifier = createPayPalSandboxVerifier({ clientId: 'sandbox-id', clientSecret: 'sandbox-secret', fetchImpl: async () => { throw new Error('no event to verify'); } });
  const result = await runPaymentReconciliationTick({ pool, providerVerifier: verifier });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PAYMENT_RECONCILIATION_TICK_IDLE');
  assert.deepEqual(result.supportedProviders, ['paypal']);
  assert.equal(connectCalls, 0);
  assert.equal(queries.length, 1);
  assert.ok(queries[0].sql.includes('provider=ANY'));
  assert.deepEqual(queries[0].params[1], ['paypal']);
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});
