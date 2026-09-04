import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCloudWakePlan } from '../src/scheduler.mjs';
import { compileCloudWakePublishBatch, publishCloudWakeBatch, ingestCloudWakeDelivery } from '../src/cloud-wake-transport.mjs';

const NOW = new Date('2026-09-05T00:00:00.000Z');
const plan = () => compileCloudWakePlan({
  anchor: NOW.toISOString(),
  intervalMinutes: 60,
  horizonHours: 2,
  missionTypes: ['agent-mesh.tick']
});
const approval = batch => ({
  authority: 'CLOUD_WAKE_PROVIDER_PUBLISH',
  approved: true,
  batchDigest: batch.batchDigest,
  expiresAt: '2026-09-05T01:00:00.000Z'
});

test('cloud wake publish batch is zero-effect and preserves deterministic occurrence binding', () => {
  const batch = compileCloudWakePublishBatch(plan());
  assert.equal(batch.ok, true);
  assert.equal(batch.status, 'CLOUD_WAKE_PROVIDER_BATCH_PREPARED_NOT_PUBLISHED');
  assert.match(batch.batchDigest, /^[a-f0-9]{64}$/);
  assert.equal(batch.entries.length, 2);
  assert.equal(batch.entries[0].idempotencyKey, batch.entries[0].occurrenceKey);
  assert.equal(batch.providerCallAuthority, 'NONE');
  assert.equal(batch.externalEffectLedger.providerCalls, 0);
});

test('provider publication cannot happen from plan existence alone', async () => {
  let calls = 0;
  const batch = compileCloudWakePublishBatch(plan());
  const out = await publishCloudWakeBatch({ batch, date: NOW, publish: async () => { calls += 1; return { accepted: true }; } });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'CLOUD_WAKE_PROVIDER_PUBLISH_BLOCKED');
  assert.equal(calls, 0);
});

test('separately authorized provider publication sends exact delay and idempotency fields', async () => {
  const calls = [];
  const batch = compileCloudWakePublishBatch(plan());
  const out = await publishCloudWakeBatch({
    batch,
    authorization: approval(batch),
    date: NOW,
    publish: async request => { calls.push(request); return { accepted: true, providerMessageId: `msg-${calls.length}` }; }
  });
  assert.equal(out.ok, true);
  assert.equal(out.providerCalls, 2);
  assert.equal(out.batchDigest, batch.batchDigest);
  assert.equal(calls[0].delaySeconds, 0);
  assert.equal(calls[1].delaySeconds, 3600);
  assert.equal(calls[0].idempotencyKey, 'cloud-wake:agent-mesh.tick:2026-09-05T00:00:00.000Z');
  assert.equal(out.externalEffectLedger.messages, 0);
  assert.equal(out.externalEffectLedger.spendCents, 0);
});

test('publish authority is bound to exact batch digest and short expiry', async () => {
  let calls = 0;
  const batch = compileCloudWakePublishBatch(plan());
  const publish = async () => { calls += 1; return { accepted: true }; };

  const wrongDigest = await publishCloudWakeBatch({
    batch,
    authorization: { ...approval(batch), batchDigest: '0'.repeat(64) },
    date: NOW,
    publish
  });
  assert.equal(wrongDigest.ok, false);
  assert.ok(wrongDigest.reasonCodes.includes('cloud-publish-batch-digest-mismatch'));

  const expired = await publishCloudWakeBatch({
    batch,
    authorization: { ...approval(batch), expiresAt: '2026-09-04T23:59:59.000Z' },
    date: NOW,
    publish
  });
  assert.equal(expired.ok, false);
  assert.ok(expired.reasonCodes.includes('cloud-publish-authorization-expired'));

  const tooLong = await publishCloudWakeBatch({
    batch,
    authorization: { ...approval(batch), expiresAt: '2026-09-06T00:00:01.000Z' },
    date: NOW,
    publish
  });
  assert.equal(tooLong.ok, false);
  assert.ok(tooLong.reasonCodes.includes('cloud-publish-authorization-too-long'));
  assert.equal(calls, 0);
});

test('batch content cannot change after authorization without integrity failure', async () => {
  const batch = compileCloudWakePublishBatch(plan());
  const authorization = approval(batch);
  batch.entries[0].delaySeconds = 30;
  await assert.rejects(
    publishCloudWakeBatch({ batch, authorization, date: NOW, publish: async () => ({ accepted: true }) }),
    /batch integrity mismatch/
  );
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
