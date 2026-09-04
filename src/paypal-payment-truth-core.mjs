import crypto from 'node:crypto';

import { classifyPaymentEvent, PAYMENT_TRUTH_POLICY_VERSION } from './payments.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PAYPAL_PAYMENT_TRUTH_VERSION = 'uberbond.paypal-payment-truth-1.0.0';
export const PAYPAL_LIVE_API = 'https://api-m.paypal.com';
export const PAYPAL_SANDBOX_API = 'https://api-m.sandbox.paypal.com';
export const FIRST_CASH_PAYPAL_SKU = 'lead-path-revenue-leak-evidence-sprint-usd-450';
export const FIRST_CASH_PAYPAL_AMOUNT_CENTS = 45_000;
export const FIRST_CASH_PAYPAL_CURRENCY = 'USD';

const MAX_PROVIDER_RESPONSE_BYTES = 512_000;
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPT_KEY = 'first-cash-v1';
const COMPLETION_EVENT = 'PAYMENT.CAPTURE.COMPLETED';
const REFUND_EVENT = 'PAYMENT.CAPTURE.REFUNDED';
const REVERSED_EVENT = 'PAYMENT.CAPTURE.REVERSED';
const DISPUTE_EVENTS = new Set(['CUSTOMER.DISPUTE.CREATED', 'CUSTOMER.DISPUTE.UPDATED', 'CUSTOMER.DISPUTE.RESOLVED']);
const SELLER_SAFE_DISPUTE_OUTCOMES = new Set(['RESOLVED_SELLER_FAVOUR', 'CANCELED_BY_BUYER', 'DENIED']);

function cloneZero() {
  return { ...ZERO_EXTERNAL_EFFECTS, providerCalls: 0, paymentMutations: 0 };
}

function text(value, max = 500) {
  const out = String(value ?? '').trim();
  return out.length <= max ? out : out.slice(0, max);
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function nowIso(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function fail(reasonCodes, status = 'REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZero(),
    ...extra
  };
}

function centsFromMoney(value) {
  const raw = text(value, 40);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function moneyFromCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function normalizeEnvironment(value) {
  const mode = text(value, 20).toLowerCase();
  return mode === 'sandbox' || mode === 'live' ? mode : null;
}

function configFor(env = process.env) {
  const environment = normalizeEnvironment(env.PAYPAL_ENVIRONMENT);
  const live = environment === 'live';
  const clientId = live ? text(env.PAYPAL_LIVE_CLIENT_ID, 4000) : text(env.PAYPAL_SANDBOX_CLIENT_ID, 4000);
  const clientSecret = live ? text(env.PAYPAL_LIVE_CLIENT_SECRET, 4000) : text(env.PAYPAL_SANDBOX_CLIENT_SECRET, 4000);
  const webhookId = live ? text(env.PAYPAL_LIVE_WEBHOOK_ID, 4000) : text(env.PAYPAL_SANDBOX_WEBHOOK_ID, 4000);
  return {
    environment,
    apiBase: live ? PAYPAL_LIVE_API : PAYPAL_SANDBOX_API,
    clientId,
    clientSecret,
    webhookId
  };
}

export function describePayPalPaymentTruthConfig({ env = process.env } = {}) {
  const cfg = configFor(env);
  const blockers = [];
  if (!cfg.environment) blockers.push('paypal-environment-required');
  if (!cfg.clientId) blockers.push('paypal-client-id-required');
  if (!cfg.clientSecret) blockers.push('paypal-client-secret-required');
  if (!cfg.webhookId) blockers.push('paypal-webhook-id-required');
  return {
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    ready: blockers.length === 0,
    environment: cfg.environment ? cfg.environment.toUpperCase() : null,
    clientIdPresent: Boolean(cfg.clientId),
    clientSecretPresent: Boolean(cfg.clientSecret),
    webhookIdPresent: Boolean(cfg.webhookId),
    blockers,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZero()
  };
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return text(headers.get(name), 4000);
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return text(value, 4000);
  }
  return '';
}

async function readJsonResponse(response) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new Error('provider-response-too-large');
  }
  const raw = String(await response.text());
  if (Buffer.byteLength(raw, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) throw new Error('provider-response-too-large');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('provider-response-json-required');
  }
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function oauth({ cfg, fetchImpl }) {
  if (!cfg.environment || !cfg.clientId || !cfg.clientSecret) return fail(['paypal-provider-credentials-not-configured'], 'NOT_CONFIGURED');
  if (typeof fetchImpl !== 'function') return fail(['fetch-implementation-required'], 'NOT_CONFIGURED');
  let response;
  try {
    response = await fetchWithTimeout(fetchImpl, `${cfg.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json'
      },
      body: 'grant_type=client_credentials'
    });
  } catch {
    return fail(['paypal-oauth-network-or-timeout'], 'PROVIDER_UNAVAILABLE');
  }
  let payload;
  try { payload = await readJsonResponse(response); } catch { return fail(['paypal-oauth-response-invalid'], 'PROVIDER_UNAVAILABLE'); }
  if (!response.ok) return fail([`paypal-oauth-http-${Number(response.status) || 'unknown'}`], 'PROVIDER_UNAVAILABLE');
  const accessToken = text(payload?.access_token, 5000);
  if (!accessToken) return fail(['paypal-oauth-token-missing'], 'PROVIDER_UNAVAILABLE');
  return { ok: true, accessToken };
}

async function providerJson({
  cfg,
  fetchImpl,
  method = 'GET',
  path,
  body,
  requestId = '',
  mutation = false,
  attempts = mutation ? 2 : 1
}) {
  const auth = await oauth({ cfg, fetchImpl });
  if (!auth.ok) return auth;
  const headers = {
    authorization: `Bearer ${auth.accessToken}`,
    accept: 'application/json'
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (requestId) headers['paypal-request-id'] = requestId;

  let lastFailure = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, `${cfg.apiBase}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      lastFailure = fail(
        [mutation ? 'paypal-mutation-result-uncertain' : 'paypal-provider-network-or-timeout'],
        mutation ? 'PROVIDER_EFFECT_UNCERTAIN' : 'PROVIDER_UNAVAILABLE',
        requestId ? { requestId } : {}
      );
      continue;
    }

    let payload;
    try {
      payload = await readJsonResponse(response);
    } catch {
      return fail(['paypal-provider-response-invalid'], mutation ? 'PROVIDER_EFFECT_UNCERTAIN' : 'PROVIDER_UNAVAILABLE', requestId ? { requestId } : {});
    }

    if (response.ok) {
      return {
        ok: true,
        payload,
        httpStatus: Number(response.status) || 200,
        requestId: requestId || null
      };
    }
    const status = Number(response.status) || 0;
    if (mutation && status >= 500 && attempt < attempts) {
      lastFailure = fail(['paypal-mutation-result-uncertain'], 'PROVIDER_EFFECT_UNCERTAIN', requestId ? { requestId } : {});
      continue;
    }
    return fail(
      [`paypal-provider-http-${status || 'unknown'}`],
      status >= 500 ? (mutation ? 'PROVIDER_EFFECT_UNCERTAIN' : 'PROVIDER_UNAVAILABLE') : 'PROVIDER_REJECTED',
      requestId ? { requestId } : {}
    );
  }
  return lastFailure || fail(['paypal-provider-call-failed'], mutation ? 'PROVIDER_EFFECT_UNCERTAIN' : 'PROVIDER_UNAVAILABLE');
}

