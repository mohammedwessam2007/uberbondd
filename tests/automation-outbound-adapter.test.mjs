import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeOutboundProvider, assertAdapterContract, OutboundAdapterError } from '../src/automation/outbound-adapter.mjs';

test('the fake provider satisfies the adapter contract', () => {
  assert.equal(assertAdapterContract(createFakeOutboundProvider()), true);
});

test('reserve is idempotent: the same key never produces two reservations', async () => {
  const provider = createFakeOutboundProvider();
  const first = await provider.reserve('key-1', { to: 'a@example.com' });
  const second = await provider.reserve('key-1', { to: 'a@example.com' });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.reservationId, second.reservationId);
});

test('reserve requires an idempotency key', async () => {
  const provider = createFakeOutboundProvider();
  await assert.rejects(provider.reserve(''), OutboundAdapterError);
});

test('sending an unreserved id fails closed', async () => {
  const provider = createFakeOutboundProvider();
  await assert.rejects(provider.send('never-reserved'), OutboundAdapterError);
});

test('sending the same reservation twice returns the original result marked duplicate, never a second send', async () => {
  const provider = createFakeOutboundProvider();
  const { reservationId } = await provider.reserve('key-2');
  const first = await provider.send(reservationId);
  const second = await provider.send(reservationId);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.status, second.status);
});

test('an always-uncertain provider never claims a definite send', async () => {
  const provider = createFakeOutboundProvider({ uncertainRate: 1 });
  const { reservationId } = await provider.reserve('key-3');
  const result = await provider.send(reservationId);
  assert.equal(result.status, 'uncertain');
  assert.equal(result.providerMessageId, null);
});

test('an always-failing provider reports failure, not a fabricated success', async () => {
  const provider = createFakeOutboundProvider({ failRate: 1 });
  const { reservationId } = await provider.reserve('key-4');
  const result = await provider.send(reservationId);
  assert.equal(result.status, 'failed');
});

test('assertAdapterContract rejects an object missing required members', () => {
  assert.throws(() => assertAdapterContract({ name: 'broken' }), OutboundAdapterError);
});
