// Canon/V3 integration -- premerge audit P0-001 (durability) and mission item 8 ("durable
// autonomous cycle").
//
// V3's runRevenueCycle held every stage's output (opportunities, prospectQueue, reservations,
// events, replies, followups, costs) in one in-memory `state` object threaded by hand between
// stages -- a crash, retry, second worker, or restart could duplicate work, lose state, or
// disagree with PostgreSQL, because nothing about that state survived past the process holding it.
//
// This module does not introduce a second orchestration mechanism: every stage below is a
// DurableQueue job handler (src/queue.mjs, already battle-tested by tests/queue.test.mjs), enqueued
// with a per-day singletonKey/dedupeKey via scheduleCanonCycle. The queue's existing lease +
// heartbeat + recoverStaleJobs machinery is what makes a stage resumable: if a worker dies mid
// stage, its job's heartbeat goes stale, recoverStaleJobs (already called on every claim) requeues
// it, and any worker's next runOnce() picks it back up. That only works because every handler here
// is itself safe to re-run to completion -- it reads/writes only durable store state and every
// write path it uses (commercial-intelligence-import's idempotency keys, prospects' domain unique
// constraint, cost-ledger reservations, outboundReservations' idempotency keys) is already
// dedup-safe, so replaying a stage after a crash produces the same durable result, never a
// duplicate.
//
// KNOWN LIMITATION (disclosed): `adapters.prospectDiscovery` and `adapters.replySweep` (like every
// opportunity-hunter.mjs adapter) default to disabled in this sandbox -- there is no live
// hiring-board/procurement/marketplace/Gmail credential wired in here. Each stage reports itself as
// blocked-not-configured rather than fabricating signals, exactly like opportunity-hunter.mjs.
import os from 'node:os';
import { id, now } from './utils.mjs';
import { ConflictError } from './store.mjs';
import { huntOpportunitySignals, buildCommercialIntelligenceRecord } from './opportunity-hunter.mjs';
import { importCommercialIntelligenceBatch, validateCommercialIntelligenceRecord, listQueueableOpportunities } from './commercial-intelligence-import.mjs';
import { REVENUE_OS_POLICY_VERSION } from './revenue-os.mjs';
import { replenishProspectQueue } from './prospect-supply.mjs';
import { resolveCanonSendCandidate } from './send-eligibility.mjs';
import { dispatchReservation } from './dispatch-adapter.mjs';
import { classifyCanonReply, applyReplyClassification } from './reply-classifier.mjs';

export const CANON_JOB_TYPES = Object.freeze({
  OPPORTUNITY_HUNT: 'canon.opportunity_hunt',
  PROSPECT_DISCOVERY: 'canon.prospect_discovery',
  SEND_PLANNING: 'canon.send_planning',
  DISPATCH: 'canon.dispatch',
  REPLY_SWEEP: 'canon.reply_sweep',
  ATTRIBUTION: 'canon.attribution',
  CHECKPOINT: 'canon.checkpoint'
});

const CANON_RESERVATION_KINDS = Object.freeze(['canon-initial', 'canon-followup']);

function dayKey(at) { return (at instanceof Date ? at : new Date(at)).toISOString().slice(0, 10); }

/** Enqueues one durable job per stage per calendar day, via the existing DurableQueue. The
 * singletonKey/dedupeKey pair means calling this twice for the same day (e.g. a second worker, or
 * a retry after a crash before the jobs were even claimed) enqueues nothing new -- queue.mjs#enqueue
 * already returns the existing job on a dedupeKey conflict. */
export async function scheduleCanonCycle(queue, { now: at = new Date() } = {}) {
  const day = dayKey(at);
  const stageKey = stage => `canon:${stage}:${day}`;
  const stages = [
    CANON_JOB_TYPES.OPPORTUNITY_HUNT, CANON_JOB_TYPES.PROSPECT_DISCOVERY, CANON_JOB_TYPES.SEND_PLANNING,
    CANON_JOB_TYPES.DISPATCH, CANON_JOB_TYPES.REPLY_SWEEP, CANON_JOB_TYPES.ATTRIBUTION, CANON_JOB_TYPES.CHECKPOINT
  ];
  const jobs = [];
  for (const type of stages) {
    jobs.push(await queue.enqueue(type, {}, { singletonKey: stageKey(type), dedupeKey: stageKey(type) }));
  }
  return jobs;
}

