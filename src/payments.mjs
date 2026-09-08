import crypto from 'node:crypto';

// Bump when the classification policy changes so past receipts stay
// attributable to the policy version that produced them.
export const PAYMENT_TRUTH_POLICY_VERSION = 'payment-truth-1.2.0';

export const FIRST_CASH_SPRINT_PRODUCT = 'lead-path-revenue-leak-evidence-sprint-usd-450';
export const KNOWN_PRODUCTS = ['full', 'strategy', 'monitoring', FIRST_CASH_SPRINT_PRODUCT];

// The real Lemon Squeezy webhook event taxonomy. subscription_updated is
// metadata-only (plan/card/renewal-date changes) and never implies a new
// charge -- treating it as a sale is the single most common source of
// revenue overcounting for subscription businesses. subscription_created and
// subscription_payment_success are the only subscription events that
// represent an actual cleared charge.
const CLEARED_ONE_TIME_EVENTS = new Set(['order_created']);
const CLEARED_SUBSCRIPTION_EVENTS = new Set(['subscription_created', 'subscription_payment_success']);
// A subscription exists in one of several states, and only one of them means a
// charge has cleared. `subscription_created` fires for every one of them --
// including a free trial, where the whole point is that no money has moved yet.
//
// Measured before the guard existed: six `subscription_created` deliveries at
// on_trial, past_due, unpaid, cancelled, expired and paused each booked the full
// $99 as cleared revenue, marked the lead paid, and reconciled as
// PROVIDER_CLEARED_PAYMENT_PROVEN. $594 of revenue nobody had paid, and a trial
// signup was worth $99 of it.
//
// An allowlist rather than a blocklist of the six above, deliberately. A
// blocklist of Lemon Squeezy's vocabulary would let another provider's
// equivalents through -- Stripe and Paddle both say `trialing`, and Stripe adds
// `incomplete` -- and the failure mode of letting one through is booking money
// nobody paid, which is silent. The failure mode of the allowlist is refusing a
// real payment, which a customer reports.
//
// `paid` is here because it means what it says on any object, not because a
// subscription is expected to carry it.
const CLEARED_SUBSCRIPTION_STATUSES = new Set(['active', 'paid']);
const LIFECYCLE_UPDATE_EVENTS = new Set(['subscription_updated', 'subscription_resumed', 'subscription_unpaused', 'subscription_plan_changed']);
const TERMINAL_EVENTS = new Set(['subscription_cancelled', 'subscription_canceled', 'subscription_expired', 'subscription_paused']);
const REFUND_EVENTS = new Set(['order_refunded']);
const FAILED_PAYMENT_EVENTS = new Set(['subscription_payment_failed']);

function malformedAmount(amountCents) {
  return !Number.isFinite(amountCents) || amountCents < 0;
}

// What the buyer is meant to be paying for the product they claim.
//
// `product` reaches this system as `checkout[custom][product]` -- a query
// parameter on the checkout link, which the buyer holds and can edit. Nothing
// compared it to the money, so the link for the $49 audit could be edited to
// claim `strategy` and unlock the $299 review for $49. Measured: $49 bought
// strategy, $0.01 bought monitoring, and a $0.00 order bought strategy.
const PRODUCT_PRICE_FIELDS = { full: 'fullAuditPrice', strategy: 'strategyAuditPrice', monitoring: 'monitoringPrice' };
const FIXED_PRODUCT_PRICE_CENTS = Object.freeze({
  [FIRST_CASH_SPRINT_PRODUCT]: 45_000
});

// The configured prices are plain numbers with no currency attached, and the
// environment names them FULL_AUDIT_PRICE_USD and so on. So they are USD, and a
// payment in another currency cannot be compared to them without an exchange
// rate this system does not have and must not invent -- EUR 30.00 is not "less
// than" USD 49.00 in any sense worth acting on.
//
// A payment in another currency is therefore treated exactly like a product
// whose price is not configured: not evidence of underpayment, and not blocked.
// That leaves a non-USD payment unchecked on amount, which is narrower than the
// hole this closes but is still a hole; closing it needs prices denominated per
// currency, which is a configuration decision rather than a code one.
const PRICE_CURRENCY = 'USD';

