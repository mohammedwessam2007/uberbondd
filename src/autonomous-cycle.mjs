// Canon/V3 integration -- premerge audit P0-001 (durability), repaired per PR #7 repair findings
// C-P0-001 (real runtime wiring), C-P0-002 (durable stage ordering), C-P0-004 (pre-dispatch
// recheck), C-P0-005 (canonical message persistence), C-P0-006 (attribution linkage).
//
// The first version of this module enqueued all seven stage jobs for a day up front, with only a
// same-day dedupeKey each -- an independent review correctly found that with queue concurrency
// greater than one, DurableQueue.runOnce can claim and execute several of those jobs in the same
// tick, so nothing actually prevented `dispatch` from running before `send_planning` populated
// anything, or `attribution` before `dispatch` produced events. This version enqueues only the
// FIRST stage; every stage handler enqueues the NEXT stage itself, with the same cycleRunId,
// only after its own work completes successfully. At any instant at most one Canon stage job for a
// given day can exist in the queue at all -- downstream stages are not merely unlikely to run
// early, they do not exist as jobs yet. A crash mid-stage is resumed by DurableQueue's existing
// lease/heartbeat/recoverStaleJobs machinery (unchanged, see tests/autonomous-cycle.test.mjs's
// worker-killed-mid-stage test) and, once the recovered job completes, the chain continues exactly
// once (the next-stage enqueue call uses a stable singletonKey/dedupeKey, so even a duplicate
// enqueue attempt after a partial crash just returns the one existing job).
//
// KNOWN LIMITATION (disclosed, not hidden): `adapters.prospectDiscovery` and `adapters.replySweep`
// (like every opportunity-hunter.mjs adapter) default to disabled in this sandbox -- there is no
// live hiring-board/procurement/marketplace/Gmail credential wired in here. Each stage reports
// itself as blocked-not-configured rather than fabricating signals, exactly like
// opportunity-hunter.mjs.
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
import { claimCohortSeat, releaseCohortSeat, markCohortSeatTouched } from './campaign-activation.mjs';

export const CANON_JOB_TYPES = Object.freeze({
  OPPORTUNITY_HUNT: 'canon.cycle.opportunity_hunt',
  PROSPECT_DISCOVERY: 'canon.cycle.prospect_discovery',
  SEND_PLANNING: 'canon.cycle.send_planning',
  DISPATCH: 'canon.cycle.dispatch',
  REPLY_SWEEP: 'canon.cycle.reply_sweep',
  ATTRIBUTION: 'canon.cycle.attribution',
  CHECKPOINT: 'canon.cycle.checkpoint'
});

// The durable stage order this integration guarantees. `nextStageOf` is the ONLY place that order
// is encoded -- scheduleCanonCycle enqueues STAGE_ORDER[0]; every handler enqueues STAGE_ORDER[i+1].
const STAGE_ORDER = Object.freeze([
  CANON_JOB_TYPES.OPPORTUNITY_HUNT, CANON_JOB_TYPES.PROSPECT_DISCOVERY, CANON_JOB_TYPES.SEND_PLANNING,
  CANON_JOB_TYPES.DISPATCH, CANON_JOB_TYPES.REPLY_SWEEP, CANON_JOB_TYPES.ATTRIBUTION, CANON_JOB_TYPES.CHECKPOINT
]);
function nextStageOf(type) {
  const index = STAGE_ORDER.indexOf(type);
  return index >= 0 && index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null;
}

const CANON_RESERVATION_KINDS = Object.freeze(['canon-initial', 'canon-followup']);

function dayKey(at) { return (at instanceof Date ? at : new Date(at)).toISOString().slice(0, 10); }

/** Enqueues ONLY the first stage of a new cycle run -- see the module doc comment for why the
 * other six are deliberately not enqueued here. `cycleRunId` is carried through every stage's
 * payload so a full cycle's jobs/audit entries can be correlated even though they exist as
 * separate durable jobs, not one in-memory run object. */
export async function scheduleCanonCycle(queue, { now: at = new Date() } = {}) {
  const day = dayKey(at);
  const cycleRunId = id('cycle');
  const firstStage = STAGE_ORDER[0];
  const payload = { cycleRunId, day, now: (at instanceof Date ? at : new Date(at)).toISOString() };
  const key = `canon:cycle:${day}:${firstStage}`;
  return queue.enqueue(firstStage, payload, { singletonKey: key, dedupeKey: key });
}

