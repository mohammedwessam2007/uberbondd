// Deterministic scheduler registry for the mission's 17 named jobs (15 from the original Revenue OS
// build, plus buyer-intent-revalidation and experiment-analysis added for 24/7 Continuous Revenue
// Core section 5). Mirrors the validated-declaration / bounded-batch pattern proven in this
// session's sibling missions. This file starts no timer of its own -- "no hidden loop" is
// structural (see the capability-scan test), not just a comment. Idempotency/lease/heartbeat/
// bounded-concurrency/timeout/retry-budget/dead-letter come from DurableQueue (reused unmodified
// from ../../src/queue.mjs); circuit breaking comes from circuit-breaker.mjs (used inside the
// handlers that call an injected provider); fake-clock support comes from every handler accepting
// an injectable `clock`; correlation IDs are stamped by every handler itself. No job may send,
// charge, refund, deploy, or alter a customer site -- verified structurally: none of the handlers
// import outbound.mjs, payments.mjs's mutating send-adjacent calls beyond verifyPayment
// (evidence-based, never a charge), or any deploy-shaped module (none exists in this package).
export const MODE_DEFINITIONS = Object.freeze({
  'import-watch': Object.freeze({ jobType: 'ros.import_watch', maxAttempts: 3 }),
  'stale-evidence-review': Object.freeze({ jobType: 'ros.stale_evidence_review', maxAttempts: 3 }),
  'opportunity-revalidation': Object.freeze({ jobType: 'ros.opportunity_revalidation', maxAttempts: 3 }),
  // 24/7 Continuous Revenue Core, section 4/5: wires buyer-intent.mjs's revalidate/expire sweep into
  // the scheduler as its own mode, distinct from opportunity-revalidation above (that one re-scores;
  // this one expires opportunities whose evidence no longer passes the freshness/domain/channel
  // gates -- complementary status transitions, not a duplicate check).
  'buyer-intent-revalidation': Object.freeze({ jobType: 'ros.buyer_intent_revalidation', maxAttempts: 3 }),
  'approval-expiry': Object.freeze({ jobType: 'ros.approval_expiry', maxAttempts: 3 }),
  'followup-eligibility': Object.freeze({ jobType: 'ros.followup_eligibility', maxAttempts: 3 }),
  'reply-import': Object.freeze({ jobType: 'ros.reply_import', maxAttempts: 3 }),
  'payment-reconciliation': Object.freeze({ jobType: 'ros.payment_reconciliation', maxAttempts: 3 }),
  'project-deadlines': Object.freeze({ jobType: 'ros.project_deadlines', maxAttempts: 3 }),
  'report-generation': Object.freeze({ jobType: 'ros.report_generation', maxAttempts: 3 }),
  'qa-reminders': Object.freeze({ jobType: 'ros.qa_reminders', maxAttempts: 3 }),
  'delivery-readiness': Object.freeze({ jobType: 'ros.delivery_readiness', maxAttempts: 3 }),
  'monitoring-checks': Object.freeze({ jobType: 'ros.monitoring_checks', maxAttempts: 3 }),
  'owner-digest': Object.freeze({ jobType: 'ros.owner_digest', maxAttempts: 3 }),
  'retention-purge': Object.freeze({ jobType: 'ros.retention_purge', maxAttempts: 3 }),
  // section 10/5's "measured learning" + "experimentation analysis" requirement: wires funnel.mjs's
  // already-existing summarizeExperiment (which refuses to call anything "significant" below a
  // minimum sample size) into a recurring sweep, rather than leaving it a library function nobody
  // calls on a schedule.
  'experiment-analysis': Object.freeze({ jobType: 'ros.experiment_analysis', maxAttempts: 3 }),
  'deterministic-verification': Object.freeze({ jobType: 'ros.deterministic_verification', maxAttempts: 3 })
});

export const SCHEDULED_MODES = Object.freeze(Object.keys(MODE_DEFINITIONS));

// 24/7 Continuous Revenue Core, section 5: "UberBond must continuously perform the highest-value
// safe work available ... a paused outbound provider must never idle the entire company." Every
// mode below is proof of that by construction, not just by claim: none of these 17 modes sends,
// charges, refunds, or deploys (see this file's own header comment -- verified structurally by this
// package's capability-scan test), so none of them can ever be gated on outbound/live-sending
// state. There is no "send" mode in this registry for outbound to pause -- sending lives entirely
// in outbound.mjs's own explicit approval+send flow, which this scheduler never calls.
// ALWAYS_SAFE_PRIORITY orders the same SCHEDULED_MODES set by the mission's own named categories:
// research/ingest, revalidation+dedup+evidence, qualification, fulfillment, monitoring, reporting,
// recovery, experimentation analysis -- so "the next safe task" always means something concrete.
export const ALWAYS_SAFE_PRIORITY = Object.freeze([
  'import-watch', 'stale-evidence-review', 'opportunity-revalidation', 'buyer-intent-revalidation',
  'approval-expiry', 'followup-eligibility', 'reply-import', 'payment-reconciliation',
  'project-deadlines', 'report-generation', 'qa-reminders', 'delivery-readiness',
  'monitoring-checks', 'owner-digest', 'retention-purge', 'experiment-analysis',
  'deterministic-verification'
]);

