import { sha256 } from './canonical.mjs';

function clip(value, max = 240) {
  return String(value ?? '').slice(0, max);
}

function finiteTimestamp(value) {
  const text = String(value || '');
  const parsed = Date.parse(text);
  if (!text || !Number.isFinite(parsed)) throw new Error('valid receipt timestamp required');
  return new Date(parsed).toISOString();
}

function baseReceipt({ shadowContext, shadowObservation, occurredAt }) {
  if (!shadowContext?.reservation?.id) throw new Error('shadow context reservation required');
  if (!shadowContext?.action?.prospectId || !shadowContext?.action?.campaignId) throw new Error('shadow context action incomplete');
  return {
    schemaVersion: 'omnia.v9.outbound-execution-receipt-shadow.p5',
    authoritative: false,
    enforced: false,
    epistemicClaim: 'PROVIDER_API_RESULT_ONLY',
    occurredAt: finiteTimestamp(occurredAt || new Date().toISOString()),
    preEffectContextDigest: sha256(shadowContext),
    preEffectObservationDigest: shadowObservation ? sha256(shadowObservation) : '',
    reservation: {
      id: String(shadowContext.reservation.id),
      idempotencyKey: String(shadowContext.reservation.idempotencyKey || ''),
      inbox: String(shadowContext.reservation.inbox || ''),
      recipientEmail: String(shadowContext.reservation.recipientEmail || ''),
      kind: String(shadowContext.reservation.kind || ''),
      followup: Number(shadowContext.reservation.followup || 0)
    },
    action: {
      operation: String(shadowContext.action.operation || ''),
      prospectId: String(shadowContext.action.prospectId || ''),
      campaignId: String(shadowContext.action.campaignId || ''),
      senderEmail: String(shadowContext.action.senderEmail || ''),
      recipientEmail: String(shadowContext.action.recipientEmail || ''),
      subjectSha256: String(shadowContext.action.subjectSha256 || ''),
      bodySha256: String(shadowContext.action.bodySha256 || '')
    }
  };
}

export function buildProviderAcceptedReceipt({ shadowContext, shadowObservation, providerResult, rfcMessageId = '', occurredAt }) {
  const gmailId = String(providerResult?.data?.id || '');
  if (!gmailId) throw new Error('provider result gmail id required');
  const receipt = {
    ...baseReceipt({ shadowContext, shadowObservation, occurredAt }),
    outcome: 'PROVIDER_ACCEPTED',
    provider: {
      name: 'gmail',
      apiAccepted: true,
      gmailId,
      threadId: String(providerResult?.data?.threadId || ''),
      rfcMessageId: String(rfcMessageId || ''),
      resultDigest: sha256({
        gmailId,
        threadId: String(providerResult?.data?.threadId || ''),
        rfcMessageId: String(rfcMessageId || '')
      })
    },
    deliveryClaim: 'NOT_ESTABLISHED'
  };
  return { ...receipt, receiptDigest: sha256(receipt) };
}

export function buildProviderUncertainReceipt({ shadowContext, shadowObservation, error, occurredAt }) {
  const errorText = clip(error?.message || error || 'provider-result-uncertain', 1000);
  const receipt = {
    ...baseReceipt({ shadowContext, shadowObservation, occurredAt }),
    outcome: 'PROVIDER_RESULT_UNCERTAIN',
    provider: {
      name: 'gmail',
      apiAccepted: null,
      errorName: clip(error?.name || 'Error', 120),
      errorDigest: sha256(errorText)
    },
    deliveryClaim: 'UNKNOWN'
  };
  return { ...receipt, receiptDigest: sha256(receipt) };
}

export function verifyExecutionReceiptShadow(receipt) {
  if (!receipt || typeof receipt !== 'object') return { ok: false, reason: 'receipt-required' };
  const { receiptDigest, ...unsigned } = receipt;
  if (!receiptDigest || sha256(unsigned) !== receiptDigest) return { ok: false, reason: 'receipt-digest-mismatch' };
  if (receipt.authoritative !== false || receipt.enforced !== false) return { ok: false, reason: 'shadow-receipt-must-be-non-authoritative' };
  if (!['PROVIDER_ACCEPTED', 'PROVIDER_RESULT_UNCERTAIN'].includes(receipt.outcome)) return { ok: false, reason: 'unknown-receipt-outcome' };
  if (!receipt.preEffectContextDigest || !receipt.reservation?.id || !receipt.action?.prospectId) return { ok: false, reason: 'receipt-binding-incomplete' };
  if (receipt.outcome === 'PROVIDER_ACCEPTED') {
    if (receipt.provider?.apiAccepted !== true || !receipt.provider?.gmailId) return { ok: false, reason: 'accepted-receipt-provider-evidence-incomplete' };
    if (receipt.deliveryClaim !== 'NOT_ESTABLISHED') return { ok: false, reason: 'accepted-receipt-overclaims-delivery' };
  }
  if (receipt.outcome === 'PROVIDER_RESULT_UNCERTAIN') {
    if (receipt.provider?.apiAccepted !== null || !receipt.provider?.errorDigest) return { ok: false, reason: 'uncertain-receipt-provider-evidence-incomplete' };
    if (receipt.deliveryClaim !== 'UNKNOWN') return { ok: false, reason: 'uncertain-receipt-overclaims-delivery' };
  }
  return { ok: true };
}

export async function recordExecutionReceiptShadow({ store, receipt }) {
  const verification = verifyExecutionReceiptShadow(receipt);
  if (!verification.ok) return { recorded: false, ...verification };
  try {
    await store?.log?.('omnia_v9_outbound_execution_receipt_shadow', receipt);
    return { recorded: true, receiptDigest: receipt.receiptDigest };
  } catch {
    return { recorded: false, reason: 'audit-log-failed', receiptDigest: receipt.receiptDigest };
  }
}
