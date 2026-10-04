// Delivery -> accepted result -> case evidence -> referral -> renewal ->
// expansion. A forward-only state machine whose every step has an evidence gate.
// It records and recommends; it never contacts anyone.
import { assessPaymentEvidence } from './payment-compression.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const DELIVERY_LOOP_VERSION = 'uberbond.delivery-loop.v1';
export const STATES = Object.freeze(['SOLD', 'PAID_CLEARED', 'DELIVERING', 'DELIVERED', 'ACCEPTED', 'CASE_EVIDENCE_PERMITTED', 'REFERRAL_ELIGIBLE', 'RENEWAL_CANDIDATE', 'EXPANSION_CANDIDATE']);

const GATES = {
  PAID_CLEARED: c => (assessPaymentEvidence(c.payment).cleared ? [] : ['cleared-provider-payment-evidence-required']),
  DELIVERING: c => (c.scope && c.acceptanceCriteria?.length ? [] : ['written-scope-and-acceptance-criteria-required']),
  DELIVERED: c => (c.deliverableRefs?.length && c.claimsVerified === true ? [] : ['deliverable-and-claim-verification-required']),
  ACCEPTED: c => (c.acceptance?.explicit === true && c.acceptance?.by ? [] : ['explicit-customer-acceptance-required (silence is not acceptance)']),
  CASE_EVIDENCE_PERMITTED: c => (c.caseStudyPermission?.granted === true && c.caseStudyPermission?.scope ? [] : ['written-customer-permission-for-named-scope-required']),
  REFERRAL_ELIGIBLE: c => (c.state_hint_valueConfirmed === true || c.valueConfirmedByCustomer === true ? [] : ['customer-must-confirm-value-before-referral-ask']),
  RENEWAL_CANDIDATE: c => (c.usedResult === true && c.recurringSignal === true ? [] : ['usage-and-recurring-need-evidence-required']),
  EXPANSION_CANDIDATE: c => (c.expansionUnits > 0 && c.marginalFounderMinutes != null && c.marginalFounderMinutes <= c.baseFounderMinutes ? [] : ['expansion-needs-units-and-non-worse-founder-minutes'])
};

export function advanceDelivery(customer = {}, { upTo = 'EXPANSION_CANDIDATE' } = {}) {
  let idx = 0; const blocks = []; const trail = ['SOLD'];
  for (let i = 1; i < STATES.length; i++) {
    const missing = GATES[STATES[i]](customer);
    if (missing.length) { blocks.push(...missing.map(m => `${STATES[i]}: ${m}`)); break; }
    idx = i; trail.push(STATES[i]);
    if (STATES[i] === upTo) break;
  }
  const state = STATES[idx];
  return {
    version: DELIVERY_LOOP_VERSION, state, trail, blocks,
    nextAllowedAction: blocks.length ? `Satisfy: ${blocks[0]}` : 'None: terminal state reached for supplied evidence.',
    contributionCents: customer.payment ? assessPaymentEvidence(customer.payment).netCents - Math.round((Number(customer.deliveryCostCents) || 0)) : null,
    authority: 'MANUAL_MOHAMED_FOR_CUSTOMER_COMMUNICATION', outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
