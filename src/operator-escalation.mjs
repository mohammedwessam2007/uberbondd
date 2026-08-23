import crypto from 'node:crypto';
import { collectAuditRows } from './durable-audit-scan.mjs';
import { DELIVERY_PROOF, PAGE_AUDIT_TYPE } from './operator-escalation-transport.mjs';

export const OPERATOR_ESCALATION_POLICY_VERSION = 'operator-escalation-1.2.0';

export const ESCALATION_AUDIT_TYPE = 'operator_escalation';

// An episode ends when the condition stops being observed. Without this row the
// ledger only ever grows, so `activeFingerprints` meant "every fingerprint ever
// raised" and a condition that recurred after recovering was suppressed by its
// own history. Probed: scheduler silent, silent, silent, healthy, healthy,
// silent, silent produced one durable SCHEDULER_SILENT row for two real
// episodes -- the second outage was never escalated to anyone.
export const ESCALATION_RESOLVED_AUDIT_TYPE = 'operator_escalation_resolved';

export const OPERATOR_ESCALATION_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const SEVERITY_RANK = Object.freeze({
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2
});

const MAX_ESCALATIONS = 3;
const MAX_REASON_CODES = 20;
const MAX_EVIDENCE_REFS = 20;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function boundedStrings(values, max) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 300)).filter(Boolean))].slice(0, max);
}

