// Canonical PayPal payment-truth boundary.
//
// The large provider implementation remains byte-preserved in
// paypal-payment-truth-core.mjs. This facade exists so no caller, including a
// direct module caller, can treat a replayed provider occurrence or incomplete
// canonical witness triad as cleared payment. API routes may add further
// defense-in-depth, but the money primitive itself is fail closed.

export * from './paypal-payment-truth-core.mjs';

import { processPayPalWebhook as processPayPalWebhookCore } from './paypal-payment-truth-core.mjs';

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function centsFromMoney(value) {
  const raw = text(value, 40);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function reviewRequired(result, reasonCodes) {
  return {
    ok: false,
    status: 'REVIEW_REQUIRED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    commercialTruthEligible: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: result?.externalEffectLedger || null
  };
}

function rawEvent(rawBody) {
  try {
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

async function enforceCanonicalCompletedCaptureTriad({ store, rawBody, result }) {
  if (!result?.ok) return result;
  if (!['PAYPAL_PROVIDER_CLEARED_WITNESSES_PERSISTED', 'PAYPAL_PAYMENT_ALREADY_RECONCILED'].includes(result.status)) {
    return result;
  }

  const event = rawEvent(rawBody);
  if (!event) return reviewRequired(result, ['paypal-post-reconcile-event-json-invalid']);
  if (text(event?.event_type, 120).toUpperCase() !== 'PAYMENT.CAPTURE.COMPLETED') return result;

  const eventId = text(event?.id, 160);
  const captureId = text(event?.resource?.id, 80);
  const orderId = text(event?.resource?.supplementary_data?.related_ids?.order_id, 80);
  const customId = text(event?.resource?.custom_id, 200);
  const invoiceId = text(event?.resource?.invoice_id, 200);
  const amountCents = centsFromMoney(event?.resource?.amount?.value);
  const currency = text(event?.resource?.amount?.currency_code, 12).toUpperCase();
  if (!eventId || !captureId || !orderId || !customId || !invoiceId || !Number.isSafeInteger(amountCents) || !currency) {
    return reviewRequired(result, ['paypal-post-reconcile-provider-identity-incomplete']);
  }

  let orders;
  let audits;
  let revenue;
  try {
    [orders, audits, revenue] = await Promise.all([
      store.list('orders'),
      store.list('auditLog'),
      store.list('revenueEvents')
    ]);
  } catch {
    return reviewRequired(result, ['paypal-post-reconcile-witness-read-failed']);
  }

  const orderWitnesses = orders.filter(row =>
    row?.provider === 'paypal'
    && row?.eventName === 'order_created'
    && row?.providerEventId === eventId
  );
  const auditWitnesses = audits.filter(row =>
    row?.type === 'payment_classification'
    && row?.detail?.provider === 'paypal'
    && row?.detail?.eventName === 'order_created'
    && row?.detail?.eventId === eventId
  );
  const revenueWitnesses = revenue.filter(row =>
    row?.provider === 'paypal'
    && row?.providerEventId === `order_created:${eventId}`
  );

  // PAYPAL_MODULE_REPLAY_TRIAD_GUARD
  if (orderWitnesses.length !== 1 || auditWitnesses.length !== 1 || revenueWitnesses.length !== 1) {
    return reviewRequired(result, ['paypal-canonical-witness-triad-incomplete-or-duplicated']);
  }

  const order = orderWitnesses[0];
  const audit = auditWitnesses[0]?.detail || {};
  const revenueRow = revenueWitnesses[0];

  const exactProviderIdentity = order.providerObjectId === captureId
    && order.providerCaptureId === captureId
    && order.providerOrderId === orderId
    && order.providerCustomId === customId
    && order.providerInvoiceId === invoiceId;

  const exactEconomics = Number(order.amountCents) === amountCents
    && text(order.currency, 12).toUpperCase() === currency
    && Number(revenueRow.amountCents) === amountCents
    && text(revenueRow.currency, 12).toUpperCase() === currency;

  const exactTriadBinding = audit.providerObjectId === order.providerObjectId
    && Number(audit.amountCents) === Number(order.amountCents)
    && text(audit.currency, 12).toUpperCase() === text(order.currency, 12).toUpperCase()
    && audit.leadId === order.leadId
    && audit.prospectId === order.prospectId
    && audit.product === order.product
    && revenueRow.leadId === order.leadId
    && revenueRow.prospectId === order.prospectId
    && revenueRow.product === order.product
    && revenueRow.kind === 'sale';

  // PAYPAL_MODULE_REPLAY_IDENTITY_GUARD
  if (!exactProviderIdentity || !exactEconomics || !exactTriadBinding) {
    return reviewRequired(result, ['paypal-provider-event-replay-identity-contradiction']);
  }

  return result;
}

export async function processPayPalWebhook(args = {}) {
  const result = await processPayPalWebhookCore(args);
  return enforceCanonicalCompletedCaptureTriad({
    store: args.store,
    rawBody: args.rawBody,
    result
  });
}
