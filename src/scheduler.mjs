const MINUTE = 60000;
const HOUR = 60 * MINUTE;

function bucket(intervalMs) { return Math.floor(Date.now() / intervalMs); }

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
        ['prometheus.commercial_memory.contradiction_scan', 24 * HOUR, {}, { maxAttempts: 2 }]
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
