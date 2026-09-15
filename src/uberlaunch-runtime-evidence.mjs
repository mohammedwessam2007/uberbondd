import crypto from 'node:crypto';
import { prepareUberLeadLaunchFusion } from './uberlead-launch-fusion.mjs';

export const UBERLAUNCH_RUNTIME_EVIDENCE_VERSION = 'uberbond.uberlaunch-runtime-evidence.v1';

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uniq = values => [...new Set((values || []).filter(Boolean))];

function evidenceRef(prefix, value) {
  const raw = clean(value, 1000);
  return raw ? `${prefix}:${raw}` : null;
}

function compileSubstrate(runtimeReceipt = {}) {
  const economic = runtimeReceipt?.economicRuntime || {};
  const observed = runtimeReceipt?.ok === true
    && runtimeReceipt?.status === 'UBERCEL_ECONOMIC_DEPLOYMENT_OBSERVED'
    && economic?.ok === true;
  const refs = Array.isArray(economic?.evidenceRefs) ? economic.evidenceRefs.map(ref => clean(ref, 1000)).filter(Boolean) : [];
  return {
    mode: observed ? 'SELF_HOSTED' : 'UNKNOWN',
    controlPlane: observed ? 'OWNED' : 'UNKNOWN',
    substrateId: observed ? 'UBERCEL' : 'UNKNOWN',
    observedHealthy: observed,
    evidenceRef: observed ? `ubercel-economic:${digest({ status: runtimeReceipt.status, refs })}` : null,
    sourceRefs: refs
  };
}

function compileEgress(egressReceipt = {}) {
  const cap = Number(egressReceipt?.totalReadyColdDailyCap || egressReceipt?.topology?.totalReadyColdDailyCap || 0);
  const ready = egressReceipt?.ok === true
    && ['UBEREGRESS_READY', 'UBEREGRESS_PARTIAL'].includes(egressReceipt?.status)
    && positive(cap);
  const topologyDigest = clean(egressReceipt?.topology?.topologyDigest, 500);
  return {
    state: ready ? 'READY' : 'UNKNOWN',
    observedColdDailyCap: ready ? Math.floor(cap) : 0,
    evidenceRef: ready && topologyDigest ? `uberegress:${topologyDigest}` : null
  };
}

function compileMailbox({ inboxReconciliation = {}, warmDecision = {}, mailboxObservation = {} } = {}) {
  const address = clean(mailboxObservation?.address || warmDecision?.address, 320).toLowerCase();
  const confirmed = inboxReconciliation?.ok === true
    && Array.isArray(inboxReconciliation?.confirmedAddresses)
    && inboxReconciliation.confirmedAddresses.map(value => clean(value, 320).toLowerCase()).includes(address);
  const warmReady = ['LIMITED_CANARY', 'RAMP', 'HOLD'].includes(warmDecision?.state)
    && positive(warmDecision?.recommendedColdDailyCap);
  const authenticated = mailboxObservation?.authenticationStatus === 'AUTHENTICATED' || mailboxObservation?.authenticated === true;
  const warmupComplete = mailboxObservation?.warmupStatus === 'WARMUP_COMPLETE' || warmReady;
  const capCandidates = [
    Number(warmDecision?.recommendedColdDailyCap),
    Number(mailboxObservation?.currentDailyCap),
    Number(mailboxObservation?.providerDailyCap)
  ].filter(value => Number.isFinite(value) && value > 0);
  const cap = capCandidates.length ? Math.min(...capCandidates) : 0;
  return {
    mailboxId: clean(mailboxObservation?.mailboxId || warmDecision?.mailboxId, 240) || null,
    address: address || null,
    authenticationStatus: confirmed && authenticated ? 'AUTHENTICATED' : 'UNKNOWN',
    warmupStatus: confirmed && warmupComplete ? 'WARMUP_COMPLETE' : 'UNKNOWN',
    paused: Boolean(mailboxObservation?.paused || warmDecision?.state === 'QUARANTINED'),
    currentDailyCap: confirmed && warmReady && positive(cap) ? Math.floor(cap) : 0,
    evidenceRef: confirmed && warmReady
      ? `ubermailbox:${digest({ address, reconciliation: inboxReconciliation.status, warmState: warmDecision.state, cap })}`
      : null
  };
}

function compileDomain(domainObservation = {}) {
  const domainId = clean(domainObservation?.domainId || domainObservation?.domain, 253).toLowerCase();
  const ready = domainObservation?.ownerAuthorized === true
    && domainObservation?.dnsAuthenticated === true
    && domainObservation?.evidenceFreshness === 'FRESH'
    && Boolean(clean(domainObservation?.evidenceRef, 1000));
  return {
    domainId: domainId || null,
    state: ready ? 'READY_FOR_LIMITED_OUTREACH' : 'UNKNOWN',
    outreachState: domainObservation?.ownerAuthorized === true ? 'AUTHORIZED' : 'UNAUTHORIZED',
    evidenceFreshness: domainObservation?.evidenceFreshness === 'FRESH' ? 'FRESH' : 'UNKNOWN',
    evidenceRef: ready ? clean(domainObservation.evidenceRef, 1000) : null
  };
}

