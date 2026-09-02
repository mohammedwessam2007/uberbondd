import crypto from 'node:crypto';
import { compileFulfillmentPlan, applyFulfillmentEvent } from './service-fulfillment.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const LEAD_PATH_SPRINT_FULFILLMENT_VERSION = 'uberbond.lead-path-sprint-fulfillment-1.3.0';
export const LEAD_PATH_SPRINT_PRICE = Object.freeze({ amountCents: 45000, currency: 'USD' });
export const LEAD_PATH_SPRINT_STATES = Object.freeze([
  'PAID','INPUT_READY','ANALYSIS_RUNNING','QA_REQUIRED','QA_PASSED','DELIVERY_READY','DELIVERED',
  'CUSTOMER_ACCEPTED','CUSTOMER_REJECTED','CUSTOMER_SILENT','SUPPORT_WINDOW','COMPLETE'
]);

const clone = value => structuredClone(value);
const text = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(reasonCodes, state = null) {
  return { ok:false, policyVersion:LEAD_PATH_SPRINT_FULFILLMENT_VERSION, status:'BLOCKED', reasonCodes:[...new Set(reasonCodes.filter(Boolean))], state, businessEffectAuthority:'NONE', externalEffectLedger:clone(ZERO_EXTERNAL_EFFECTS) };
}
function nextEventId(state, suffix) { return `${state.sprintId}:${state.history.length + 1}:${suffix}`; }
function apply(state, event) {
  const result = applyFulfillmentEvent({ state:state.fulfillmentState, event, date:new Date(event.at) });
  if (!result.ok) return result;
  return result.state;
}

// Consume the existing canonical reconciliation result. Do not reinterpret raw
// webhooks here and do not create a fourth payment ledger/witness system.
//
// First-cash is one fixed-price purchase, not "some collection of rows whose
// net happens to add to $450". Requiring exactly one verified provider event
// prevents two $225 payments, nine $50 payments, or a payment plus renewal from
// being silently reinterpreted as this SKU. The canonical lead id and truth
// digest also bind the fulfilment unlock to the exact reconciled scope rather
// than to a hand-built summary object with the same totals.
export function validateCanonicalSprintPaymentTruth(truth = {}, { paymentLeadId = null } = {}) {
  const reasons = [];
  const expectedLeadId = text(paymentLeadId, 200);
  const canonicalLeadId = text(truth?.leadId, 200);
  const truthDigest = text(truth?.truthDigest, 128).toLowerCase();
  const providerRefs = Array.isArray(truth?.verifiedProviderEventRefs)
    ? truth.verifiedProviderEventRefs.map(value => text(value, 400)).filter(Boolean)
    : [];

  if (truth.ok !== true) reasons.push('canonical-payment-truth-not-ok');
  if (text(truth.policyVersion, 120) !== 'payment-renewal-truth-1.6.0') reasons.push('canonical-payment-policy-version-required');
  if (!/^[a-f0-9]{64}$/.test(truthDigest)) reasons.push('canonical-payment-truth-digest-required');
  if (!expectedLeadId) reasons.push('payment-lead-id-required');
  if (!canonicalLeadId) reasons.push('canonical-payment-lead-id-required');
  if (expectedLeadId && canonicalLeadId && expectedLeadId !== canonicalLeadId) reasons.push('canonical-payment-lead-scope-mismatch');
  if (truth.status !== 'PROVIDER_CLEARED_PAYMENT_PROVEN') reasons.push('provider-cleared-payment-not-proven');
  if (truth?.stages?.CLEARED_PAYMENT?.status !== 'PROVEN') reasons.push('canonical-cleared-payment-stage-not-proven');
  if (truth?.stages?.PAYMENT_RETAINED?.status !== 'PROVEN') reasons.push('canonical-payment-retention-not-proven');
  if (Array.isArray(truth.contradictions) && truth.contradictions.length) reasons.push('canonical-payment-contradictions-present');
  if (Number(truth?.economics?.netProviderClearedRevenueCents) !== LEAD_PATH_SPRINT_PRICE.amountCents) reasons.push('net-provider-cleared-amount-mismatch');
  if (text(truth?.economics?.currency, 12).toUpperCase() !== LEAD_PATH_SPRINT_PRICE.currency) reasons.push('canonical-payment-currency-mismatch');
  if (Number(truth?.economics?.verifiedPaymentCount) !== 1) reasons.push('exactly-one-canonical-verified-payment-required');
  if (Number(truth?.economics?.verifiedRenewalCount) !== 0) reasons.push('renewal-cannot-unlock-first-cash-sprint');
  if (providerRefs.length !== 1) reasons.push('exactly-one-verified-provider-event-ref-required');
  if (Number(truth?.economics?.verifiedReversalCount) !== 0) reasons.push('verified-reversal-cannot-unlock-fulfillment');
  if (Number(truth?.economics?.unverifiedReversalCents) > 0) reasons.push('unverified-reversal-requires-review');
  if (Number(truth?.economics?.reversedRevenueCents) > 0) reasons.push('reversed-payment-cannot-unlock-fulfillment');
  return {
    ok:reasons.length === 0,
    reasonCodes:reasons,
    canonicalTruthRef: reasons.length ? null : `payment-truth:${digest({
      policyVersion:truth.policyVersion,
      truthDigest,
      leadId:canonicalLeadId,
      status:truth.status,
      providerEventRef:providerRefs[0],
      amountCents:truth?.economics?.netProviderClearedRevenueCents,
      currency:truth?.economics?.currency,
      verifiedPaymentCount:truth?.economics?.verifiedPaymentCount,
      verifiedRenewalCount:truth?.economics?.verifiedRenewalCount,
      reversedRevenueCents:truth?.economics?.reversedRevenueCents,
      contradictions:truth?.contradictions || []
    })}`
  };
}

