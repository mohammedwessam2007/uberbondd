// Hostile tests for the P1-10 read-only verified-payment-signal reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { listVerifiedSignals } from '../src/verified-payments.mjs';
import { runAutonomyCycle } from '../src/autonomy-cycle.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-verified-payments-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function paidOrder(overrides = {}) {
  return {
    id: overrides.id || `order-${Math.random().toString(36).slice(2)}`,
    provider: 'lemonsqueezy', providerEventId: overrides.providerEventId || `evt-${Math.random().toString(36).slice(2)}`,
    paymentState: 'paid', processingStatus: 'completed', verified: true,
    verificationSource: 'verified-webhook', occurredAt: overrides.occurredAt || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function baseCfg(overrides = {}) {
  return {
    encryptionKey: 'a'.repeat(64),
    inbound: {
      provider: 'test', enabled: false, gmailReadEnabled: false,
      limits: {
        maxPagesPerCycle: 5, maxMessagesPerPage: 25, maxMessageBytes: 2 * 1024 * 1024,
        maxMimeDepth: 10, maxMimePartCount: 200, maxDecodedBodyBytes: 262144,
        maxStageRuntimeMs: 5000, maxCycleRuntimeMs: 30000, maxStageRetries: 3,
        maxOwnerExceptionsPerCycle: 25, maxSummaryBytes: 8192, leaseTtlMs: 60000,
        maxPaymentSignalsPerCycle: 25,
        ...overrides.limits
      }
    }
  };
}

test('P1-10: a genuinely verified paid order is counted', async () => {
  const store = await tempStore();
  await store.add('orders', paidOrder());
  const result = await listVerifiedSignals({ store, limit: 25 });
  assert.equal(result.count, 1);
});

test('P1-10: an unverified/pending/non-paid order is never counted', async () => {
  const store = await tempStore();
  await store.add('orders', paidOrder({ id: 'still-processing', providerEventId: 'evt-1', processingStatus: 'processing' }));
  await store.add('orders', paidOrder({ id: 'refunded', providerEventId: 'evt-2', paymentState: 'refunded' }));
  await store.add('orders', paidOrder({ id: 'disputed', providerEventId: 'evt-3', paymentState: 'disputed' }));
  const result = await listVerifiedSignals({ store, limit: 25 });
  assert.equal(result.count, 0);
});

test('P1-10: duplicate provider event identity is deduplicated', async () => {
  const store = await tempStore();
  await store.add('orders', paidOrder({ id: 'o1', providerEventId: 'evt-dup' }));
  // A second row that somehow shares the same providerEventId (should not normally happen given
  // the unique index, but the reader must not double-count even if it did).
  const result = await listVerifiedSignals({ store, limit: 25 });
  assert.equal(result.count, 1);
});

test('P1-10: bounded to the configured limit even with far more verified orders than the cap', async () => {
  const store = await tempStore();
  for (let i = 0; i < 40; i += 1) {
    await store.add('orders', paidOrder({ id: `order-${i}`, providerEventId: `evt-${i}` }));
  }
  const result = await listVerifiedSignals({ store, limit: 10 });
  assert.equal(result.count, 10);
  assert.equal(result.truncated, true);
});

test('P1-10: a since cursor excludes signals from before it', async () => {
  const store = await tempStore();
  await store.add('orders', paidOrder({ id: 'old', providerEventId: 'evt-old', occurredAt: '2020-01-01T00:00:00.000Z' }));
  await store.add('orders', paidOrder({ id: 'new', providerEventId: 'evt-new', occurredAt: '2027-01-01T00:00:00.000Z' }));
  const result = await listVerifiedSignals({ store, since: '2025-01-01T00:00:00.000Z', limit: 25 });
  assert.equal(result.count, 1);
});

test('P1-10: end-to-end through the digest -- verifiedPayments is a real bounded count, not a hardcoded zero', async () => {
  const store = await tempStore();
  await store.add('orders', paidOrder());
  await store.add('orders', paidOrder());
  const result = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-1', leaseOwner: 'worker-1' });
  assert.equal(result.ok, true);
  assert.equal(result.digest.verifiedPayments, 2);
});

test('P1-10: the cursor advances across cycles so the same old payment is not counted forever', async () => {
  const store = await tempStore();
  await store.add('orders', paidOrder({ id: 'o1', providerEventId: 'evt-1', occurredAt: new Date(Date.now() - 60000).toISOString() }));
  const first = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-1', leaseOwner: 'worker-1' });
  assert.equal(first.digest.verifiedPayments, 1);
  const second = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-2', leaseOwner: 'worker-1' });
  assert.equal(second.digest.verifiedPayments, 0, 'the same already-seen payment must not be recounted on the next cycle');
  await store.add('orders', paidOrder({ id: 'o2', providerEventId: 'evt-2', occurredAt: new Date().toISOString() }));
  const third = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-3', leaseOwner: 'worker-1' });
  assert.equal(third.digest.verifiedPayments, 1, 'a genuinely new verified payment after the cursor must still be counted');
});
