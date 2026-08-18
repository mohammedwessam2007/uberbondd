// The Live Activation Rule (section 8 of the mission). Evaluates the actual
// environment and returns exactly one of the 9 defined final states. This
// function NEVER simulates activation, never fabricates a receipt, and
// never performs a write of its own -- it only reads already-recorded
// domain/mailbox state and, when every real requirement is met, calls the
// provider adapter's real capabilities and persists the real response
// through the registries.
import { requestMailboxWarmupStart, reconcileMailboxWarmupStatus } from './warmup-orchestrator.mjs';
import { redactProviderReceipt } from './provider-adapter-contract.mjs';

export const LIVE_ACTIVATION_GATE_POLICY_VERSION = 'live-activation-gate-1.0.0';

export const LIVE_ACTIVATION_STATES = Object.freeze([
  'LIVE_WARMUP_ACTIVE', 'READY_TO_START_AFTER_OWNER_AUTH', 'READY_FOR_DRY_RUN',
  'BLOCKED_PROVIDER_AUTH', 'BLOCKED_DNS', 'BLOCKED_MAILBOX', 'BLOCKED_OWNER_AUTHORIZATION',
  'BLOCKED_PROVIDER_CAPABILITY', 'UNCERTAIN_EXTERNAL_STATE'
]);

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function blocked(state, missingItem, beginnerSteps, timestamp, extra = {}) {
  return { ok: true, policyVersion: LIVE_ACTIVATION_GATE_POLICY_VERSION, state, missingItem, beginnerSteps, timestamp, providerReceipt: null, ...extra };
}