function bindingFor({ intentId, leadId, prospectId, product, amountCents, currency, environment }) {
  return { intentId, leadId, prospectId, product, amountCents, currency, environment };
}

function buildIntent({ leadId, prospectId, environment, attemptKey = DEFAULT_ATTEMPT_KEY, date = new Date() }) {
  const product = FIRST_CASH_PAYPAL_SKU;
  const amountCents = FIRST_CASH_PAYPAL_AMOUNT_CENTS;
  const currency = FIRST_CASH_PAYPAL_CURRENCY;
  const seed = `${leadId}|${prospectId}|${product}|${amountCents}|${currency}|${environment}|${attemptKey}`;
  const intentId = `paypal_intent_${sha(seed).slice(0, 24)}`;
  const bindingDigest = sha(JSON.stringify(bindingFor({ intentId, leadId, prospectId, product, amountCents, currency, environment })));
  return {
    id: intentId,
    intentId,
    provider: 'paypal',
    providerEventId: `intent:${intentId}`,
    eventName: 'PAYPAL_ORDER_INTENT',
    leadId,
    prospectId,
    product,
    amountCents,
    currency,
    environment: environment.toUpperCase(),
    attemptKey,
    bindingDigest,
    customId: `ub:${intentId}:${bindingDigest.slice(0, 16)}`,
    invoiceId: `ub-${intentId}`,
    createRequestId: `ub-create-${sha(intentId).slice(0, 28)}`,
    captureRequestId: `ub-capture-${sha(intentId).slice(0, 28)}`,
    providerOrderId: null,
    providerCaptureId: null,
    approveUrl: null,
    status: 'INTENT_PREPARED',
    createdAt: nowIso(date),
    updatedAt: nowIso(date)
  };
}

function validIntent(record) {
  if (!record || record.provider !== 'paypal' || record.eventName !== 'PAYPAL_ORDER_INTENT') return false;
  const expected = sha(JSON.stringify(bindingFor({
    intentId: record.intentId,
    leadId: record.leadId,
    prospectId: record.prospectId,
    product: record.product,
    amountCents: Number(record.amountCents),
    currency: record.currency,
    environment: String(record.environment || '').toUpperCase()
  })));
  return expected === record.bindingDigest
    && record.customId === `ub:${record.intentId}:${expected.slice(0, 16)}`
    && record.invoiceId === `ub-${record.intentId}`;
}

function exactPurchaseUnit(order, intent) {
  const units = Array.isArray(order?.purchase_units) ? order.purchase_units : [];
  if (units.length !== 1) return null;
  const unit = units[0];
  const itemRows = Array.isArray(unit?.items) ? unit.items : [];
  const item = itemRows.length === 1 ? itemRows[0] : null;
  const amount = centsFromMoney(unit?.amount?.value);
  const currency = text(unit?.amount?.currency_code, 12).toUpperCase();
  if (text(unit?.reference_id, 200) !== intent.intentId) return null;
  if (text(unit?.custom_id, 200) !== intent.customId) return null;
  if (text(unit?.invoice_id, 200) !== intent.invoiceId) return null;
  if (amount !== intent.amountCents || currency !== intent.currency) return null;
  if (!item || text(item?.sku, 200) !== intent.product || text(item?.quantity, 20) !== '1') return null;
  if (centsFromMoney(item?.unit_amount?.value) !== intent.amountCents) return null;
  if (text(item?.unit_amount?.currency_code, 12).toUpperCase() !== intent.currency) return null;
  return unit;
}

