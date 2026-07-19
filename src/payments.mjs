import crypto from 'node:crypto';

export const OFFER_TYPES = Object.freeze(['diagnostic', 'implementation-sprint', 'monitoring']);
export const PAYMENT_STATES = Object.freeze(['draft', 'approved', 'checkout-sent', 'paid', 'refunded', 'disputed', 'cancelled']);

const TYPE_SET = new Set(OFFER_TYPES);
const STATE_SET = new Set(PAYMENT_STATES);
const CURRENCIES = new Set(['USD', 'AED', 'SAR', 'QAR', 'KWD', 'GBP', 'AUD', 'EUR']);
const PROVIDERS = new Set(['test', 'manual', 'lemonsqueezy']);
const TRANSITIONS = Object.freeze({
  draft: new Set(['approved', 'cancelled']),
  approved: new Set(['checkout-sent', 'cancelled']),
  'checkout-sent': new Set(['paid', 'cancelled']),
  paid: new Set(['refunded', 'disputed', 'cancelled']),
  disputed: new Set(['paid', 'refunded', 'cancelled']),
  refunded: new Set(),
  cancelled: new Set()
});

export class PaymentStateError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'PaymentStateError';
    this.code = code;
  }
}

function clean(value = '', maximum = 500) {
  return String(value || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function cleanList(values = []) {
  if (!Array.isArray(values)) throw new PaymentStateError('offer-exclusions-invalid');
  return [...new Set(values.map(value => clean(value, 240)).filter(Boolean))].slice(0, 12);
}

function issueKey(issue = {}) {
  return crypto.createHash('sha256').update(JSON.stringify({
    title: clean(issue.title, 220),
    evidenceUrl: clean(issue.evidenceUrl, 1000),
    evidenceExcerpt: clean(issue.evidenceExcerpt, 500)
  })).digest('hex');
}

export function createOfferRecord(input = {}, at = new Date().toISOString()) {
  const allowed = new Set([
    'id', 'campaignId', 'prospectId', 'leadId', 'type', 'name', 'scope', 'exclusions',
    'amountCents', 'currency', 'provider', 'providerMode', 'checkoutKey', 'issue'
  ]);
  const unknown = Object.keys(input).filter(key => !allowed.has(key));
  if (unknown.length) throw new PaymentStateError('offer-unknown-field');
  for (const forbidden of ['discount', 'originalPrice', 'coupon', 'password', 'token', 'secret', 'apiKey', 'credentials']) {
    if (Object.hasOwn(input, forbidden)) throw new PaymentStateError('offer-forbidden-field');
  }
  const type = clean(input.type, 40).toLowerCase();
  const provider = clean(input.provider || 'test', 40).toLowerCase();
  const providerMode = provider === 'test' ? 'test' : provider === 'manual' ? 'manual' : clean(input.providerMode, 20).toLowerCase();
  const currency = clean(input.currency || 'USD', 3).toUpperCase();
  const amountCents = Number(input.amountCents);
  const issue = input.issue || {};
  const scope = clean(input.scope, 1200);
  if (!clean(input.id, 120) || !clean(input.campaignId, 120) || !clean(input.prospectId, 120)) throw new PaymentStateError('offer-linkage-required');
  if (!TYPE_SET.has(type)) throw new PaymentStateError('offer-type-invalid');
  if (!PROVIDERS.has(provider)) throw new PaymentStateError('offer-provider-invalid');
  if (provider === 'lemonsqueezy' && !['test', 'live'].includes(providerMode)) throw new PaymentStateError('offer-provider-mode-required');
  if (!CURRENCIES.has(currency)) throw new PaymentStateError('offer-currency-invalid');
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 100000000) throw new PaymentStateError('offer-amount-invalid');
  if (scope.length < 10) throw new PaymentStateError('offer-scope-required');
  if (!clean(issue.title, 220) || !clean(issue.evidenceUrl, 1000) || !clean(issue.evidenceExcerpt, 500)) {
    throw new PaymentStateError('offer-evidence-required');
  }
  let checkoutKey = clean(input.checkoutKey, 40).toLowerCase();
  if (type === 'diagnostic') checkoutKey = checkoutKey || 'full';
  if (type === 'monitoring') checkoutKey = 'monitoring';
  if (type === 'implementation-sprint') checkoutKey = 'implementation';
  if (!['full', 'strategy', 'monitoring', 'implementation'].includes(checkoutKey)) throw new PaymentStateError('offer-checkout-key-invalid');
  if (type === 'diagnostic' && !['full', 'strategy'].includes(checkoutKey)) throw new PaymentStateError('offer-checkout-key-invalid');
  if (type !== 'diagnostic' && ((type === 'monitoring') !== (checkoutKey === 'monitoring'))) throw new PaymentStateError('offer-checkout-key-invalid');
  return {
    id: clean(input.id, 120),
    campaignId: clean(input.campaignId, 120),
    prospectId: clean(input.prospectId, 120),
    leadId: clean(input.leadId, 120) || null,
    type,
    name: clean(input.name, 160) || ({ diagnostic: 'Diagnostic offer', 'implementation-sprint': 'Implementation sprint', monitoring: 'Monitoring offer' }[type]),
    scope,
    exclusions: cleanList(input.exclusions),
    amountCents,
    currency,
    provider,
    providerMode,
    checkoutKey,
    issueRef: issueKey(issue),
    issue: {
      title: clean(issue.title, 220),
      evidenceUrl: clean(issue.evidenceUrl, 1000),
      evidenceExcerpt: clean(issue.evidenceExcerpt, 500),
      service: clean(issue.service, 160)
    },
    status: 'draft',
    paymentState: 'draft',
    ownerApproval: { status: 'pending' },
    paymentHistory: [{ from: '', to: 'draft', source: 'owner-created', referenceHash: '', at }],
    recurring: type === 'monitoring',
    createdAt: at,
    updatedAt: at
  };
}

function safeReferenceHash(reference = '') {
  return reference ? crypto.createHash('sha256').update(String(reference)).digest('hex') : '';
}

export function transitionOfferRecord(offer = {}, nextState, detail = {}) {
  const current = clean(offer.paymentState || offer.status, 40).toLowerCase();
  const next = clean(nextState, 40).toLowerCase();
  if (!STATE_SET.has(current) || !STATE_SET.has(next)) throw new PaymentStateError('payment-state-invalid');
  const source = clean(detail.source, 60);
  if (next === 'approved' && source !== 'owner-approval') throw new PaymentStateError('offer-owner-approval-required');
  if (next === 'checkout-sent' && source !== 'owner-checkout') throw new PaymentStateError('checkout-owner-approval-required');
  if (next === 'paid' && !['verified-webhook', 'manual-owner', 'test-simulation'].includes(source)) {
    throw new PaymentStateError('verified-payment-source-required');
  }
  if (['refunded', 'disputed', 'cancelled'].includes(next) && !['verified-webhook', 'manual-owner', 'owner-cancel', 'test-simulation'].includes(source)) {
    throw new PaymentStateError('verified-payment-source-required');
  }
  const stableOffer = { ...offer };
  delete stableOffer.duplicateTransition;
  if (current === next) return stableOffer;
  if (!TRANSITIONS[current]?.has(next)) throw new PaymentStateError('payment-transition-invalid');
  const at = detail.at || new Date().toISOString();
  const history = [...(offer.paymentHistory || []), {
    from: current,
    to: next,
    source,
    referenceHash: safeReferenceHash(detail.reference),
    at
  }].slice(-100);
  const field = `${next.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())}At`;
  return {
    ...stableOffer,
    status: next,
    paymentState: next,
    paymentHistory: history,
    ...(next === 'approved' ? { ownerApproval: { status: 'approved', approvedAt: at, approvedBy: 'owner' } } : {}),
    [field]: at,
    updatedAt: at
  };
}

function checkoutBaseUrl(offer = {}, cfg = {}) {
  if (offer.checkoutKey === 'full') return cfg.fullAuditCheckoutUrl || '';
  if (offer.checkoutKey === 'strategy') return cfg.strategyAuditCheckoutUrl || '';
  if (offer.checkoutKey === 'monitoring') return cfg.monitoringCheckoutUrl || '';
  return cfg.implementationCheckoutUrl || '';
}

export function checkoutForOffer(offer = {}, cfg = {}) {
  if (offer.ownerApproval?.status !== 'approved' || !['approved', 'checkout-sent'].includes(offer.paymentState || offer.status)) {
    throw new PaymentStateError('offer-not-owner-approved');
  }
  if (offer.provider === 'test') return { configured: true, provider: 'test', mode: 'test', simulated: true, url: '' };
  if (offer.provider === 'manual') return { configured: true, provider: 'manual', mode: 'manual', simulated: false, url: '' };
  if (offer.provider !== 'lemonsqueezy') throw new PaymentStateError('offer-provider-invalid');
  const baseUrl = checkoutBaseUrl(offer, cfg);
  const url = checkoutUrl(baseUrl, {
    offer_id: offer.id,
    lead_id: offer.leadId || '',
    prospect_id: offer.prospectId,
    campaign_id: offer.campaignId,
    offer_type: offer.type
  });
  return { configured: Boolean(url), provider: 'lemonsqueezy', mode: offer.providerMode, simulated: false, url };
}

export function verifyLemonSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected=crypto.createHmac('sha256',secret).update(rawBody).digest('hex');
  const a=Buffer.from(expected,'utf8');
  const b=Buffer.from(String(signature),'utf8');
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

export function checkoutUrl(baseUrl, custom={}) {
  if(!baseUrl) return '';
  const url=new URL(baseUrl);
  for(const [key,value] of Object.entries(custom)) {
    if(value!==undefined&&value!==null&&String(value)!=='') url.searchParams.set(`checkout[custom][${key}]`,String(value));
  }
  return url.href;
}

export function normalizeLemonEvent(payload={}) {
  const meta=payload.meta||{};
  const data=payload.data||{};
  const attributes=data.attributes||{};
  return {
    eventName:String(meta.event_name||''),
    eventId:String(data.id||meta.webhook_id||''),
    objectType:String(data.type||''),
    custom: {
      offer_id: String(meta.custom_data?.offer_id || ''),
      lead_id: String(meta.custom_data?.lead_id || ''),
      prospect_id: String(meta.custom_data?.prospect_id || ''),
      campaign_id: String(meta.custom_data?.campaign_id || ''),
      offer_type: String(meta.custom_data?.offer_type || '')
    },
    testMode: [true, 1, '1', 'true'].includes(meta.test_mode) || [true, 1, '1', 'true'].includes(attributes.test_mode),
    amountCents:Number(attributes.total||attributes.subtotal||0),
    currency:String(attributes.currency||attributes.currency_code||'').toUpperCase(),
    status:String(attributes.status||''),
    createdAt:String(attributes.created_at||new Date().toISOString())
  };
}

export function lemonPaymentState(eventName = '') {
  const name = clean(eventName, 80).toLowerCase();
  if (['order_created', 'subscription_created', 'subscription_payment_success'].includes(name)) return 'paid';
  if (['order_refunded', 'subscription_payment_refunded'].includes(name)) return 'refunded';
  if (['order_disputed', 'order_dispute_created', 'subscription_payment_disputed'].includes(name)) return 'disputed';
  if (['subscription_cancelled', 'subscription_canceled', 'subscription_expired'].includes(name)) return 'cancelled';
  return '';
}

export function validateLemonPaymentEvent(event = {}, offer = {}) {
  const state = lemonPaymentState(event.eventName);
  if (!event.eventId || !event.eventName || !state) throw new PaymentStateError('lemon-event-unsupported');
  if (offer.provider !== 'lemonsqueezy') throw new PaymentStateError('offer-provider-mismatch');
  if (String(event.custom?.offer_id || '') !== offer.id) throw new PaymentStateError('offer-event-mismatch');
  if (event.custom?.lead_id && String(event.custom.lead_id) !== String(offer.leadId || '')) throw new PaymentStateError('offer-event-mismatch');
  if (event.custom?.prospect_id && String(event.custom.prospect_id) !== String(offer.prospectId || '')) throw new PaymentStateError('offer-event-mismatch');
  if (['paid', 'refunded'].includes(state) && String(event.currency || '').toUpperCase() !== offer.currency) throw new PaymentStateError('payment-currency-mismatch');
  if (state === 'disputed' && event.currency && String(event.currency).toUpperCase() !== offer.currency) throw new PaymentStateError('payment-currency-mismatch');
  if (['paid', 'refunded'].includes(state) && Number(event.amountCents) !== Number(offer.amountCents)) throw new PaymentStateError('payment-amount-mismatch');
  const expectedTestMode = offer.providerMode === 'test';
  if (Boolean(event.testMode) !== expectedTestMode) throw new PaymentStateError('payment-mode-mismatch');
  return { state, providerEventId: `${event.eventName}:${event.eventId}` };
}
