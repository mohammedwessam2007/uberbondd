import { compilePlacementProbePlan, compilePlacementReport, uberWarmPlacementObservation } from './uberplacement.mjs';
import { compileUberWarmFleet } from './uberwarm-reputation-lab.mjs';

export const UBERWARM2_VERSION = 'uberbond.uberwarm2.v1';

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

function senderFromMailbox(mailbox = {}) {
  const email = clean(mailbox.address || mailbox.email, 320).toLowerCase();
  return {
    slot: clean(mailbox.slot || mailbox.mailboxId, 120) || null,
    email,
    connected: mailbox.authenticationStatus === 'AUTHENTICATED' && emailOk(email),
    paused: mailbox.paused === true
  };
}

function observedProviders(senderReport = {}) {
  return (Array.isArray(senderReport.byProvider) ? senderReport.byProvider : [])
    .filter(row => Number(row?.observed || 0) > 0)
    .map(row => clean(row.provider, 80))
    .filter(Boolean);
}

function nextAction(decision = {}) {
  switch (decision.state) {
    case 'BLOCKED':
      return { action: 'FIX_AUTHENTICATION', coldSendAllowed: false };
    case 'WARMING':
      return { action: 'RUN_OWNER_CONTROLLED_PLACEMENT_PROBES', coldSendAllowed: false };
    case 'LIMITED_CANARY':
      return { action: 'RUN_BOUNDED_EVIDENCE_CANARY', coldSendAllowed: decision.recommendedColdDailyCap > 0 };
    case 'RAMP':
      return { action: 'INCREASE_ONLY_TO_RECOMMENDED_CAP', coldSendAllowed: true };
    case 'HOLD':
      return { action: 'HOLD_CURRENT_CAP', coldSendAllowed: decision.recommendedColdDailyCap > 0 };
    case 'QUARANTINED':
      return { action: 'STOP_AND_DIAGNOSE', coldSendAllowed: false };
    default:
      return { action: 'NO_ACTION_UNKNOWN_STATE', coldSendAllowed: false };
  }
}

/**
 * UberWarm² composes UberPlacement + UberWarm into an evidence-first
 * reputation controller. It deliberately does not manufacture engagement,
 * auto-reply to synthetic warmup conversations, move mail out of spam, or
 * claim that provider acceptance equals inbox placement.
 *
 * External effects remain zero. The returned probe plan is PLAN_ONLY and any
 * real send still requires the existing governed dispatch/owner authorization.
 */
