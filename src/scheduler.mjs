import { reconcileScheduledOccurrence } from './durable-scheduler-occurrence.mjs';
import { autonomicCirculationConfigFromEnv } from './autonomic-circulation-config.mjs';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;

export function startScheduler(queue, cfg, log = console) {
  const timers = [];
  const safe = (label, fn) => Promise.resolve().then(fn).catch(error => log.error(label, error));
  const schedule = (type, intervalMs, payload = {}, options = {}) => reconcileScheduledOccurrence({
    queue,
    type,
    intervalMs,
    payload,
    options,
    maxCatchUpBuckets: 2
  });
  const recurring = [];

  if (cfg.autopilot) {
    recurring.push(
      ['research.batch', 15 * MINUTE, { limit: cfg.maxBatch, reason: 'scheduled' }, { maxAttempts: 3 }],
      ['replies.poll', Math.max(1, cfg.replyPollMinutes) * MINUTE, {}, { maxAttempts: 5 }],
      ['outbound.process', 5 * MINUTE, {}, { maxAttempts: 3 }],
      ['followups.process', 15 * MINUTE, {}, { maxAttempts: 5 }],
      ['outbound.reservations.recover', 15 * MINUTE, {}, { maxAttempts: 3 }],
      ['monitoring.process', HOUR, {}, { maxAttempts: 5 }],
      ['artifacts.cleanup', 24 * HOUR, {}, { maxAttempts: 3 }]
    );
    if (cfg.discovery?.enabled) {
      recurring.push(['discovery.run', Math.max(1, Number(cfg.discovery.runEveryHours || 24)) * HOUR, { scheduled: true }, { maxAttempts: 4 }]);
    }
    if (cfg.prometheus?.schedulingEnabled) {
      recurring.push(
        ['prometheus.capability_gap.recompute', 6 * HOUR, {}, { maxAttempts: 2 }],
        ['prometheus.capability_genome.plan', 24 * HOUR, { budget: { maxSources: 20, maxRecordsPerSource: 100 } }, { maxAttempts: 2 }],
        ['prometheus.commercial_memory.contradiction_scan', 24 * HOUR, {}, { maxAttempts: 2 }],
        ['prometheus.commercial.catalog', 24 * HOUR, {}, { maxAttempts: 2 }]
      );
    }
    if (cfg.domainMailbox?.schedulingEnabled) {
      recurring.push(['domainMailbox.warmup.reconcile', HOUR, {}, { maxAttempts: 3 }]);
    }
  }

  // The autonomic heartbeat is deliberately independent from outreach/discovery
  // autopilot. It schedules only local-preparation/read-reconciliation work and
  // therefore may keep the organism cognitively circulating while outbound,
  // discovery, payment, deployment and other consequence-bearing lanes remain off.
  const autonomic = cfg.autonomic || autonomicCirculationConfigFromEnv();
  if (autonomic?.enabled) {
    recurring.push(['autonomic.circulation.tick', autonomic.intervalMs, {}, { maxAttempts: 3, priority: 120 }]);
  }

  for (const [type, intervalMs, payload, options] of recurring) {
    safe(`initial ${type}`, () => schedule(type, intervalMs, payload, options));
    const timer = setInterval(() => safe(`schedule ${type}`, () => schedule(type, intervalMs, payload, options)), intervalMs);
    timer.unref?.();
    timers.push(timer);
  }
  return () => timers.forEach(clearInterval);
}
