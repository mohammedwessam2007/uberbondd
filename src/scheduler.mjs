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
      // Universal Wealth performs zero-capital economic search while the founder
      // is absent. It may research/build/test locally, but has no spend, trading,
      // contracting, publishing, outreach, borrowing, or account-opening authority.
      ['universal.wealth.pulse', 30 * MINUTE, { maxSearchCells: 256, maxCanaries: 5, maxCapitalAtRisk: 0 }, { maxAttempts: 3 }]
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
