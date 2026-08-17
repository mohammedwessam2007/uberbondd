import { recoverStaleOutboundReservations } from './reservation-recovery.mjs';

// Bump when the summary's shape or derivation logic changes.
export const OPERATOR_SUMMARY_POLICY_VERSION = 'outbound-operator-summary-1.0.0';

const DEFAULT_AUDIT_LIMIT = 500;

function nextSafeAction({ killSwitchEnabled, globalPaused, staleCandidates, quarantinedTotal, reviewRequiredCount, pausedSenders }) {
  if (globalPaused) return 'Outbound is globally paused (settings.outboundPaused). No action needed unless the owner intends to resume.';
  if (staleCandidates > 0) return `Run the reservation recovery sweep: ${staleCandidates} reservation(s) are stale and awaiting classification.`;
  if (quarantinedTotal > 0) return `Review ${quarantinedTotal} quarantined reservation(s) with an unresolved provider outcome before any related retry.`;
  if (pausedSenders > 0) return `${pausedSenders} sender inbox(es) are health-paused; review outbound_events before resuming them.`;
  if (reviewRequiredCount > 0) return `${reviewRequiredCount} campaign(s)/decision(s) require explicit owner review (autoSend disabled) before any send.`;
  if (!killSwitchEnabled) return 'Outbound is structurally disabled (cfg.outbound.enabled/dryRun). No local preparation is blocked by this; enable it deliberately when ready for live sends.';
  return 'No blocking condition detected. Outbound is enabled and no stale/quarantined/paused state was found.';
}

// Read-only, deterministic. Never sends a notification, never contacts
// anyone; the return value is a structured report for a human operator to
// read (or a future control-tower surface to render), reusing existing
// models (outboundReservations, senderHealth, auditLog, campaigns, settings)
// rather than creating a parallel one.
export async function buildOutboundOperatorSummary({ store, cfg = {}, date = new Date(), auditLimit = DEFAULT_AUDIT_LIMIT } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();

  if (!store || typeof store.list !== 'function') {
    return { ok: false, reason: 'malformed-input-store', policyVersion: OPERATOR_SUMMARY_POLICY_VERSION, timestamp };
  }

  const [reservedRows, dispatchingRows, sentRows, cancelledRows, uncertainRows, senderHealthRows, campaigns, settings, recentAudit] = await Promise.all([
    store.list('outboundReservations', { filters: { status: 'reserved' } }),
    store.list('outboundReservations', { filters: { status: 'dispatching' } }),
    store.list('outboundReservations', { filters: { status: 'sent' } }),
    store.list('outboundReservations', { filters: { status: 'cancelled' } }),
    store.list('outboundReservations', { filters: { status: 'uncertain' } }),
    store.list('senderHealth'),
    store.list('campaigns'),
    store.getSettings(),
    store.list('auditLog', { orderBy: 'createdAt', direction: 'desc', limit: Math.max(0, Number(auditLimit) || DEFAULT_AUDIT_LIMIT) })
  ]);

  const recoveryPreview = await recoverStaleOutboundReservations({
    store, date: referenceDate,
    timeoutMs: cfg.outbound?.reservationRecoveryTimeoutMs,
    limit: cfg.outbound?.reservationRecoverySweepLimit,
    dryRun: true
  });

  const guardDecisions = recentAudit.filter(entry => entry.type === 'deliverability_guard_decision');
  const blockedActions = guardDecisions.filter(entry => entry.detail?.decision === 'DENY').length;
  const reviewRequiredDecisions = guardDecisions.filter(entry => entry.detail?.decision === 'REVIEW_REQUIRED').length;
  const duplicateReplayAttempts = guardDecisions.filter(entry =>
    (entry.detail?.receipt?.denyReasonCodes || []).some(code => String(code).startsWith('replay-idempotency-key'))
  ).length;
  const reportEmailBlocked = recentAudit.filter(entry => entry.type === 'report_email_audit' && entry.detail?.outcome === 'blocked').length;
  const reportEmailUncertain = recentAudit.filter(entry => entry.type === 'report_email_audit' && entry.detail?.outcome === 'uncertain').length;

  const pausedSenders = senderHealthRows.filter(item => item.paused);
  const reviewRequiredCampaigns = campaigns.filter(item => item.approved && !item.autoSend);

  const killSwitchEnabled = Boolean(cfg.outbound?.enabled && !cfg.outbound?.dryRun);
  const globalPaused = Boolean(settings?.outboundPaused);
  const staleCandidates = recoveryPreview.ok ? (recoveryPreview.counts.recoverable + recoveryPreview.counts.quarantined) : 0;

  return {
    ok: true,
    policyVersion: OPERATOR_SUMMARY_POLICY_VERSION,
    timestamp,
    reservations: {
      reserved: reservedRows.length,
      dispatching: dispatchingRows.length,
      sent: sentRows.length,
      cancelled: cancelledRows.length,
      unknownOutcome: uncertainRows.length,
      quarantined: uncertainRows.length
    },
    staleRecoveryPreview: {
      examined: recoveryPreview.ok ? recoveryPreview.counts.examined : 0,
      wouldRecover: recoveryPreview.ok ? recoveryPreview.counts.recoverable : 0,
      wouldQuarantine: recoveryPreview.ok ? recoveryPreview.counts.quarantined : 0,
      failedSafely: recoveryPreview.ok ? recoveryPreview.counts.failedSafely : 0
    },
    duplicateReplayAttempts,
    blockedActions,
    reviewRequired: {
      recentGuardDecisions: reviewRequiredDecisions,
      campaignsAwaitingApproval: reviewRequiredCampaigns.length
    },
    transactionalReportEmail: {
      blockedRecently: reportEmailBlocked,
      unresolvedOutcomesRecently: reportEmailUncertain
    },
    killSwitch: {
      outboundStructurallyEnabled: killSwitchEnabled,
      globalOutboundPaused: globalPaused
    },
    providerHealth: {
      pausedSenderCount: pausedSenders.length,
      pausedSenders: pausedSenders.map(item => ({ inbox: item.inbox, reason: item.pauseReason || 'unknown', pausedAt: item.pausedAt || null }))
    },
    nextSafeAction: nextSafeAction({
      killSwitchEnabled, globalPaused, staleCandidates,
      quarantinedTotal: uncertainRows.length, reviewRequiredCount: reviewRequiredDecisions + reviewRequiredCampaigns.length,
      pausedSenders: pausedSenders.length
    })
  };
}