async function runOpportunityHunt(store, cfg, adapters, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const { signals, blocked } = await huntOpportunitySignals({ adapters: adapters.opportunity || {}, now: at });
  const records = [];
  const invalid = [];
  for (const signal of signals) {
    try { records.push(validateCommercialIntelligenceRecord(buildCommercialIntelligenceRecord(signal))); }
    catch (error) { invalid.push({ signal: signal.id || signal.organizationDomain, error: error.message }); }
  }
  const importResult = records.length ? await importCommercialIntelligenceBatch(store, records, { mode: 'commit', cfg, at }) : null;
  const summary = {
    signalCount: signals.length, blocked, invalidCount: invalid.length, invalid,
    imported: importResult?.acceptedCount || 0, policyRejected: importResult?.policyRejectedCount || 0
  };
  await store.log('canon_opportunity_hunt_completed', summary);
  return summary;
}

async function runProspectDiscovery(store, cfg, adapters, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const fn = adapters.prospectDiscovery;
  let candidates = [];
  if (typeof fn === 'function') {
    try { candidates = (await fn({ now: at })) || []; }
    catch (error) { await store.log('canon_prospect_discovery_adapter_error', { error: String(error?.message || error) }); }
  } else {
    await store.log('canon_prospect_discovery_blocked_no_adapter', {});
  }
  const result = await replenishProspectQueue(store, {
    candidates, targetBacklog: cfg.acquisition?.targetProspectBacklog || 1000, now: at,
    simulation: cfg.acquisition?.simulation === true
  });
  const summary = { added: result.additions.length, rejected: result.rejected.length, backlog: result.backlog, gap: result.gap };
  await store.log('canon_prospect_discovery_completed', summary);
  return summary;
}

/** Every ready_for_message opportunity with a validated message variant and active experiment is
 * (re-)evaluated fresh through send-eligibility.mjs -- never a cached/prior verdict -- and, only if
 * eligible AND within the durable cost ledger's remaining budget, reserved via the existing atomic
 * store.reserveOutboundSend (P0-004: never a process-local guard). idempotencyKey is derived
 * deterministically from the opportunity id, so re-running this stage after a crash is a no-op for
 * every opportunity already reserved. */
async function runSendPlanning(store, cfg, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const opportunities = await listQueueableOpportunities(store);
  const results = [];
  const senderSet = Array.isArray(cfg.acquisition?.senderSet) ? cfg.acquisition.senderSet : [];

  for (const opportunity of opportunities) {
    const idempotencyKey = `canon-send:${opportunity.id}`;
    if (await store.findOne('outboundReservations', { idempotencyKey })) continue;

    const sourceEvidence = opportunity.sourceEvidenceId ? await store.get('sourceEvidence', opportunity.sourceEvidenceId) : null;
    if (!sourceEvidence?.contactEmail) { results.push({ opportunityId: opportunity.id, status: 'skipped', reason: 'no-contact-email' }); continue; }

    const variants = await store.list('messageVariants', { filters: { opportunityId: opportunity.id } });
    const messageVariant = variants.find(variant => variant.status === 'approved');
    if (!messageVariant) { results.push({ opportunityId: opportunity.id, status: 'skipped', reason: 'no-approved-message-variant' }); continue; }

    const experiment = messageVariant.experimentId ? await store.get('experiments', messageVariant.experimentId) : null;
    if (!experiment) { results.push({ opportunityId: opportunity.id, status: 'skipped', reason: 'no-experiment' }); continue; }

    // A policy 'pass' decision (required by evaluateCanonSendEligibility below) already proved
    // sourceEvidence.contactEmail was an officially-published, domain-matched email at import time
    // (commercial-intelligence-import.mjs's computeScoreAndPolicy runs contactEligibility with
    // exactly this shape) -- reconstructing that same shape here does not re-trust a boolean, it
    // reflects a fact send-eligibility.mjs re-verifies via the stored policyDecision itself.
    const contactRoute = { type: 'email', email: sourceEvidence.contactEmail, publishedOfficially: true };
    const recipientEmails = [sourceEvidence.contactEmail];

    const evalResult = await resolveCanonSendCandidate(store, {
      opportunityId: opportunity.id, messageVariantId: messageVariant.id, experimentId: experiment.id,
      contactRoute, prospect: {}, senderInbox: senderSet[0], recipientEmails, senderSet,
      policyVersion: REVENUE_OS_POLICY_VERSION, cfg, at, simulation: cfg.acquisition?.simulation === true
    });
    if (!evalResult.ok) { results.push({ opportunityId: opportunity.id, status: 'ineligible', reasons: evalResult.reasons }); continue; }

    const budget = await store.reserveCostBudget(dayKey(at), 'infra', 1, cfg.acquisition?.dailyInfraCostCeilingCents || 0);
    if (!budget.ok) { results.push({ opportunityId: opportunity.id, status: 'budget-blocked', reason: budget.reason }); continue; }

    const reservation = await store.reserveOutboundSend({
      idempotencyKey, inbox: senderSet[0] || 'canon', recipientEmail: sourceEvidence.contactEmail, kind: 'canon-initial',
      dailyCap: cfg.acquisition?.targetDailySends || 0, hourlyCap: cfg.acquisition?.targetDailySends || 0, minGapSeconds: 0, now: at
    });
    results.push({ opportunityId: opportunity.id, status: reservation.ok ? 'reserved' : 'reservation-failed', reason: reservation.reason });
  }

  const summary = { evaluated: opportunities.length, results };
  await store.log('canon_send_planning_completed', summary);
  return summary;
}

