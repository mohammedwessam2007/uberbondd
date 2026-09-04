import { CLOUD_WAKE_PLAN_POLICY_VERSION } from './scheduler.mjs';

export const CLOUD_WAKE_TRANSPORT_POLICY_VERSION = 'uberbond-cloud-wake-transport-1.0.0';

const ZERO_BUSINESS_EFFECTS = Object.freeze({
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const MISSION_RE = /^[a-z0-9][a-z0-9._-]{1,79}$/i;
const OCCURRENCE_RE = /^cloud-wake:([a-z0-9][a-z0-9._-]{1,79}):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/i;

function boundedText(value, max = 300) {
  const text = String(value ?? '').trim();
  return text && text.length <= max ? text : '';
}

function normalizeEntry(entry = {}) {
  const missionType = boundedText(entry.missionType, 80);
  const scheduledFor = boundedText(entry.scheduledFor, 80);
  const occurrenceKey = boundedText(entry.occurrenceKey, 300);
  const topic = boundedText(entry.topic, 80);
  const delaySeconds = Number(entry.delaySeconds);
  const retentionSeconds = Number(entry.retentionSeconds);
  if (!MISSION_RE.test(missionType)) throw new TypeError('invalid cloud wake mission type');
  if (!MISSION_RE.test(topic)) throw new TypeError('invalid cloud wake topic');
  if (!Number.isSafeInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 7 * 24 * 3600) throw new TypeError('invalid cloud wake delay');
  if (!Number.isSafeInteger(retentionSeconds) || retentionSeconds < 3600 || retentionSeconds > 7 * 24 * 3600) throw new TypeError('invalid cloud wake retention');
  const parsed = OCCURRENCE_RE.exec(occurrenceKey);
  if (!parsed || parsed[1] !== missionType || parsed[2] !== scheduledFor) throw new TypeError('cloud wake occurrence binding mismatch');
  if (!Number.isFinite(Date.parse(scheduledFor))) throw new TypeError('invalid cloud wake schedule timestamp');
  if (entry.idempotencyKey !== occurrenceKey) throw new TypeError('cloud wake idempotency key must equal occurrence key');
  return {
    occurrenceKey,
    idempotencyKey: occurrenceKey,
    topic,
    missionType,
    scheduledFor,
    delaySeconds,
    retentionSeconds,
    payload: {
      occurrenceKey,
      missionType,
      scheduledFor,
      consequenceClass: 'LOCAL_PREPARATION'
    }
  };
}

/**
 * Compile provider request objects from a verified cloud-wake plan.
 * This function performs no provider I/O.
 */
export function compileCloudWakePublishBatch(plan = {}) {
  if (plan?.policyVersion !== CLOUD_WAKE_PLAN_POLICY_VERSION) throw new TypeError('recognized cloud wake plan policy required');
  if (plan?.status !== 'CLOUD_WAKE_PLAN_COMPILED_NOT_PUBLISHED') throw new TypeError('unpublished cloud wake plan required');
  if (plan?.canonicalJobTruth !== 'UBERBOND_DURABLE_QUEUE') throw new TypeError('canonical durable queue truth required');
  if (plan?.cloudPublishAuthority !== 'NONE') throw new TypeError('compiler plan must not carry publish authority');
  if (!Array.isArray(plan.entries) || plan.entries.length < 1 || plan.entries.length > 512) throw new TypeError('bounded cloud wake entries required');
  const entries = plan.entries.map(normalizeEntry);
  if (new Set(entries.map(entry => entry.occurrenceKey)).size !== entries.length) throw new TypeError('duplicate cloud wake occurrence key');
  return {
    ok: true,
    policyVersion: CLOUD_WAKE_TRANSPORT_POLICY_VERSION,
    status: 'CLOUD_WAKE_PROVIDER_BATCH_PREPARED_NOT_PUBLISHED',
    entries,
    providerCallAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { providerCalls: 0, ...ZERO_BUSINESS_EFFECTS }
  };
}

/**
 * Actual queue publication seam. It is deliberately impossible to invoke by
 * merely compiling a plan: the caller must present a separate authorization
 * receipt and inject the provider-specific publisher.
 */
export async function publishCloudWakeBatch({ batch, authorization, publish } = {}) {
  if (batch?.policyVersion !== CLOUD_WAKE_TRANSPORT_POLICY_VERSION || batch?.status !== 'CLOUD_WAKE_PROVIDER_BATCH_PREPARED_NOT_PUBLISHED') {
    throw new TypeError('prepared cloud wake provider batch required');
  }
  if (authorization?.authority !== 'CLOUD_WAKE_PROVIDER_PUBLISH' || authorization?.approved !== true) {
    return { ok: false, status: 'CLOUD_WAKE_PROVIDER_PUBLISH_BLOCKED', reasonCodes: ['separate-cloud-publish-authorization-required'], providerCalls: 0, externalEffectLedger: { providerCalls: 0, ...ZERO_BUSINESS_EFFECTS } };
  }
  if (typeof publish !== 'function') throw new TypeError('provider publish function required');
  const receipts = [];
  let calls = 0;
  for (const entry of batch.entries) {
    const result = await publish({
      topic: entry.topic,
      payload: entry.payload,
      delaySeconds: entry.delaySeconds,
      retentionSeconds: entry.retentionSeconds,
      idempotencyKey: entry.idempotencyKey
    });
    calls += 1;
    receipts.push({ occurrenceKey: entry.occurrenceKey, accepted: result?.accepted === true, providerMessageId: boundedText(result?.providerMessageId, 240) || null });
    if (result?.accepted !== true) {
      return { ok: false, status: 'CLOUD_WAKE_PROVIDER_PUBLISH_PARTIAL', receipts, providerCalls: calls, externalEffectLedger: { providerCalls: calls, ...ZERO_BUSINESS_EFFECTS } };
    }
  }
  return { ok: true, status: 'CLOUD_WAKE_PROVIDER_PUBLISHED', receipts, providerCalls: calls, externalEffectLedger: { providerCalls: calls, ...ZERO_BUSINESS_EFFECTS } };
}

/**
 * Consumer seam for an at-least-once cloud queue delivery.
 * The provider message never becomes business truth. It only asks UberBond's
 * canonical durable queue to admit a replay-safe local-preparation occurrence.
 */
export async function ingestCloudWakeDelivery({ delivery, enqueue } = {}) {
  if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) throw new TypeError('structured cloud wake delivery required');
  if (typeof enqueue !== 'function') throw new TypeError('canonical queue enqueue function required');
  const occurrenceKey = boundedText(delivery.occurrenceKey, 300);
  const missionType = boundedText(delivery.missionType, 80);
  const scheduledFor = boundedText(delivery.scheduledFor, 80);
  const parsed = OCCURRENCE_RE.exec(occurrenceKey);
  if (!parsed || parsed[1] !== missionType || parsed[2] !== scheduledFor) throw new TypeError('cloud wake delivery binding mismatch');
  if (delivery.consequenceClass !== 'LOCAL_PREPARATION') throw new TypeError('cloud wake delivery may only request local preparation');
  const job = await enqueue(missionType, { occurrenceKey, scheduledFor, source: 'cloud-wake-transport' }, {
    dedupeKey: occurrenceKey,
    singletonKey: `singleton:${missionType}`,
    maxAttempts: 3,
    recoveryPolicy: 'replay-safe',
    idempotent: true
  });
  return {
    ok: true,
    policyVersion: CLOUD_WAKE_TRANSPORT_POLICY_VERSION,
    status: 'CLOUD_WAKE_INGESTED_TO_CANONICAL_QUEUE',
    occurrenceKey,
    jobId: boundedText(job?.id, 240) || null,
    canonicalJobTruth: 'UBERBOND_DURABLE_QUEUE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { providerCalls: 0, ...ZERO_BUSINESS_EFFECTS }
  };
}
