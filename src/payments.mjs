import crypto from 'node:crypto';

// Bump when the classification policy changes so past receipts stay
// attributable to the policy version that produced them.
export const PAYMENT_TRUTH_POLICY_VERSION = 'payment-truth-1.0.0';

export const KNOWN_PRODUCTS = ['full', 'strategy', 'monitoring'];

// The real Lemon Squeezy webhook event taxonomy. subscription_updated is
// metadata-only (plan/card/renewal-date changes) and never implies a new
// charge -- treating it as a sale is the single most common source of
// revenue overcounting for subscription businesses. subscription_created and
// subscription_payment_success are the only subscription events that
// represent an actual cleared charge.
const CLEARED_ONE_TIME_EVENTS = new Set(['order_created']);
const CLEARED_SUBSCRIPTION_EVENTS = new Set(['subscription_created', 'subscription_payment_success']);
const LIFECYCLE_UPDATE_EVENTS = new Set(['subscription_updated', 'subscription_resumed', 'subscription_unpaused', 'subscription_plan_changed']);
const TERMINAL_EVENTS = new Set(['subscription_cancelled', 'subscription_canceled', 'subscription_expired', 'subscription_paused']);
const REFUND_EVENTS = new Set(['order_refunded']);
const FAILED_PAYMENT_EVENTS = new Set(['subscription_payment_failed']);

function malformedAmount(amountCents) {
  return !Number.isFinite(amountCents) || amountCents < 0;
}
function malformedCurrency(currency) {
  return !/^[A-Z]{3}$/.test(String(currency || ''));
}

// Pure, deterministic, side-effect-free. Given a normalized webhook event and
// the lead it claims to belong to, decides exactly what state transition (if
// any) is warranted -- never mutates anything itself. The caller (RevenueEngine)
// is responsible for applying the decision and for provider-event-id
// deduplication (already enforced by the store's existing unique constraint).
export function classifyPaymentEvent({ event, lead, cfg = {} } = {}) {
  const reasonCodes = [];
  const base = {
    classification: 'INVALID_OR_UNSUPPORTED',
    reasonCodes,
    shouldUnlock: false,
    shouldRecordRevenue: false,
    revenueKind: null,
    revenueSign: 0,
    shouldSyncSubscriptionStatus: false,
    subscriptionStatus: null,
    policyVersion: PAYMENT_TRUTH_POLICY_VERSION
  };

  if (!event || typeof event !== 'object') { reasonCodes.push('malformed-event'); return base; }
  if (!event.eventId) { reasonCodes.push('missing-event-id'); return base; }
  if (!event.eventName) { reasonCodes.push('missing-event-name'); return base; }

  const leadId = event.custom?.lead_id || '';
  if (!leadId) { reasonCodes.push('missing-lead-id'); return { ...base, classification: 'REVIEW_REQUIRED' }; }
  if (!lead) { reasonCodes.push('unknown-lead'); return { ...base, classification: 'REVIEW_REQUIRED' }; }
  const eventProspectId = event.custom?.prospect_id || '';
  if (eventProspectId && lead.prospectId && eventProspectId !== lead.prospectId) {
    reasonCodes.push('lead-prospect-mismatch');
    return { ...base, classification: 'REVIEW_REQUIRED' };
  }

  const product = event.custom?.product || '';
  const isPaymentBearing = CLEARED_ONE_TIME_EVENTS.has(event.eventName) || CLEARED_SUBSCRIPTION_EVENTS.has(event.eventName);
  if (isPaymentBearing && !KNOWN_PRODUCTS.includes(product)) {
    reasonCodes.push('unknown-product');
    return { ...base, classification: 'REVIEW_REQUIRED' };
  }
  if (isPaymentBearing && (malformedAmount(event.amountCents) || malformedCurrency(event.currency))) {
    reasonCodes.push('malformed-amount-or-currency');
    return { ...base, classification: 'REVIEW_REQUIRED' };
  }
  if (isPaymentBearing && event.testMode && !cfg.revenue?.allowTestUnlock) {
    reasonCodes.push('test-mode-event-rejected');
    return { ...base, classification: 'INVALID_OR_UNSUPPORTED' };
  }

  if (CLEARED_ONE_TIME_EVENTS.has(event.eventName)) {
    if (event.status && !['paid', 'completed', 'success'].includes(String(event.status).toLowerCase())) {
      reasonCodes.push(`order-status-${event.status}`);
      return { ...base, classification: 'PENDING_OR_UNCLEAR' };
    }
    reasonCodes.push('cleared-one-time-payment');
    return { ...base, classification: 'CLEARED_ONE_TIME_PAYMENT', shouldUnlock: true, shouldRecordRevenue: true, revenueKind: 'sale', revenueSign: 1 };
  }

  if (CLEARED_SUBSCRIPTION_EVENTS.has(event.eventName)) {
    reasonCodes.push('cleared-subscription-payment');
    return {
      ...base, classification: 'CLEARED_SUBSCRIPTION_PAYMENT', shouldUnlock: true, shouldRecordRevenue: true,
      revenueKind: 'subscription', revenueSign: 1, shouldSyncSubscriptionStatus: true, subscriptionStatus: 'active'
    };
  }

  if (LIFECYCLE_UPDATE_EVENTS.has(event.eventName)) {
    reasonCodes.push('subscription-lifecycle-update-no-charge');
    const resuming = ['subscription_resumed', 'subscription_unpaused'].includes(event.eventName);
    return { ...base, classification: 'SUBSCRIPTION_LIFECYCLE_UPDATE', shouldSyncSubscriptionStatus: resuming, subscriptionStatus: resuming ? 'active' : null };
  }

  if (TERMINAL_EVENTS.has(event.eventName)) {
    reasonCodes.push('subscription-terminal-transition');
    return { ...base, classification: 'SUBSCRIPTION_LIFECYCLE_UPDATE', shouldSyncSubscriptionStatus: true, subscriptionStatus: event.eventName.replace('subscription_', '') };
  }

  if (REFUND_EVENTS.has(event.eventName)) {
    reasonCodes.push('refund');
    return { ...base, classification: 'REFUND_OR_DISPUTE', shouldRecordRevenue: true, revenueKind: 'refund', revenueSign: -1 };
  }
  if (FAILED_PAYMENT_EVENTS.has(event.eventName)) {
    // A failed charge attempt is not a refund -- no money was ever
    // collected to return. It may resolve on the provider's dunning retry,
    // so it is pending, not a terminal state.
    reasonCodes.push('failed-payment-attempt');
    return { ...base, classification: 'PENDING_OR_UNCLEAR' };
  }

  reasonCodes.push(`unrecognized-event-name:${event.eventName}`);
  return base;
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
    custom:meta.custom_data||{},
    attributes,
    testMode:Boolean(meta.test_mode||attributes.test_mode),
    amountCents:Number(attributes.total||attributes.subtotal||0),
    currency:String(attributes.currency||attributes.currency_code||'USD'),
    customerEmail:String(attributes.user_email||attributes.customer_email||''),
    status:String(attributes.status||''),
    createdAt:String(attributes.created_at||new Date().toISOString())
  };
}
