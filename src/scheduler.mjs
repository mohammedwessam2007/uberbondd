import { reconcileScheduledOccurrence } from './durable-scheduler-occurrence.mjs';

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

  if (cfg.autopilot) {
    const recurring = [
      ['research.batch', 15 * MINUTE, { limit: cfg.maxBatch, reason: 'scheduled' }, { maxAttempts: 3 }],
      ['replies.poll', Math.max(1, cfg.replyPollMinutes) * MINUTE, {}, { maxAttempts: 5 }],
      ['outbound.process', 5 * MINUTE, {}, { maxAttempts: 3 }],
      ['followups.process', 15 * MINUTE, {}, { maxAttempts: 5 }],
      ['outbound.reservations.recover', 15 * MINUTE, {}, { maxAttempts: 3 }],
      ['monitoring.process', HOUR, {}, { maxAttempts: 5 }],
      ['artifacts.cleanup', 24 * HOUR, {}, { maxAttempts: 3 }],
      // Read-only frontier learning consumes only the latest policy-cleared
      // Gamechanger receipt and writes a local audit receipt. It makes no
      // provider call and has no messaging, spend, deployment, or customer
      // authority. Deep investigation stays downstream behind Genome gates.
      ['frontier.learning.process', 5 * MINUTE, { maxInvestigations: 8 }, { maxAttempts: 3 }],
      // Personal Civilization reads only runtime-local private state and writes
      // a redacted digest/mission receipt. It models dreams, futures, capability
      // gaps and life-level priorities but has no external-effect authority.
      ['personal.civilization.pulse', 15 * MINUTE, {}, { maxAttempts: 3 }],
      // Universal Wealth is the resident economic control heartbeat. It wakes
      // every minute while autopilot is running so opportunity discovery,
      // ranking, simulation, reconciliation, inevitability checks, and bounded
      // self-repair never wait on a ChatGPT/task scheduler. Durable occurrence
      // dedupe + singleton protection prevent overlapping wealth pulses when a
      // prior minute is still being processed. External effects remain behind
      // the existing spend/trading/contracting/publishing/outreach/borrowing/
      // account-opening consequence gates.
      ['universal.wealth.pulse', MINUTE, { maxSearchCells: 256, maxCanaries: 5, maxCapitalAtRisk: 0 }, { maxAttempts: 3 }],
      // UberDoso is the owned outreach-mail control plane. The pulse only creates
      // canonical internal registry state and schedules already-governed DNS/
      // health reconciliation work. It cannot publish DNS, deploy a mail node,
      // warm/send mail, spend, or create outreach authority. Idempotent content
      // keys let this run frequently without turning into clock-driven spam.
      ['uberdoso.reconcile', 5 * MINUTE, {}, { maxAttempts: 3 }]
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
    // Legacy external-provider warm-up reconciliation remains opt-in. UberDoso
    // does not use it until a real owned seed/warm-up mesh is separately
    // evidenced; warm-up completion is never inferred from scheduler time.
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