// domainState/mailboxState: folded registry records, or null if never
// registered. providerAdapterResolution: the result of
// resolveProviderAdapter(cfg, provider) (src/provider-adapter-contract.mjs).
// ownerAuthorization: { granted: boolean, grantedBy, grantedAt } -- must be
// an explicit, caller-supplied fact; this function never infers it.
export async function evaluateLiveActivation({
  domainState = null, mailboxState = null, providerAdapterResolution = null,
  ownerAuthorization = null, minWarmupDays = 14, date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();

  if (!domainState || !mailboxState) {
    return blocked(
      'BLOCKED_OWNER_AUTHORIZATION',
      'exact domain and mailbox targets',
      ['Register the exact purchased domain and the exact mailbox address you want to warm up. UberBond will not guess a domain or mailbox name.'],
      timestamp
    );
  }

  if (!providerAdapterResolution || providerAdapterResolution.ok !== true) {
    const reason = providerAdapterResolution?.reason || 'provider-not-configured';
    return blocked(
      'BLOCKED_PROVIDER_AUTH',
      `an authenticated ${providerAdapterResolution?.adapter?.providerName || 'email'} provider connection`,
      [
        'Choose a supported provider (Instantly, Google Workspace, or Microsoft 365).',
        'Create/confirm the account and generate the credential UberBond needs (API key or OAuth app).',
        'Add that credential to the environment configuration (never paste it into chat or a document).',
        `Current blocker: ${reason}.`
      ],
      timestamp,
      { providerReason: reason }
    );
  }

  if (!['GREEN', 'YELLOW'].includes(domainState.dnsState?.status)) {
    return blocked(
      'BLOCKED_DNS',
      'valid DNS records (MX, SPF, DKIM, DMARC) for this domain',
      [
        `Current DNS status: ${domainState.dnsState?.status || 'UNKNOWN'}.`,
        'Open your DNS provider (e.g. GoDaddy) and add exactly the records your mailbox provider specifies -- do not guess values.',
        'Do not add a second SPF record if one already exists; edit the existing one.',
        'Re-run DNS verification after making changes.'
      ],
      timestamp,
      { dnsReasonCodes: domainState.dnsState?.reasonCodes || [] }
    );
  }

  if (mailboxState.authenticationStatus !== 'AUTHENTICATED' || mailboxState.paused) {
    return blocked(
      'BLOCKED_MAILBOX',
      'an authenticated, unpaused mailbox',
      [
        `Current mailbox authentication status: ${mailboxState.authenticationStatus}${mailboxState.paused ? ' (also currently paused)' : ''}.`,
        'Confirm the mailbox exists with the provider and that its authentication has not expired.',
        mailboxState.paused ? `Resolve the pause reason first: ${mailboxState.pauseReasonCodes?.join(', ') || 'unspecified'}.` : 'Re-run mailbox authentication verification.'
      ],
      timestamp
    );
  }

  if (!ownerAuthorization?.granted) {
    return blocked(
      'READY_TO_START_AFTER_OWNER_AUTH',
      'explicit owner authorization to begin warm-up',
      [
        'Everything technical required for warm-up has passed.',
        'This is a sovereignty-level decision: explicitly authorize warm-up start for this exact mailbox.',
        'No message will be sent to any third party -- warm-up uses the provider\'s own native mechanism only.'
      ],
      timestamp
    );
  }

  const capability = typeof providerAdapterResolution.adapter?.warmupCapable === 'function'
    ? await providerAdapterResolution.adapter.warmupCapable()
    : { ok: false, status: 'CAPABILITY_MISSING' };
  if (!capability?.ok) {
    return blocked(
      'BLOCKED_PROVIDER_CAPABILITY',
      'native provider warm-up support for this mailbox',
      [`The connected provider reported it cannot warm up this mailbox (${capability?.status || 'unknown reason'}).`, 'Check the provider\'s own dashboard for the mailbox\'s eligibility.'],
      timestamp,
      { providerReceipt: redactProviderReceipt(capability) }
    );
  }

  if (mailboxState.warmupStatus && mailboxState.warmupStatus !== 'WARMUP_NOT_STARTED') {
    const reconciled = await reconcileMailboxWarmupStatus({ mailboxState, providerAdapter: providerAdapterResolution.adapter, minWarmupDays, date: at });
    if (reconciled.state === 'WARMUP_UNCERTAIN') {
      return blocked('UNCERTAIN_EXTERNAL_STATE', 'a definitive provider warm-up status', ['The provider did not return a clear warm-up status.', 'Try again shortly; if this persists, check the provider\'s own status page.'], timestamp, { providerReceipt: reconciled.providerReceipt });
    }
    if (reconciled.state === 'WARMUP_ACTIVE') {
      return { ok: true, policyVersion: LIVE_ACTIVATION_GATE_POLICY_VERSION, state: 'LIVE_WARMUP_ACTIVE', missingItem: null, beginnerSteps: [], timestamp, providerReceipt: reconciled.providerReceipt, currentCap: reconciled.reportedDailyCap ?? reconciled.plannedDailyCap ?? null, coldOutreachRemainsLocked: true };
    }
    if (reconciled.state === 'WARMUP_COMPLETE') {
      return { ok: true, policyVersion: LIVE_ACTIVATION_GATE_POLICY_VERSION, state: 'READY_FOR_DRY_RUN', missingItem: null, beginnerSteps: ['Warm-up is complete per the provider. Owner review is still required before any cold outreach.'], timestamp, providerReceipt: reconciled.providerReceipt, coldOutreachRemainsLocked: true };
    }
  }

  const started = await requestMailboxWarmupStart({ domainState, mailboxState, providerAdapter: providerAdapterResolution.adapter, date: at });
  if (!started.ok) {
    return blocked('BLOCKED_PROVIDER_CAPABILITY', 'a successful provider warm-up start response', [`Provider warm-up start failed: ${started.reasonCodes.join(', ')}.`], timestamp, { providerReceipt: started.providerReceipt });
  }

  return {
    ok: true, policyVersion: LIVE_ACTIVATION_GATE_POLICY_VERSION, state: 'LIVE_WARMUP_ACTIVE',
    missingItem: null, beginnerSteps: [], timestamp, providerReceipt: started.providerReceipt,
    warmupStartTime: started.warmupStartTime, coldOutreachRemainsLocked: true
  };
}
