// Beginner-friendly operator surface: "Domain and Mailbox Readiness."
// Read-only. Composes already-computed domain/mailbox/live-activation state
// into plain language -- it never claims a green check that isn't backed by
// a real recorded event, and it never invents a status.
export const DOMAIN_MAILBOX_CONTROL_CENTER_POLICY_VERSION = 'domain-mailbox-control-center-1.0.0';

function plainCheck(status) {
  if (status === 'GREEN') return { ok: true, label: 'working' };
  if (status === 'YELLOW') return { ok: false, label: 'needs attention (stale or propagating)' };
  if (status === 'RED') return { ok: false, label: 'missing or broken' };
  if (status === 'BLOCKED') return { ok: false, label: 'cannot be checked yet' };
  return { ok: false, label: 'unknown' };
}

function domainSummaryLine(domainState) {
  if (!domainState) return 'This domain is not registered with UberBond yet.';
  switch (domainState.state) {
    case 'OWNERSHIP_UNVERIFIED': return 'Your domain is registered, but ownership has not been confirmed.';
    case 'DNS_INCOMPLETE': return 'Your domain is purchased, but DNS is not fully configured yet.';
    case 'DNS_CONTRADICTORY': return 'Your domain has contradictory DNS records (for example, more than one SPF record). This must be fixed by hand.';
    case 'MAILBOX_UNVERIFIED': return 'Your domain\'s DNS looks correct, but no mailbox is connected yet.';
    case 'WARMUP_NOT_STARTED': return 'Your mailbox exists and is connected. Warm-up has not started yet.';
    case 'WARMING': return `Warm-up is active. Cold outreach remains locked until the minimum warm-up period is complete.`;
    case 'READY_FOR_DRY_RUN': return 'Everything required for warm-up passed. Cold outreach still requires your explicit authorization.';
    case 'READY_FOR_LIMITED_OUTREACH': return 'Warm-up is complete and you have authorized limited outreach.';
    case 'PAUSED': return `Sending is paused: ${domainState.statusReason}`;
    case 'BLOCKED': return 'Sending is blocked. See the operator action card below.';
    case 'UNCERTAIN': return 'Provider/DNS status could not be freshly verified. Sending is blocked until it is.';
    case 'RETIRED': return 'This domain is retired.';
    default: return 'Status unknown.';
  }
}

function mailboxSummaryLine(mailboxState) {
  if (!mailboxState) return 'No mailbox connected yet.';
  if (mailboxState.paused) return `This mailbox is paused: ${mailboxState.pauseReasonCodes?.join(', ') || 'unspecified reason'}.`;
  if (mailboxState.authenticationStatus !== 'AUTHENTICATED') return 'Your mailbox exists, but authentication (SPF/DKIM/DMARC) is not fully confirmed.';
  if (mailboxState.warmupStatus === 'WARMUP_NOT_STARTED') return 'Your mailbox is authenticated. Warm-up has not started.';
  if (mailboxState.warmupStatus === 'WARMUP_ACTIVE') return `Warm-up is active. Current daily cap: ${mailboxState.currentDailyCap || 'not yet reported by the provider'}.`;
  if (mailboxState.warmupStatus === 'WARMUP_COMPLETE') return 'Warm-up is complete per the provider.';
  return `Warm-up status: ${mailboxState.warmupStatus}.`;
}

