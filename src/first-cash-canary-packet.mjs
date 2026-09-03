import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { LEAD_PATH_SPRINT_SKU } from './lead-path-sprint-fulfillment.mjs';

export const FIRST_CASH_CANARY_PACKET_VERSION = 'uberbond.first-cash-canary-packet-1.4.0';
export const CANONICAL_FIRST_CASH_OFFER = Object.freeze({
  name: 'White-label Lead-Path Revenue Leak Evidence Sprint',
  sku: LEAD_PATH_SPRINT_SKU,
});
export const CURRENT_CHAMPION_OFFER = CANONICAL_FIRST_CASH_OFFER.name;
export const DEFAULT_FIRST_CASH_PAYMENT_LINK = 'https://paypal.me/Sarawessam';
export const PAYMENT_LINK_TRUTH_BOUNDARY = 'PAYMENT_LINK_IS_NOT_CLEARED_PAYMENT_PROOF';
export const FIRST_CASH_CONTACT_GATES = Object.freeze([
  'jurisdictionApproved','providerPurposeAllowed','contactProvenanceApproved','senderReady','authorityGranted','canaryOpen'
]);
export const REQUIRED_CONTACT_GATES = FIRST_CASH_CONTACT_GATES;

function structuredContactGates(input = {}) {
  return Object.fromEntries(FIRST_CASH_CONTACT_GATES.map(id => [id, {
    satisfied: input?.[id] === true || input?.[id]?.satisfied === true
  }]));
}

export function canContactFromGates(input = {}) {
  const gates = structuredContactGates(input);
  return FIRST_CASH_CONTACT_GATES.every(id => gates?.[id]?.satisfied === true);
}

export function canaryDecision({ qualifiedConversationCount = 0, paidPilotCount = 0 } = {}) {
  if (!Number.isSafeInteger(qualifiedConversationCount) || qualifiedConversationCount < 0) return 'INVALID';
  if (!Number.isSafeInteger(paidPilotCount) || paidPilotCount < 0 || paidPilotCount > qualifiedConversationCount) return 'INVALID';
  if (qualifiedConversationCount >= 5 && paidPilotCount < 1) return 'KILL_OR_RETHINK';
  if (qualifiedConversationCount >= 5) return 'REVIEW_BEFORE_ANY_EXPANSION';
  return 'CONTINUE_BOUNDED_CANARY';
}

function qa(question, answer, status, evidenceClass, reasonCodes, module) {
  return { question, answer, status, evidenceClass, reasonCodes, module };
}