function completedCaptureFromOrder(order, intent) {
  const unit = exactPurchaseUnit(order, intent);
  if (!unit) return null;
  const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
  const completed = captures.filter(row => text(row?.status, 40).toUpperCase() === 'COMPLETED');
  if (completed.length !== 1) return null;
  const capture = completed[0];
  if (centsFromMoney(capture?.amount?.value) !== intent.amountCents) return null;
  if (text(capture?.amount?.currency_code, 12).toUpperCase() !== intent.currency) return null;
  if (text(capture?.custom_id, 200) && text(capture.custom_id, 200) !== intent.customId) return null;
  if (text(capture?.invoice_id, 200) && text(capture.invoice_id, 200) !== intent.invoiceId) return null;
  return capture;
}

function approvalUrl(order) {
  const links = Array.isArray(order?.links) ? order.links : [];
  const hit = links.find(link => ['payer-action', 'approve'].includes(text(link?.rel, 40).toLowerCase()));
  const href = text(hit?.href, 2000);
  if (!href) return null;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function orderCreateBody(intent, { returnUrl, cancelUrl }) {
  return {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: intent.intentId,
      custom_id: intent.customId,
      invoice_id: intent.invoiceId,
      description: 'UberBond Lead-Path Revenue Leak Evidence Sprint',
      amount: {
        currency_code: intent.currency,
        value: moneyFromCents(intent.amountCents),
        breakdown: {
          item_total: { currency_code: intent.currency, value: moneyFromCents(intent.amountCents) }
        }
      },
      items: [{
        name: 'Lead-Path Revenue Leak Evidence Sprint',
        sku: intent.product,
        quantity: '1',
        category: 'DIGITAL_GOODS',
        unit_amount: { currency_code: intent.currency, value: moneyFromCents(intent.amountCents) }
      }]
    }],
    payment_source: {
      paypal: {
        experience_context: {
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: returnUrl,
          cancel_url: cancelUrl
        }
      }
    }
  };
}

function safePublicUrl(value, environment) {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (environment === 'live' && url.protocol !== 'https:') return null;
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function ensureIntentRecord(store, intent) {
  let existing = await store.get('orders', intent.id);
  if (existing) return existing;
  try {
    await store.add('orders', intent);
  } catch (error) {
    if (error?.code !== 'CONFLICT') throw error;
  }
  existing = await store.get('orders', intent.id);
  return existing || intent;
}

export async function preparePayPalFirstCashOrder({
  store,
  leadId,
  env = process.env,
  fetchImpl = globalThis.fetch,
  attemptKey = DEFAULT_ATTEMPT_KEY,
  returnUrl = '',
  cancelUrl = '',
  date = new Date()
} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.add !== 'function' || typeof store.patch !== 'function') {
    return fail(['store-required']);
  }
  const cfg = configFor(env);
  const doctor = describePayPalPaymentTruthConfig({ env });
  if (!doctor.ready) return fail(doctor.blockers, 'NOT_CONFIGURED');
  const leadKey = text(leadId, 200);
  if (!leadKey) return fail(['lead-id-required']);
  const lead = await store.get('leads', leadKey);
  if (!lead) return fail(['lead-not-found']);
  const prospectId = text(lead.prospectId, 200);
  if (!prospectId) return fail(['lead-prospect-binding-required']);

  const base = text(env.APP_BASE_URL, 2000).replace(/\/$/, '');
  const intentPreview = buildIntent({
    leadId: leadKey,
    prospectId,
    environment: cfg.environment.toUpperCase(),
    attemptKey: text(attemptKey, 120) || DEFAULT_ATTEMPT_KEY,
    date
  });
  const resolvedReturn = safePublicUrl(
    returnUrl || `${base}/api/payments/paypal-capture?intent=${encodeURIComponent(intentPreview.intentId)}`,
    cfg.environment
  );
  const resolvedCancel = safePublicUrl(cancelUrl || `${base}/?paypal=cancelled`, cfg.environment);
  if (!resolvedReturn || !resolvedCancel) return fail(['paypal-return-and-cancel-url-required']);

  let intent = await ensureIntentRecord(store, intentPreview);
  if (!validIntent(intent)) return fail(['paypal-intent-binding-invalid']);
  if (intent.environment !== cfg.environment.toUpperCase()) return fail(['paypal-intent-environment-mismatch']);
  if (intent.providerOrderId && intent.approveUrl && ['APPROVAL_PENDING', 'CAPTURE_SUBMITTED', 'WEBHOOK_RECONCILED'].includes(intent.status)) {
    return {
      ok: true,
      policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
      status: 'PAYPAL_ORDER_REUSED',
      intentId: intent.intentId,
      providerOrderId: intent.providerOrderId,
      approvalUrl: intent.approveUrl,
      environment: intent.environment,
      commercialTruthEligible: false,
      businessEffectAuthority: 'PAYPAL_ORDER_PREPARATION_ONLY',
      externalEffectLedger: cloneZero()
    };
  }

  const created = await providerJson({
    cfg,
    fetchImpl,
    method: 'POST',
    path: '/v2/checkout/orders',
    body: orderCreateBody(intent, { returnUrl: resolvedReturn, cancelUrl: resolvedCancel }),
    requestId: intent.createRequestId,
    mutation: true
  });
  if (!created.ok) return created;
  const orderId = text(created.payload?.id, 80);
  const approve = approvalUrl(created.payload);
  if (!orderId || !approve) return fail(['paypal-order-id-and-approval-url-required'], 'PROVIDER_RESPONSE_INVALID');

  const observed = await providerJson({ cfg, fetchImpl, path: `/v2/checkout/orders/${encodeURIComponent(orderId)}` });
  if (!observed.ok) return observed;
  if (text(observed.payload?.id, 80) !== orderId || text(observed.payload?.intent, 40).toUpperCase() !== 'CAPTURE') {
    return fail(['paypal-created-order-identity-mismatch']);
  }
  if (!exactPurchaseUnit(observed.payload, intent)) return fail(['paypal-created-order-binding-mismatch']);

  const at = nowIso(date);
  intent = await store.patch('orders', intent.id, {
    providerOrderId: orderId,
    approveUrl: approve,
    status: 'APPROVAL_PENDING',
    providerObservedAt: at,
    updatedAt: at
  });

  return {
    ok: true,
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    status: 'APPROVAL_PENDING',
    intentId: intent.intentId,
    providerOrderId: orderId,
    approvalUrl: approve,
    environment: intent.environment,
    commercialTruthEligible: false,
    businessEffectAuthority: 'PAYPAL_ORDER_PREPARATION_ONLY',
    externalEffectLedger: { ...cloneZero(), providerCalls: 3, paymentMutations: 0 }
  };
}

