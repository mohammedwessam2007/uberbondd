import crypto from 'node:crypto';

export const XPAY_WEBHOOK_POLICY_VERSION = 'uberbond.xpay-webhook-input.v1';
const effects = () => ({ paymentMutations: 0, fulfillmentEffects: 0, messages: 0, spendCents: 0 });
const id = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = (reason, httpStatus = 400) => ({ ok: false, status: 'REFUSED', httpStatus,
  reasonCodes: [reason], businessEffectAuthority: 'NONE', externalEffectLedger: effects() });

// Provider documentation: HMAC-SHA256(secret, timestamp + '.' + raw bytes).
// This is input admission ONLY. Paid state, revenue and fulfilment require
// independently reconciled canonical witnesses; metadata is never authority.
export function verifyXPayWebhook({ rawBody, signature, signingSecret, environment, now = Date.now() } = {}) {
  if (!signingSecret || !['test', 'live'].includes(environment)) return fail('xpay-endpoint-not-configured', 503);
  if (!Buffer.isBuffer(rawBody) || !rawBody.length) return fail('raw-body-required');
  if (rawBody.length > 1024 * 1024) return fail('body-too-large', 413);
  if (typeof signature !== 'string' || signature.length > 512) return fail('invalid-xpay-signature', 401);
  const fields = signature.split(',').map(part => part.trim().split('='));
  if (fields.length !== 2 || fields.some(part => part.length !== 2)
    || fields.filter(([key]) => key === 't').length !== 1
    || fields.filter(([key]) => key === 'v1').length !== 1) return fail('invalid-xpay-signature', 401);
  const header = Object.fromEntries(fields);
  if (!/^\d{1,12}$/.test(header.t) || !/^[a-f0-9]{64}$/i.test(header.v1)) return fail('invalid-xpay-signature', 401);
  const seconds = Math.floor(Number(now) / 1000);
  if (!Number.isFinite(seconds) || Math.abs(seconds - Number(header.t)) > 300) return fail('xpay-signature-outside-replay-window', 401);
  const expected = crypto.createHmac('sha256', signingSecret).update(header.t + '.').update(rawBody).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(header.v1, 'hex'))) return fail('invalid-xpay-signature', 401);
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch { return fail('invalid-json'); }
  const session = payload?.data?.object;
  if (!id(payload?.id) || !id(session?.id)) return fail('xpay-event-and-object-id-required');
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(payload.type)
    || session.object !== 'checkout.session') return fail('unsupported-xpay-event');
  if (typeof payload.livemode !== 'boolean' || typeof session.livemode !== 'boolean'
    || payload.livemode !== session.livemode || payload.livemode !== (environment === 'live')) return fail('xpay-mode-mismatch');
  if (!['open', 'complete', 'expired'].includes(session.status)
    || !['paid', 'unpaid', 'no_payment_required'].includes(session.paymentStatus)) return fail('xpay-session-state-required');
  const providerEventKey = hash(`xpay|${environment}|${payload.id}`);
  return { ok: true, status: 'VERIFIED_WEBHOOK_READY_FOR_DURABLE_INBOX', httpStatus: 200,
    policyVersion: XPAY_WEBHOOK_POLICY_VERSION, businessEffectAuthority: 'NONE', externalEffectLedger: effects(),
    event: { provider: 'xpay', providerEventKey, eventName: payload.type,
      objectId: session.id, objectType: session.object, payloadHash: hash(rawBody),
      // No customer details, client secrets, card details or user metadata.
      customData: { environment, providerEventId: payload.id, providerStatus: session.status,
        providerPaymentStatus: session.paymentStatus, commercialTruthEligible: false },
      admissionLaw: 'INPUT_EVIDENCE_ONLY; NO_REVENUE_OR_FULFILLMENT_WITHOUT_CANONICAL_RECONCILIATION' } };
}
