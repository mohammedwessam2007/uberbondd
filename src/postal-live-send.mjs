import { ADAPTER_OUTCOMES } from './omnia-v9/integrations/external-effect-adapter.mjs';
import {
  PostalEffectAdapter,
  postalProviderEffectIdentity
} from './omnia-v9/integrations/providers/postal-effect-adapter.mjs';

export const POSTAL_LIVE_SEND_VERSION = 'uberbond.postal-live-send.v1';

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function refusal(reasonCodes) {
  return {
    ok: false,
    classification: ADAPTER_OUTCOMES.REJECTED,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    providerCalls: 0
  };
}

/**
 * The narrow production bridge from Pipeline's already-authorized outbound
 * reservation into the existing PostalEffectAdapter.
 *
 * This module owns no campaign authority and performs no retries. It can be
 * reached only after Pipeline's suppression/evidence/cap/domain-mailbox/final
 * recheck and authoritative consequence gate. A timeout or ambiguous provider
 * response remains UNCERTAIN and therefore must never become automatic retry
 * permission.
 */
export async function dispatchPostalCanary({
  cfg,
  account,
  reservation,
  effectPayload,
  followup = 0,
  fetchImpl = globalThis.fetch,
  now = () => new Date()
} = {}) {
  if (String(cfg?.outbound?.provider || '').toLowerCase() !== 'postal' || cfg?.outbound?.useEffectAdapter !== true) {
    return { handled: false, providerCalls: 0 };
  }

  const reasons = [];
  if (!reservation?.id || !reservation?.idempotencyKey) reasons.push('durable-outbound-reservation-required');
  if (!account?.connected || !text(account?.email, 320)) reasons.push('connected-postal-sender-required');
  if (!cfg?.providers?.postal?.configured || !text(cfg?.providers?.postal?.apiKey, 5000)) reasons.push('postal-api-key-required');
  if (!text(cfg?.providers?.postal?.baseUrl, 1000)) reasons.push('postal-base-url-required');
  if (!text(cfg?.outbound?.messageIdDomain, 253)) reasons.push('postal-message-id-domain-required');
  if (Number(followup || 0) !== 0) reasons.push('postal-canary-followups-not-enabled');
  if (effectPayload?.threadId || effectPayload?.replyToId) reasons.push('postal-canary-threaded-send-not-enabled');
  if (reasons.length) return { handled: true, ...refusal(reasons) };

  const executionId = `outbound:${reservation.id}`;
  const providerEffectIdentity = postalProviderEffectIdentity(executionId, cfg.outbound.messageIdDomain);
  const adapter = new PostalEffectAdapter({
    baseUrl: cfg.providers.postal.baseUrl,
    apiKey: cfg.providers.postal.apiKey,
    fromAddress: account.email,
    messageIdDomain: cfg.outbound.messageIdDomain,
    fetchImpl,
    now
  });

  let prepared;
  try {
    prepared = await adapter.prepare({
      businessKey: reservation.idempotencyKey,
      providerEffectIdentity,
      executionId,
      effectPayload: {
        to: effectPayload?.to,
        from: account.email,
        subject: effectPayload?.subject,
        body: effectPayload?.body,
        listUnsubscribe: effectPayload?.listUnsubscribe
      }
    });
  } catch (error) {
    return {
      handled: true,
      ok: false,
      classification: ADAPTER_OUTCOMES.REJECTED,
      reasonCodes: [`postal-prepare-refused:${text(error?.code || error?.message || error, 240)}`],
      providerCalls: 0
    };
  }

  let result;
  try {
    result = await adapter.dispatch(prepared);
  } catch (error) {
    return {
      handled: true,
      ok: false,
      classification: ADAPTER_OUTCOMES.UNCERTAIN,
      dispatchError: text(error?.message || error, 500),
      providerCalls: adapter.dispatchCallCount
    };
  }

  return {
    handled: true,
    ok: result.classification === ADAPTER_OUTCOMES.ACCEPTED,
    classification: result.classification,
    providerReferenceId: result.providerReferenceId || null,
    messageId: prepared.messageId,
    providerEffectIdentity,
    argumentsDigest: prepared.argumentsDigest,
    evidence: result.evidence || null,
    dispatchError: result.dispatchError || null,
    providerCalls: adapter.dispatchCallCount,
    truthBoundary: 'ACCEPTED proves Postal accepted the exact API submission. It does not prove inbox placement, human receipt, reply, revenue, or future deliverability.'
  };
}