export async function capturePayPalFirstCashOrder({
  store,
  intentId,
  providerOrderId,
  env = process.env,
  fetchImpl = globalThis.fetch,
  date = new Date()
} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.patch !== 'function') return fail(['store-required']);
  const cfg = configFor(env);
  const doctor = describePayPalPaymentTruthConfig({ env });
  if (!doctor.ready) return fail(doctor.blockers, 'NOT_CONFIGURED');
  const intent = await store.get('orders', text(intentId, 200));
  if (!validIntent(intent)) return fail(['valid-paypal-intent-required']);
  if (intent.environment !== cfg.environment.toUpperCase()) return fail(['paypal-intent-environment-mismatch']);
  const orderId = text(providerOrderId, 80);
  if (!orderId || orderId !== intent.providerOrderId) return fail(['paypal-return-order-id-mismatch']);
  if (intent.status === 'WEBHOOK_RECONCILED') {
    return {
      ok: true,
      policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
      status: 'ALREADY_RECONCILED',
      intentId: intent.intentId,
      commercialTruthEligible: cfg.environment === 'live',
      businessEffectAuthority: 'NONE',
      externalEffectLedger: cloneZero()
    };
  }

  const captured = await providerJson({
    cfg,
    fetchImpl,
    method: 'POST',
    path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    body: {},
    requestId: intent.captureRequestId,
    mutation: true
  });
  if (!captured.ok) {
    if (captured.status === 'PROVIDER_EFFECT_UNCERTAIN') {
      await store.patch('orders', intent.id, { status: 'CAPTURE_UNCERTAIN', updatedAt: nowIso(date) });
    }
    return captured;
  }
  if (text(captured.payload?.id, 80) !== orderId || text(captured.payload?.status, 40).toUpperCase() !== 'COMPLETED') {
    return fail(['paypal-capture-response-not-completed'], 'PROVIDER_RESPONSE_INVALID');
  }
  const capture = completedCaptureFromOrder(captured.payload, intent);
  const captureId = text(capture?.id, 80);
  if (!captureId) return fail(['paypal-completed-capture-binding-invalid'], 'PROVIDER_RESPONSE_INVALID');

  await store.patch('orders', intent.id, {
    status: 'CAPTURE_SUBMITTED',
    providerCaptureId: captureId,
    captureObservedAt: nowIso(date),
    updatedAt: nowIso(date)
  });
  return {
    ok: true,
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    status: 'WAITING_FOR_SIGNED_PROVIDER_WEBHOOK',
    intentId: intent.intentId,
    providerOrderId: orderId,
    providerCaptureId: captureId,
    environment: intent.environment,
    commercialTruthEligible: false,
    truthBoundary: 'CAPTURE_RESPONSE_IS_NOT_CLEARED_PAYMENT_TRUTH',
    businessEffectAuthority: 'PAYPAL_CAPTURE_REQUEST_ONLY',
    externalEffectLedger: { ...cloneZero(), providerCalls: 2, paymentMutations: 1 }
  };
}

async function verifyWebhook({ cfg, rawBody, headers, fetchImpl }) {
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
  if (!raw.length) return fail(['paypal-webhook-body-required']);
  if (raw.length > 1024 * 1024) return fail(['paypal-webhook-body-too-large']);
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return fail(['paypal-webhook-json-invalid']); }
  const transmissionId = headerValue(headers, 'paypal-transmission-id');
  const transmissionTime = headerValue(headers, 'paypal-transmission-time');
  const transmissionSig = headerValue(headers, 'paypal-transmission-sig');
  const certUrl = headerValue(headers, 'paypal-cert-url');
  const authAlgo = headerValue(headers, 'paypal-auth-algo');
  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return fail(['paypal-webhook-transmission-headers-required'], 'UNAUTHORIZED');
  }
  if (!cfg.webhookId) return fail(['paypal-webhook-id-required'], 'NOT_CONFIGURED');

  const verification = await providerJson({
    cfg,
    fetchImpl,
    method: 'POST',
    path: '/v1/notifications/verify-webhook-signature',
    body: {
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: cfg.webhookId,
      webhook_event: event
    }
  });
  if (!verification.ok) return verification;
  if (text(verification.payload?.verification_status, 40).toUpperCase() !== 'SUCCESS') {
    return fail(['paypal-webhook-signature-verification-failed'], 'UNAUTHORIZED');
  }
  return { ok: true, event };
}

