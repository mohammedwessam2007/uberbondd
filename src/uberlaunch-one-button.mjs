import crypto from 'node:crypto';
import { evaluateOutreachLaunchGate, OUTREACH_LAUNCH_STATES } from './outreach-launch-gate.mjs';
import { dispatchGovernedOutreach } from './governed-outreach-dispatch.mjs';

export const UBERLAUNCH_ONE_BUTTON_VERSION = 'uberbond.uberlaunch-one-button.v1';
export const UBERLAUNCH_SELF_HOST_POLICY = Object.freeze({
  defaultControlPlane: 'SELF_HOSTED',
  preferredSubstrates: Object.freeze(['UBERCLOUD', 'UBERLIT', 'UBERCEL']),
  externalServices: 'IRREDUCIBLE_OR_EXPLICITLY_AUTHORIZED_ONLY',
  providerPolicyEvasion: false,
  suppressionBypass: false,
  legalBypass: false
});

const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function substrateDecision(substrate = {}) {
  const blockers = [];
  const mode = clean(substrate.mode, 80).toUpperCase();
  const controlPlane = clean(substrate.controlPlane, 80).toUpperCase();
  const substrateId = clean(substrate.substrateId, 160).toUpperCase();

  if (mode !== 'SELF_HOSTED') blockers.push('self-hosted-runtime-required');
  if (controlPlane !== 'OWNED') blockers.push('owned-control-plane-required');
  if (!UBERLAUNCH_SELF_HOST_POLICY.preferredSubstrates.includes(substrateId)) blockers.push('approved-sovereign-substrate-required');
  if (substrate.observedHealthy !== true) blockers.push('observed-healthy-sovereign-runtime-required');
  if (!clean(substrate.evidenceRef, 1000)) blockers.push('sovereign-runtime-evidence-reference-required');

  return {
    ok: blockers.length === 0,
    substrateId: substrateId || null,
    blockers,
    truthBoundary: 'Self-hosted readiness requires observed runtime evidence. Naming UberCloud, UberLit, or UberCel never proves that the physical runtime is online.'
  };
}

