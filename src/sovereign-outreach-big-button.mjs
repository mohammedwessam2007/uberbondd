import crypto from 'node:crypto';
import { compileUberLaunchRuntimeEvidence } from './uberlaunch-runtime-evidence.mjs';
import { compileUberLaunchManifest, pressUberLaunchButton } from './uberlaunch-one-button.mjs';
import { evaluateOutreachLaunchGate, OUTREACH_LAUNCH_STATES } from './outreach-launch-gate.mjs';
import { PostalEffectAdapter } from './omnia-v9/integrations/providers/postal-effect-adapter.mjs';

export const SOVEREIGN_OUTREACH_BIG_BUTTON_VERSION = 'uberbond.sovereign-outreach-big-button.v1';
export const OUTREACH_CAPSULE_SCHEMA_VERSION = 'uberbond.sovereign-outreach-launch-capsule.v1';

const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const uniq = values => [...new Set((values || []).filter(Boolean))];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function capsuleBody(capsule = {}) {
  const { capsuleDigest: _ignored, ...body } = capsule || {};
  return body;
}

export function computeOutreachCapsuleDigest(capsule = {}) {
  return `ubocap_${sha256(JSON.stringify(stable(capsuleBody(capsule))))}`;
}

function iso(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function fail(state, reasonCodes, extra = {}) {
  return {
    ok: false,
    version: SOVEREIGN_OUTREACH_BIG_BUTTON_VERSION,
    state,
    reasonCodes: uniq(reasonCodes),
    oneButtonPressAvailable: false,
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

export function compileSovereignOutreachLaunchCapsule({
  sourceReadiness = {},
  leadFusionReceipt = {},
  runtimeEvidence = {},
  genome = {},
  recipient = {},
  legal = {},
  suppression = {},
  message = {},
  campaignId,
  idempotencyKey,
  preparedAt = new Date(),
  expiresAt
} = {}) {
  const preparedIso = new Date(preparedAt).toISOString();
  const expiryIso = iso(expiresAt) || new Date(new Date(preparedAt).getTime() + 15 * 60_000).toISOString();
  const discovery = leadFusionReceipt?.rankedDiscovery || leadFusionReceipt?.discovery || {};
  const normalizedCampaign = clean(campaignId || message?.campaignId, 240);
  const normalizedRecipient = clean(recipient?.email || message?.to, 320).toLowerCase();
  const capsule = {
    schemaVersion: OUTREACH_CAPSULE_SCHEMA_VERSION,
    preparedAt: preparedIso,
    expiresAt: expiryIso,
    sourceReadiness,
    leadFusion: {
      version: clean(leadFusionReceipt?.version, 160) || null,
      evidenceRef: clean(discovery?.evidenceRef, 1000) || null
    },
    discovery: {
      state: discovery?.state || null,
      sourceClass: discovery?.sourceClass || null,
      qualifiedProspectCount: Number(discovery?.qualifiedProspectCount || 0),
      evidenceRef: clean(discovery?.evidenceRef, 1000) || null,
      protectedSource: discovery?.protectedSource === true,
      captchaBypass: discovery?.captchaBypass === true,
      privateDataInference: discovery?.privateDataInference === true
    },
    runtimeEvidence,
    genome,
    recipient: { ...recipient, email: normalizedRecipient || clean(recipient?.email, 320) },
    legal,
    suppression,
    campaignId: normalizedCampaign,
    message: {
      to: clean(message?.to || normalizedRecipient, 320).toLowerCase(),
      from: clean(message?.from, 320),
      campaignId: normalizedCampaign,
      subject: clean(message?.subject, 500),
      body: clean(message?.body, 100000),
      replyTo: clean(message?.replyTo, 320) || null,
      listUnsubscribe: clean(message?.listUnsubscribe, 1200) || null
    },
    idempotencyKey: clean(idempotencyKey, 500),
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
  capsule.capsuleDigest = computeOutreachCapsuleDigest(capsule);
  return capsule;
}

function validateCapsule(capsule = {}, expectedDigest, now = new Date()) {
  const hardStop = [];
  const wait = [];
  if (capsule?.schemaVersion !== OUTREACH_CAPSULE_SCHEMA_VERSION) hardStop.push('valid-launch-capsule-schema-required');
  const actualDigest = computeOutreachCapsuleDigest(capsule);
  if (!clean(capsule?.capsuleDigest, 100) || capsule.capsuleDigest !== actualDigest) hardStop.push('launch-capsule-integrity-mismatch');
  if (expectedDigest && expectedDigest !== actualDigest) hardStop.push('founder-pressed-capsule-digest-mismatch');
  const expiry = Date.parse(String(capsule?.expiresAt || ''));
  if (!Number.isFinite(expiry)) hardStop.push('launch-capsule-expiry-required');
  else if (expiry <= new Date(now).getTime()) hardStop.push('launch-capsule-expired');
  if (capsule?.sourceReadiness?.state !== 'VERIFIED_SOURCE_READY' || !clean(capsule?.sourceReadiness?.evidenceRef, 1000)) wait.push('verified-source-readiness-required');
  if (capsule?.discovery?.state !== 'READY') wait.push('ranked-lead-discovery-ready-required');
  if (capsule?.discovery?.sourceClass !== 'PUBLIC_BUSINESS_DATA') hardStop.push('public-business-data-only');
  if (capsule?.discovery?.protectedSource || capsule?.discovery?.captchaBypass || capsule?.discovery?.privateDataInference) hardStop.push('prohibited-discovery-method');
  if (!(Number(capsule?.discovery?.qualifiedProspectCount) > 0) || !clean(capsule?.discovery?.evidenceRef, 1000)) wait.push('qualified-lead-evidence-required');
  const recipient = clean(capsule?.recipient?.email, 320).toLowerCase();
  const messageRecipient = clean(capsule?.message?.to, 320).toLowerCase();
  if (!recipient || !messageRecipient || recipient !== messageRecipient) hardStop.push('capsule-recipient-message-mismatch');
  const campaignId = clean(capsule?.campaignId, 240);
  if (!campaignId || clean(capsule?.message?.campaignId, 240) !== campaignId) hardStop.push('capsule-campaign-message-mismatch');
  if (!clean(capsule?.message?.subject, 500) || !clean(capsule?.message?.body, 100000)) hardStop.push('capsule-message-required');
  if (!clean(capsule?.idempotencyKey, 500)) hardStop.push('capsule-idempotency-key-required');
  return { actualDigest, hardStop: uniq(hardStop), wait: uniq(wait) };
}

function previewCampaignAuthorization(capsuleDigest, now) {
  return {
    authorized: true,
    receiptId: `preview_${sha256(capsuleDigest)}`,
    expiresAt: new Date(new Date(now).getTime() + 60_000).toISOString(),
    previewOnly: true
  };
}

export function evaluateSovereignOutreachButton({ capsule = {}, expectedDigest, now = new Date() } = {}) {
  const validation = validateCapsule(capsule, expectedDigest, now);
  if (validation.hardStop.length) return fail('ABSTAIN', validation.hardStop, { capsuleDigest: validation.actualDigest });

  const runtime = compileUberLaunchRuntimeEvidence(capsule.runtimeEvidence || {});
  const wait = [...validation.wait, ...(runtime.waitReasonCodes || [])];
  const launchDecision = evaluateOutreachLaunchGate({
    genome: capsule.genome,
    ...runtime.launchInputs,
    campaignAuthorization: previewCampaignAuthorization(validation.actualDigest, now),
    recipient: capsule.recipient,
    legal: capsule.legal,
    suppression: capsule.suppression,
    now
  });
  if (launchDecision.state === OUTREACH_LAUNCH_STATES.ABSTAIN) {
    return fail('ABSTAIN', launchDecision.hardStopReasonCodes || [], { capsuleDigest: validation.actualDigest, runtime, launchDecision });
  }
  if (launchDecision.state !== OUTREACH_LAUNCH_STATES.READY) wait.push(...(launchDecision.waitReasonCodes || []));
  const uniqueWait = uniq(wait);
  return {
    ok: uniqueWait.length === 0,
    version: SOVEREIGN_OUTREACH_BIG_BUTTON_VERSION,
    state: uniqueWait.length ? 'WAITING_FOR_REALITY' : 'READY_FOR_FOUNDER_PRESS',
    reasonCodes: uniqueWait,
    capsuleDigest: validation.actualDigest,
    campaignId: capsule.campaignId || null,
    recipientEmail: capsule?.recipient?.email || null,
    subject: capsule?.message?.subject || null,
    runtime,
    launchDecision,
    oneButtonPressAvailable: uniqueWait.length === 0,
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'READY_FOR_FOUNDER_PRESS proves only that the immutable prepared capsule and all non-founder launch gates are green on supplied evidence. This preview creates no campaign, dispatch, or send authority.'
  };
}

function mintFounderPressAuthorizations(capsule, capsuleDigest, now = new Date()) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const pressId = `ubpress_${sha256(`${capsuleDigest}\0${new Date(now).toISOString()}\0${nonce}`)}`;
  const expiresAt = new Date(new Date(now).getTime() + 5 * 60_000).toISOString();
  return {
    ownerAuthorization: { authorized: true, receiptId: pressId, authorizedBy: 'FOUNDER_PRIVATE_BIG_BUTTON', expiresAt, capsuleDigest },
    campaignAuthorization: { authorized: true, receiptId: `ubcmp_${sha256(`${pressId}\0${capsule.campaignId}`)}`, authorizedBy: 'FOUNDER_PRIVATE_BIG_BUTTON', expiresAt, campaignId: capsule.campaignId, capsuleDigest },
    dispatchAuthorization: { authorized: true, receiptId: `ubdsp_${sha256(`${pressId}\0${capsule.campaignId}\0${capsule.recipient.email}`)}`, authorizedBy: 'FOUNDER_PRIVATE_BIG_BUTTON', expiresAt, recipientEmail: capsule.recipient.email, campaignId: capsule.campaignId, capsuleDigest },
    pressId,
    expiresAt
  };
}

export function createPostalGovernedTransportAdapter({
  baseUrl,
  apiKey,
  fromAddress,
  messageIdDomain,
  fetchImpl = globalThis.fetch,
  reconciliationLookupFn = null,
  now = () => new Date(),
  timeoutMs = 15000
} = {}) {
  const domain = clean(messageIdDomain, 253).toLowerCase();
  const postal = new PostalEffectAdapter({ baseUrl, apiKey, fromAddress, messageIdDomain: domain, fetchImpl, reconciliationLookupFn, now, timeoutMs });
  return {
    provider: 'UBERDOSO_POSTAL',
    async send(input = {}) {
      const executionId = `ubig_${sha256(`${input.launchDecisionId || ''}\0${input.authorizationReceiptId || ''}\0${input.idempotencyKey || ''}`)}`;
      const providerEffectIdentity = `<v9-${sha256(executionId)}@${domain}>`;
      const prepared = await postal.prepare({
        businessKey: `${clean(input.campaignId, 240)}:${clean(input.to, 320).toLowerCase()}`,
        providerEffectIdentity,
        executionId,
        effectPayload: {
          to: input.to,
          from: input.from || fromAddress,
          subject: input.subject,
          body: input.body,
          ...(input.listUnsubscribe ? { listUnsubscribe: input.listUnsubscribe } : {})
        }
      });
      const result = await postal.dispatch(prepared);
      if (result?.classification === 'ACCEPTED' && clean(result?.providerReferenceId, 500)) {
        return { confirmed: true, providerReceiptId: `postal:${clean(result.providerReferenceId, 500)}`, providerEvidence: result.evidence || null };
      }
      return {
        confirmed: false,
        providerReceiptId: null,
        providerClassification: result?.classification || 'UNKNOWN',
        providerEvidence: result?.evidence || null,
        dispatchError: clean(result?.dispatchError, 1000) || null
      };
    }
  };
}

export async function pressSovereignOutreachBigButton({
  capsule = {},
  expectedDigest,
  transportAdapter,
  now = new Date()
} = {}) {
  const readiness = evaluateSovereignOutreachButton({ capsule, expectedDigest, now });
  if (!readiness.oneButtonPressAvailable) {
    return fail(readiness.state === 'ABSTAIN' ? 'BIG_BUTTON_ABSTAINED' : 'BIG_BUTTON_NOT_READY', readiness.reasonCodes || [], { capsuleDigest: readiness.capsuleDigest, readiness, providerCalls: 0, messagesSent: 0 });
  }
  const auth = mintFounderPressAuthorizations(capsule, readiness.capsuleDigest, now);
  const runtime = readiness.runtime;
  const launchInputs = {
    genome: capsule.genome,
    ...runtime.launchInputs,
    campaignAuthorization: auth.campaignAuthorization,
    recipient: capsule.recipient,
    legal: capsule.legal,
    suppression: capsule.suppression
  };
  const manifest = compileUberLaunchManifest({
    sourceReadiness: capsule.sourceReadiness,
    discovery: capsule.discovery,
    substrate: runtime.substrate,
    launchInputs,
    ownerAuthorization: auth.ownerAuthorization,
    now
  });
  if (manifest.state !== 'READY_TO_PRESS') {
    return fail('BIG_BUTTON_MANIFEST_REFUSED', [...(manifest.hardStopReasonCodes || []), ...(manifest.waitReasonCodes || [])], { capsuleDigest: readiness.capsuleDigest, manifest, providerCalls: 0, messagesSent: 0 });
  }
  const dispatch = await pressUberLaunchButton({
    manifest,
    ownerAuthorization: auth.ownerAuthorization,
    dispatchAuthorization: auth.dispatchAuthorization,
    message: capsule.message,
    transportAdapter,
    idempotencyKey: capsule.idempotencyKey,
    now
  });
  return {
    ...dispatch,
    version: SOVEREIGN_OUTREACH_BIG_BUTTON_VERSION,
    pressId: auth.pressId,
    capsuleDigest: readiness.capsuleDigest,
    manifestId: manifest.manifestId,
    campaignAuthorizationReceiptId: auth.campaignAuthorization.receiptId,
    dispatchAuthorizationReceiptId: auth.dispatchAuthorization.receiptId,
    automaticRetryAuthorized: false,
    truthBoundary: `${dispatch.truthBoundary || ''} One authenticated founder press minted only short-lived authority bound to this exact immutable capsule, campaign and recipient. It did not waive suppression, legal, reputation, provider, runtime or idempotency gates.`.trim()
  };
}