function parseDate(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function incident({
  type,
  severity,
  reasonCodes = [],
  evidenceRefs = [],
  recommendedAction,
  detail = null
}) {
  const normalizedType = text(type, 100).toUpperCase();
  const normalizedSeverity = SEVERITY_RANK[severity] == null ? 'WARNING' : severity;
  const normalizedReasons = boundedStrings(reasonCodes, MAX_REASON_CODES).sort();
  const normalizedEvidence = boundedStrings(evidenceRefs, MAX_EVIDENCE_REFS).sort();
  const fingerprint = stableHash({
    type: normalizedType,
    severity: normalizedSeverity,
    reasonCodes: normalizedReasons,
    evidenceRefs: normalizedEvidence
  });

  return {
    type: normalizedType,
    severity: normalizedSeverity,
    reasonCodes: normalizedReasons,
    evidenceRefs: normalizedEvidence,
    recommendedAction: text(recommendedAction, 500),
    detail,
    fingerprint
  };
}

function schedulerIncidents(snapshot, now) {
  const scheduler = snapshot?.scheduler || {};
  if (scheduler.enabled !== true) return [];

  const expectedIntervalMinutes = Math.max(1, nonNegativeInteger(scheduler.expectedIntervalMinutes, 60));
  const lastTerminal = parseDate(scheduler.lastTerminalAt);
  if (!lastTerminal) {
    return [incident({
      type: 'SCHEDULER_NO_TERMINAL_RECEIPT',
      severity: 'CRITICAL',
      reasonCodes: ['scheduler-enabled', 'terminal-receipt-missing'],
      evidenceRefs: scheduler.evidenceRefs,
      recommendedAction: 'Inspect the scheduler and mesh-cycle receipt path before relying on device-off operation.'
    })];
  }

  const ageMinutes = Math.floor((now.getTime() - lastTerminal.getTime()) / 60000);
  if (ageMinutes < 0) {
    return [incident({
      type: 'SCHEDULER_FUTURE_RECEIPT',
      severity: 'CRITICAL',
      reasonCodes: ['terminal-receipt-in-future'],
      evidenceRefs: scheduler.evidenceRefs,
      recommendedAction: 'Investigate clock skew or invalid receipt timestamps before trusting duration evidence.',
      detail: { ageMinutes }
    })];
  }

  const overdueThreshold = expectedIntervalMinutes * 3;
  if (ageMinutes > overdueThreshold) {
    return [incident({
      type: 'SCHEDULER_SILENT',
      severity: 'CRITICAL',
      reasonCodes: ['scheduler-enabled', 'terminal-receipt-overdue'],
      evidenceRefs: scheduler.evidenceRefs,
      recommendedAction: 'Inspect scheduler execution, worker availability, and the latest mesh-cycle receipts.',
      detail: { ageMinutes, expectedIntervalMinutes, overdueThresholdMinutes: overdueThreshold }
    })];
  }

  return [];
}

function queueIncidents(snapshot) {
  const queue = snapshot?.queue || {};
  const incidents = [];
  const openDeadLetters = nonNegativeInteger(queue.openDeadLetters);
  const abandonedCycles = nonNegativeInteger(queue.abandonedCycles);
  const stalledRuns = nonNegativeInteger(queue.stalledRuns);
  const strandedRuns = nonNegativeInteger(queue.strandedRuns);
  const exhaustedRuns = nonNegativeInteger(queue.exhaustedRuns);

  if (openDeadLetters > 0) {
    incidents.push(incident({
      type: 'OPEN_DEAD_LETTERS',
      severity: 'CRITICAL',
      reasonCodes: ['dead-letter-open'],
      evidenceRefs: queue.evidenceRefs,
      recommendedAction: 'Inspect and reconcile open dead-letter work before certifying unattended operation.',
      detail: { openDeadLetters }
    }));
  }
  if (abandonedCycles > 0) {
    incidents.push(incident({
      type: 'ABANDONED_MESH_CYCLES',
      severity: 'CRITICAL',
      reasonCodes: ['started-without-terminal'],
      evidenceRefs: queue.evidenceRefs,
      recommendedAction: 'Reconcile abandoned STARTED cycles into durable terminal receipts and investigate the crash boundary.',
      detail: { abandonedCycles }
    }));
  }
  if (stalledRuns + strandedRuns + exhaustedRuns > 0) {
    incidents.push(incident({
      type: 'AUTONOMY_WORK_NOT_PROGRESSING',
      severity: exhaustedRuns > 0 ? 'CRITICAL' : 'WARNING',
      reasonCodes: [
        ...(stalledRuns ? ['stalled-runs'] : []),
        ...(strandedRuns ? ['stranded-runs'] : []),
        ...(exhaustedRuns ? ['exhausted-runs'] : [])
      ],
      evidenceRefs: queue.evidenceRefs,
      recommendedAction: 'Inspect the affected autonomy runs and resolve the earliest durable blocker before adding more work.',
      detail: { stalledRuns, strandedRuns, exhaustedRuns }
    }));
  }
  return incidents;
}

function truthIncidents(snapshot) {
  const truth = snapshot?.truth || {};
  const unknownEffectKeys = nonNegativeInteger(truth.unknownEffectKeys);
  const nonZeroUnauthorizedEffects = nonNegativeInteger(truth.nonZeroUnauthorizedEffects);
  const secretScanFailures = nonNegativeInteger(truth.secretScanFailures);
  const incidents = [];

  if (unknownEffectKeys > 0 || nonZeroUnauthorizedEffects > 0) {
    incidents.push(incident({
      type: 'EFFECT_LEDGER_INTEGRITY_FAILURE',
      severity: 'CRITICAL',
      reasonCodes: [
        ...(unknownEffectKeys ? ['unknown-effect-keys'] : []),
        ...(nonZeroUnauthorizedEffects ? ['unauthorized-non-zero-effects'] : [])
      ],
      evidenceRefs: truth.evidenceRefs,
      recommendedAction: 'Stop consequential execution and inspect the effect ledger before trusting any success receipt.',
      detail: { unknownEffectKeys, nonZeroUnauthorizedEffects }
    }));
  }

  if (secretScanFailures > 0) {
    incidents.push(incident({
      type: 'SECRET_SCAN_FAILURE',
      severity: 'CRITICAL',
      reasonCodes: ['secret-scan-failed'],
      evidenceRefs: truth.evidenceRefs,
      recommendedAction: 'Quarantine the affected artifact or receipt and rotate credentials if exposure is confirmed.',
      detail: { secretScanFailures }
    }));
  }

  return incidents;
}

function commercialIncidents(snapshot) {
  const commercial = snapshot?.commercial || {};
  const reviewRequiredPayments = nonNegativeInteger(commercial.reviewRequiredPayments);
  const uncertainSends = nonNegativeInteger(commercial.uncertainSends);
  const complaintEvents = nonNegativeInteger(commercial.complaintEvents);
  const incidents = [];

  if (reviewRequiredPayments > 0) {
    incidents.push(incident({
      type: 'PAYMENT_REVIEW_REQUIRED',
      severity: 'WARNING',
      reasonCodes: ['payment-review-required'],
      evidenceRefs: commercial.evidenceRefs,
      recommendedAction: 'Review the unresolved payment classifications so a real payment cannot remain unfulfilled or misattributed.',
      detail: { reviewRequiredPayments }
    }));
  }

  if (uncertainSends > 0) {
    incidents.push(incident({
      type: 'UNCERTAIN_SEND_STATE',
      severity: 'WARNING',
      reasonCodes: ['send-outcome-uncertain'],
      evidenceRefs: commercial.evidenceRefs,
      recommendedAction: 'Reconcile uncertain send reservations before any retry or new send consumes the same logical consequence.',
      detail: { uncertainSends }
    }));
  }

  if (complaintEvents > 0) {
    incidents.push(incident({
      type: 'COMPLAINT_SIGNAL',
      severity: 'CRITICAL',
      reasonCodes: ['complaint-observed'],
      evidenceRefs: commercial.evidenceRefs,
      recommendedAction: 'Keep the affected route suppressed and inspect sender-health and campaign scope before any further outreach.',
      detail: { complaintEvents }
    }));
  }

  return incidents;
}

/**
 * Escalations that were raised and never reached a person.
 *
 * A monitoring system that detects a critical condition and cannot tell anyone
 * has two problems, and this is the second one. It was previously reported as
 * the string `transport: 'UNCONFIGURED'` inside a report nobody was paged about
 * -- which is the failure describing itself in a place only a reader who
 * already knew would look.
 */
function undeliveredIncidents(snapshot) {
  const paging = snapshot?.paging;
  if (!paging || typeof paging !== 'object') return [];
  const undelivered = nonNegativeInteger(paging.undeliveredEscalations, 0);
  if (!undelivered) return [];

  const noTransport = paging.deliveryProof === DELIVERY_PROOF.NO_TRANSPORT_CONFIGURED;
  return [incident({
    type: 'OWNER_UNREACHABLE',
    // Not being able to page is critical regardless of what could not be paged
    // about: the next condition is the one that matters, and it will be silent
    // too.
    severity: 'CRITICAL',
    reasonCodes: [
      'operator-escalations-undelivered',
      noTransport ? 'no-human-reachable-transport-configured' : 'human-reachable-transport-did-not-deliver'
    ],
    // Deliberately no evidenceRefs. The fingerprint is computed from type,
    // severity and reasonCodes plus evidenceRefs, so feeding it a list that
    // grows with the undelivered count would give this incident a new identity
    // every cycle -- a fresh escalation, forever, about being unable to send
    // escalations. The condition is "the owner cannot be reached"; how many
    // things are queued behind it is a measurement, and measurements belong in
    // detail, which is not fingerprinted.
    evidenceRefs: [],
    recommendedAction: noTransport
      ? 'Configure a transport that reaches a device the owner carries. Until then every escalation below is written down and nobody is told.'
      : 'A human-reachable transport is configured and is not delivering. Check it before trusting any quiet period.',
    detail: {
      undeliveredEscalations: undelivered,
      deliveryProof: text(paging.deliveryProof, 60) || null,
      oldestUndeliveredAt: text(paging.oldestUndeliveredAt, 40) || null,
      undeliveredRefs: boundedStrings(paging.evidenceRefs, MAX_EVIDENCE_REFS)
    }
  })];
}

export function evaluateOperatorHealth({
  snapshot = {},
  activeFingerprints = [],
  activeEpisodes = null,
  date = new Date(),
  maxEscalations = MAX_ESCALATIONS
} = {}) {
  const now = parseDate(date);
  if (!now) {
    return {
      ok: false,
      policyVersion: OPERATOR_ESCALATION_POLICY_VERSION,
      status: 'REJECTED',
      reasonCodes: ['valid-reference-time-required'],
      externalEffectLedger: { ...OPERATOR_ESCALATION_EXTERNAL_EFFECTS }
    };
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return {
      ok: false,
      policyVersion: OPERATOR_ESCALATION_POLICY_VERSION,
      status: 'REJECTED',
      reasonCodes: ['health-snapshot-object-required'],
      externalEffectLedger: { ...OPERATOR_ESCALATION_EXTERNAL_EFFECTS }
    };
  }

  const active = new Set(boundedStrings(activeFingerprints, 500));
  const candidates = [
    ...schedulerIncidents(snapshot, now),
    ...queueIncidents(snapshot),
    ...truthIncidents(snapshot),
    ...commercialIncidents(snapshot),
    ...undeliveredIncidents(snapshot)
  ];

  candidates.sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDelta) return severityDelta;
    return a.type.localeCompare(b.type);
  });

  const limit = Math.max(1, Math.min(MAX_ESCALATIONS, nonNegativeInteger(maxEscalations, MAX_ESCALATIONS) || MAX_ESCALATIONS));
  // Episode sequence, so two outages of the same kind are two escalations with
  // distinguishable identities rather than one row and a silence.
  const episodes = activeEpisodes instanceof Map ? activeEpisodes : new Map();
  const selected = candidates.slice(0, limit).map(candidate => ({
    ...candidate,
    episodeSequence: (episodes.get(candidate.fingerprint)?.sequence ?? 0) + (active.has(candidate.fingerprint) ? 0 : 1),
    escalationId: `operator_${candidate.fingerprint.slice(0, 24)}_${(episodes.get(candidate.fingerprint)?.sequence ?? 0) + (active.has(candidate.fingerprint) ? 0 : 1)}`,
    status: active.has(candidate.fingerprint) ? 'SUPPRESSED_DUPLICATE' : 'NEW_ESCALATION',
    ownerRequired: true,
    transportStatus: 'NOT_DISPATCHED',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...OPERATOR_ESCALATION_EXTERNAL_EFFECTS }
  }));

  const newEscalations = selected.filter(item => item.status === 'NEW_ESCALATION');
  return {
    ok: true,
    policyVersion: OPERATOR_ESCALATION_POLICY_VERSION,
    timestamp: now.toISOString(),
    health: candidates.length ? (candidates.some(item => item.severity === 'CRITICAL') ? 'CRITICAL' : 'DEGRADED') : 'HEALTHY',
    candidateCount: candidates.length,
    // Every condition present on this assessment, not just the three that fit
    // in the queue. A caller resolves episodes by difference: open episodes
    // whose fingerprint is absent here have stopped happening.
    observedFingerprints: [...new Set(candidates.map(candidate => candidate.fingerprint))],
    escalations: selected,
    newEscalationCount: newEscalations.length,
    ownerActionQueue: newEscalations.slice(0, 3).map(item => ({
      escalationId: item.escalationId,
      severity: item.severity,
      action: item.recommendedAction,
      reasonCodes: item.reasonCodes,
      evidenceRefs: item.evidenceRefs
    })),
    paging: {
      decision: newEscalations.length ? 'PAGE_OWNER_REQUIRED' : 'NO_NEW_PAGE_REQUIRED',
      // The decision is this module's to make. Whether anyone was reached is
      // not, and it is no longer asserted here as a literal: the caller
      // dispatches through src/operator-escalation-transport.mjs and feeds the
      // observed result back through `snapshot.paging` on the next assessment.
      transport: text(snapshot?.paging?.transport, 60) || 'UNCONFIGURED',
      deliveryProof: text(snapshot?.paging?.deliveryProof, 60) || DELIVERY_PROOF.NO_TRANSPORT_CONFIGURED,
      undeliveredEscalations: nonNegativeInteger(snapshot?.paging?.undeliveredEscalations, 0)
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...OPERATOR_ESCALATION_EXTERNAL_EFFECTS }
  };
}