function listPriceCents(product, currency, cfg) {
  if (String(currency).toUpperCase() !== PRICE_CURRENCY) return null;
  if (Number.isSafeInteger(FIXED_PRODUCT_PRICE_CENTS[product])) return FIXED_PRODUCT_PRICE_CENTS[product];
  const configured = cfg?.revenue?.[PRODUCT_PRICE_FIELDS[product]];
  return Number.isFinite(Number(configured)) ? Math.round(Number(configured) * 100) : null;
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
  // The money must cover the thing being unlocked.
  //
  // Not a refusal: a discount code is a real reason to pay less, and silently
  // discarding a genuine payment is worse than the hole this closes. This is the
  // one classification an operator is actually shown -- the command center
  // raises REVIEW_REQUIRED and nothing else -- so an underpayment lands in front
  // of a person instead of unlocking, or vanishing.
  //
  // Overpayment is fine and deliberately not flagged: Lemon Squeezy's `total`
  // includes tax, so a correct payment routinely exceeds the list price.
  if (isPaymentBearing) {
    const expected = listPriceCents(product, event.currency, cfg);
    if (expected !== null && Number(event.amountCents) < expected) {
      reasonCodes.push('amount-below-product-price');
      return { ...base, classification: 'REVIEW_REQUIRED' };
    }
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
    // The same shape as the one-time branch above, which has always checked
    // whether the order was actually paid. This branch did not, so the guard
    // existed on one side of the money and not the other.
    //
    // Applied to `subscription_created` only. There the status describes whether
    // the subscription has been charged, so it decides the question.
    // `subscription_payment_success` is the provider asserting a charge
    // succeeded, and its subscription status can legitimately still read
    // past_due at the moment a recovery payment lands -- refusing that would
    // discard real money.
    if (event.eventName === 'subscription_created'
      && event.status && !CLEARED_SUBSCRIPTION_STATUSES.has(String(event.status).toLowerCase())) {
      reasonCodes.push(`subscription-status-${event.status}`);
      return { ...base, classification: 'PENDING_OR_UNCLEAR' };
    }
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

// Lemon Squeezy sends the Order resource for both `order_created` and
// `order_refunded`. `data.id` identifies that resource, not one webhook
// occurrence. A stable state digest gives us an occurrence/state identity when
// the provider does not include a distinct webhook id in the payload, while
// leaving the provider object id available for refund-state reconciliation.
const VOLATILE_STATE_KEYS = new Set(['created_at', 'updated_at']);

function canonicalState(value) {
  if (Array.isArray(value)) return value.map(canonicalState);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter(key => !VOLATILE_STATE_KEYS.has(key))
      .sort()
      .map(key => [key, canonicalState(value[key])])
  );
}

function stateDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalState(value))).digest('hex');
}

export function normalizeLemonEvent(payload={}) {
  const meta=payload.meta||{};
  const data=payload.data||{};
  const attributes=data.attributes||{};
  const eventName=String(meta.event_name||'');
  const providerObjectId=String(data.id||'');
  const explicitWebhookId=String(meta.webhook_id||'');
  const snapshotDigest=stateDigest({
    eventName,
    objectType:String(data.type||''),
    providerObjectId,
    custom:meta.custom_data||{},
    attributes
  });
  // Prefer an explicit provider occurrence id when one is present. The
  // fallback is deliberately derived from the signed state, not the object
  // id, so order_created and order_refunded for one Order cannot collide.
  const eventId=explicitWebhookId || (providerObjectId ? `state:${snapshotDigest}` : '');
  const refundAmount=attributes.refunded_amount ?? attributes.total ?? attributes.subtotal ?? 0;
  const amountCents=Number(eventName === 'order_refunded'
    ? refundAmount
    : (attributes.total ?? attributes.subtotal ?? attributes.amount ?? 0));
  return {
    eventName,
    eventId,
    providerOccurrenceId:eventId,
    providerObjectId,
    snapshotDigest,
    objectType:String(data.type||''),
    custom:meta.custom_data||{},
    attributes,
    testMode:Boolean(meta.test_mode||attributes.test_mode),
    amountCents,
    providerAmountCents:amountCents,
    cumulativeRefundedAmountCents:eventName === 'order_refunded' ? Number(refundAmount) : Number(attributes.refunded_amount ?? 0),
    currency:String(attributes.currency||attributes.currency_code||'USD'),
    customerEmail:String(attributes.user_email||attributes.customer_email||''),
    status:String(attributes.status||''),
    createdAt:String(attributes.created_at||new Date().toISOString())
  };
}