function captureBinding(resource) {
  return {
    captureId: text(resource?.id, 80),
    status: text(resource?.status, 40).toUpperCase(),
    amountCents: centsFromMoney(resource?.amount?.value),
    currency: text(resource?.amount?.currency_code, 12).toUpperCase(),
    customId: text(resource?.custom_id, 200),
    invoiceId: text(resource?.invoice_id, 200),
    orderId: text(resource?.supplementary_data?.related_ids?.order_id, 80)
  };
}

function customIntentId(customId) {
  const match = /^ub:(paypal_intent_[a-f0-9]{24}):([a-f0-9]{16})$/i.exec(text(customId, 200));
  return match ? { intentId: match[1], digestPrefix: match[2].toLowerCase() } : null;
}

function exactCaptureBinding(binding, intent) {
  if (!binding || !validIntent(intent)) return false;
  const parsed = customIntentId(binding.customId);
  return Boolean(
    parsed
    && parsed.intentId === intent.intentId
    && parsed.digestPrefix === intent.bindingDigest.slice(0, 16)
    && binding.invoiceId === intent.invoiceId
    && binding.orderId === intent.providerOrderId
    && binding.amountCents === intent.amountCents
    && binding.currency === intent.currency
  );
}

async function findIntentByCaptureId(store, captureId) {
  const rows = await store.list('orders');
  return rows.find(row =>
    row?.provider === 'paypal'
    && row?.eventName === 'PAYPAL_ORDER_INTENT'
    && text(row?.providerCaptureId, 80) === captureId
  ) || null;
}

async function materializeCanonicalWitnesses({
  store,
  intent,
  eventName,
  eventId,
  providerObjectId,
  amountCents,
  currency,
  classification,
  revenueSign,
  date,
  providerExtra = {}
}) {
  const eventKey = `${eventName}:${eventId}`;
  const existing = (await store.list('orders')).find(row =>
    row?.provider === 'paypal'
    && row?.eventName === eventName
    && row?.providerEventId === eventId
  );
  if (existing) {
    const identical = Number(existing.amountCents) === Number(amountCents)
      && text(existing.currency, 12).toUpperCase() === currency
      && existing.leadId === intent.leadId
      && existing.prospectId === intent.prospectId
      && existing.product === intent.product;
    return identical
      ? { ok: true, duplicate: true, eventKey }
      : fail(['paypal-provider-event-replay-contradiction']);
  }

  const at = nowIso(date);
  const witnessId = `paypal_witness_${sha(eventKey).slice(0, 24)}`;
  const revenueId = `paypal_revenue_${sha(eventKey).slice(0, 24)}`;
  const auditId = `paypal_payment_audit_${sha(eventKey).slice(0, 24)}`;

  try {
    await store.transaction(async tx => {
      const race = (await tx.list('orders')).find(row =>
        row?.provider === 'paypal'
        && row?.eventName === eventName
        && row?.providerEventId === eventId
      );
      if (race) return;

      await tx.add('orders', {
        id: witnessId,
        provider: 'paypal',
        providerEventId: eventId,
        providerOccurrenceId: eventId,
        providerObjectId,
        eventName,
        leadId: intent.leadId,
        prospectId: intent.prospectId,
        product: intent.product,
        amountCents,
        currency,
        status: classification === 'CLEARED_ONE_TIME_PAYMENT' ? 'paid' : 'reversed',
        testMode: false,
        environment: 'LIVE',
        ...providerExtra,
        createdAt: at,
        updatedAt: at
      });
      await tx.add('auditLog', {
        id: auditId,
        type: 'payment_classification',
        detail: {
          provider: 'paypal',
          classification,
          reasonCodes: classification === 'CLEARED_ONE_TIME_PAYMENT'
            ? ['cleared-one-time-payment']
            : ['refund-or-dispute'],
          eventName,
          eventId,
          providerObjectId,
          amountCents,
          currency,
          leadId: intent.leadId,
          prospectId: intent.prospectId,
          product: intent.product,
          testMode: false,
          shouldUnlock: classification === 'CLEARED_ONE_TIME_PAYMENT',
          shouldRecordRevenue: true,
          revenueKind: revenueSign > 0 ? 'sale' : 'refund',
          policyVersion: PAYMENT_TRUTH_POLICY_VERSION,
          timestamp: at
        },
        createdAt: at
      });
      await tx.add('revenueEvents', {
        id: revenueId,
        provider: 'paypal',
        providerEventId: eventKey,
        leadId: intent.leadId,
        prospectId: intent.prospectId,
        product: intent.product,
        kind: revenueSign > 0 ? 'sale' : 'refund',
        amountCents: Math.abs(amountCents) * revenueSign,
        currency,
        createdAt: at
      });
      if (eventName === 'order_created') {
        await tx.patch('orders', intent.id, {
          status: 'WEBHOOK_RECONCILED',
          providerCaptureId: providerObjectId,
          reconciledProviderEventId: eventId,
          reconciledAt: at,
          updatedAt: at
        });
      }
    });
  } catch (error) {
    if (error?.code !== 'CONFLICT') return fail(['paypal-canonical-witness-transaction-failed']);
  }
  return { ok: true, duplicate: false, eventKey };
}