export async function persistOperatorEscalations(store, report) {
  if (!store || typeof store.log !== 'function' || !report?.ok) return [];
  const persisted = [];
  for (const item of report.escalations || []) {
    if (item.status !== 'NEW_ESCALATION') continue;
    persisted.push(await store.log('operator_escalation', {
      policyVersion: report.policyVersion,
      escalationId: item.escalationId,
      fingerprint: item.fingerprint,
      severity: item.severity,
      type: item.type,
      reasonCodes: item.reasonCodes,
      evidenceRefs: item.evidenceRefs,
      recommendedAction: item.recommendedAction,
      detail: item.detail,
      episodeSequence: nonNegativeInteger(item.episodeSequence, 1) || 1,
      ownerRequired: true,
      transportStatus: 'NOT_DISPATCHED',
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...OPERATOR_ESCALATION_EXTERNAL_EFFECTS }
    }));
  }
  return persisted;
}

/**
 * Read back what has already been escalated, and what of it ever reached a
 * person.
 *
 * `evaluateOperatorHealth` has always accepted `activeFingerprints` to suppress
 * an escalation it has already raised. Nothing ever passed it. A probe running
 * ten mesh ticks against one unchanging condition wrote thirty durable
 * escalation rows for three real problems -- at an hourly cadence, seventy-two
 * duplicate pages a day for one fact that has not changed. That is not a
 * cosmetic defect: an alerting channel that repeats itself is one an operator
 * eventually stops reading, and the suppression this needed was already built
 * and simply never fed.
 *
 * Delivery is read from the page ledger rather than assumed. An escalation with
 * no page attempt at all counts as undelivered, because it is.
 */
