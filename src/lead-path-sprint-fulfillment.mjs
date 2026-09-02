import crypto from 'node:crypto';
import { compileFulfillmentPlan, applyFulfillmentEvent } from './service-fulfillment.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const LEAD_PATH_SPRINT_FULFILLMENT_VERSION = 'uberbond.lead-path-sprint-fulfillment-1.2.0';
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
export function validateCanonicalSprintPaymentTruth(truth = {}) {
  const reasons = [];
  if (truth.ok !== true) reasons.push('canonical-payment-truth-not-ok');
  if (truth.status !== 'PROVIDER_CLEARED_PAYMENT_PROVEN') reasons.push('provider-cleared-payment-not-proven');
  if (truth?.stages?.CLEARED_PAYMENT?.status !== 'PROVEN') reasons.push('canonical-cleared-payment-stage-not-proven');
  if (Array.isArray(truth.contradictions) && truth.contradictions.length) reasons.push('canonical-payment-contradictions-present');
  if (Number(truth?.economics?.netProviderClearedRevenueCents) !== LEAD_PATH_SPRINT_PRICE.amountCents) reasons.push('net-provider-cleared-amount-mismatch');
  if (text(truth?.economics?.currency, 12).toUpperCase() !== LEAD_PATH_SPRINT_PRICE.currency) reasons.push('canonical-payment-currency-mismatch');
  if (Number(truth?.economics?.verifiedPaymentCount) < 1) reasons.push('canonical-verified-payment-required');
  if (Number(truth?.economics?.reversedRevenueCents) > 0) reasons.push('reversed-payment-cannot-unlock-fulfillment');
  return {
    ok:reasons.length === 0,
    reasonCodes:reasons,
    canonicalTruthRef: reasons.length ? null : `payment-truth:${digest({
      status:truth.status,
      amountCents:truth?.economics?.netProviderClearedRevenueCents,
      currency:truth?.economics?.currency,
      verifiedPaymentCount:truth?.economics?.verifiedPaymentCount,
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
    && text(evidence.evidenceRef, 240)
  );
}

export function createLeadPathSprint({ customerRef, canonicalPaymentTruth, at = new Date().toISOString() } = {}) {
  const payment = validateCanonicalSprintPaymentTruth(canonicalPaymentTruth);
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
    CUSTOMER_ACCEPTED:['SUPPORT_WINDOW'], CUSTOMER_REJECTED:[], CUSTOMER_SILENT:['SUPPORT_WINDOW'], SUPPORT_WINDOW:['COMPLETE'], COMPLETE:[]
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