function validExternalCustomerEvidence(evidence) {
  return Boolean(
    evidence
    && evidence.evidenceClass === 'EXTERNAL_CUSTOMER'
    && text(evidence.origin, 40).toUpperCase() === 'CUSTOMER'
    && /^(customer|receipt):/i.test(text(evidence.evidenceRef, 240))
  );
}

export function createLeadPathSprint({ customerRef, paymentLeadId, canonicalPaymentTruth, at = new Date().toISOString() } = {}) {
  const payment = validateCanonicalSprintPaymentTruth(canonicalPaymentTruth, { paymentLeadId });
  if (!payment.ok) return fail(payment.reasonCodes);
  const plan = compileFulfillmentPlan({
    serviceSkuId:'lead-path-revenue-leak-evidence-sprint-usd-450',
    customerRef,
    requirements:['customer-provided lead-path inputs','agency context and downstream client scope'],
    acceptanceCriteria:['evidence packet delivered','findings traceable to supplied or observed evidence','scope remains fixed'],
    maxRevisions:1,
    supportWindowDays:0,
    renewalIntervalDays:null,
    date:new Date(at)
  });
  if (!plan.ok) return fail(plan.reasonCodes || ['fulfillment-plan-failed']);
  const sprintId = `sprint_${plan.fulfillmentId}`;
  return {
    ok:true,
    policyVersion:LEAD_PATH_SPRINT_FULFILLMENT_VERSION,
    sprintId,
    status:'PAID',
    paymentLeadId:text(paymentLeadId, 200),
    fulfillmentState:plan,
    canonicalPaymentTruthRef:payment.canonicalTruthRef,
    customerAcceptanceEvidenceRef:null,
    commercialDeliveryCount:0,
    history:[{from:null,to:'PAID',at,evidenceClass:'CANONICAL_PAYMENT_TRUTH',evidenceRef:payment.canonicalTruthRef}],
    businessEffectAuthority:'NONE',
    externalEffectLedger:clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function advanceLeadPathSprint({ state, to, evidence = null, artifactRefs = [], qaEvidenceRef = 'qa:lead-path-sprint', at = new Date().toISOString() } = {}) {
  if (!state?.ok || !LEAD_PATH_SPRINT_STATES.includes(state.status)) return fail(['valid-sprint-state-required']);
  const target = text(to, 40).toUpperCase();
  if (!LEAD_PATH_SPRINT_STATES.includes(target)) return fail(['valid-sprint-target-required'], state);
  const allowed = {
    PAID:['INPUT_READY'], INPUT_READY:['ANALYSIS_RUNNING'], ANALYSIS_RUNNING:['QA_REQUIRED'], QA_REQUIRED:['QA_PASSED'],
    QA_PASSED:['DELIVERY_READY'], DELIVERY_READY:['DELIVERED'], DELIVERED:['CUSTOMER_ACCEPTED','CUSTOMER_REJECTED','CUSTOMER_SILENT'],
    CUSTOMER_ACCEPTED:['SUPPORT_WINDOW'], CUSTOMER_REJECTED:[], CUSTOMER_SILENT:[], SUPPORT_WINDOW:['COMPLETE'], COMPLETE:[]
  };
  if (!allowed[state.status].includes(target)) return fail([`invalid-sprint-transition:${state.status}->${target}`], state);

  let fulfillmentState = state.fulfillmentState;
  try {
    if (target === 'ANALYSIS_RUNNING') fulfillmentState = apply(state,{eventId:nextEventId(state,'work-started'),type:'WORK_STARTED',at});
    if (target === 'QA_REQUIRED') fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,'work-complete'),type:'WORK_COMPLETE',at});
    if (target === 'QA_PASSED') fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,'qa-pass'),type:'QA_RESULT',qaPassed:true,evidenceRef:qaEvidenceRef,at});
    if (target === 'DELIVERED') {
      const refs = (artifactRefs || []).map(value => text(value, 300)).filter(Boolean);
      if (!refs.length) return fail(['delivery-artifact-required'], state);
      fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,'delivery'),type:'DELIVERY_RECORDED',artifactRefs:refs,at});
    }
    if (['CUSTOMER_ACCEPTED','CUSTOMER_REJECTED','CUSTOMER_SILENT'].includes(target)) {
      fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,'acceptance-requested'),type:'ACCEPTANCE_REQUESTED',at});
      if (target === 'CUSTOMER_ACCEPTED' || target === 'CUSTOMER_REJECTED') {
        if (!validExternalCustomerEvidence(evidence)) return fail([target === 'CUSTOMER_ACCEPTED' ? 'external-customer-acceptance-evidence-required' : 'external-customer-rejection-evidence-required'], state);
        fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,target === 'CUSTOMER_ACCEPTED' ? 'customer-accepted' : 'customer-rejected'),type:target,evidenceClass:'EXTERNAL_CUSTOMER',evidenceRef:evidence.evidenceRef,at});
      }
    }
  } catch (error) {
    return fail(['underlying-fulfillment-transition-failed', text(error?.message, 240)], state);
  }
  if (fulfillmentState?.ok === false) return fail(fulfillmentState.reasonCodes || ['underlying-fulfillment-transition-failed'], state);

  const next = {
    ...state,
    status:target,
    fulfillmentState,
    customerAcceptanceEvidenceRef: target === 'CUSTOMER_ACCEPTED' ? evidence.evidenceRef : state.customerAcceptanceEvidenceRef,
    history:[...state.history,{from:state.status,to:target,at,evidenceClass:evidence?.evidenceClass || null,evidenceRef:evidence?.evidenceRef || null}],
    commercialDeliveryCount: fulfillmentState?.economicTruth?.acceptedDelivery === true && target === 'CUSTOMER_ACCEPTED' ? 1 : state.commercialDeliveryCount
  };
  return { ok:true, policyVersion:LEAD_PATH_SPRINT_FULFILLMENT_VERSION, status:target, state:next, businessEffectAuthority:'NONE', externalEffectLedger:clone(ZERO_EXTERNAL_EFFECTS) };
}
