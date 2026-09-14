import crypto from 'node:crypto';
import { OUTREACH_LAUNCH_STATES } from './outreach-launch-gate.mjs';

export const GOVERNED_OUTREACH_DISPATCH_VERSION = 'uberbond.governed-outreach-dispatch.v1';

const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function failure(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: GOVERNED_OUTREACH_DISPATCH_VERSION,
    state: 'DISPATCH_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    providerCalls: 0,
    messagesSent: 0,
    ...extra
  };
}

function authorizationValid(authorization = {}, now = new Date()) {
  const reasons = [];
  if (authorization.authorized !== true) reasons.push('explicit-dispatch-authorization-required');
  if (!clean(authorization.receiptId, 240)) reasons.push('dispatch-authorization-receipt-required');
  if (!clean(authorization.authorizedBy, 240)) reasons.push('dispatch-authorizer-required');
  if (!clean(authorization.recipientEmail, 320)) reasons.push('authorized-recipient-required');
  if (!clean(authorization.campaignId, 240)) reasons.push('authorized-campaign-required');
  if (!authorization.expiresAt || !Number.isFinite(Date.parse(authorization.expiresAt))) reasons.push('dispatch-authorization-expiry-required');
  else if (Date.parse(authorization.expiresAt) <= new Date(now).getTime()) reasons.push('dispatch-authorization-expired');
  return reasons;
}

export async function dispatchGovernedOutreach({
  launchDecision,
  authorization,
  message = {},
  transportAdapter,
  idempotencyKey,
  now = new Date()
} = {}) {
  const reasons = [];
  if (launchDecision?.state !== OUTREACH_LAUNCH_STATES.READY || launchDecision?.readyForGovernedCanary !== true) reasons.push('ready-launch-decision-required');
  if (!clean(launchDecision?.decisionId, 240)) reasons.push('launch-decision-id-required');
  reasons.push(...authorizationValid(authorization, now));

  const recipient = clean(message.to, 320).toLowerCase();
  const campaignId = clean(message.campaignId, 240);
  if (!recipient) reasons.push('message-recipient-required');
  if (!campaignId) reasons.push('message-campaign-required');
  if (!clean(message.subject, 500)) reasons.push('message-subject-required');
  if (!clean(message.body, 100000)) reasons.push('message-body-required');
  if (recipient && clean(authorization?.recipientEmail, 320).toLowerCase() !== recipient) reasons.push('authorization-recipient-mismatch');
  if (campaignId && clean(authorization?.campaignId, 240) !== campaignId) reasons.push('authorization-campaign-mismatch');
  if (!clean(idempotencyKey, 500)) reasons.push('idempotency-key-required');
  if (!transportAdapter || typeof transportAdapter.send !== 'function') reasons.push('transport-send-capability-required');
  if (reasons.length) return failure(reasons);

  const dispatchId = `ubodsp_${sha256(JSON.stringify({
    launchDecisionId: launchDecision.decisionId,
    authorizationReceiptId: authorization.receiptId,
    idempotencyKey: clean(idempotencyKey, 500),
    recipient,
    campaignId,
    subject: clean(message.subject, 500),
    bodyDigest: sha256(clean(message.body, 100000))
  }))}`;

  try {
    const providerResult = await transportAdapter.send({
      to: recipient,
      from: clean(message.from, 320) || null,
      subject: clean(message.subject, 500),
      body: clean(message.body, 100000),
      replyTo: clean(message.replyTo, 320) || null,
      listUnsubscribe: clean(message.listUnsubscribe, 1200) || null,
      campaignId,
      idempotencyKey: clean(idempotencyKey, 500),
      launchDecisionId: launchDecision.decisionId,
      authorizationReceiptId: authorization.receiptId
    });

    if (providerResult?.confirmed !== true || !clean(providerResult?.providerReceiptId, 500)) {
      return {
        ok: false,
        version: GOVERNED_OUTREACH_DISPATCH_VERSION,
        state: 'DISPATCH_OUTCOME_UNCERTAIN',
        reasonCodes: ['provider-confirmation-required'],
        dispatchId,
        providerCalls: 1,
        messagesSent: 0,
        automaticRetryAuthorized: false,
        providerReceiptId: clean(providerResult?.providerReceiptId, 500) || null,
        truthBoundary: 'An ambiguous provider result is quarantined. No automatic retry is authorized because duplicate external effects are possible.'
      };
    }

    return {
      ok: true,
      version: GOVERNED_OUTREACH_DISPATCH_VERSION,
      state: 'PROVIDER_CONFIRMED_SEND',
      dispatchId,
      launchDecisionId: launchDecision.decisionId,
      authorizationReceiptId: authorization.receiptId,
      providerReceiptId: clean(providerResult.providerReceiptId, 500),
      providerCalls: 1,
      messagesSent: 1,
      automaticRetryAuthorized: false,
      truthBoundary: 'PROVIDER_CONFIRMED_SEND proves only that the configured provider adapter returned an explicit confirmation receipt for this exact separately-authorized action. It does not prove inbox placement, reply, opportunity, revenue, or future deliverability.'
    };
  } catch (error) {
    return {
      ok: false,
      version: GOVERNED_OUTREACH_DISPATCH_VERSION,
      state: 'DISPATCH_OUTCOME_UNCERTAIN',
      reasonCodes: ['provider-call-threw-after-dispatch-boundary'],
      dispatchId,
      providerCalls: 1,
      messagesSent: 0,
      automaticRetryAuthorized: false,
      error: clean(error?.message || error, 1000),
      truthBoundary: 'A thrown provider call after crossing the external boundary is treated as uncertain, never as definitely unsent, and is never retried automatically.'
    };
  }
}
