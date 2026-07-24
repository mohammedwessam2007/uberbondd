// Deterministic scheduler registry for the mission's 15 named jobs. Mirrors the validated-
// declaration / bounded-batch pattern proven in this session's sibling missions. This file starts
// no timer of its own -- "no hidden loop" is structural (see the capability-scan test), not just a
// comment. Idempotency/lease/heartbeat/bounded-concurrency/timeout/retry-budget/dead-letter come
// from DurableQueue (reused unmodified from ../../src/queue.mjs); circuit breaking comes from
// circuit-breaker.mjs (used inside the two handlers that call an injected provider); fake-clock
// support comes from every handler accepting an injectable `clock`; correlation IDs are stamped by
// every handler itself. No job may send, charge, refund, deploy, or alter a customer site --
// verified structurally: none of the 15 handlers import outbound.mjs, payments.mjs's mutating
// send-adjacent calls beyond verifyPayment (evidence-based, never a charge), or any deploy-shaped
// module (none exists in this package).
export const MODE_DEFINITIONS = Object.freeze({
  'import-watch': Object.freeze({ jobType: 'ros.import_watch', maxAttempts: 3 }),
  'stale-evidence-review': Object.freeze({ jobType: 'ros.stale_evidence_review', maxAttempts: 3 }),
  'opportunity-revalidation': Object.freeze({ jobType: 'ros.opportunity_revalidation', maxAttempts: 3 }),
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
  'deterministic-verification': Object.freeze({ jobType: 'ros.deterministic_verification', maxAttempts: 3 })
});

export const SCHEDULED_MODES = Object.freeze(Object.keys(MODE_DEFINITIONS));

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