async function logSandboxWebhook(store, event, date) {
  const eventId = text(event?.id, 160);
  if (!eventId) return;
  const id = `paypal_sandbox_${sha(eventId).slice(0, 24)}`;
  try {
    await store.add('auditLog', {
      id,
      type: 'paypal_sandbox_webhook_verified',
      detail: {
        provider: 'paypal',
        environment: 'SANDBOX',
        eventId,
        eventType: text(event?.event_type, 120),
        commercialTruthEligible: false
      },
      createdAt: nowIso(date)
    });
  } catch (error) {
    if (error?.code !== 'CONFLICT') throw error;
  }
}

async function reconcileCompletedCapture({ store, cfg, event, fetchImpl, date }) {
  const resource = captureBinding(event?.resource);
  if (!resource.captureId || resource.status !== 'COMPLETED') return fail(['paypal-completed-capture-shape-invalid']);
  const parsed = customIntentId(resource.customId);
  if (!parsed) return fail(['paypal-capture-custom-id-invalid']);
  const intent = await store.get('orders', parsed.intentId);
  if (!validIntent(intent)) return fail(['paypal-capture-intent-not-found-or-invalid']);
  if (intent.environment !== cfg.environment.toUpperCase()) return fail(['paypal-capture-environment-mismatch']);
  if (!exactCaptureBinding(resource, intent)) return fail(['paypal-webhook-capture-binding-mismatch']);

  const captureRead = await providerJson({
    cfg,
    fetchImpl,
    path: `/v2/payments/captures/${encodeURIComponent(resource.captureId)}`
  });
  if (!captureRead.ok) return captureRead;
  const captureObserved = captureBinding(captureRead.payload);
  if (captureObserved.captureId !== resource.captureId || captureObserved.status !== 'COMPLETED' || !exactCaptureBinding(captureObserved, intent)) {
    return fail(['paypal-independent-capture-lookup-mismatch']);
  }

  const orderRead = await providerJson({
    cfg,
    fetchImpl,
    path: `/v2/checkout/orders/${encodeURIComponent(resource.orderId)}`
  });
  if (!orderRead.ok) return orderRead;
  if (text(orderRead.payload?.id, 80) !== intent.providerOrderId
    || text(orderRead.payload?.status, 40).toUpperCase() !== 'COMPLETED'
    || !exactPurchaseUnit(orderRead.payload, intent)) {
    return fail(['paypal-independent-order-lookup-mismatch']);
  }
  const orderCapture = completedCaptureFromOrder(orderRead.payload, intent);
  if (text(orderCapture?.id, 80) !== resource.captureId) return fail(['paypal-order-capture-id-mismatch']);

  const lead = await store.get('leads', intent.leadId);
  if (!lead || text(lead.prospectId, 200) !== intent.prospectId) return fail(['paypal-payment-lead-binding-stale']);
  const canonicalEvent = {
    provider: 'paypal',
    eventName: 'order_created',
    eventId: text(event.id, 160),
    providerOccurrenceId: text(event.id, 160),
    providerObjectId: resource.captureId,
    custom: {
      lead_id: intent.leadId,
      prospect_id: intent.prospectId,
      product: intent.product
    },
    amountCents: resource.amountCents,
    providerAmountCents: resource.amountCents,
    currency: resource.currency,
    status: 'paid',
    testMode: false
  };
  const decision = classifyPaymentEvent({ event: canonicalEvent, lead, cfg: {} });
  if (decision.classification !== 'CLEARED_ONE_TIME_PAYMENT'
    || decision.shouldUnlock !== true
    || decision.shouldRecordRevenue !== true) {
    return fail(['paypal-canonical-payment-classification-refused', ...(decision.reasonCodes || [])]);
  }
  const materialized = await materializeCanonicalWitnesses({
    store,
    intent,
    eventName: canonicalEvent.eventName,
    eventId: canonicalEvent.eventId,
    providerObjectId: resource.captureId,
    amountCents: resource.amountCents,
    currency: resource.currency,
    classification: decision.classification,
    revenueSign: 1,
    date,
    providerExtra: {
      providerOrderId: resource.orderId,
      providerCaptureId: resource.captureId,
      providerCustomId: resource.customId,
      providerInvoiceId: resource.invoiceId
    }
  });
  if (!materialized.ok) return materialized;
  return {
    ok: true,
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    status: materialized.duplicate ? 'PAYPAL_PAYMENT_ALREADY_RECONCILED' : 'PAYPAL_PROVIDER_CLEARED_WITNESSES_PERSISTED',
    providerEventRef: `order_created:${canonicalEvent.eventId}`,
    leadId: intent.leadId,
    prospectId: intent.prospectId,
    product: intent.product,
    amountCents: resource.amountCents,
    currency: resource.currency,
    commercialTruthEligible: true,
    businessEffectAuthority: 'CANONICAL_PAYMENT_WITNESS_ONLY',
    externalEffectLedger: { ...cloneZero(), providerCalls: 3, paymentMutations: 0 }
  };
}

