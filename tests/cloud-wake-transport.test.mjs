import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCloudWakePlan } from '../src/scheduler.mjs';
import { compileCloudWakePublishBatch, publishCloudWakeBatch, ingestCloudWakeDelivery } from '../src/cloud-wake-transport.mjs';

const plan = () => compileCloudWakePlan({
  anchor: '2026-09-05T00:00:00.000Z',
  intervalMinutes: 60,
  horizonHours: 2,
  missionTypes: ['agent-mesh.tick']
});

test('cloud wake publish batch is zero-effect and preserves deterministic occurrence binding', () => {
  const batch = compileCloudWakePublishBatch(plan());
  assert.equal(batch.ok, true);
  assert.equal(batch.status, 'CLOUD_WAKE_PROVIDER_BATCH_PREPARED_NOT_PUBLISHED');
  assert.equal(batch.entries.length, 2);
  assert.equal(batch.entries[0].idempotencyKey, batch.entries[0].occurrenceKey);
  assert.equal(batch.providerCallAuthority, 'NONE');
  assert.equal(batch.externalEffectLedger.providerCalls, 0);
});

test('provider publication cannot happen from plan existence alone', async () => {
  let calls = 0;
  const batch = compileCloudWakePublishBatch(plan());
  const out = await publishCloudWakeBatch({ batch, publish: async () => { calls += 1; return { accepted: true }; } });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'CLOUD_WAKE_PROVIDER_PUBLISH_BLOCKED');
  assert.equal(calls, 0);
});

test('separately authorized provider publication sends exact delay and idempotency fields', async () => {
  const calls = [];
  const batch = compileCloudWakePublishBatch(plan());
  const out = await publishCloudWakeBatch({
    batch,
    authorization: { authority: 'CLOUD_WAKE_PROVIDER_PUBLISH', approved: true },
    publish: async request => { calls.push(request); return { accepted: true, providerMessageId: `msg-${calls.length}` }; }
  });
  assert.equal(out.ok, true);
  assert.equal(out.providerCalls, 2);
  assert.equal(calls[0].delaySeconds, 0);
  assert.equal(calls[1].delaySeconds, 3600);
  assert.equal(calls[0].idempotencyKey, 'cloud-wake:agent-mesh.tick:2026-09-05T00:00:00.000Z');
  assert.equal(out.externalEffectLedger.messages, 0);
  assert.equal(out.externalEffectLedger.spendCents, 0);
});

test('at-least-once delivery is translated to the canonical queue occurrence key', async () => {
  const calls = [];
  const delivery = plan().entries[0].payload;
  const enqueue = async (type, payload, options) => {
    calls.push({ type, payload, options });
    return { id: 'job-wake-1' };
  };
  const first = await ingestCloudWakeDelivery({ delivery, enqueue });
  const second = await ingestCloudWakeDelivery({ delivery, enqueue });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(calls.length, 2); // provider may redeliver; canonical queue sees same dedupe key twice
  assert.equal(calls[0].options.dedupeKey, calls[1].options.dedupeKey);
  assert.equal(calls[0].options.dedupeKey, delivery.occurrenceKey);
  assert.equal(calls[0].options.recoveryPolicy, 'replay-safe');
  assert.equal(calls[0].options.idempotent, true);
  assert.equal(first.canonicalJobTruth, 'UBERBOND_DURABLE_QUEUE');
});

test('tampered occurrence, authority widening, and duplicate plan entries fail closed', async () => {
  const original = plan();
  const duplicate = { ...original, entries: [original.entries[0], original.entries[0]] };
  assert.throws(() => compileCloudWakePublishBatch(duplicate), /duplicate cloud wake occurrence/);
  await assert.rejects(
    ingestCloudWakeDelivery({
      delivery: { ...original.entries[0].payload, consequenceClass: 'EXTERNAL_EFFECT' },
      enqueue: async () => ({ id: 'should-not-run' })
    }),
    /local preparation/
  );
  await assert.rejects(
    ingestCloudWakeDelivery({
      delivery: { ...original.entries[0].payload, occurrenceKey: 'cloud-wake:other.tick:2026-09-05T00:00:00.000Z' },
      enqueue: async () => ({ id: 'should-not-run' })
    }),
    /binding mismatch/
  );
});