export async function readEscalationDeliveryState(store, { date = new Date() } = {}) {
  if (!store || typeof store.list !== 'function') {
    return { ok: false, reasonCodes: ['store-list-required'], activeFingerprints: [], paging: null };
  }

  const escalations = await collectAuditRows(store, { type: ESCALATION_AUDIT_TYPE });
  if (!escalations.ok) {
    return { ok: false, reasonCodes: escalations.reasonCodes, activeFingerprints: [], paging: null };
  }
  const pages = await collectAuditRows(store, { type: PAGE_AUDIT_TYPE });
  if (!pages.ok) {
    return { ok: false, reasonCodes: pages.reasonCodes, activeFingerprints: [], paging: null };
  }

  const reachedFingerprints = new Set();
  let anyHumanTransportAttempted = false;
  for (const row of pages.rows) {
    const detail = row?.detail || {};
    if (Array.isArray(detail.attempts) && detail.attempts.some(attempt => attempt?.reachesHuman)) {
      anyHumanTransportAttempted = true;
    }
    if (detail.ownerReached === true) reachedFingerprints.add(text(detail.fingerprint, 200));
  }

  const resolutions = await collectAuditRows(store, { type: ESCALATION_RESOLVED_AUDIT_TYPE });
  if (!resolutions.ok) {
    return { ok: false, reasonCodes: resolutions.reasonCodes, activeFingerprints: [], paging: null };
  }

  // Fold escalations and resolutions into one lifecycle per fingerprint. The
  // last event wins: an escalation opens an episode, a resolution closes it,
  // and a fingerprint whose latest event is a resolution is not active -- so the
  // same condition recurring later opens a NEW episode and pages again.
  const lifecycle = new Map();
  const rank = row => `${String(row?.detail?.createdAt || row?.createdAt || '')}|${String(row?.id || '')}`;
  for (const row of [...escalations.rows, ...resolutions.rows]) {
    const fingerprint = text(row?.detail?.fingerprint, 200);
    if (!fingerprint) continue;
    const opened = row.type === ESCALATION_AUDIT_TYPE;
    const entry = lifecycle.get(fingerprint) || { open: false, sequence: 0, openedAt: null, lastRank: '' };
    const at = String(row?.detail?.createdAt || row?.createdAt || '');
    if (opened) {
      entry.sequence = Math.max(entry.sequence, nonNegativeInteger(row?.detail?.episodeSequence, 0) || entry.sequence + 1);
      if (!entry.open) entry.openedAt = at;
      entry.open = true;
    } else if (rank(row) >= entry.lastRank) {
      entry.open = false;
    }
    entry.lastRank = rank(row) > entry.lastRank ? rank(row) : entry.lastRank;
    lifecycle.set(fingerprint, entry);
  }

  const openFingerprints = [...lifecycle.entries()].filter(([, entry]) => entry.open).map(([fingerprint]) => fingerprint);
  // Only open episodes count as an undelivered gap. A resolved episode nobody
  // was told about is history worth keeping, not an outstanding action -- and
  // counting it forever would make OWNER_UNREACHABLE grow without bound.
  const undelivered = openFingerprints.filter(fingerprint => !reachedFingerprints.has(fingerprint));
  const oldestUndeliveredAt = undelivered
    .map(fingerprint => lifecycle.get(fingerprint)?.openedAt)
    .filter(Boolean)
    .sort()[0] || null;

  return {
    ok: true,
    policyVersion: OPERATOR_ESCALATION_POLICY_VERSION,
    // Only fingerprints whose episode is currently open. Raising an open
    // episode again adds a row and no information; raising a resolved one is a
    // new outage and must page.
    activeFingerprints: openFingerprints,
    activeEpisodes: lifecycle,
    resolvedEpisodeCount: [...lifecycle.values()].filter(entry => !entry.open).length,
    paging: {
      transport: anyHumanTransportAttempted ? 'HUMAN_REACHABLE_ATTEMPTED' : 'UNCONFIGURED',
      deliveryProof: reachedFingerprints.size
        ? DELIVERY_PROOF.HUMAN_DELIVERY_PROVEN
        : anyHumanTransportAttempted
          ? DELIVERY_PROOF.DELIVERY_INDETERMINATE
          : DELIVERY_PROOF.NO_TRANSPORT_CONFIGURED,
      undeliveredEscalations: undelivered.length,
      oldestUndeliveredAt,
      evidenceRefs: undelivered.slice(0, MAX_EVIDENCE_REFS).map(fingerprint => `escalation:${fingerprint.slice(0, 24)}`)
    },
    scannedRows: (escalations.scannedRows || 0) + (pages.scannedRows || 0),
    assessedAt: parseDate(date)?.toISOString() || new Date().toISOString()
  };
}