async function reconcileRefund({ store, cfg, event, fetchImpl, date }) {
  const refundId = text(event?.resource?.id, 80);
  if (!refundId) return fail(['paypal-refund-id-required']);
  const refundRead = await providerJson({ cfg, fetchImpl, path: `/v2/payments/refunds/${encodeURIComponent(refundId)}` });
  if (!refundRead.ok) return refundRead;
  if (text(refundRead.payload?.id, 80) !== refundId || text(refundRead.payload?.status, 40).toUpperCase() !== 'COMPLETED') {
    return fail(['paypal-refund-lookup-not-completed']);
  }
  const captureId = text(refundRead.payload?.supplementary_data?.related_ids?.capture_id, 80);
  const amountCents = centsFromMoney(refundRead.payload?.amount?.value);
  const currency = text(refundRead.payload?.amount?.currency_code, 12).toUpperCase();
  if (!captureId || !Number.isSafeInteger(amountCents) || amountCents <= 0 || currency !== FIRST_CASH_PAYPAL_CURRENCY) {
    return fail(['paypal-refund-binding-invalid']);
  }
  const intent = await findIntentByCaptureId(store, captureId);
  if (!validIntent(intent) || intent.environment !== cfg.environment.toUpperCase()) return fail(['paypal-refund-intent-not-found-or-invalid']);
  if (amountCents > intent.amountCents) return fail(['paypal-refund-exceeds-original-payment']);

  const captureRead = await providerJson({ cfg, fetchImpl, path: `/v2/payments/captures/${encodeURIComponent(captureId)}` });
  if (!captureRead.ok) return captureRead;
  const observed = captureBinding(captureRead.payload);
  if (observed.captureId !== captureId || !exactCaptureBinding({ ...observed, status: observed.status }, intent)) {
    return fail(['paypal-refund-original-capture-mismatch']);
  }

  const canonical = {
    provider: 'paypal',
    eventName: 'order_refunded',
    eventId: text(event.id, 160),
    custom: { lead_id: intent.leadId, prospect_id: intent.prospectId, product: intent.product },
    amountCents,
    currency,
    status: 'refunded',
    testMode: false
  };
  const lead = await store.get('leads', intent.leadId);
  const decision = classifyPaymentEvent({ event: canonical, lead, cfg: {} });
  if (decision.classification !== 'REFUND_OR_DISPUTE' || decision.shouldRecordRevenue !== true) {
    return fail(['paypal-refund-classification-refused', ...(decision.reasonCodes || [])]);
  }
  const materialized = await materializeCanonicalWitnesses({
    store,
    intent,
    eventName: canonical.eventName,
    eventId: canonical.eventId,
    providerObjectId: refundId,
    amountCents,
    currency,
    classification: decision.classification,
    revenueSign: -1,
    date,
    providerExtra: { providerCaptureId: captureId, providerRefundId: refundId }
  });
  if (!materialized.ok) return materialized;
  return {
    ok: true,
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    status: materialized.duplicate ? 'PAYPAL_REFUND_ALREADY_RECONCILED' : 'PAYPAL_REFUND_WITNESSES_PERSISTED',
    providerEventRef: `order_refunded:${canonical.eventId}`,
    amountCents,
    currency,
    commercialTruthEligible: true,
    businessEffectAuthority: 'CANONICAL_PAYMENT_REVERSAL_WITNESS_ONLY',
    externalEffectLedger: { ...cloneZero(), providerCalls: 3, paymentMutations: 0 }
  };
}

async function logRetentionRisk({ store, intent, event, riskKey, status, outcome = null, date }) {
  const eventId = text(event?.id, 160);
  const id = `paypal_risk_${sha(`${riskKey}|${eventId}`).slice(0, 24)}`;
  try {
    await store.add('auditLog', {
      id,
      type: 'payment_retention_risk',
      detail: {
        provider: 'paypal',
        leadId: intent?.leadId || null,
        prospectId: intent?.prospectId || null,
        product: intent?.product || null,
        providerCaptureId: intent?.providerCaptureId || null,
        riskKey,
        status,
        outcome,
        providerEventId: eventId,
        providerEventType: text(event?.event_type, 120),
        observedAt: nowIso(date)
      },
      createdAt: nowIso(date)
    });
  } catch (error) {
    if (error?.code !== 'CONFLICT') throw error;
  }
}

async function reconcileReversal({ store, cfg, event, fetchImpl, date }) {
  const resource = captureBinding(event?.resource);
  if (!resource.captureId) return fail(['paypal-reversal-capture-id-required']);
  const intent = await findIntentByCaptureId(store, resource.captureId);
  if (!validIntent(intent) || intent.environment !== cfg.environment.toUpperCase()) return fail(['paypal-reversal-intent-not-found-or-invalid']);
  const captureRead = await providerJson({ cfg, fetchImpl, path: `/v2/payments/captures/${encodeURIComponent(resource.captureId)}` });
  if (!captureRead.ok) return captureRead;
  const observed = captureBinding(captureRead.payload);
  const exact = exactCaptureBinding({ ...observed, status: observed.status }, intent);
  if (!exact) {
    await logRetentionRisk({
      store, intent, event,
      riskKey: `paypal-reversal:${resource.captureId}`,
      status: 'OPEN',
      outcome: 'PROVIDER_REVERSAL_BINDING_UNCERTAIN',
      date
    });
    return fail(['paypal-reversal-binding-uncertain'], 'REVIEW_REQUIRED');
  }
  if (resource.amountCents !== intent.amountCents || resource.currency !== intent.currency) {
    await logRetentionRisk({
      store, intent, event,
      riskKey: `paypal-reversal:${resource.captureId}`,
      status: 'OPEN',
      outcome: 'REVERSAL_AMOUNT_UNCERTAIN',
      date
    });
    return fail(['paypal-reversal-amount-not-exact'], 'REVIEW_REQUIRED');
  }
  const eventId = text(event.id, 160);
  const materialized = await materializeCanonicalWitnesses({
    store,
    intent,
    eventName: 'order_refunded',
    eventId,
    providerObjectId: resource.captureId,
    amountCents: intent.amountCents,
    currency: intent.currency,
    classification: 'REFUND_OR_DISPUTE',
    revenueSign: -1,
    date,
    providerExtra: { providerCaptureId: resource.captureId, providerReversal: true }
  });
  if (!materialized.ok) return materialized;
  return {
    ok: true,
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    status: materialized.duplicate ? 'PAYPAL_REVERSAL_ALREADY_RECONCILED' : 'PAYPAL_REVERSAL_WITNESSES_PERSISTED',
    commercialTruthEligible: true,
    businessEffectAuthority: 'CANONICAL_PAYMENT_REVERSAL_WITNESS_ONLY',
    externalEffectLedger: { ...cloneZero(), providerCalls: 2, paymentMutations: 0 }
  };
}

