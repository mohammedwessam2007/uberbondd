function dateKey(at = new Date()) {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * The owner's daily digest (spec section K/M): everything an owner needs to see once a day
 * without opening the control center, built entirely from data the rest of the automation layer
 * already computes (revenue summary, cockpit snapshot, exception queue, worker health). This
 * module performs no I/O -- the caller is responsible for persisting the returned record to the
 * automationDigests collection if history is wanted.
 */
export function buildDailyDigest({ revenueSummary = {}, cockpitSnapshot = {}, exceptionSummary = {}, workerHealth = {}, automationStatus = {} } = {}, at = new Date()) {
  return {
    kind: 'daily',
    digestDate: dateKey(at),
    generatedAt: at.toISOString(),
    automation: { mode: automationStatus.mode, enabled: automationStatus.enabled, live: automationStatus.live },
    pipeline: { counts: cockpitSnapshot.counts || {} },
    exceptions: exceptionSummary,
    revenue: {
      todayRevenue: revenueSummary.todayRevenue || 0,
      grossRevenue: revenueSummary.grossRevenue || 0,
      mrr: revenueSummary.mrr || 0,
      paidCustomers: revenueSummary.paidCustomers || 0,
      activeSubscriptions: revenueSummary.activeSubscriptions || 0
    },
    workers: { liveWorkerCount: workerHealth.liveWorkerCount || 0, deadLetterCount: workerHealth.deadLetterCount || 0, paused: workerHealth.paused === true },
    nextOwnerAction: exceptionSummary.total
      ? `${exceptionSummary.total} exception${exceptionSummary.total === 1 ? '' : 's'} awaiting review (${exceptionSummary.byPriority?.P0 || 0} P0).`
      : 'No exceptions. Nothing requires owner action today.'
  };
}

/**
 * Weekly health report: worker/queue trend over the last 7 daily digests plus the current
 * exception backlog. Accepts an array of already-computed daily digests (oldest first) rather
 * than reaching into a store itself, so it stays a pure, directly testable function.
 */
export function buildWeeklyHealthReport(dailyDigests = [], { exceptionSummary = {}, automationStatus = {} } = {}, at = new Date()) {
  const window = dailyDigests.slice(-7);
  const totalRevenue = window.reduce((sum, entry) => sum + Number(entry.revenue?.todayRevenue || 0), 0);
  const deadLetterTrend = window.map(entry => Number(entry.workers?.deadLetterCount || 0));
  const worstDeadLetter = Math.max(0, ...deadLetterTrend);
  return {
    kind: 'weekly',
    digestDate: dateKey(at),
    generatedAt: at.toISOString(),
    automation: { mode: automationStatus.mode, enabled: automationStatus.enabled, live: automationStatus.live },
    daysCovered: window.length,
    totalRevenue,
    deadLetterTrend,
    worstDeadLetterCount: worstDeadLetter,
    currentExceptionBacklog: exceptionSummary,
    healthy: worstDeadLetter === 0 && (exceptionSummary.byPriority?.P0 || 0) === 0
  };
}