function compileTransport(transportObservation = {}) {
  const ready = transportObservation?.state === 'READY'
    && transportObservation?.authenticated === true
    && Boolean(clean(transportObservation?.evidenceRef, 1000));
  return {
    state: ready ? 'READY' : 'UNKNOWN',
    authenticated: ready,
    evidenceRef: ready ? clean(transportObservation.evidenceRef, 1000) : null
  };
}

function compileRecipientProvider(observation = {}) {
  const ready = observation?.state === 'READY'
    && positive(observation?.observedDailyBudget)
    && Boolean(clean(observation?.evidenceRef, 1000));
  return {
    state: ready ? 'READY' : 'UNKNOWN',
    observedDailyBudget: ready ? Math.floor(Number(observation.observedDailyBudget)) : 0,
    evidenceRef: ready ? clean(observation.evidenceRef, 1000) : null
  };
}

export function compileUberLaunchRuntimeEvidence({
  runtimeReceipt = {},
  domainObservation = {},
  inboxReconciliation = {},
  warmDecision = {},
  mailboxObservation = {},
  egressReceipt = {},
  transportObservation = {},
  recipientProviderObservation = {}
} = {}) {
  const substrate = compileSubstrate(runtimeReceipt);
  const domainState = compileDomain(domainObservation);
  const mailboxState = compileMailbox({ inboxReconciliation, warmDecision, mailboxObservation });
  const egress = compileEgress(egressReceipt);
  const transport = compileTransport(transportObservation);
  const recipientProvider = compileRecipientProvider(recipientProviderObservation);

  const waitReasonCodes = [];
  if (!substrate.observedHealthy) waitReasonCodes.push('sovereign-runtime-observation-required');
  if (domainState.state !== 'READY_FOR_LIMITED_OUTREACH') waitReasonCodes.push('fresh-authorized-domain-observation-required');
  if (mailboxState.authenticationStatus !== 'AUTHENTICATED') waitReasonCodes.push('observed-mailbox-materialization-and-authentication-required');
  if (mailboxState.warmupStatus !== 'WARMUP_COMPLETE' || !positive(mailboxState.currentDailyCap)) waitReasonCodes.push('observed-mailbox-warmup-and-health-cap-required');
  if (egress.state !== 'READY') waitReasonCodes.push('observed-egress-capacity-required');
  if (transport.state !== 'READY') waitReasonCodes.push('observed-authenticated-transport-required');
  if (recipientProvider.state !== 'READY') waitReasonCodes.push('observed-recipient-provider-budget-required');

  const receipt = {
    version: UBERLAUNCH_RUNTIME_EVIDENCE_VERSION,
    state: waitReasonCodes.length ? 'WAIT_EXTERNAL_OBSERVATION' : 'RUNTIME_EVIDENCE_READY',
    substrate,
    launchInputs: { domainState, mailboxState, egress, transport, recipientProvider },
    waitReasonCodes: uniq(waitReasonCodes),
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'RUNTIME_EVIDENCE_READY means already-observed Ubercel/UberLit runtime, domain, mailbox, reputation, egress, transport and recipient-provider receipts were successfully normalized for the one-button launch gate. It creates no authority and never manufactures missing physical evidence.'
  };
  receipt.evidenceBundleId = `ublaunchrt_${digest(receipt)}`;
  return receipt;
}

export async function prepareSovereignOneButtonLaunch({
  sourceReadiness,
  discoveryConfig,
  discoveryOptions,
  leadQuery,
  suppressions = [],
  signals = [],
  runtimeEvidence = {},
  genome,
  campaignAuthorization,
  recipient,
  legal,
  suppression,
  ownerAuthorization,
  fetcher = fetch,
  now = new Date()
} = {}) {
  const runtime = compileUberLaunchRuntimeEvidence(runtimeEvidence);
  const launchInputs = {
    genome,
    ...runtime.launchInputs,
    campaignAuthorization,
    recipient,
    legal,
    suppression
  };

  const prepared = await prepareUberLeadLaunchFusion({
    sourceReadiness,
    discoveryConfig,
    discoveryOptions,
    leadQuery,
    suppressions,
    signals,
    substrate: runtime.substrate,
    launchInputs,
    ownerAuthorization,
    fetcher,
    now
  });

  return {
    version: UBERLAUNCH_RUNTIME_EVIDENCE_VERSION,
    runtime,
    ...prepared,
    state: prepared?.manifest?.state || 'WAIT_EXTERNAL_EVIDENCE',
    oneButtonPressAvailable: prepared?.manifest?.oneButtonPressAvailable === true,
    remainingMachineObservableEvidence: runtime.waitReasonCodes,
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'This is the fully fused source path: public-business discovery → UberBond Lead OS → observed sovereign runtime evidence → final launch gate. The button becomes pressable only when the real-world receipts supplied to it are green and fresh; the compiler cannot fabricate DNS, mailbox health, egress, legal eligibility, contact verification, provider tolerance or founder authority.'
  };
}