function disputeCaptureIds(dispute) {
  const rows = Array.isArray(dispute?.disputed_transactions) ? dispute.disputed_transactions : [];
  const ids = new Set();
  for (const row of rows) {
    for (const value of [row?.seller_transaction_id, row?.buyer_transaction_id]) {
      const id = text(value, 80);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

async function reconcileDispute({ store, cfg, event, fetchImpl, date }) {
  const disputeId = text(event?.resource?.dispute_id || event?.resource?.id, 120);
  if (!disputeId) return fail(['paypal-dispute-id-required']);
  const read = await providerJson({ cfg, fetchImpl, path: `/v1/customer/disputes/${encodeURIComponent(disputeId)}` });
  if (!read.ok) return read;
  if (text(read.payload?.dispute_id, 120) !== disputeId) return fail(['paypal-dispute-lookup-id-mismatch']);
  const linked = disputeCaptureIds(read.payload);
  const intents = (await store.list('orders')).filter(row => row?.provider === 'paypal' && row?.eventName === 'PAYPAL_ORDER_INTENT');
  const intent = intents.find(row => linked.includes(text(row?.providerCaptureId, 80))) || null;
  if (!validIntent(intent)) return fail(['paypal-dispute-capture-not-bound-to-known-payment'], 'REVIEW_REQUIRED');

  const providerStatus = text(read.payload?.status, 80).toUpperCase();
  const outcome = text(read.payload?.dispute_outcome?.outcome_code, 120).toUpperCase();
  const resolvedSafe = providerStatus === 'RESOLVED' && SELLER_SAFE_DISPUTE_OUTCOMES.has(outcome);
  const riskStatus = resolvedSafe ? 'RESOLVED' : 'OPEN';
  await logRetentionRisk({
    store,
    intent,
    event,
    riskKey: `paypal-dispute:${disputeId}`,
    status: riskStatus,
    outcome: outcome || providerStatus || 'UNKNOWN',
    date
  });
  return {
    ok: true,
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    status: resolvedSafe ? 'PAYPAL_DISPUTE_RESOLVED_WITHOUT_RETENTION_LOSS' : 'PAYPAL_DISPUTE_BLOCKS_PAYMENT_RETENTION_TRUTH',
    disputeId,
    riskStatus,
    outcome: outcome || null,
    commercialTruthEligible: false,
    businessEffectAuthority: 'PAYMENT_RETENTION_EVIDENCE_ONLY',
    externalEffectLedger: { ...cloneZero(), providerCalls: 2, paymentMutations: 0 }
  };
}

export async function processPayPalWebhook({
  store,
  env = process.env,
  rawBody,
  headers,
  fetchImpl = globalThis.fetch,
  date = new Date()
} = {}) {
  if (!store || typeof store.list !== 'function' || typeof store.get !== 'function' || typeof store.add !== 'function' || typeof store.transaction !== 'function') {
    return fail(['store-required']);
  }
  const cfg = configFor(env);
  const doctor = describePayPalPaymentTruthConfig({ env });
  if (!doctor.ready) return fail(doctor.blockers, 'NOT_CONFIGURED');
  const verified = await verifyWebhook({ cfg, rawBody, headers, fetchImpl });
  if (!verified.ok) return verified;
  const event = verified.event;
  const eventId = text(event?.id, 160);
  const eventType = text(event?.event_type, 120).toUpperCase();
  if (!eventId || !eventType) return fail(['paypal-webhook-event-id-and-type-required']);

  if (cfg.environment === 'sandbox') {
    await logSandboxWebhook(store, event, date);
    return {
      ok: true,
      policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
      status: 'SANDBOX_WEBHOOK_VERIFIED_NO_COMMERCIAL_TRUTH',
      eventType,
      commercialTruthEligible: false,
      truthBoundary: 'PAYPAL_SANDBOX_CAN_NEVER_CREATE_CLEARED_REVENUE',
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...cloneZero(), providerCalls: 2, paymentMutations: 0 }
    };
  }

  if (eventType === COMPLETION_EVENT) return reconcileCompletedCapture({ store, cfg, event, fetchImpl, date });
  if (eventType === REFUND_EVENT) return reconcileRefund({ store, cfg, event, fetchImpl, date });
  if (eventType === REVERSED_EVENT) return reconcileReversal({ store, cfg, event, fetchImpl, date });
  if (DISPUTE_EVENTS.has(eventType)) return reconcileDispute({ store, cfg, event, fetchImpl, date });

  return {
    ok: true,
    policyVersion: PAYPAL_PAYMENT_TRUTH_VERSION,
    status: 'PAYPAL_WEBHOOK_VERIFIED_IGNORED_NON_MONEY_EVENT',
    eventType,
    commercialTruthEligible: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...cloneZero(), providerCalls: 2, paymentMutations: 0 }
  };
}