/**
 * Close every open episode whose condition is no longer observed.
 *
 * Resolution is by difference: `evaluateOperatorHealth` reports every condition
 * present on this assessment, and any open episode absent from that list has
 * stopped happening. This is what makes recurrence work -- without a resolution
 * row the ledger only grows, `activeFingerprints` means "ever raised", and a
 * condition that comes back after recovering is suppressed by its own history.
 *
 * Deliberately derived from the two audit types this module already writes
 * rather than from a separate incident store. An episode is a fold over the
 * escalation ledger, not a new subsystem with its own truth to keep in sync.
 *
 * A report that could not be produced resolves nothing. "We could not assess"
 * and "the problem went away" are the same silence from the outside, and only
 * one of them is a reason to stop paging.
 */
export async function resolveVanishedEscalations(store, report, deliveryState, { date = new Date() } = {}) {
  if (!store || typeof store.log !== 'function') return [];
  if (!report?.ok || !deliveryState?.ok) return [];
  if (!Array.isArray(report.observedFingerprints)) return [];

  const observed = new Set(report.observedFingerprints);
  const resolvedAt = parseDate(date)?.toISOString() || new Date().toISOString();
  const resolved = [];

  for (const fingerprint of deliveryState.activeFingerprints || []) {
    if (observed.has(fingerprint)) continue;
    const episode = deliveryState.activeEpisodes?.get?.(fingerprint);
    resolved.push(await store.log(ESCALATION_RESOLVED_AUDIT_TYPE, {
      policyVersion: OPERATOR_ESCALATION_POLICY_VERSION,
      fingerprint,
      episodeSequence: nonNegativeInteger(episode?.sequence, 1) || 1,
      openedAt: episode?.openedAt || null,
      resolvedAt,
      createdAt: resolvedAt,
      resolution: 'CONDITION_NO_LONGER_OBSERVED',
      externalEffectLedger: { ...OPERATOR_ESCALATION_EXTERNAL_EFFECTS }
    }));
  }
  return resolved;
}