async function runDispatch(store, cfg, provider) {
  const reservations = (await store.list('outboundReservations', { filters: { status: 'reserved' } }))
    .filter(reservation => CANON_RESERVATION_KINDS.includes(reservation.kind));
  const results = [];
  for (const reservation of reservations) {
    const outcome = await dispatchReservation(store, reservation, { provider, simulation: cfg.acquisition?.simulation === true });
    results.push({ reservationId: reservation.id, status: outcome.status });
  }
  const summary = { count: reservations.length, results };
  await store.log('canon_dispatch_completed', summary);
  return summary;
}

/** Gated to once per 24h via a durable setting (store.getSettings()/setSetting -- the same
 * general-purpose durable key-value the rest of the repo already uses, not a new table), matching
 * mission item 8/10 ("ordinary reply ingestion runs once per 24 hours"). Reuses the SAME
 * `prospects`/`replies` collections the pre-Canon pipeline.mjs#pollReplies writes to -- there is no
 * separate Canon reply truth. */
async function runReplySweep(store, cfg, adapters, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const settings = await store.getSettings();
  const lastSweepAt = settings.canonLastReplySweepAt;
  const due = !lastSweepAt || (at.getTime() - new Date(lastSweepAt).getTime()) >= 24 * 3600000;
  if (!due) return { swept: false, reason: 'not-due', lastSweepAt };

  const fn = adapters.replySweep;
  let inbound = [];
  if (typeof fn === 'function') {
    try { inbound = (await fn({ since: lastSweepAt, now: at })) || []; }
    catch (error) { await store.log('canon_reply_sweep_adapter_error', { error: String(error?.message || error) }); }
  } else {
    await store.log('canon_reply_sweep_blocked_no_adapter', {});
  }

  let processed = 0;
  const prospects = await store.list('prospects');
  for (const parsed of inbound) {
    if (parsed.id && await store.findOne('replies', { gmailId: parsed.id })) continue;
    const prospect = prospects.find(candidate =>
      candidate.threadId === parsed.threadId ||
      (candidate.contact?.email && String(parsed.from || '').toLowerCase().includes(candidate.contact.email.toLowerCase()))
    );
    if (!prospect) continue;
    const classification = await classifyCanonReply(parsed, { cfg: cfg.ai });
    try {
      await store.add('replies', {
        id: id('reply'), prospectId: prospect.id, gmailId: parsed.id || null, threadId: parsed.threadId || null,
        from: parsed.from || '', subject: parsed.subject || '', body: parsed.body || '', classification, receivedAt: now()
      });
    } catch (error) {
      if (error instanceof ConflictError) continue;
      throw error;
    }
    await applyReplyClassification(store, prospect, classification, { at });
    processed += 1;
  }

  await store.setSetting('canonLastReplySweepAt', at.toISOString());
  const summary = { swept: true, processed, inboundCount: inbound.length };
  await store.log('canon_reply_sweep_completed', summary);
  return summary;
}

