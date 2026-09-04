const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_CLOUD_WAKE_HORIZON_HOURS = 7 * 24;
const MAX_CLOUD_WAKE_ITEMS = 512;

export const CLOUD_WAKE_PLAN_POLICY_VERSION = 'uberbond-cloud-wake-plan-1.0.0';

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function bucket(intervalMs) { return Math.floor(Date.now() / intervalMs); }

function boundedInteger(value, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function missionName(value) {
  const name = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(name) ? name : '';
}

/**
 * Compile a rolling cloud wake plan without publishing anything.
 *
 * UberBond's durable queue remains the source of job truth. A cloud queue is
 * only a wake-up transport, so every delayed delivery carries a deterministic
 * occurrence key that the canonical queue can dedupe after at-least-once
 * redelivery. This keeps Vercel Queue/Workflow replaceable rather than creating
 * a second scheduler ledger.
 */
export function compileCloudWakePlan({
  anchor,
  intervalMinutes = 60,
  horizonHours = 24,
  missionTypes = ['agent-mesh.tick'],
  topic = 'uberbond-background-wake'
} = {}) {
  const anchorMs = Date.parse(String(anchor || ''));
  if (!Number.isFinite(anchorMs)) throw new TypeError('valid anchor ISO timestamp required');
  const interval = boundedInteger(intervalMinutes, 1, 24 * 60);
  const horizon = boundedInteger(horizonHours, 1, MAX_CLOUD_WAKE_HORIZON_HOURS);
  if (interval == null) throw new TypeError('intervalMinutes must be an integer from 1 to 1440');
  if (horizon == null) throw new TypeError(`horizonHours must be an integer from 1 to ${MAX_CLOUD_WAKE_HORIZON_HOURS}`);
  if (!Array.isArray(missionTypes) || missionTypes.length < 1 || missionTypes.length > 16) throw new TypeError('missionTypes must contain 1..16 entries');
  const missions = [...new Set(missionTypes.map(missionName))];
  if (missions.length !== missionTypes.length || missions.some(name => !name)) throw new TypeError('missionTypes must be unique bounded identifiers');
  const topicName = missionName(topic);
  if (!topicName) throw new TypeError('valid cloud wake topic required');

  const intervalMs = interval * MINUTE;
  const horizonMs = horizon * HOUR;
  const entries = [];
  for (let offsetMs = 0; offsetMs < horizonMs; offsetMs += intervalMs) {
    const scheduledFor = new Date(anchorMs + offsetMs).toISOString();
    for (const missionType of missions) {
      const occurrenceKey = `cloud-wake:${missionType}:${scheduledFor}`;
      entries.push({
        occurrenceKey,
        topic: topicName,
        missionType,
        scheduledFor,
        delaySeconds: Math.floor(offsetMs / 1000),
        retentionSeconds: Math.min(7 * 24 * 60 * 60, Math.max(24 * 60 * 60, Math.floor((horizonMs - offsetMs) / 1000) + 3600)),
        idempotencyKey: occurrenceKey,
        payload: {
          occurrenceKey,
          missionType,
          scheduledFor,
          consequenceClass: 'LOCAL_PREPARATION'
        }
      });
      if (entries.length > MAX_CLOUD_WAKE_ITEMS) throw new RangeError(`cloud wake plan exceeds ${MAX_CLOUD_WAKE_ITEMS} items`);
    }
  }

  return {
    ok: true,
    policyVersion: CLOUD_WAKE_PLAN_POLICY_VERSION,
    status: 'CLOUD_WAKE_PLAN_COMPILED_NOT_PUBLISHED',
    anchor: new Date(anchorMs).toISOString(),
    intervalMinutes: interval,
    horizonHours: horizon,
    topic: topicName,
    entries,
    canonicalJobTruth: 'UBERBOND_DURABLE_QUEUE',
    deliverySemanticsExpected: 'AT_LEAST_ONCE_TRANSPORT_DEDUPED_BY_OCCURRENCE_KEY',
    cloudPublishAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function startScheduler(queue, cfg, log = console) {
  const timers = [];
  const safe = (label, fn) => Promise.resolve().then(fn).catch(error => log.error(label, error));
  const schedule = (type, intervalMs, payload = {}, options = {}) => queue.enqueue(type, payload, {
    ...options,
    dedupeKey: `${type}:${bucket(intervalMs)}`,
    singletonKey: type === 'research.batch' ? null : `singleton:${type}`
  });

  if (cfg.autopilot) {
    const recurring = [
      ['research.batch', 15 * MINUTE, { limit: cfg.maxBatch, reason: 'scheduled' }, { maxAttempts: 3 }],
      ['replies.poll', Math.max(1, cfg.replyPollMinutes) * MINUTE, {}, { maxAttempts: 5 }],
      ['outbound.process', 5 * MINUTE, {}, { maxAttempts: 3 }],
      ['followups.process', 15 * MINUTE, {}, { maxAttempts: 5 }],
      ['outbound.reservations.recover', 15 * MINUTE, {}, { maxAttempts: 3 }],
      ['monitoring.process', HOUR, {}, { maxAttempts: 5 }],
      ['artifacts.cleanup', 24 * HOUR, {}, { maxAttempts: 3 }]
    ];
    if (cfg.discovery?.enabled) {
      recurring.push(['discovery.run', Math.max(1, Number(cfg.discovery.runEveryHours || 24)) * HOUR, { scheduled: true }, { maxAttempts: 4 }]);
    }
    // Read-only Prometheus recomputation jobs -- layered on top of
    // autopilot behind their own explicit flag so no existing autopilot
    // deployment picks these up silently. Neither job ever calls a
    // provider, sends anything, or spends money; both are pure read +
    // audit-log-receipt writes.
    if (cfg.prometheus?.schedulingEnabled) {
      recurring.push(
        ['prometheus.capability_gap.recompute', 6 * HOUR, {}, { maxAttempts: 2 }],
        ['prometheus.capability_genome.plan', 24 * HOUR, { budget: { maxSources: 20, maxRecordsPerSource: 100 } }, { maxAttempts: 2 }],
        ['prometheus.commercial_memory.contradiction_scan', 24 * HOUR, {}, { maxAttempts: 2 }],
        ['prometheus.commercial.catalog', 24 * HOUR, {}, { maxAttempts: 2 }]
      );
    }
    // Domain/mailbox warm-up reconciliation -- read-only unless a real
    // registered mailbox+provider pair exists, in which case it re-asks the
    // provider for real status and persists the receipt. Off by default,
    // layered on autopilot, same pattern as the Prometheus jobs above. This
    // scheduler has no way to enumerate registered mailboxes on its own
    // (deliberately -- adding that here would require a new query surface);
    // a real deployment wires payload.mailboxId/provider via its own
    // dispatch layer. Left as a documented, disabled-by-default hook rather
    // than guessed at.
    if (cfg.domainMailbox?.schedulingEnabled) {
      recurring.push(
        ['domainMailbox.warmup.reconcile', HOUR, {}, { maxAttempts: 3 }]
      );
    }
    for (const [type, intervalMs, payload, options] of recurring) {
      safe(`initial ${type}`, () => schedule(type, intervalMs, payload, options));
      const timer = setInterval(() => safe(`schedule ${type}`, () => schedule(type, intervalMs, payload, options)), intervalMs);
      timer.unref?.();
      timers.push(timer);
    }
  }
  return () => timers.forEach(clearInterval);
}
