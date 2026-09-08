export const DURABLE_SCHEDULER_OCCURRENCE_VERSION = 'uberbond.durable-scheduler-occurrence.v1';

const DEFAULT_MAX_CATCHUP_BUCKETS = 2;

function text(value, max = 240) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function bucketFor(nowMs, intervalMs) {
  return Math.floor(Number(nowMs) / Number(intervalMs));
}

function stateKey(type) {
  const normalized = text(type, 160);
  if (!normalized) throw new Error('durable-scheduler-type-required');
  return `schedulerOccurrence:${DURABLE_SCHEDULER_OCCURRENCE_VERSION}:${normalized}`;
}

function cursorFromSettings(settings, key) {
  const value = settings?.[key];
  const bucket = Number(value?.lastEnqueuedBucket);
  return Number.isSafeInteger(bucket) && bucket >= 0 ? bucket : null;
}

function occurrenceOptions(type, bucket, options = {}) {
  return {
    ...options,
    dedupeKey: `${type}:${bucket}`,
    singletonKey: type === 'research.batch' ? null : `singleton:${type}`
  };
}

/**
 * Reconcile one recurring schedule against a durable cursor.
 *
 * Queue persistence is the source of truth for the occurrence itself. The cursor
 * advances only after enqueue returns. If the process dies after the durable
 * queue write but before setSetting, the next pulse repeats the same deterministic
 * dedupe key and heals the cursor instead of creating a second logical job.
 */
export async function reconcileScheduledOccurrence({
  queue,
  store = queue?.store,
  type,
  intervalMs,
  payload = {},
  options = {},
  nowMs = Date.now(),
  maxCatchUpBuckets = DEFAULT_MAX_CATCHUP_BUCKETS
} = {}) {
  if (!queue || typeof queue.enqueue !== 'function') throw new Error('durable-scheduler-queue-required');
  if (!store || typeof store.getSettings !== 'function' || typeof store.setSetting !== 'function') {
    throw new Error('durable-scheduler-store-required');
  }

  const normalizedType = text(type, 160);
  if (!normalizedType) throw new Error('durable-scheduler-type-required');
  const interval = Number(intervalMs);
  if (!Number.isSafeInteger(interval) || interval <= 0) throw new Error('durable-scheduler-positive-interval-required');
  const reference = Number(nowMs);
  if (!Number.isFinite(reference) || reference < 0) throw new Error('durable-scheduler-valid-clock-required');

  const catchup = Math.max(1, Math.min(64, Math.floor(Number(maxCatchUpBuckets) || DEFAULT_MAX_CATCHUP_BUCKETS)));
  const currentBucket = bucketFor(reference, interval);
  const key = stateKey(normalizedType);
  const settings = await store.getSettings();
  const previousBucket = cursorFromSettings(settings, key);

  if (previousBucket !== null && previousBucket >= currentBucket) {
    return {
      ok: true,
      status: 'CURRENT_OCCURRENCE_ALREADY_RECONCILED',
      type: normalizedType,
      currentBucket,
      previousBucket,
      enqueuedBuckets: [],
      skippedHistoricalBuckets: 0,
      businessEffectAuthority: 'NONE'
    };
  }

  const earliestRequired = previousBucket === null ? currentBucket : previousBucket + 1;
  const firstBucket = Math.max(earliestRequired, currentBucket - catchup + 1);
  const skippedHistoricalBuckets = Math.max(0, firstBucket - earliestRequired);
  const enqueuedBuckets = [];

  for (let bucket = firstBucket; bucket <= currentBucket; bucket += 1) {
    const scheduledFor = new Date(bucket * interval).toISOString();
    const job = await queue.enqueue(
      normalizedType,
      structuredClone(payload || {}),
      occurrenceOptions(normalizedType, bucket, options)
    );

    await store.setSetting(key, {
      schemaVersion: DURABLE_SCHEDULER_OCCURRENCE_VERSION,
      type: normalizedType,
      intervalMs: interval,
      lastEnqueuedBucket: bucket,
      lastScheduledFor: scheduledFor,
      lastJobId: job?.id || null,
      updatedAt: new Date(reference).toISOString()
    });
    enqueuedBuckets.push(bucket);
  }

  return {
    ok: true,
    status: previousBucket === null ? 'INITIAL_OCCURRENCE_RECONCILED' : 'MISSED_OCCURRENCE_RECONCILED',
    type: normalizedType,
    currentBucket,
    previousBucket,
    enqueuedBuckets,
    skippedHistoricalBuckets,
    cursorKey: key,
    recoveryBoundary: 'QUEUE_WRITE_PRECEDES_CURSOR_ADVANCE__DEDUPE_HEALS_CRASH_BETWEEN_THEM',
    businessEffectAuthority: 'NONE'
  };
}
