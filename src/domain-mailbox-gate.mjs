// Deny-only pre-check composing with (never replacing) the existing
// Deliverability Guard (src/deliverability-guard.mjs) and OMNIA/V9
// (src/consequence-boundary.mjs). Mirrors the established V9-Guard
// composition contract: this gate can DENY or flag REVIEW_REQUIRED before
// either of those is even consulted, but its passing result is explicitly
// named to make "necessary, not sufficient" impossible to misread --
// NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE is not authorization to send anything.
//
// Required checks (section 9): domain readiness, mailbox readiness, DNS
// evidence, authentication evidence, suppression, prior-contact, evidence
// freshness, contactability, sender health, volume ceiling, campaign
// authorization, workspace isolation, policy decision. Suppression,
// prior-contact, contactability, and campaign authorization are already
// covered by the existing src/send-safety.mjs / src/deliverability-guard.mjs
// and are intentionally NOT duplicated here -- this gate only adds the
// checks those modules have no domain/mailbox concept to perform. Any
// unknown state fails closed to DENY.
export const DOMAIN_MAILBOX_GATE_POLICY_VERSION = 'domain-mailbox-gate-1.0.0';

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function deny(reasonCodes, timestamp, extra = {}) {
  return { decision: 'DENY', policyVersion: DOMAIN_MAILBOX_GATE_POLICY_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], timestamp, ...extra };
}

// domainState/mailboxState: folded registry records. workspaceId: the
// caller's workspace, checked for isolation against both records.
// volumeCeiling: { dailyCap, sentToday } -- read from the mailbox's own
// provider-confirmed cap, never invented here.
export function evaluateDomainMailboxGate({
  domainState = null, mailboxState = null, workspaceId = null, volumeCeiling = null, date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const deny_ = [];
  const review = [];

  if (!domainState) return deny(['domain-not-registered'], timestamp);
  if (!mailboxState) return deny(['mailbox-not-registered'], timestamp);
  if (workspaceId && (domainState.workspaceId !== workspaceId || mailboxState.workspaceId !== workspaceId)) {
    return deny(['workspace-isolation-violation'], timestamp);
  }

  if (domainState.state === 'PAUSED' || domainState.state === 'BLOCKED' || domainState.state === 'RETIRED') deny_.push(`domain-state:${domainState.state}`);
  if (mailboxState.paused) deny_.push('mailbox-paused');
  if (mailboxState.authenticationStatus !== 'AUTHENTICATED') deny_.push('mailbox-authentication-not-confirmed');
  if (!['GREEN', 'YELLOW'].includes(domainState.dnsState?.status)) deny_.push(`domain-dns-not-verified:${domainState.dnsState?.status || 'UNKNOWN'}`);
  if (domainState.evidenceFreshness === 'NONE') deny_.push('domain-dns-never-verified');
  else if (domainState.evidenceFreshness === 'STALE') review.push('domain-dns-evidence-stale');
  if (domainState.state === 'UNCERTAIN') deny_.push('domain-state-uncertain');

  if (domainState.state !== 'READY_FOR_LIMITED_OUTREACH' || domainState.outreachState !== 'AUTHORIZED') {
    deny_.push('cold-outreach-not-yet-owner-authorized-for-this-domain');
  }

  if (volumeCeiling) {
    const cap = Number(volumeCeiling.dailyCap);
    const sent = Number(volumeCeiling.sentToday);
    if (!Number.isFinite(cap) || cap <= 0) deny_.push('volume-ceiling-unknown-or-zero');
    else if (Number.isFinite(sent) && sent >= cap) deny_.push('volume-ceiling-exceeded');
  } else {
    deny_.push('volume-ceiling-not-supplied');
  }

  if (deny_.length) return deny(deny_, timestamp, { reviewReasonCodes: review });
  if (review.length) return { decision: 'REVIEW_REQUIRED', policyVersion: DOMAIN_MAILBOX_GATE_POLICY_VERSION, reasonCodes: review, timestamp };

  return {
    // Deliberately not "ALLOW" -- this gate can only ever clear its own
    // scope of checks. The existing Deliverability Guard and OMNIA/V9 still
    // run afterward and can still deny independently.
    decision: 'NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE',
    policyVersion: DOMAIN_MAILBOX_GATE_POLICY_VERSION,
    reasonCodes: [],
    timestamp
  };
}
