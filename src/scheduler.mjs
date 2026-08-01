import { scheduleCanonCycle } from './autonomous-cycle.mjs';

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
      ['monitoring.process', HOUR, {}, { maxAttempts: 5 }],
      ['artifacts.cleanup', 24 * HOUR, {}, { maxAttempts: 3 }]
    ];
    if (cfg.discovery?.enabled) {
      recurring.push(['discovery.run', Math.max(1, Number(cfg.discovery.runEveryHours || 24)) * HOUR, { scheduled: true }, { maxAttempts: 4 }]);
    }
    for (const [type, intervalMs, payload, options] of recurring) {
      safe(`initial ${type}`, () => schedule(type, intervalMs, payload, options));
      const timer = setInterval(() => safe(`schedule ${type}`, () => schedule(type, intervalMs, payload, options)), intervalMs);
      timer.unref?.();
      timers.push(timer);
    }
  }

  // Canon/V3 acquisition cycle -- a SEPARATE, explicit default-false gate
  // (ACQUISITION_WORKERS_ACTIVE) from cfg.autopilot above. Registration of the Canon job handlers
  // (job-handlers.mjs) is unconditional, so a manual `queue.enqueue('canon.cycle.opportunity_hunt',
  // ...)` always works regardless of this flag; only the automatic daily kickoff is gated here.
  if (cfg.acquisition?.workersActive) {
    safe('initial canon.cycle', () => scheduleCanonCycle(queue, { cfg }));
    const timer = setInterval(() => safe('schedule canon.cycle', () => scheduleCanonCycle(queue, { cfg })), 24 * HOUR);
    timer.unref?.();
    timers.push(timer);
  }

  return () => timers.forEach(clearInterval);
}
