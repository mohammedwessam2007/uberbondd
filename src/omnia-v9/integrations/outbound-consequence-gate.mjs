import { sha256 } from '../canonical.mjs';

const DIGEST_RE = /^[a-f0-9]{64}$/;

function text(value) {
  return String(value ?? '');
}

function normalizeMailbox(value) {
  return text(value).trim().toLowerCase();
}

function validDigest(value) {
  return DIGEST_RE.test(text(value));
}

/**
 * Builds the exact, immutable envelope checked at the last reversible
 * boundary in the legacy outbound pipeline. The email payload is built once,
 * hashed here, and the same object is subsequently passed to Gmail.
 */
export function buildOutboundConsequenceContext({
  reservation, prospect, campaign, account, effectPayload, followup = 0,
  idempotencyKey, checkedAt
}) {
  if (!reservation?.id || !prospect?.id || !campaign?.id || !account?.email) {
    throw new TypeError('outbound consequence context is incomplete');
  }
  const normalizedPayload = normalizeOutboundEffectPayload(effectPayload);
  const effectPayloadDigest = sha256(normalizedPayload);
  const actionIntent = {
    operation: 'OUTBOUND_EMAIL_SEND',
    consequenceClass: 'COMMUNICATE_EXTERNAL',
    reservationId: text(reservation.id),
    idempotencyKey: text(idempotencyKey || reservation.idempotencyKey),
    prospectId: text(prospect.id),
    campaignId: text(campaign.id),
    inbox: text(prospect.inbox || reservation.inbox),
    senderEmail: normalizeMailbox(account.email),
    recipientEmail: normalizedPayload.to,
    followup: Number(followup || 0),
    effectPayloadDigest
  };
  return {
    schemaVersion: 'omnia.v9.outbound-consequence-gate.v1',
    boundary: 'AFTER_DURABLE_RESERVATION_BEFORE_DISPATCHING',
    checkedAt: text(checkedAt || new Date().toISOString()),
    reservation: {
      id: text(reservation.id),
      state: 'reserved',
      idempotencyKey: actionIntent.idempotencyKey
    },
    actionIntent,
    actionIntentDigest: sha256(actionIntent),
    effectPayloadDigest
  };
}

export function normalizeOutboundEffectPayload(effectPayload = {}) {
  return {
    from: text(effectPayload?.from),
    to: normalizeMailbox(effectPayload?.to),
    subject: text(effectPayload?.subject),
    body: text(effectPayload?.body),
    threadId: text(effectPayload?.threadId),
    replyToId: text(effectPayload?.replyToId),
    listUnsubscribe: text(effectPayload?.listUnsubscribe)
  };
}

export function digestOutboundEffectPayload(effectPayload = {}) {
  return sha256(normalizeOutboundEffectPayload(effectPayload));
}

/**
 * Fail-closed verifier for the authoritative hook. No hook, hook error,
 * malformed output, DENY/REVIEW, or any stale/mismatched binding blocks the
 * provider call. This function performs no external I/O itself.
 */
export async function enforceOutboundConsequence({ hook, context }) {
  const contextDigest = sha256(context);
  const base = {
    schemaVersion: 'omnia.v9.outbound-consequence-admission.v1',
    authoritative: true,
    enforced: true,
    reservationId: context?.reservation?.id || '',
    contextDigest,
    actionIntentDigest: context?.actionIntentDigest || '',
    effectPayloadDigest: context?.effectPayloadDigest || ''
  };

  if (typeof hook !== 'function') {
    return { ...base, allowed: false, decision: 'DENY', reason: 'authoritative-consequence-gate-not-configured' };
  }

  let result;
  try {
    result = await hook(context);
  } catch (error) {
    return {
      ...base, allowed: false, decision: 'DENY', reason: 'authoritative-consequence-gate-error',
      error: text(error?.message || error).slice(0, 500)
    };
  }

  const decision = text(result?.decision).toUpperCase();
  if (decision !== 'ALLOW') {
    return { ...base, allowed: false, decision: decision || 'DENY', reason: text(result?.reason || 'authoritative-admission-not-allow').slice(0, 240) };
  }

  const exactBindings = [
    ['contextDigest', contextDigest],
    ['reservationId', context.reservation.id],
    ['actionIntentDigest', context.actionIntentDigest],
    ['effectPayloadDigest', context.effectPayloadDigest]
  ];
  for (const [field, expected] of exactBindings) {
    if (text(result?.[field]) !== text(expected)) {
      return { ...base, allowed: false, decision: 'DENY', reason: `${field}-mismatch` };
    }
  }

  if (result?.authoritative !== true || result?.enforced !== true) {
    return { ...base, allowed: false, decision: 'DENY', reason: 'admission-not-authoritative-and-enforced' };
  }
  for (const field of ['authorizationDigest', 'policyDigest', 'constitutionDigest']) {
    if (!validDigest(result?.[field])) {
      return { ...base, allowed: false, decision: 'DENY', reason: `${field}-invalid` };
    }
  }
  if (!text(result?.authorityReservationId).trim()) {
    return { ...base, allowed: false, decision: 'DENY', reason: 'authority-reservation-id-missing' };
  }

  return {
    ...base,
    allowed: true,
    decision: 'ALLOW',
    reason: 'authoritative-admission-bound',
    authorizationDigest: result.authorizationDigest,
    policyDigest: result.policyDigest,
    constitutionDigest: result.constitutionDigest,
    authorityReservationId: text(result.authorityReservationId)
  };
}