export function compileUberWarm2Plan({
  mailboxes = [],
  mailboxObservations = {},
  seedInboxes = [],
  placementObservations = [],
  placementPlan = null,
  warmPolicy = {},
  maxSeedsPerSender = 4,
  now = new Date()
} = {}) {
  const mailboxRows = Array.isArray(mailboxes) ? mailboxes : [];
  const senders = mailboxRows.map(senderFromMailbox).filter(sender => emailOk(sender.email));

  const probePlan = placementPlan || compilePlacementProbePlan({
    senders,
    seedInboxes,
    campaignId: 'uberwarm2-placement-canary',
    maxSeedsPerSender,
    now
  });

  const placementReport = compilePlacementReport({
    plan: probePlan,
    observations: placementObservations,
    now
  });

  const bySender = new Map(
    (placementReport.senderReports || []).map(report => [clean(report.senderEmail, 320).toLowerCase(), report])
  );

  const mergedObservations = {};
  for (const mailbox of mailboxRows) {
    const mailboxId = mailbox.mailboxId || mailbox.id;
    if (!mailboxId) continue;
    const email = clean(mailbox.address || mailbox.email, 320).toLowerCase();
    const report = bySender.get(email);
    const placement = report ? uberWarmPlacementObservation(report) : {
      inboxPlacementRate: null,
      spamPlacementRate: null,
      placementObservationCoverage: 0
    };
    const providers = report ? observedProviders(report) : [];
    mergedObservations[mailboxId] = {
      ...(mailboxObservations?.[mailboxId] || {}),
      ...placement,
      placementProvidersObserved: providers.length,
      placementProviderIds: providers,
      warmupMode: 'EVIDENCE_RAMP',
      evidenceRampAuthorized: true
    };
  }

  const warmFleet = compileUberWarmFleet({
    mailboxes: mailboxRows.map(mailbox => ({ ...mailbox, warmupMode: 'EVIDENCE_RAMP' })),
    observationsByMailbox: mergedObservations,
    policy: warmPolicy,
    now
  });

  const nextActions = warmFleet.decisions.map(decision => ({
    mailboxId: decision.mailboxId,
    address: decision.address,
    state: decision.state,
    recommendedColdDailyCap: decision.recommendedColdDailyCap,
    reasonCodes: decision.reasonCodes,
    nextEvidence: decision.nextEvidence,
    ...nextAction(decision)
  }));

  const probeCoverage = {
    expected: Number(placementReport.expectedProbes || 0),
    observed: Number(placementReport.observedProbes || 0),
    rate: Number(placementReport.expectedProbes || 0) > 0
      ? Number((Number(placementReport.observedProbes || 0) / Number(placementReport.expectedProbes || 0)).toFixed(4))
      : 0
  };

  return Object.freeze({
    version: UBERWARM2_VERSION,
    generatedAt: new Date(now).toISOString(),
    mode: 'EVIDENCE_RAMP_NO_SYNTHETIC_ENGAGEMENT',
    placementPlan: probePlan,
    placementReport,
    warmFleet,
    nextActions,
    probeCoverage,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    providerCalls: 0,
    messagesSent: 0,
    syntheticWarmupMessagesCreated: 0,
    spamFolderRescuesPerformed: 0,
    autoRepliesPerformed: 0,
    spendCents: 0,
    truthBoundary: 'UberWarm² compiles bounded reputation experiments from supplied observations. It does not create recipient-network trust, send mail, manufacture engagement, rescue spam, or authorize outreach. Real placement, provider policy, recipient eligibility and provider/account state remain external evidence.'
  });
}

export function compileUberWarm2PurchaseBoundary({
  transport = {},
  domainsOwned = 0,
  controlPlaneOwned = false,
  seedCoverage = {}
} = {}) {
  const transportReady = transport.authorized === true
    && transport.configured === true
    && transport.outboundSmtp === true
    && (transport.inboundReplies === true || transport.inboundForwarding === true);

  const blockers = [];
  if (Number(domainsOwned) <= 0) blockers.push('owned-sending-domain-required');
  if (controlPlaneOwned !== true) blockers.push('control-plane-required');
  if (!transportReady) blockers.push('authorized-smtp-imap-transport-purchase-or-activation-required');

  const externalSeeds = Number(seedCoverage.ownerControlledRecipientNetworks || 0);
  const scaleEvidenceReady = externalSeeds >= 2;

  return Object.freeze({
    version: UBERWARM2_VERSION,
    prePurchaseState: blockers.length ? 'EXTERNAL_TRANSPORT_REMAINS' : 'SOFTWARE_AND_ASSETS_READY',
    blockers,
    providerWarmupAddonRequired: false,
    providerWarmupAddonStatus: 'OPTIONAL',
    seedNetworkStatus: scaleEvidenceReady ? 'DIVERSE_OWNER_CONTROLLED_SEEDS_AVAILABLE' : 'OPTIONAL_FOR_PURCHASE_REQUIRED_BEFORE_SCALE',
    externalSeedsObserved: externalSeeds,
    transportReady,
    truthBoundary: 'This boundary says only whether UberBond still needs a reputation-bearing SMTP/IMAP substrate. Diverse recipient-network seeds improve placement evidence before scale but are not a reason to buy a warmup SaaS.'
  });
}