async function runOpportunityHunt(store, cfg, adapters, at) {
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

async function runProspectDiscovery(store, cfg, adapters, at) {
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

/**
 * Every ready_for_message opportunity with an approved message variant and active experiment is
 * (re-)evaluated fresh through send-eligibility.mjs -- never a cached/prior verdict. PR #7 repair:
 * eligibility is now checked against a cohort SEAT (campaign-activation.mjs's frozen-membership
 * model), which is atomically claimed (never re-derived from a full-batch hash comparison that
 * could never match a single recipient -- C-P0-003), and every reservation is durably patched with
 * its full canonical message identity and attribution linkage (C-P0-005, C-P0-006) before this
 * stage considers the candidate done.
 */
async function runSendPlanning(store, cfg, at) {
  const opportunities = await listQueueableOpportunities(store);
  const results = [];
  const senderSet = Array.isArray(cfg.acquisition?.senderSet) ? cfg.acquisition.senderSet : [];

  for (const opportunity of opportunities) {
    const idempotencyKey = `canon-send:${opportunity.id}`;
    if (await store.findOne('outboundReservations', { idempotencyKey })) continue;

    const sourceEvidence = opportunity.sourceEvidenceId ? await store.get('sourceEvidence', opportunity.sourceEvidenceId) : null;
    if (!sourceEvidence?.contactEmail) { results.push({ opportunityId: opportunity.id, status: 'skipped', reason: 'no-contact-email' }); continue; }
    const organizationDomain = sourceEvidence.organizationDomain;

    const variants = await store.list('messageVariants', { filters: { opportunityId: opportunity.id } });
    const messageVariant = variants.find(variant => variant.status === 'approved');
    if (!messageVariant) { results.push({ opportunityId: opportunity.id, status: 'skipped', reason: 'no-approved-message-variant' }); continue; }

    const experiment = messageVariant.experimentId ? await store.get('experiments', messageVariant.experimentId) : null;
    if (!experiment) { results.push({ opportunityId: opportunity.id, status: 'skipped', reason: 'no-experiment' }); continue; }

    // A policy 'pass' decision (required below) already proved sourceEvidence.contactEmail was an
    // officially-published, domain-matched email at import time (see commercial-intelligence-import.mjs's
    // computeScoreAndPolicy) -- reconstructing that same shape here reflects a fact send-eligibility.mjs
    // re-verifies via the stored policyDecision itself, not a re-trusted boolean.
    const contactRoute = { type: 'email', email: sourceEvidence.contactEmail, publishedOfficially: true };

    const evalResult = await resolveCanonSendCandidate(store, {
      opportunityId: opportunity.id, messageVariantId: messageVariant.id, experimentId: experiment.id,
      contactRoute, prospect: {}, senderInbox: senderSet[0], organizationDomain, senderSet,
      policyVersion: REVENUE_OS_POLICY_VERSION, cfg, at, simulation: cfg.acquisition?.simulation === true,
      expectedMemberStatus: 'pending'
    });
    if (!evalResult.ok) { results.push({ opportunityId: opportunity.id, status: 'ineligible', reasons: evalResult.reasons }); continue; }

    const claim = await claimCohortSeat(store, {
      cfg, experimentId: experiment.id, organizationDomain, recipientEmail: sourceEvidence.contactEmail,
      senderSet, policyVersion: REVENUE_OS_POLICY_VERSION, at
    });
    if (!claim.ok) { results.push({ opportunityId: opportunity.id, status: 'cohort-seat-unavailable', reason: claim.reason }); continue; }

    const budget = await store.reserveCostBudget(dayKey(at), 'infra', 1, cfg.acquisition?.dailyInfraCostCeilingCents || 0);
    if (!budget.ok) {
      await releaseCohortSeat(store, claim.approval.id, organizationDomain);
      results.push({ opportunityId: opportunity.id, status: 'budget-blocked', reason: budget.reason });
      continue;
    }

    const reservation = await store.reserveOutboundSend({
      idempotencyKey, inbox: senderSet[0] || 'canon', recipientEmail: sourceEvidence.contactEmail, kind: 'canon-initial',
      dailyCap: cfg.acquisition?.targetDailySends || 0, hourlyCap: cfg.acquisition?.targetDailySends || 0, minGapSeconds: 0, now: at
    });
    if (!reservation.ok) {
      await releaseCohortSeat(store, claim.approval.id, organizationDomain);
      results.push({ opportunityId: opportunity.id, status: 'reservation-failed', reason: reservation.reason });
      continue;
    }

    // C-P0-005: persist the canonical message identity/content and C-P0-006: the full attribution
    // chain on the reservation itself -- provider.send() (dispatch-adapter.mjs) receives this same
    // record, so it gets the exact approved payload, never a bare email reservation.
    await store.patch('outboundReservations', reservation.reservation.id, {
      messageVariantId: messageVariant.id, contentHash: messageVariant.bodyHash,
      subject: messageVariant.subject, body: messageVariant.body,
      opportunityId: opportunity.id, sourceEvidenceId: sourceEvidence.id, experimentId: experiment.id,
      lane: messageVariant.lane, organizationDomain, cohortApprovalId: claim.approval.id,
      policyVersion: REVENUE_OS_POLICY_VERSION, prospectId: opportunity.prospectId || null
    });
    await markCohortSeatTouched(store, claim.approval.id, organizationDomain, reservation.reservation.id);

    results.push({ opportunityId: opportunity.id, status: 'reserved', reservationId: reservation.reservation.id });
  }

  const summary = { evaluated: opportunities.length, results };
  await store.log('canon_send_planning_completed', summary);
  return summary;
}

/**
 * C-P0-004: immediately before invoking a live/simulated provider, every reservation is
 * transactionally re-evaluated through the SAME canonical eligibility function send-planning used
 * -- suppression, terminal replies, approval/cohort expiry, sender health, and evidence freshness
 * are all re-checked fresh (never the verdict computed when the reservation was created). A
 * global outbound pause is checked explicitly too. Any now-ineligible reservation is cancelled;
 * `dispatchReservation` (and therefore any live/simulated provider) is never called for it.
 */
async function runDispatch(store, cfg, provider, at) {
  const reservations = (await store.list('outboundReservations', { filters: { status: 'reserved' } }))
    .filter(reservation => CANON_RESERVATION_KINDS.includes(reservation.kind));
  const senderSet = Array.isArray(cfg.acquisition?.senderSet) ? cfg.acquisition.senderSet : [];
  const results = [];

  for (const reservation of reservations) {
    const settings = await store.getSettings();
    if (settings.outboundPaused === true) {
      await store.markOutboundReservation(reservation.id, 'cancelled', { cancelReason: 'global-outbound-paused' });
      await store.log('canon_dispatch_cancelled_pre_send_recheck', { reservationId: reservation.id, reasons: ['global-outbound-paused'] });
      results.push({ reservationId: reservation.id, status: 'cancelled', reasons: ['global-outbound-paused'] });
      continue;
    }

    const prospect = reservation.prospectId ? (await store.get('prospects', reservation.prospectId)) || {} : {};
    const recheck = await resolveCanonSendCandidate(store, {
      opportunityId: reservation.opportunityId, messageVariantId: reservation.messageVariantId, experimentId: reservation.experimentId,
      contactRoute: { type: 'email', email: reservation.recipientEmail, publishedOfficially: true }, prospect,
      senderInbox: reservation.inbox, organizationDomain: reservation.organizationDomain, senderSet,
      policyVersion: reservation.policyVersion, cfg, at, simulation: cfg.acquisition?.simulation === true,
      expectedMemberStatus: 'touched'
    });
    if (!recheck.ok) {
      await store.markOutboundReservation(reservation.id, 'cancelled', { cancelReason: recheck.reasons.join(',') });
      await store.log('canon_dispatch_cancelled_pre_send_recheck', { reservationId: reservation.id, reasons: recheck.reasons });
      results.push({ reservationId: reservation.id, status: 'cancelled', reasons: recheck.reasons });
      continue;
    }

    const outcome = await dispatchReservation(store, reservation, { provider, simulation: cfg.acquisition?.simulation === true });
    results.push({ reservationId: reservation.id, status: outcome.status });
  }

  const summary = { count: reservations.length, results };
  await store.log('canon_dispatch_completed', summary);
  return summary;
}

/** Gated to once per 24h via a durable setting (store.getSettings()/setSetting -- the same
 * general-purpose durable key-value the rest of the repo already uses, not a new table). Reuses
 * the SAME `prospects`/`replies` collections the pre-Canon pipeline.mjs#pollReplies writes to --
 * there is no separate Canon reply truth. The chain still advances to attribution/checkpoint on a
 * not-due day; only the sweep's own business logic is skipped. */
async function runReplySweep(store, cfg, adapters, at) {
  const settings = await store.getSettings();
  const lastSweepAt = settings.canonLastReplySweepAt;
  const due = !lastSweepAt || (at.getTime() - new Date(lastSweepAt).getTime()) >= 24 * 3600000;
  if (!due) { await store.log('canon_reply_sweep_completed', { swept: false, reason: 'not-due', lastSweepAt }); return { swept: false, reason: 'not-due', lastSweepAt }; }

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

/** Read-only attribution rollup. C-P0-006 repair: in addition to the aggregate snapshot (kept for
 * a cheap dashboard-style count), every reservation created this run is proven individually
 * reconstructable via attribution-chain.mjs -- not just counted. */
async function runAttribution(store) {
  const [opportunities, prospects, offers, messageVariants, replies, outboundEvents, orders, subscriptions, reservations] = await Promise.all([
    store.list('opportunities'), store.list('prospects'), store.list('offers'), store.list('messageVariants'),
    store.list('replies'), store.list('outboundEvents'), store.list('orders'), store.list('subscriptions'),
    store.list('outboundReservations', { filters: { kind: 'canon-initial' } })
  ]);
  const attributionComplete = reservations.every(reservation =>
    reservation.opportunityId && reservation.sourceEvidenceId && reservation.experimentId &&
    reservation.messageVariantId && reservation.cohortApprovalId
  );
  const snapshot = {
    opportunities: opportunities.length,
    readyForMessage: opportunities.filter(o => o.stage === 'ready_for_message').length,
    policyRejected: opportunities.filter(o => o.stage === 'policy_rejected').length,
    prospects: prospects.length, offers: offers.length, messageVariants: messageVariants.length,
    replies: replies.length,
    sentEvents: outboundEvents.filter(e => e.eventType === 'sent').length,
    simulatedSentEvents: outboundEvents.filter(e => e.eventType === 'simulated_sent').length,
    orders: orders.length, subscriptions: subscriptions.length,
    canonReservations: reservations.length, attributionComplete,
    generatedAt: now()
  };
  await store.log('canon_attribution_snapshot', snapshot);
  return snapshot;
}

/** Records a heartbeat (existing workerHeartbeats collection -- role: 'canon-cycle') so a stalled
 * cycle is externally observable the same way ordinary DurableQueue workers already are
 * (queue.mjs#liveWorkers), and writes one canonical checkpoint audit event carrying the day this
 * cycle simulated/ran for. */
async function runCheckpoint(store, cfg, at, day) {
  await store.upsert('workerHeartbeats', {
    id: 'canon-cycle', role: 'canon-cycle', hostname: os.hostname(), pid: process.pid,
    version: cfg.version || '', startedAt: at.toISOString(), heartbeatAt: at.toISOString(),
    createdAt: at.toISOString(), updatedAt: at.toISOString()
  });
  const summary = { checkpointAt: at.toISOString(), day };
  await store.log('canon_cycle_checkpoint', summary);
  return summary;
}

const STAGE_RUNNERS = Object.freeze({
  [CANON_JOB_TYPES.OPPORTUNITY_HUNT]: (store, cfg, adapters, at) => runOpportunityHunt(store, cfg, adapters, at),
  [CANON_JOB_TYPES.PROSPECT_DISCOVERY]: (store, cfg, adapters, at) => runProspectDiscovery(store, cfg, adapters, at),
  [CANON_JOB_TYPES.SEND_PLANNING]: (store, cfg, adapters, at) => runSendPlanning(store, cfg, at),
  [CANON_JOB_TYPES.DISPATCH]: (store, cfg, adapters, at, provider) => runDispatch(store, cfg, provider, at),
  [CANON_JOB_TYPES.REPLY_SWEEP]: (store, cfg, adapters, at) => runReplySweep(store, cfg, adapters, at),
  [CANON_JOB_TYPES.ATTRIBUTION]: (store, cfg) => runAttribution(store),
  [CANON_JOB_TYPES.CHECKPOINT]: (store, cfg, adapters, at, provider, day) => runCheckpoint(store, cfg, at, day)
});

/**
 * Returns the job-handlers map for the Canon cycle, mergeable into job-handlers.mjs's existing
 * handler dictionary (worker.mjs spreads that map into DurableQueue#startWorker). `adapters` is
 * `{ opportunity: createOpportunityAdapters({...}), prospectDiscovery: fn, replySweep: fn }`;
 * `provider` is dispatch-adapter.mjs's live-send provider (`null` outside a real deployment).
 * `queue` is required -- each handler enqueues the next stage itself (see module doc comment).
 */
export function createCanonCycleHandlers({ store, cfg, queue, adapters = {}, provider = null }) {
  if (!queue) throw new Error('createCanonCycleHandlers requires a queue (DurableQueue) so each stage can enqueue the next one');
  const handlers = {};
  for (const type of STAGE_ORDER) {
    handlers[type] = async payload => {
      const at = new Date(payload?.now || Date.now());
      const day = payload?.day || dayKey(at);
      const result = await STAGE_RUNNERS[type](store, cfg, adapters, at, provider, day);
      const next = nextStageOf(type);
      if (next) {
        const key = `canon:cycle:${day}:${next}`;
        await queue.enqueue(next, { cycleRunId: payload?.cycleRunId, day, now: payload?.now }, { singletonKey: key, dedupeKey: key });
      }
      return result;
    };
  }
  return handlers;
}

export {
  STAGE_ORDER, nextStageOf,
  runOpportunityHunt, runProspectDiscovery, runSendPlanning, runDispatch, runReplySweep, runAttribution, runCheckpoint
};