// Never a claim of success without a backing receipt -- domainState/
// mailboxState are the folded registry records, already sourced from real
// recorded events (or null, meaning "not registered," which this function
// reports honestly rather than defaulting to a green check.
export function buildDomainReadinessCard({ domainState = null, mailboxState = null }) {
  return {
    policyVersion: DOMAIN_MAILBOX_CONTROL_CENTER_POLICY_VERSION,
    domainId: domainState?.domainId || null,
    domain: domainState?.domain || null,
    summary: domainSummaryLine(domainState),
    registered: Boolean(domainState),
    dnsVerified: domainState?.dnsState?.status === 'GREEN',
    dns: {
      mx: plainCheck(domainState?.dnsState?.checks?.mx?.status),
      spf: plainCheck(domainState?.dnsState?.checks?.spf?.status),
      dkim: plainCheck(domainState?.dnsState?.checks?.dkim?.status),
      dmarc: plainCheck(domainState?.dnsState?.checks?.dmarc?.status)
    },
    mailboxSummary: mailboxSummaryLine(mailboxState),
    mailboxExists: Boolean(mailboxState),
    warmupActive: mailboxState?.warmupStatus === 'WARMUP_ACTIVE',
    currentDailyCap: mailboxState?.currentDailyCap ?? null,
    coldOutreachBlocked: domainState ? domainState.coldOutreachBlocked : true,
    nextSafeAction: domainState?.nextSafeAction || 'Register this domain to begin.',
    ownerActionRequired: !domainState || domainState.state === 'BLOCKED' || domainState.state === 'PAUSED' || domainState.state === 'OWNERSHIP_UNVERIFIED',
    lastRealProviderReceipt: mailboxState?.lastExternalReceipt || null
  };
}

export function buildDomainReadinessDashboard(cards = []) {
  return {
    policyVersion: DOMAIN_MAILBOX_CONTROL_CENTER_POLICY_VERSION,
    title: 'Domain and Mailbox Readiness',
    domainCount: cards.length,
    readyForOutreachCount: cards.filter(c => !c.coldOutreachBlocked).length,
    ownerActionRequiredCount: cards.filter(c => c.ownerActionRequired).length,
    cards
  };
}

// One-page action card (section 12). Every field the mission requires;
// `spendsMoney`/`createsExternalEffects` default conservatively to
// "unknown -> treat as yes" unless the caller explicitly says otherwise.
export function buildOperatorActionCard({
  issue, affectedScope, provider = 'unknown', screenToOpen = '', recordType = '',
  exactValueFromProvider = '', buttonToPress = '', expectedVerificationResult = '',
  whatNotToChange = [], spendsMoney = null, createsExternalEffects = null,
  estimatedOwnerMinutes = null, rollbackSteps = []
} = {}) {
  return {
    policyVersion: DOMAIN_MAILBOX_CONTROL_CENTER_POLICY_VERSION,
    issue: String(issue || 'Unspecified issue'),
    affectedScope: affectedScope || null,
    provider,
    screenToOpen,
    recordType,
    exactValueFromProvider,
    buttonToPress,
    expectedVerificationResult,
    whatNotToChange: Array.isArray(whatNotToChange) ? whatNotToChange : [whatNotToChange].filter(Boolean),
    spendsMoney: spendsMoney == null ? 'UNKNOWN_ASSUME_YES' : Boolean(spendsMoney),
    createsExternalEffects: createsExternalEffects == null ? 'UNKNOWN_ASSUME_YES' : Boolean(createsExternalEffects),
    estimatedOwnerMinutes: Number.isFinite(Number(estimatedOwnerMinutes)) ? Number(estimatedOwnerMinutes) : null,
    rollbackSteps: Array.isArray(rollbackSteps) ? rollbackSteps : [rollbackSteps].filter(Boolean)
  };
}

// Builds the action card directly from a live-activation-gate BLOCKED_*
// result, so the card is never hand-written out of sync with the real
// blocker.
export function actionCardFromActivationResult(result) {
  if (!result || result.state === 'LIVE_WARMUP_ACTIVE' || result.state === 'READY_FOR_DRY_RUN') return null;
  return buildOperatorActionCard({
    issue: `Blocked: ${result.state} -- missing ${result.missingItem || 'unspecified requirement'}.`,
    provider: result.providerReason ? String(result.providerReason) : 'unknown',
    expectedVerificationResult: 'Re-run activation; the state should change once the missing item is resolved.',
    whatNotToChange: ['Do not add a second DNS record for something that already exists.', 'Do not create a new provider account if one already exists.'],
    spendsMoney: false,
    createsExternalEffects: false,
    rollbackSteps: ['No irreversible action was taken -- nothing to roll back.']
  });
}
