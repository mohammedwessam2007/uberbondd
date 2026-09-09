import { reconcileScheduledOccurrence } from './durable-scheduler-occurrence.mjs';

export const DURABLE_SCHEDULER_WAKE_PULSE_VERSION = 'uberbond.durable-scheduler-wake-pulse.v1';

const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const text = (value, max = 240) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: DURABLE_SCHEDULER_WAKE_PULSE_VERSION,
    status: 'DURABLE_SCHEDULER_WAKE_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    canonicalJobTruth: 'UBERBOND_DURABLE_QUEUE_AND_SCHEDULER_CURSOR',
    wakeAuthority: 'PULSE_ONLY',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { providerCalls: 0, ...ZERO_EFFECTS },
    ...extra
  };
}

function validateLocalSchedule(schedule = {}) {
  const reasons = [];
  const type = text(schedule.type, 160);
  const intervalMs = Number(schedule.intervalMs);
  const maxCatchUpBuckets = Number(schedule.maxCatchUpBuckets ?? 2);
  if (!type) reasons.push('local-schedule-type-required');
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) reasons.push('local-positive-interval-required');
  if (!Number.isSafeInteger(maxCatchUpBuckets) || maxCatchUpBuckets < 1 || maxCatchUpBuckets > 64) reasons.push('bounded-local-catchup-required');
  if (schedule.payload != null && (typeof schedule.payload !== 'object' || Array.isArray(schedule.payload))) reasons.push('local-schedule-payload-must-be-object');
  if (schedule.options != null && (typeof schedule.options !== 'object' || Array.isArray(schedule.options))) reasons.push('local-schedule-options-must-be-object');
  return { reasons, type, intervalMs, maxCatchUpBuckets };
}

/**
 * Accept a replaceable external wake as a pulse only.
 *
 * The delivery is deliberately NOT allowed to carry job type, payload, interval,
 * occurrence key, retry law or catch-up policy. Those remain local trusted
 * configuration and the existing durable scheduler derives the deterministic
 * occurrence identity from its own clock/cursor. A cloud queue, cron, webhook,
 * workflow or future transport can therefore wake UberBond without becoming
 * job truth or gaining a path to invent work.
 */
export async function applyDurableSchedulerWakePulse({
  wake,
  schedule,
  queue,
  nowMs = Date.now(),
  maxWakeAgeMs = 15 * 60 * 1000
} = {}) {
  const local = validateLocalSchedule(schedule);
  const reasons = [...local.reasons];
  if (!wake || typeof wake !== 'object' || Array.isArray(wake)) reasons.push('structured-wake-required');

  const wakeId = text(wake?.wakeId, 240);
  const providerId = text(wake?.providerId, 160);
  const observedAt = text(wake?.observedAt, 80);
  const observedAtMs = Date.parse(observedAt || '');
  const clock = Number(nowMs);
  const ageLimit = Number(maxWakeAgeMs);

  if (!wakeId) reasons.push('wake-id-required');
  if (!providerId) reasons.push('wake-provider-id-required');
  if (!Number.isFinite(observedAtMs)) reasons.push('valid-wake-observation-time-required');
  if (!Number.isFinite(clock) || clock < 0) reasons.push('valid-local-clock-required');
  if (!Number.isSafeInteger(ageLimit) || ageLimit < 1_000 || ageLimit > 24 * 60 * 60 * 1000) reasons.push('bounded-wake-age-required');
  if (Number.isFinite(observedAtMs) && Number.isFinite(clock)) {
    if (observedAtMs > clock + 60_000) reasons.push('future-wake-refused');
    if (clock - observedAtMs > ageLimit) reasons.push('stale-wake-refused');
  }

  // A provider message that tries to smuggle scheduler semantics is rejected,
  // not ignored. Silent ignoring would make it easy for a future caller to
  // believe provider-controlled fields were honored when they were not.
  const forbidden = ['type', 'missionType', 'payload', 'options', 'intervalMs', 'occurrenceKey', 'dedupeKey', 'singletonKey', 'maxAttempts', 'maxCatchUpBuckets'];
  const injected = forbidden.filter(key => Object.prototype.hasOwnProperty.call(wake || {}, key));
  if (injected.length) reasons.push('wake-must-not-carry-scheduler-semantics');
  if (reasons.length) return fail(reasons, { wakeId: wakeId || null, providerId: providerId || null, injectedFields: injected });

  const result = await reconcileScheduledOccurrence({
    queue,
    type: local.type,
    intervalMs: local.intervalMs,
    payload: structuredClone(schedule.payload || {}),
    options: structuredClone(schedule.options || {}),
    nowMs: clock,
    maxCatchUpBuckets: local.maxCatchUpBuckets
  });

  return {
    ok: true,
    version: DURABLE_SCHEDULER_WAKE_PULSE_VERSION,
    status: 'DURABLE_SCHEDULER_WAKE_RECONCILED',
    wake: { wakeId, providerId, observedAt: new Date(observedAtMs).toISOString() },
    schedulerResult: result,
    canonicalJobTruth: 'UBERBOND_DURABLE_QUEUE_AND_SCHEDULER_CURSOR',
    wakeAuthority: 'PULSE_ONLY',
    truthBoundary: 'WAKE_DELIVERY_PROVES_ONLY_THAT_A_PULSE_WAS_RECEIVED__THE_PROVIDER_CANNOT_DEFINE_OR_PROVE_A_SCHEDULED_JOB_OR_ITS_EXECUTION',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { providerCalls: 0, ...ZERO_EFFECTS }
  };
}
