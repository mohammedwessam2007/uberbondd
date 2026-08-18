// Automatic circuit breakers for the domain/mailbox readiness system. Pure,
// deterministic: given current domain/mailbox state and measured signal
// counts, decides whether a pause is required and produces the receipt
// fields the mission requires (reason code, timestamp, affected scope,
// evidence references, safe recovery action, owner-required flag). This
// module never itself performs the pause -- callers persist the pause via
// src/sending-domain-registry.mjs#recordDomainPause /
// src/sending-mailbox-registry.mjs#recordMailboxPause.
export const CIRCUIT_BREAKER_POLICY_VERSION = 'domain-mailbox-circuit-breaker-1.0.0';

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function trigger(reasonCode, scope, evidenceRefs, safeRecoveryAction, ownerRequired = true) {
  return { reasonCode, scope, evidenceRefs, safeRecoveryAction, ownerRequired };
}

// domainState/mailboxState: the folded records from the registries.
// thresholds: { bounceRatePauseThreshold, complaintRatePauseThreshold }.
// sentCount: total sends this mailbox has attempted in the measurement
// window, supplied by the caller (this module never counts sends itself --
// that stays the existing outboundReservations/send-safety responsibility).
export function evaluateCircuitBreaker({
  domainState = null, mailboxState = null, thresholds = {}, sentCount = 0,
  duplicateReservationDetected = false, uncertainProviderOutcome = false,
  secretDetectedInLog = false, providerContractChanged = false,
  v9BypassAttempted = false, date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const triggers = [];

  if (v9BypassAttempted) {
    triggers.push(trigger('live-send-path-bypassed-v9', 'CAMPAIGN', [], 'Do not resume until the bypassed code path is fixed and reviewed.', true));
  }
  if (secretDetectedInLog) {
    triggers.push(trigger('credentials-appeared-in-log', 'GLOBAL', [], 'Rotate the exposed credential immediately, then purge the log entry.', true));
  }
  if (providerContractChanged) {
    triggers.push(trigger('provider-contract-changed', 'DOMAIN', [], 'Re-run DNS and mailbox verification against the new provider contract before resuming.', true));
  }

  if (domainState) {
    if (domainState.dnsState?.status === 'RED') triggers.push(trigger('dns-evidence-red', 'DOMAIN', [{ type: 'dns', status: domainState.dnsState.status }], 'Fix the missing/contradictory DNS records, then re-run verification.', true));
    if (domainState.evidenceFreshness === 'STALE') triggers.push(trigger('dns-evidence-expired', 'DOMAIN', [{ type: 'dns', lastVerifiedAt: domainState.dnsState?.lastVerifiedAt }], 'Re-run DNS verification to refresh evidence.', false));
  }

  if (mailboxState) {
    if (mailboxState.spfStatus === 'RED') triggers.push(trigger('spf-fails', 'MAILBOX', [{ type: 'spf' }], 'Fix the SPF record, then re-run mailbox authentication check.', true));
    if (mailboxState.dkimStatus === 'RED') triggers.push(trigger('dkim-fails', 'MAILBOX', [{ type: 'dkim' }], 'Fix the DKIM record, then re-run mailbox authentication check.', true));
    if (mailboxState.dmarcStatus === 'RED') triggers.push(trigger('dmarc-fails', 'MAILBOX', [{ type: 'dmarc' }], 'Publish a valid DMARC record, then re-run mailbox authentication check.', true));
    if (mailboxState.alignmentStatus === 'RED') triggers.push(trigger('alignment-fails', 'MAILBOX', [{ type: 'alignment' }], 'Fix SPF/DKIM alignment with the From domain.', true));
    if (mailboxState.authenticationStatus === 'AUTHENTICATION_LOST') triggers.push(trigger('mailbox-authentication-disappeared', 'MAILBOX', [], 'Re-authenticate the mailbox with the provider.', true));
    if (mailboxState.providerRateLimited) triggers.push(trigger('provider-rate-limit', 'MAILBOX', [], 'Wait for the provider-reported cooldown, then resume.', false));

    const bounceRate = sentCount > 0 ? mailboxState.bounceCount / sentCount : 0;
    const complaintRate = sentCount > 0 ? mailboxState.complaintCount / sentCount : 0;
    const bounceThreshold = Number.isFinite(thresholds.bounceRatePauseThreshold) ? thresholds.bounceRatePauseThreshold : 0.05;
    const complaintThreshold = Number.isFinite(thresholds.complaintRatePauseThreshold) ? thresholds.complaintRatePauseThreshold : 0.001;
    if (sentCount > 0 && bounceRate > bounceThreshold) {
      triggers.push(trigger('bounce-rate-exceeds-threshold', 'MAILBOX', [{ type: 'bounceRate', value: bounceRate, threshold: bounceThreshold }], 'Investigate list quality before resuming; do not simply retry.', true));
    }
    if (sentCount > 0 && complaintRate > complaintThreshold) {
      triggers.push(trigger('complaint-rate-exceeds-threshold', 'MAILBOX', [{ type: 'complaintRate', value: complaintRate, threshold: complaintThreshold }], 'Investigate message content/targeting before resuming; do not simply retry.', true));
    }
  } else {
    triggers.push(trigger('provider-health-unknown', 'MAILBOX', [], 'Register and authenticate the mailbox before it can send.', false));
  }

  if (duplicateReservationDetected) triggers.push(trigger('duplicate-reservation-detected', 'CAMPAIGN', [], 'Investigate the idempotency-key collision before resuming.', true));
  if (uncertainProviderOutcome) triggers.push(trigger('uncertain-provider-outcome', 'MAILBOX', [], 'Reconcile the uncertain send outcome before continuing.', true));

  return {
    ok: true,
    policyVersion: CIRCUIT_BREAKER_POLICY_VERSION,
    timestamp,
    shouldPause: triggers.length > 0,
    triggers,
    ownerRequired: triggers.some(t => t.ownerRequired)
  };
}
