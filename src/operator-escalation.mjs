import crypto from 'node:crypto';

export const OPERATOR_ESCALATION_POLICY_VERSION = 'operator-escalation-1.0.0';

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

export function evaluateOperatorHealth({
  snapshot = {},
  activeFingerprints = [],
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
    ...commercialIncidents(snapshot)
  ];

  candidates.sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDelta) return severityDelta;
    return a.type.localeCompare(b.type);
  });

  const limit = Math.max(1, Math.min(MAX_ESCALATIONS, nonNegativeInteger(maxEscalations, MAX_ESCALATIONS) || MAX_ESCALATIONS));
  const selected = candidates.slice(0, limit).map(candidate => ({
    ...candidate,
    escalationId: `operator_${candidate.fingerprint.slice(0, 24)}`,
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
      transport: 'UNCONFIGURED',
      deliveryProof: 'NOT_AVAILABLE'
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
      ownerRequired: true,
      transportStatus: 'NOT_DISPATCHED',
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...OPERATOR_ESCALATION_EXTERNAL_EFFECTS }
    }));
  }
  return persisted;
}