function normalizeHttpsPaymentLink(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

export function buildFirstCashCanaryPacket({
  gates = {},
  qualifiedConversationCount = 0,
  paidPilotCount = 0,
  sender = null,
  provider = null,
  policyEvidence = [],
  authorityEvidence = [],
  paymentLink = DEFAULT_FIRST_CASH_PAYMENT_LINK,
  targetCount = 0,
  eligibleTargetCount = 0,
  targetIds = []
} = {}) {
  const canContact = canContactFromGates(gates);
  const decision = canaryDecision({ qualifiedConversationCount, paidPilotCount });
  const normalizedGates = structuredContactGates(gates);
  const blocked = FIRST_CASH_CONTACT_GATES.filter(id => normalizedGates?.[id]?.satisfied !== true);
  const normalizedPaymentLink = normalizeHttpsPaymentLink(paymentLink);
  const paymentLinkEvidenceClass = normalizedPaymentLink === DEFAULT_FIRST_CASH_PAYMENT_LINK
    ? 'OWNER_SUPPLIED_PUBLIC_PAYPAL_ME_LINK'
    : normalizedPaymentLink
      ? 'CALLER_SUPPLIED_PUBLIC_HTTPS_LINK'
      : 'PAYMENT_LINK_NOT_CONFIGURED';
  const qs = [
    qa('CAN WE CONTACT?', canContact ? 'YES' : 'NO', canContact?'READY':'BLOCKED', 'RUNTIME_GATES', blocked, 'first-cash-canary-packet'),
    qa('WHO?', {segment:'US or otherwise legally approved agencies serving HVAC, plumbing, or electrical businesses',targetIds}, targetCount>0?'PREPARED':'NEEDS_EXTERNAL_TARGETS','PUBLIC_EVIDENCE',targetCount>0?[]:['qualified-targets-required'],'opportunity-engine'),
    qa('WHY?', 'One qualified agency may represent multiple downstream contractor accounts; the sprint gathers bounded evidence of lead-path revenue leakage without mutating customer systems.', 'PREPARED','OFFER_HYPOTHESIS',[],'event-horizon-economic-genome'),
    qa('WHICH SENDER?', sender || 'NONE_PROVEN', sender?'PREPARED':'BLOCKED','SENDER_HEALTH',sender?[]:['sender-readiness-not-proven'],'sender-mesh'),
    qa('WHICH PROVIDER?', provider || 'NONE_PROVEN', provider?'PREPARED':'BLOCKED','PROVIDER_ACTIVATION',provider?[]:['provider-route-not-proven'],'free-first-outreach-router'),
    qa('WHICH POLICY EVIDENCE?', policyEvidence, policyEvidence.length?'PREPARED':'BLOCKED','PROVIDER_POLICY',policyEvidence.length?[]:['provider-policy-evidence-required'],'provider-activation-receipt'),
    qa('WHICH AUTHORITY?', authorityEvidence, normalizedGates.authorityGranted.satisfied?'PREPARED':'BLOCKED','OMNIA_AUTHORITY',normalizedGates.authorityGranted.satisfied?[]:['omnia-authority-not-granted'],'omnia-v9'),
    qa('WHAT OFFER?', {name:CANONICAL_FIRST_CASH_OFFER.name,sku:CANONICAL_FIRST_CASH_OFFER.sku}, 'PREPARED','CANONICAL_OFFER',[],'lead-path-sprint-fulfillment'),
    qa('WHAT PRICE?', {currency:'USD',amount:450,scope:'fixed'}, 'HYPOTHESIS','PRICE_HYPOTHESIS',[],'world-brain-field-mission'),
    qa('WHAT PAYMENT LINK?', normalizedPaymentLink, normalizedPaymentLink?'PREPARED':'BLOCKED',paymentLinkEvidenceClass,normalizedPaymentLink?[]:['valid-https-payment-link-required'],'payment-runtime'),
    qa('HOW RECONCILED?', 'Provider-origin payment evidence -> durable payment evidence -> canonical payment truth -> fulfilment payment binding. A payment-link visit or owner-visible balance is not cleared-payment proof by itself.', 'IMPLEMENTED','PAYMENT_TRUTH',[],'payment-runtime'),
    qa('HOW DELIVERED?', 'Lead-Path Sprint fulfilment state machine composes service-fulfillment and requires QA before delivery.', 'IMPLEMENTED','FULFILLMENT_CODE',[],'lead-path-sprint-fulfillment'),
    qa('HOW ACCEPTED?', 'Only independent EXTERNAL_CUSTOMER evidence bound to the correct customer may set customer acceptance.', 'IMPLEMENTED','CUSTOMER_WITNESS',[],'lead-path-sprint-fulfillment'),
    qa('ON REPLY?', 'Stop automated follow-up, classify reply, and route qualification/objection to canonical reply handling.', 'IMPLEMENTED','OUTREACH_CONTROL',[],'reply-intelligence'),
    qa('ON BOUNCE?', 'Quarantine sender/recipient evidence, suppress as appropriate, and treat bounce as proof of send with negative delivery evidence.', 'IMPLEMENTED','DELIVERABILITY',[],'postal-effect-adapter'),
    qa('ON COMPLAINT?', 'Suppress recipient, pause affected sender/provider as required, and raise deliverability circuit breaker.', 'IMPLEMENTED','DELIVERABILITY',[],'sender-mesh'),
    qa('ON UNCERTAIN SEND?', 'Lock the business key, reconcile read-only, and never blindly retry without proof of non-submission.', 'IMPLEMENTED','V9_EFFECT_PROTOCOL',[],'external-effect-recovery'),
    qa('AFTER FIVE CONVERSATIONS?', decision, decision==='CONTINUE_BOUNDED_CANARY'?'BOUNDED':'REVIEW_OR_STOP','CANARY_DOCTRINE',[], 'first-cash-canary-packet'),
    qa('CURRENT ELIGIBLE TARGETS?', {qualified:targetCount,eligibleToContact:eligibleTargetCount,targetIds}, eligibleTargetCount>0?'PREPARED':'BLOCKED','TARGET_EVIDENCE',eligibleTargetCount>0?[]:['no-targets-currently-proven-eligible'],'world-brain-field-mission')
  ];
  return {
    schemaVersion:FIRST_CASH_CANARY_PACKET_VERSION,
    offer:CANONICAL_FIRST_CASH_OFFER.name,
    sku:CANONICAL_FIRST_CASH_OFFER.sku,
    offerLineage:'CANONICAL_LEAD_PATH_CHAMPION',
    price:{currency:'USD',amount:450,scope:'fixed'},
    buyer:'US or otherwise legally approved agencies serving HVAC, plumbing, or electrical businesses',
    paymentLink:normalizedPaymentLink,
    paymentLinkEvidenceClass,
    paymentTruthBoundary:PAYMENT_LINK_TRUTH_BOUNDARY,
    canContact,
    blockedGates:blocked,
    targetCount,
    eligibleTargetCount,
    targetIds:[...targetIds],
    qualifiedConversationCount,
    paidPilotCount,
    canaryDecision:decision,
    questions:qs,
    commercialTruth:{realCustomers:0,clearedRevenueUsd:0,acceptedPaidDeliveries:0,retainedCustomers:0},
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}
  };
}
