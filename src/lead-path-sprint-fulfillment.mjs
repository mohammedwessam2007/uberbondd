import { compileFulfillmentPlan, applyFulfillmentEvent } from './service-fulfillment.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const LEAD_PATH_SPRINT_FULFILLMENT_VERSION = 'uberbond.lead-path-sprint-fulfillment-1.0.0';
export const LEAD_PATH_SPRINT_STATES = Object.freeze([
  'PAID','INPUT_READY','ANALYSIS_RUNNING','QA_REQUIRED','QA_PASSED','DELIVERY_READY','DELIVERED',
  'CUSTOMER_ACCEPTED','CUSTOMER_REJECTED','CUSTOMER_SILENT','SUPPORT_WINDOW','COMPLETE'
]);

function fail(reasonCodes, state = null) {
  return { ok:false, policyVersion:LEAD_PATH_SPRINT_FULFILLMENT_VERSION, status:'BLOCKED', reasonCodes, state, businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS} };
}
function externalEvidence(evidence, expectedClass) {
  return Boolean(evidence && evidence.evidenceClass === expectedClass && evidence.origin !== 'SYNTHETIC' && String(evidence.evidenceRef || '').trim());
}
function nextEventId(state, suffix) {
  return `${state.sprintId}:${state.history.length + 1}:${suffix}`;
}
function apply(state, event) {
  const result = applyFulfillmentEvent({ state:state.fulfillmentState, event, date:new Date(event.at) });
  if (!result.ok) return result;
  return result.state;
}

export function createLeadPathSprint({ customerRef, paymentEvidence, at = new Date().toISOString() } = {}) {
  if (!externalEvidence(paymentEvidence, 'EXTERNAL_PAYMENT')) return fail(['external-payment-evidence-required']);
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
    paymentEvidenceRef:paymentEvidence.evidenceRef,
    customerAcceptanceEvidenceRef:null,
    commercialDeliveryCount:0,
    history:[{from:null,to:'PAID',at,evidenceClass:'EXTERNAL_PAYMENT',evidenceRef:paymentEvidence.evidenceRef}],
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}
  };
}

export function advanceLeadPathSprint({ state, to, evidence = null, artifactRefs = [], qaEvidenceRef = 'qa:lead-path-sprint', at = new Date().toISOString() } = {}) {
  if (!state?.ok || !LEAD_PATH_SPRINT_STATES.includes(state.status)) return fail(['valid-sprint-state-required']);
  const target = String(to || '').toUpperCase();
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
      const refs = (artifactRefs || []).filter(Boolean);
      fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,'delivery'),type:'DELIVERY_RECORDED',artifactRefs:refs,at});
    }
    if (['CUSTOMER_ACCEPTED','CUSTOMER_REJECTED','CUSTOMER_SILENT'].includes(target)) {
      fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,'acceptance-requested'),type:'ACCEPTANCE_REQUESTED',at});
      if (target === 'CUSTOMER_ACCEPTED') {
        if (!externalEvidence(evidence,'EXTERNAL_CUSTOMER')) return fail(['external-customer-acceptance-evidence-required'], state);
        fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,'customer-accepted'),type:'CUSTOMER_ACCEPTED',evidenceClass:'EXTERNAL_CUSTOMER',evidenceRef:evidence.evidenceRef,at});
      }
      if (target === 'CUSTOMER_REJECTED') {
        if (!externalEvidence(evidence,'EXTERNAL_CUSTOMER')) return fail(['external-customer-rejection-evidence-required'], state);
        fulfillmentState = apply({...state,fulfillmentState},{eventId:nextEventId(state,'customer-rejected'),type:'CUSTOMER_REJECTED',evidenceClass:'EXTERNAL_CUSTOMER',evidenceRef:evidence.evidenceRef,at});
      }
    }
  } catch (error) {
    return fail(['underlying-fulfillment-transition-failed', String(error?.message || error)], state);
  }
  if (fulfillmentState?.ok === false) return fail(fulfillmentState.reasonCodes || ['underlying-fulfillment-transition-failed'], state);

  const next = {
    ...state,
    status:target,
    fulfillmentState,
    customerAcceptanceEvidenceRef: target === 'CUSTOMER_ACCEPTED' ? evidence.evidenceRef : state.customerAcceptanceEvidenceRef,
    history:[...state.history,{from:state.status,to:target,at,evidenceClass:evidence?.evidenceClass || null,evidenceRef:evidence?.evidenceRef || null}],
    commercialDeliveryCount: fulfillmentState?.economicTruth?.acceptedDelivery === true ? 1 : state.commercialDeliveryCount
  };
  return { ok:true, policyVersion:LEAD_PATH_SPRINT_FULFILLMENT_VERSION, status:target, state:next, businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS} };
}

export function runSyntheticFulfillmentCanary({ at = '2026-09-01T12:00:00.000Z' } = {}) {
  const syntheticPayment = { evidenceClass:'EXTERNAL_PAYMENT', evidenceRef:'payment:synthetic-canary', origin:'SYNTHETIC' };
  const refusedPayment = createLeadPathSprint({ customerRef:'synthetic-customer', paymentEvidence:syntheticPayment, at });
  const realLikePayment = { evidenceClass:'EXTERNAL_PAYMENT', evidenceRef:'payment:test-fixture', origin:'TEST_FIXTURE' };
  let state = createLeadPathSprint({ customerRef:'synthetic-customer', paymentEvidence:realLikePayment, at });
  if (!state.ok) return { ok:false, status:'CANARY_SETUP_FAILED', commercialDeliveryCount:0, refusedSyntheticPayment:!refusedPayment.ok };
  const path = ['INPUT_READY','ANALYSIS_RUNNING','QA_REQUIRED','QA_PASSED','DELIVERY_READY','DELIVERED'];
  for (const target of path) {
    const result = advanceLeadPathSprint({ state, to:target, artifactRefs: target === 'DELIVERED' ? ['artifact:synthetic-report'] : [], at });
    if (!result.ok) return { ok:false, status:'CANARY_TRANSITION_FAILED', failedAt:target, reasonCodes:result.reasonCodes, commercialDeliveryCount:0, refusedSyntheticPayment:!refusedPayment.ok };
    state = result.state;
  }
  const syntheticAcceptance = advanceLeadPathSprint({ state, to:'CUSTOMER_ACCEPTED', evidence:{ evidenceClass:'EXTERNAL_CUSTOMER', evidenceRef:'customer:synthetic-acceptance', origin:'SYNTHETIC' }, at });
  return {
    ok:true,
    status:'SYNTHETIC_CANARY_COMPLETE',
    refusedSyntheticPayment:!refusedPayment.ok,
    refusedSyntheticCustomerAcceptance:!syntheticAcceptance.ok,
    commercialDeliveryCount:0,
    terminalState:state.status,
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}
  };
}