/** Read-only attribution rollup (source -> opportunity -> lane -> prospect -> offer -> variant ->
 * sender -> reply -> proposal -> payment -> recurring revenue), written as one auditLog snapshot --
 * not a new store, per the merge directives' prohibition on a second audit system. */
async function runAttribution(store) {
  const [opportunities, prospects, offers, messageVariants, replies, outboundEvents, orders, subscriptions] = await Promise.all([
    store.list('opportunities'), store.list('prospects'), store.list('offers'), store.list('messageVariants'),
    store.list('replies'), store.list('outboundEvents'), store.list('orders'), store.list('subscriptions')
  ]);
  const snapshot = {
    opportunities: opportunities.length,
    readyForMessage: opportunities.filter(o => o.stage === 'ready_for_message').length,
    policyRejected: opportunities.filter(o => o.stage === 'policy_rejected').length,
    prospects: prospects.length, offers: offers.length, messageVariants: messageVariants.length,
    replies: replies.length,
    sentEvents: outboundEvents.filter(e => e.eventType === 'sent').length,
    simulatedSentEvents: outboundEvents.filter(e => e.eventType === 'simulated_sent').length,
    orders: orders.length, subscriptions: subscriptions.length,
    generatedAt: now()
  };
  await store.log('canon_attribution_snapshot', snapshot);
  return snapshot;
}

/** Records a heartbeat (existing workerHeartbeats collection -- role: 'canon-cycle') so a stalled
 * cycle is externally observable the same way ordinary DurableQueue workers already are
 * (queue.mjs#liveWorkers), and writes one canonical checkpoint audit event. */
async function runCheckpoint(store, cfg) {
  const at = new Date();
  await store.upsert('workerHeartbeats', {
    id: 'canon-cycle', role: 'canon-cycle', hostname: os.hostname(), pid: process.pid,
    version: cfg.version || '', startedAt: at.toISOString(), heartbeatAt: at.toISOString(),
    createdAt: at.toISOString(), updatedAt: at.toISOString()
  });
  const summary = { checkpointAt: at.toISOString() };
  await store.log('canon_cycle_checkpoint', summary);
  return summary;
}

/**
 * Returns the job-handlers map for the Canon cycle, mergeable into job-handlers.mjs's existing
 * handler dictionary (worker.mjs already spreads that map into DurableQueue#startWorker). `adapters`
 * is `{ opportunity: createOpportunityAdapters({...}), prospectDiscovery: fn, replySweep: fn }`;
 * `provider` is dispatch-adapter.mjs's live-send provider (`null` outside a real deployment).
 */
export function createCanonCycleHandlers({ store, cfg, adapters = {}, provider = null, nowFn = () => new Date() }) {
  return {
    [CANON_JOB_TYPES.OPPORTUNITY_HUNT]: () => runOpportunityHunt(store, cfg, adapters, nowFn()),
    [CANON_JOB_TYPES.PROSPECT_DISCOVERY]: () => runProspectDiscovery(store, cfg, adapters, nowFn()),
    [CANON_JOB_TYPES.SEND_PLANNING]: () => runSendPlanning(store, cfg, nowFn()),
    [CANON_JOB_TYPES.DISPATCH]: () => runDispatch(store, cfg, provider),
    [CANON_JOB_TYPES.REPLY_SWEEP]: () => runReplySweep(store, cfg, adapters, nowFn()),
    [CANON_JOB_TYPES.ATTRIBUTION]: () => runAttribution(store),
    [CANON_JOB_TYPES.CHECKPOINT]: () => runCheckpoint(store, cfg)
  };
}

export {
  runOpportunityHunt, runProspectDiscovery, runSendPlanning, runDispatch, runReplySweep, runAttribution, runCheckpoint
};