export function compileUberLaunchManifest({
  sourceReadiness = {},
  discovery = {},
  substrate = {},
  launchInputs = {},
  ownerAuthorization = {},
  now = new Date()
} = {}) {
  const hardStop = [];
  const wait = [];
  const selfHost = substrateDecision(substrate);

  if (sourceReadiness.state !== 'VERIFIED_SOURCE_READY') wait.push('verified-source-readiness-required');
  if (!clean(sourceReadiness.evidenceRef, 1000)) wait.push('source-readiness-evidence-reference-required');

  if (discovery.state !== 'READY') wait.push('discovery-readiness-required');
  if (discovery.sourceClass !== 'PUBLIC_BUSINESS_DATA') hardStop.push('public-business-data-only');
  if (discovery.protectedSource === true || discovery.captchaBypass === true || discovery.privateDataInference === true) hardStop.push('prohibited-discovery-method');
  if (!Number.isFinite(Number(discovery.qualifiedProspectCount)) || Number(discovery.qualifiedProspectCount) < 1) wait.push('qualified-prospect-inventory-required');
  if (!clean(discovery.evidenceRef, 1000)) wait.push('discovery-evidence-reference-required');

  wait.push(...selfHost.blockers);

  const launchDecision = evaluateOutreachLaunchGate({ ...launchInputs, now });
  if (launchDecision.state === OUTREACH_LAUNCH_STATES.ABSTAIN) hardStop.push(...launchDecision.hardStopReasonCodes);
  if (launchDecision.state === OUTREACH_LAUNCH_STATES.WAIT) wait.push(...launchDecision.waitReasonCodes);

  if (ownerAuthorization.authorized !== true) wait.push('fresh-owner-big-button-authorization-required');
  if (!clean(ownerAuthorization.receiptId, 240)) wait.push('owner-big-button-authorization-receipt-required');
  if (!ownerAuthorization.expiresAt || !Number.isFinite(Date.parse(ownerAuthorization.expiresAt))) wait.push('owner-big-button-authorization-expiry-required');
  else if (Date.parse(ownerAuthorization.expiresAt) <= new Date(now).getTime()) hardStop.push('owner-big-button-authorization-expired');

  const uniqueHardStop = uniq(hardStop);
  const uniqueWait = uniq(wait);
  const state = uniqueHardStop.length ? 'ABSTAIN' : uniqueWait.length ? 'WAIT_EXTERNAL_EVIDENCE' : 'READY_TO_PRESS';
  const seed = {
    state,
    sourceRef: clean(sourceReadiness.evidenceRef, 1000) || null,
    discoveryRef: clean(discovery.evidenceRef, 1000) || null,
    substrateRef: clean(substrate.evidenceRef, 1000) || null,
    launchDecisionId: launchDecision.decisionId,
    ownerReceipt: clean(ownerAuthorization.receiptId, 240) || null,
    hardStop: uniqueHardStop,
    wait: uniqueWait
  };

  return {
    version: UBERLAUNCH_ONE_BUTTON_VERSION,
    state,
    manifestId: `ublaunch_${sha256(JSON.stringify(seed))}`,
    selfHostPolicy: UBERLAUNCH_SELF_HOST_POLICY,
    selfHost,
    launchDecision,
    qualifiedProspectCount: Number(discovery.qualifiedProspectCount) || 0,
    hardStopReasonCodes: uniqueHardStop,
    waitReasonCodes: uniqueWait,
    oneButtonPressAvailable: state === 'READY_TO_PRESS',
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'READY_TO_PRESS means the source, public-business discovery inventory, sovereign runtime evidence, outreach launch gate, and fresh founder authorization supplied to this manifest are all green. It does not create authority, fabricate runtime evidence, prove inbox placement, or waive legal/provider/suppression rules.'
  };
}

export async function pressUberLaunchButton({
  manifest,
  ownerAuthorization,
  dispatchAuthorization,
  message,
  transportAdapter,
  idempotencyKey,
  now = new Date()
} = {}) {
  const reasons = [];
  if (manifest?.state !== 'READY_TO_PRESS' || manifest?.oneButtonPressAvailable !== true) reasons.push('ready-to-press-manifest-required');
  if (!clean(manifest?.manifestId, 240)) reasons.push('launch-manifest-id-required');
  if (ownerAuthorization?.authorized !== true) reasons.push('fresh-owner-big-button-authorization-required');
  if (!clean(ownerAuthorization?.receiptId, 240)) reasons.push('owner-big-button-authorization-receipt-required');
  if (!ownerAuthorization?.expiresAt || !Number.isFinite(Date.parse(ownerAuthorization.expiresAt)) || Date.parse(ownerAuthorization.expiresAt) <= new Date(now).getTime()) reasons.push('fresh-owner-big-button-authorization-required');
  if (reasons.length) {
    return {
      ok: false,
      version: UBERLAUNCH_ONE_BUTTON_VERSION,
      state: 'BIG_BUTTON_REFUSED',
      reasonCodes: uniq(reasons),
      providerCalls: 0,
      messagesSent: 0,
      automaticRetryAuthorized: false
    };
  }

  const result = await dispatchGovernedOutreach({
    launchDecision: manifest.launchDecision,
    authorization: dispatchAuthorization,
    message,
    transportAdapter,
    idempotencyKey,
    now
  });

  return {
    ...result,
    oneButtonVersion: UBERLAUNCH_ONE_BUTTON_VERSION,
    manifestId: manifest.manifestId,
    founderPressReceiptId: clean(ownerAuthorization.receiptId, 240),
    truthBoundary: `${result.truthBoundary || ''} The big button is an orchestration boundary, not a bypass: every underlying launch, authorization, suppression, legal, reputation, and provider gate remains binding.`.trim()
  };
}
