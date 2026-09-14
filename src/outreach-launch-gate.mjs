import crypto from 'node:crypto';

export const OUTREACH_LAUNCH_GATE_VERSION = 'uberbond.outreach-launch-gate.v1';
export const OUTREACH_LAUNCH_STATES = Object.freeze({
  READY: 'READY_FOR_GOVERNED_CANARY',
  WAIT: 'WAIT_EXTERNAL_ACTIVATION',
  ABSTAIN: 'ABSTAIN'
});

const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

function evidenceRef(value) {
  const out = clean(value, 1000);
  return out || null;
}

export function evaluateOutreachLaunchGate({
  genome = {},
  domainState = null,
  mailboxState = null,
  egress = {},
  transport = {},
  campaignAuthorization = {},
  recipient = {},
  legal = {},
  suppression = {},
  recipientProvider = {},
  now = new Date()
} = {}) {
  const hardStop = [];
  const wait = [];

  if (genome.state !== 'REPORT_VISIBLE_V1_STRUCTURALLY_CLOSED' && genome.state !== 'VERIFIED_SOURCE_READY') wait.push('genome-source-readiness-required');
  if (!evidenceRef(genome.evidenceRef)) wait.push('genome-evidence-reference-required');

  if (!domainState) wait.push('sending-domain-state-required');
  else {
    if (domainState.state !== 'READY_FOR_LIMITED_OUTREACH') wait.push(`sending-domain-not-ready:${domainState.state || 'UNKNOWN'}`);
    if (domainState.outreachState !== 'AUTHORIZED') wait.push('domain-owner-authorization-required');
    if (!['FRESH'].includes(domainState.evidenceFreshness)) wait.push('fresh-domain-dns-evidence-required');
  }

  if (!mailboxState) wait.push('sending-mailbox-state-required');
  else {
    if (mailboxState.authenticationStatus !== 'AUTHENTICATED') wait.push('mailbox-authentication-required');
    if (mailboxState.warmupStatus !== 'WARMUP_COMPLETE') wait.push('mailbox-warmup-complete-required');
    if (mailboxState.paused) hardStop.push('mailbox-paused');
    if (!finitePositive(mailboxState.currentDailyCap)) wait.push('observed-mailbox-daily-cap-required');
  }

  if (egress.state !== 'READY' || !finitePositive(egress.observedColdDailyCap)) wait.push('observed-ready-egress-required');
  if (!evidenceRef(egress.evidenceRef)) wait.push('egress-evidence-reference-required');

  if (transport.state !== 'READY' || transport.authenticated !== true) wait.push('authenticated-transport-required');
  if (!evidenceRef(transport.evidenceRef)) wait.push('transport-evidence-reference-required');

  if (campaignAuthorization.authorized !== true) wait.push('campaign-authorization-required');
  if (!evidenceRef(campaignAuthorization.receiptId)) wait.push('campaign-authorization-receipt-required');
  if (campaignAuthorization.expiresAt && Date.parse(campaignAuthorization.expiresAt) <= new Date(now).getTime()) hardStop.push('campaign-authorization-expired');

  if (suppression.suppressed === true || suppression.unsubscribed === true) hardStop.push('suppression-dominates');
  if (recipient.safeForOutreach !== true) hardStop.push('recipient-not-safe-for-outreach');
  if (!clean(recipient.email, 320)) wait.push('recipient-email-required');
  if (!evidenceRef(recipient.verificationEvidenceRef)) wait.push('recipient-verification-evidence-required');

  if (legal.status !== 'PASSED') hardStop.push('recipient-legal-eligibility-not-passed');
  if (!evidenceRef(legal.evidenceId)) wait.push('recipient-legal-evidence-id-required');
  if (!clean(legal.policyVersion, 160)) wait.push('recipient-legal-policy-version-required');

  if (recipientProvider.state !== 'READY' || !finitePositive(recipientProvider.observedDailyBudget)) wait.push('recipient-provider-budget-required');
  if (!evidenceRef(recipientProvider.evidenceRef)) wait.push('recipient-provider-evidence-required');

  const state = hardStop.length
    ? OUTREACH_LAUNCH_STATES.ABSTAIN
    : wait.length
      ? OUTREACH_LAUNCH_STATES.WAIT
      : OUTREACH_LAUNCH_STATES.READY;

  const decisionSeed = {
    state,
    hardStop,
    wait,
    recipient: clean(recipient.email, 320).toLowerCase(),
    campaignReceipt: evidenceRef(campaignAuthorization.receiptId),
    genomeRef: evidenceRef(genome.evidenceRef),
    domainId: domainState?.domainId || null,
    mailboxId: mailboxState?.mailboxId || null,
    egressRef: evidenceRef(egress.evidenceRef),
    transportRef: evidenceRef(transport.evidenceRef),
    legalEvidenceId: evidenceRef(legal.evidenceId),
    recipientProviderRef: evidenceRef(recipientProvider.evidenceRef)
  };

  return {
    version: OUTREACH_LAUNCH_GATE_VERSION,
    state,
    decisionId: `ubol_${sha256(JSON.stringify(decisionSeed))}`,
    hardStopReasonCodes: [...new Set(hardStop)],
    waitReasonCodes: [...new Set(wait)],
    readyForGovernedCanary: state === OUTREACH_LAUNCH_STATES.READY,
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'READY_FOR_GOVERNED_CANARY means the supplied evidence clears this final launch gate for one separately-authorized canary action. It never creates authority, never proves future deliverability, never waives suppression/legal/provider rules, and never converts planning capacity into observed live capacity.'
  };
}
