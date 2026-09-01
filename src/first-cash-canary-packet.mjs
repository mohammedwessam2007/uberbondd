import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FIRST_CASH_CANARY_PACKET_VERSION = 'uberbond.first-cash-canary-packet-1.0.0';
export const REQUIRED_CONTACT_GATES = Object.freeze([
  'jurisdictionApproved','providerPurposeAllowed','contactProvenanceApproved','senderReady','authorityGranted','canaryOpen'
]);

export function canContactFromGates(gates = {}) {
  return REQUIRED_CONTACT_GATES.every(key => gates?.[key] === true);
}

export function canaryDecision({ qualifiedConversationCount = 0, paidPilotCount = 0 } = {}) {
  if (!Number.isSafeInteger(qualifiedConversationCount) || qualifiedConversationCount < 0) return 'INVALID';
  if (qualifiedConversationCount >= 5 && paidPilotCount < 1) return 'KILL_OR_RETHINK';
  if (qualifiedConversationCount >= 5) return 'REVIEW_BEFORE_ANY_EXPANSION';
  return 'CONTINUE_BOUNDED_CANARY';
}

function qa(question, answer, status, evidenceClass, reasonCodes, module) {
  return { question, answer, status, evidenceClass, reasonCodes, module };
}

export function buildFirstCashCanaryPacket({
  gates = {},
  qualifiedConversationCount = 0,
  paidPilotCount = 0,
  sender = null,
  provider = null,
  policyEvidence = [],
  authorityEvidence = [],
  paymentLink = null,
  targetCount = 0,
  eligibleTargetCount = 0
} = {}) {
  const canContact = canContactFromGates(gates);
  const decision = canaryDecision({ qualifiedConversationCount, paidPilotCount });
  const blocked = REQUIRED_CONTACT_GATES.filter(key => gates?.[key] !== true);
  const qs = [
    qa('CAN WE CONTACT?', canContact ? 'YES' : 'NO', canContact?'READY':'BLOCKED', 'RUNTIME_GATES', blocked, 'first-cash-canary-packet'),
    qa('WHO?', 'US or otherwise legally approved agencies serving HVAC, plumbing, or electrical businesses', targetCount>0?'PREPARED':'NEEDS_EXTERNAL_TARGETS','PUBLIC_EVIDENCE',targetCount>0?[]:['qualified-targets-required'],'opportunity-engine'),
    qa('WHY?', 'One qualified agency may represent multiple downstream contractor accounts; diagnose lead-path revenue leakage with evidence.', 'PREPARED','OFFER_HYPOTHESIS',[],'event-horizon-economic-genome'),
    qa('WHICH SENDER?', sender || 'NONE_PROVEN', sender?'PREPARED':'BLOCKED','SENDER_HEALTH',sender?[]:['sender-readiness-not-proven'],'sender-mesh'),
    qa('WHICH PROVIDER?', provider || 'NONE_PROVEN', provider?'PREPARED':'BLOCKED','PROVIDER_ACTIVATION',provider?[]:['provider-route-not-proven'],'free-first-outreach-router'),
    qa('WHICH POLICY EVIDENCE?', policyEvidence, policyEvidence.length?'PREPARED':'BLOCKED','PROVIDER_POLICY',policyEvidence.length?[]:['provider-policy-evidence-required'],'provider-activation-receipt'),
    qa('WHICH AUTHORITY?', authorityEvidence, gates.authorityGranted?'PREPARED':'BLOCKED','OMNIA_AUTHORITY',gates.authorityGranted?[]:['omnia-authority-not-granted'],'omnia-v9'),
    qa('WHAT OFFER?', 'White-label Lead-Path Revenue Leak Evidence Sprint', 'PREPARED','CANONICAL_OFFER',[],'event-horizon-economic-genome'),
    qa('WHAT PRICE?', {currency:'USD',amount:450,scope:'fixed'}, 'HYPOTHESIS','PRICE_HYPOTHESIS',[],'event-horizon-economic-genome'),
    qa('WHAT PAYMENT LINK?', paymentLink || null, paymentLink?'PREPARED':'BLOCKED','PAYMENT_RUNTIME',paymentLink?[]:['payment-link-not-configured'],'payment-rail-doctor'),
    qa('HOW RECONCILED?', 'Signed provider webhook -> durable inbox -> provider verification -> canonical payment receipt -> RECONCILED.', 'IMPLEMENTED','PAYMENT_TRUTH',[],'billing-webhook-repository'),
    qa('HOW DELIVERED?', 'Lead-Path Sprint fulfillment state machine composes service-fulfillment and requires QA before delivery.', 'IMPLEMENTED','FULFILLMENT_CODE',[],'lead-path-sprint-fulfillment'),
    qa('HOW ACCEPTED?', 'Only independent EXTERNAL_CUSTOMER evidence may set customer acceptance.', 'IMPLEMENTED','CUSTOMER_WITNESS',[],'lead-path-sprint-fulfillment'),
    qa('ON REPLY?', 'Stop automated follow-up, classify reply, and route qualification/objection to canonical reply handling.', 'IMPLEMENTED','OUTREACH_CONTROL',[],'reply-intelligence'),
    qa('ON BOUNCE?', 'Quarantine sender/recipient evidence, suppress as appropriate, and treat bounce as proof of send with negative delivery evidence.', 'IMPLEMENTED','DELIVERABILITY',[],'postal-effect-adapter'),
    qa('ON COMPLAINT?', 'Suppress recipient, pause affected sender/provider as required, and raise deliverability circuit breaker.', 'IMPLEMENTED','DELIVERABILITY',[],'sender-mesh'),
    qa('ON UNCERTAIN SEND?', 'Lock the business key, reconcile read-only, and never blindly retry without proof of non-submission.', 'IMPLEMENTED','V9_EFFECT_PROTOCOL',[],'external-effect-recovery'),
    qa('AFTER FIVE CONVERSATIONS?', decision, decision==='CONTINUE_BOUNDED_CANARY'?'BOUNDED':'REVIEW_OR_STOP','CANARY_DOCTRINE',[], 'first-cash-canary-packet'),
    qa('CURRENT ELIGIBLE TARGETS?', {qualified:targetCount,eligibleToContact:eligibleTargetCount}, eligibleTargetCount>0?'PREPARED':'BLOCKED','TARGET_EVIDENCE',eligibleTargetCount>0?[]:['no-targets-currently-proven-eligible'],'lead-engine')
  ];
  return {
    schemaVersion:FIRST_CASH_CANARY_PACKET_VERSION,
    offer:'White-label Lead-Path Revenue Leak Evidence Sprint',
    price:{currency:'USD',amount:450,scope:'fixed'},
    buyer:'US or otherwise legally approved agencies serving HVAC, plumbing, or electrical businesses',
    canContact,
    blockedGates:blocked,
    qualifiedConversationCount,
    paidPilotCount,
    canaryDecision:decision,
    questions:qs,
    commercialTruth:{realCustomers:0,clearedRevenueUsd:0,acceptedPaidDeliveries:0,retainedCustomers:0},
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}
  };
}