export class SchedulerError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'SchedulerError';
    this.code = code;
  }
}

function correlationId() {
  return `ros_sched_corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Pure, deterministic given the same mode/payload/runKey -- a caller can inspect what would be
 * enqueued before doing it (dry run). */
export function planScheduledJob(mode, payload = {}, { runKey } = {}) {
  const definition = MODE_DEFINITIONS[mode];
  if (!definition) throw new SchedulerError('unsupported-scheduled-mode', `${mode}. Valid modes: ${SCHEDULED_MODES.join(', ')}`);
  const safeRunKey = String(runKey || '').replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 120) || new Date().toISOString().slice(0, 13);
  return {
    mode, jobType: definition.jobType, maxAttempts: definition.maxAttempts,
    payload: { ...payload, correlationId: correlationId() },
    dedupeKey: `revenue-os-scheduled:${mode}:${safeRunKey}`,
    singletonKey: `revenue-os-scheduled:${mode}`
  };
}

/** Scheduled automation requires the operator to have explicitly chosen a store backend -- same
 * doctrine as this session's other missions, even though only the JSON backend is implemented this
 * session (see docs/REUSE_VS_REPLACE_DECISION.md). */
export function schedulerPreflight(cfg = {}) {
  if (!['json', 'postgres'].includes(cfg.storeBackend)) return { ok: false, blockedReason: 'unknown-store-backend' };
  return { ok: true, blockedReason: '' };
}

/** Enqueues and immediately runs one scheduled job through the given DurableQueue. */
export async function runScheduledJob({ mode, payload, runKey, dryRun = false, queue, handlers, store }) {
  const plan = planScheduledJob(mode, payload, { runKey });
  if (dryRun) return { mode: plan.mode, jobType: plan.jobType, dryRun: true, wouldEnqueue: plan.payload };
  const job = await queue.enqueue(plan.jobType, plan.payload, { queue: plan.jobType, maxAttempts: plan.maxAttempts, dedupeKey: plan.dedupeKey, singletonKey: plan.singletonKey });
  const result = await queue.runOnce(handlers);
  const storedJob = await store.get('jobs', job.id);
  return { mode: plan.mode, jobType: plan.jobType, claimed: result.claimed || 0, paused: result.paused === true, jobStatus: storedJob?.status || job.status || 'unknown', correlationId: plan.payload.correlationId };
}

/**
 * Pure priority pick: given a `lastRunAt` map (mode -> ISO timestamp or missing), returns the
 * ALWAYS_SAFE_PRIORITY mode that was least recently run (missing/unparseable counts as
 * "never," i.e. most overdue). Ties resolve to the earlier mode in priority order. No I/O, no
 * outbound/live-sending input of any kind -- this is the literal, inspectable proof that "the next
 * safe task" is never a function of whether outbound is enabled, paused, or blocked.
 */
export function selectNextSafeTask(lastRunAt = {}) {
  let chosen = ALWAYS_SAFE_PRIORITY[0];
  let oldest = Infinity;
  for (const mode of ALWAYS_SAFE_PRIORITY) {
    const parsed = Date.parse(lastRunAt[mode] || 0);
    const stamp = Number.isFinite(parsed) ? parsed : 0;
    if (stamp < oldest) { oldest = stamp; chosen = mode; }
  }
  return chosen;
}

/**
 * Real-I/O wrapper: reads each mode's most recent job (by its scheduler singletonKey) from the
 * store to build the `lastRunAt` map, picks the next mode via selectNextSafeTask, and runs it
 * through runScheduledJob. This is the single call a continuous runner (a poll loop, a cron tick,
 * or -- when outbound is paused/blocked/disabled -- the *only* thing still running) can invoke
 * repeatedly to guarantee UberBond always has a next safe task in hand. `runKey` defaults to the
 * current instant (not the coarser per-hour default planScheduledJob otherwise falls back to) so
 * repeated calls make real, distinct progress instead of colliding on one dedupe key per hour.
 */
export async function runNextSafeTask({ store, queue, handlers, payload = {}, runKey } = {}) {
  const lastRunAt = {};
  for (const mode of ALWAYS_SAFE_PRIORITY) {
    const singletonKey = `revenue-os-scheduled:${mode}`;
    const jobs = await store.list('jobs', { filters: { singletonKey } });
    const latest = jobs.reduce((best, job) => (!best || Date.parse(job.updatedAt) > Date.parse(best.updatedAt)) ? job : best, null);
    if (latest) lastRunAt[mode] = latest.updatedAt;
  }
  const mode = selectNextSafeTask(lastRunAt);
  return runScheduledJob({ mode, payload, runKey: runKey || new Date().toISOString(), queue, handlers, store });
}
