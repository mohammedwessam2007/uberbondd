import { PostgresStore } from '../../src/store.mjs';
import { processPayPalWebhook } from '../../src/paypal-payment-truth.mjs';

let liveStorePromise = null;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

async function defaultStore(env) {
  if (!env.DATABASE_URL) throw new Error('database-url-required');
  if (!liveStorePromise) {
    liveStorePromise = (async () => {
      const store = new PostgresStore({
        databaseUrl: env.DATABASE_URL,
        ssl: String(env.DATABASE_SSL || '').toLowerCase() !== 'false'
      });
      await store.init();
      return store;
    })();
  }
  return liveStorePromise;
}

function responseStatus(result) {
  if (result?.ok) return 200;
  if (result?.status === 'UNAUTHORIZED') return 401;
  if (['NOT_CONFIGURED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_EFFECT_UNCERTAIN'].includes(result?.status)) return 503;
  if (result?.status === 'REVIEW_REQUIRED') return 200;
  return 400;
}

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
    reasonCodes,
    commercialTruthEligible: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: result?.externalEffectLedger || null
  };
}

async function enforceCompletedCaptureTriad({ store, raw, result }) {
  if (!result?.ok) return result;
  if (!['PAYPAL_PROVIDER_CLEARED_WITNESSES_PERSISTED', 'PAYPAL_PAYMENT_ALREADY_RECONCILED'].includes(result.status)) {
    return result;
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); }
  catch { return reviewRequired(result, ['paypal-post-reconcile-event-json-invalid']); }
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

  if (!exactProviderIdentity || !exactEconomics || !exactTriadBinding) {
    return reviewRequired(result, ['paypal-provider-event-replay-identity-contradiction']);
  }
  return result;
}

export function createFetchHandler(deps = {}) {
  const env = deps.env || process.env;
  const storeFactory = deps.getStore || defaultStore;
  const processWebhook = deps.processPayPalWebhook || processPayPalWebhook;
  return async function handler(request) {
    if (request?.method && request.method !== 'POST') return json({ ok: false, status: 'REFUSED', reasonCodes: ['method-not-allowed'] }, 405);
    let raw;
    try { raw = Buffer.from(await request.arrayBuffer()); } catch { return json({ ok: false, status: 'REFUSED', reasonCodes: ['raw-body-read-failed'] }, 400); }
    if (!raw.length) return json({ ok: false, status: 'REFUSED', reasonCodes: ['raw-body-required'] }, 400);
    if (raw.length > 1024 * 1024) return json({ ok: false, status: 'REFUSED', reasonCodes: ['body-too-large'] }, 413);
    let store;
    try { store = await storeFactory(env); } catch { return json({ ok: false, status: 'REFUSED', reasonCodes: ['payment-store-unavailable'] }, 503); }
    let result = await processWebhook({ store, env, rawBody: raw, headers: request.headers });
    result = await enforceCompletedCaptureTriad({ store, raw, result });
    // A verified but unresolved reversal/dispute is acknowledged to stop an
    // infinite provider retry storm. The durable payment-retention risk entry
    // keeps commercial truth blocked until independent provider evidence clears it.
    return json(result, responseStatus(result));
  };
}

export const POST = createFetchHandler();