// The nineteen questions that stand between this repository and its first
// dollar, answered in one machine-consumable object.
//
// The packet exists because "are we ready to go get a customer?" kept being
// answered by reading code and feeling optimistic. Each question below is
// answered from a module that can be pointed at, with a status that says what
// class of thing the answer is, so an answer can be wrong in public rather than
// vague in private.
//
// The top-level `canContact` is the only field that decides anything, and it is
// a pure function of six gates. It is false today, and it is false for six
// independent reasons -- which is the point: satisfying any one of them still
// leaves it false. Nothing in this file can make it true. Only an activated
// provider that permits the purpose, an owner authorization, a verified sending
// identity, loaded suppression/consent evidence, a live payment rail and a legal
// clearance can, and every one of those is somebody's external act.
//
// Canary doctrine: at most five qualified conversations, then KILL or RETHINK.
// A sixth conversation may never read CONTINUE. That ceiling is enforced by
// `canaryVerdictForConversation` rather than left to judgement, because the
// point in an experiment where stopping is hardest is exactly the point where
// the rule has to already exist.
import crypto from 'node:crypto';

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { PAYMENT_TRUTH_POLICY_VERSION } from './payments.mjs';
import { selectFreeRoute, FREE_FIRST_ROUTER_VERSION } from './free-first-outreach-router.mjs';
import {
  diagnosePaymentRail,
  isPaymentRailLiveReady,
  summarizePaymentRail,
  PAYMENT_RAIL_DOCTOR_VERSION,
  UNIMPLEMENTED_PAYMENT_RAILS
} from './payment-rail-doctor.mjs';
import {
  evaluateFirstCashCanary,
  FIRST_CASH_MAX_QUALIFIED_CONVERSATIONS
} from './first-cash-canary-guard.mjs';
import {
  createLeadPathSprint,
  LEAD_PATH_SPRINT_FULFILLMENT_VERSION,
  LEAD_PATH_SPRINT_PRICE,
  LEAD_PATH_SPRINT_SKU,
  LEAD_PATH_SPRINT_STATES
} from './lead-path-sprint-fulfillment.mjs';

export const FIRST_CASH_CANARY_PACKET_VERSION = 'uberbond.first-cash-canary-packet-1.0.0';

/**
 * The six gates `canContact` is the conjunction of.
 *
 * Named and exported so a test can flip them one at a time and prove that no
 * single one of them is sufficient.
 */
export const FIRST_CASH_CONTACT_GATES = Object.freeze([
  'coldB2bTransportRoute',
  'outboundAuthority',
  'verifiedSendingIdentity',
  'consentAndSuppressionEvidence',
  'paymentRailLiveReady',
  'legalAndTaxClearance'
]);

export const QUESTION_STATUSES = Object.freeze([
  'ANSWERED',
  'BLOCKED',
  'OWNER_ACTION_REQUIRED',
  'EXTERNAL_PROOF_REQUIRED'
]);

export const QUESTION_EVIDENCE_CLASSES = Object.freeze([
  'INTERNAL_CODE',
  'PROVIDER_POLICY_RESEARCH',
  'HYPOTHESIS',
  'OWNER_DECISION',
  'OWNER_ATTESTATION',
  'EXTERNAL_PAYMENT',
  'EXTERNAL_CUSTOMER',
  'NONE'
]);

/**
 * The question ids, in brief order.
 *
 * The execution packet names eighteen of these in prose and calls the set
 * nineteen; the mission brief itself is not repository-native, so the
 * nineteenth is recorded here as ON_REFUND_OR_DISPUTE. That is the only step of
 * the canonical loop the eighteen leave unanswered, and `src/payments.mjs`
 * already implements REFUND_OR_DISPUTE, so it is the one question the tree can
 * answer that the prose list omits. If the brief names a different nineteenth,
 * this array is the single line that changes.
 */
export const FIRST_CASH_QUESTIONS = Object.freeze([
  'CAN_WE_CONTACT',
  'WHO',
  'WHY',
  'WHICH_SENDER',
  'WHICH_PROVIDER',
  'WHICH_POLICY_EVIDENCE',
  'WHICH_AUTHORITY',
  'WHAT_OFFER',
  'WHAT_PRICE',
  'WHAT_PAYMENT_LINK',
  'HOW_RECONCILED',
  'HOW_DELIVERED',
  'HOW_ACCEPTED',
  'ON_REFUND_OR_DISPUTE',
  'ON_REPLY',
  'ON_BOUNCE',
  'ON_COMPLAINT',
  'ON_UNCERTAIN_SEND',
  'AFTER_FIVE_CONVERSATIONS'
]);

export const FIRST_CASH_OFFER = Object.freeze({
  offerId: 'lead-path-revenue-leak-evidence-sprint',
  name: 'White-label Lead-Path Revenue Leak Evidence Sprint',
  sku: LEAD_PATH_SPRINT_SKU,
  deliveryModel: 'WHITE_LABEL_FIXED_SCOPE',
  priceCents: LEAD_PATH_SPRINT_PRICE.amountCents,
  currency: LEAD_PATH_SPRINT_PRICE.currency,
  priceModel: 'FIXED_ONE_TIME',
  paymentTiming: 'PAYMENT_BEFORE_FULFILMENT',
  buyer: 'US or otherwise legally approved agencies serving HVAC, plumbing and electrical contractors',
  buyerEvidenceClass: 'HYPOTHESIS'
});

export const FIRST_CASH_CANARY_DOCTRINE = Object.freeze({
  maxQualifiedConversations: FIRST_CASH_MAX_QUALIFIED_CONVERSATIONS,
  decisionAfterLimit: Object.freeze(['KILL', 'RETHINK']),
  rule: 'At most five qualified conversations. A sixth may never read CONTINUE.'
});

const clone = value => structuredClone(value);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function strictDate(value) {
  const date = value instanceof Date ? value : new Date(text(value, 80) || '');
  return Number.isFinite(date.getTime()) ? date : null;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function gate({ id, satisfied, reasonCodes, evidenceClass, module: moduleRef }) {
  return {
    id,
    satisfied: satisfied === true,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    evidenceClass,
    module: moduleRef
  };
}

/**
 * The kill ceiling, as a function rather than a paragraph.
 *
 * Five is the whole experiment. The sixth conversation is not a sixth data
 * point; it is the moment the experiment stopped being one.
 */
export function canaryVerdictForConversation(count) {
  if (!Number.isSafeInteger(count) || count < 1) return 'INVALID_CONVERSATION_COUNT';
  if (count < FIRST_CASH_CANARY_DOCTRINE.maxQualifiedConversations) return 'CONTINUE';
  if (count === FIRST_CASH_CANARY_DOCTRINE.maxQualifiedConversations) return 'DECISION_REQUIRED_KILL_OR_RETHINK';
  return 'CANARY_LIMIT_EXCEEDED_KILL';
}

/**
 * `canContact` is the conjunction and nothing else.
 *
 * Written as a reduction over the named gate list rather than as a chain of
 * `&&`, so adding a gate cannot forget to add it here, and so a test can prove
 * that flipping any single gate is not enough.
 */
export function deriveCanContact(gates) {
  return FIRST_CASH_CONTACT_GATES.every(id => gates?.[id]?.satisfied === true);
}

function evaluateOutboundAuthority(authorization, at) {
  const reasonCodes = [];
  if (!authorization || typeof authorization !== 'object') {
    return { satisfied: false, reasonCodes: ['outbound-authorization-absent'] };
  }
  if (authorization.ownerAuthorized !== true) reasonCodes.push('outbound-authorization-not-granted');
  if (!text(authorization.scopeRef, 300)) reasonCodes.push('outbound-authorization-scope-required');
  const expires = strictDate(authorization.expiresAt);
  if (!expires) reasonCodes.push('outbound-authorization-expiry-required');
  else if (expires.getTime() <= at.getTime()) reasonCodes.push('outbound-authorization-expired');
  return { satisfied: reasonCodes.length === 0, reasonCodes };
}

function evaluateSendingIdentity(sendingIdentity, at) {
  const reasonCodes = [];
  if (!sendingIdentity || typeof sendingIdentity !== 'object') {
    return { satisfied: false, reasonCodes: ['verified-sending-identity-absent'] };
  }
  if (!text(sendingIdentity.domain, 253)) reasonCodes.push('sending-domain-required');
  if (!text(sendingIdentity.mailbox, 320)) reasonCodes.push('sending-mailbox-required');
  // Only an observation may say VERIFIED. A generated expected record is a
  // prediction about DNS, not a reading of it.
  if (text(sendingIdentity.dnsStatus, 40).toUpperCase() !== 'GREEN') reasonCodes.push('sending-domain-dns-not-green');
  if (sendingIdentity.dnsEvidenceClass !== 'OBSERVED') reasonCodes.push('sending-domain-dns-evidence-must-be-observed');
  const observedAt = strictDate(sendingIdentity.observedAt);
  if (!observedAt) reasonCodes.push('sending-domain-dns-observation-time-required');
  else if (at.getTime() - observedAt.getTime() > 24 * 3_600_000) reasonCodes.push('sending-domain-dns-evidence-stale');
  return { satisfied: reasonCodes.length === 0, reasonCodes };
}

function evaluateConsentAndSuppression(consent) {
  const reasonCodes = [];
  if (!consent || typeof consent !== 'object') {
    return { satisfied: false, reasonCodes: ['consent-and-suppression-evidence-absent'] };
  }
  if (consent.suppressionListLoaded !== true) reasonCodes.push('suppression-list-not-loaded');
  if (consent.complaintHandlingWired !== true) reasonCodes.push('complaint-handling-not-wired');
  if (!text(consent.consentEvidenceRef, 500)) reasonCodes.push('consent-evidence-reference-required');
  return { satisfied: reasonCodes.length === 0, reasonCodes };
}

function evaluateLegalClearance(legal, at) {
  const reasonCodes = [];
  if (!legal || typeof legal !== 'object') {
    return { satisfied: false, reasonCodes: ['legal-and-tax-clearance-absent'] };
  }
  if (legal.ownerAttested !== true) reasonCodes.push('legal-clearance-owner-attestation-required');
  if (!Array.isArray(legal.evidenceRefs) || !legal.evidenceRefs.filter(Boolean).length) reasonCodes.push('legal-clearance-evidence-reference-required');
  const attestedAt = strictDate(legal.attestedAt);
  if (!attestedAt) reasonCodes.push('legal-clearance-attestation-time-required');
  else if (at.getTime() - attestedAt.getTime() > 180 * 86_400_000) reasonCodes.push('legal-clearance-attestation-stale');
  return { satisfied: reasonCodes.length === 0, reasonCodes };
}

function question(id, answer, status, evidenceClass, reasonCodes, moduleRef) {
  return {
    question: id,
    answer,
    status,
    evidenceClass,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    module: moduleRef
  };
}

/**
 * Compile the packet.
 *
 * Every optional input defaults to absent, and absent is always the blocking
 * answer. A caller who supplies nothing gets the true picture rather than an
 * empty one.
 */
export function compileFirstCashCanaryPacket({
  providers = [],
  outboundAuthorization = null,
  sendingIdentity = null,
  consentEvidence = null,
  legalClearance = null,
  paymentRail = null,
  date = new Date()
} = {}) {
  const at = strictDate(date);
  if (!at) return {
    ok: false,
    policyVersion: FIRST_CASH_CANARY_PACKET_VERSION,
    status: 'BLOCKED',
    reasonCodes: ['valid-packet-time-required'],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
  const atIso = at.toISOString();
  const providerRows = Array.isArray(providers) ? providers : [];

  // Only the stable published subset of the router's signature is used here;
  // another lane extends that module and keeps these keys fixed.
  const coldRoute = selectFreeRoute({
    purpose: 'COLD_B2B',
    providers: providerRows,
    usageByProvider: {},
    providerStates: {},
    consentEvidence: false,
    at: atIso,
    mode: 'PLAN',
    maxPolicyAgeDays: 45
  });

  const rail = paymentRail && typeof paymentRail === 'object' && paymentRail.state
    ? paymentRail
    : diagnosePaymentRail({ mode: 'LIVE', at, ...(paymentRail || {}) });
  const railSummary = summarizePaymentRail(rail);

  const authority = evaluateOutboundAuthority(outboundAuthorization, at);
  const identity = evaluateSendingIdentity(sendingIdentity, at);
  const consent = evaluateConsentAndSuppression(consentEvidence);
  const legal = evaluateLegalClearance(legalClearance, at);

  const gates = {
    coldB2bTransportRoute: gate({
      id: 'coldB2bTransportRoute',
      satisfied: coldRoute.ok === true,
      reasonCodes: coldRoute.ok ? [] : coldRoute.reasonCodes,
      evidenceClass: 'PROVIDER_POLICY_RESEARCH',
      module: 'src/free-first-outreach-router.mjs'
    }),
    outboundAuthority: gate({
      id: 'outboundAuthority',
      satisfied: authority.satisfied,
      reasonCodes: authority.reasonCodes,
      evidenceClass: 'OWNER_DECISION',
      module: 'src/deliverability-guard.mjs'
    }),
    verifiedSendingIdentity: gate({
      id: 'verifiedSendingIdentity',
      satisfied: identity.satisfied,
      reasonCodes: identity.reasonCodes,
      evidenceClass: 'INTERNAL_CODE',
      module: 'src/dns-verification.mjs'
    }),
    consentAndSuppressionEvidence: gate({
      id: 'consentAndSuppressionEvidence',
      satisfied: consent.satisfied,
      reasonCodes: consent.reasonCodes,
      evidenceClass: 'INTERNAL_CODE',
      module: 'src/deliverability-guard.mjs'
    }),
    paymentRailLiveReady: gate({
      id: 'paymentRailLiveReady',
      satisfied: isPaymentRailLiveReady(rail),
      reasonCodes: isPaymentRailLiveReady(rail) ? [] : [`payment-rail-state:${rail.state}`, ...(rail.reasonCodes || [])],
      evidenceClass: 'INTERNAL_CODE',
      module: 'src/payment-rail-doctor.mjs'
    }),
    legalAndTaxClearance: gate({
      id: 'legalAndTaxClearance',
      satisfied: legal.satisfied,
      reasonCodes: legal.reasonCodes,
      evidenceClass: 'OWNER_ATTESTATION',
      module: 'owner attestation; no repository module can decide this'
    })
  };

  const canContact = deriveCanContact(gates);
  const blockingGates = FIRST_CASH_CONTACT_GATES.filter(id => gates[id].satisfied !== true);

  const coldCapableProviders = providerRows.filter(row => String(row?.purposeRules?.COLD_B2B ?? '').toUpperCase() === 'ALLOWED');

  const questions = [
    question('CAN_WE_CONTACT',
      canContact
        ? 'Yes, within the authorized scope.'
        : `No. Not one prospect may be contacted today. ${blockingGates.length} of ${FIRST_CASH_CONTACT_GATES.length} gates are unsatisfied.`,
      canContact ? 'ANSWERED' : 'BLOCKED', 'INTERNAL_CODE',
      blockingGates.map(id => `gate-unsatisfied:${id}`), 'src/first-cash-canary-packet.mjs'),

    question('WHO', FIRST_CASH_OFFER.buyer,
      'ANSWERED', 'HYPOTHESIS', ['buyer-definition-is-a-hypothesis-until-a-buyer-pays'], 'src/first-cash-canary-packet.mjs'),

    question('WHY',
      'Lead-path instrumentation between an agency\'s ad spend and its client\'s booked jobs leaks attributable revenue; the sprint produces fixed-scope evidence of where and how much.',
      'ANSWERED', 'HYPOTHESIS', ['mechanism-unvalidated-by-any-paying-buyer'], 'src/commercial-opportunity-catalog.mjs'),

    question('WHICH_SENDER',
      'None. No sending domain or mailbox has a fresh observed GREEN DNS reading.',
      'BLOCKED', 'INTERNAL_CODE', gates.verifiedSendingIdentity.reasonCodes, 'src/sending-domain-registry.mjs'),

    question('WHICH_PROVIDER',
      `None. ${coldCapableProviders.length} of ${providerRows.length} reviewed free providers permit COLD_B2B, and no provider account is activated.`,
      'BLOCKED', 'PROVIDER_POLICY_RESEARCH', gates.coldB2bTransportRoute.reasonCodes, 'src/free-first-outreach-router.mjs'),

    question('WHICH_POLICY_EVIDENCE',
      `artifacts/outreach/free-first-provider-registry-2026-09-01.json: ${providerRows.length} providers, each carrying a policy observation time and at least one evidence reference.`,
      providerRows.length ? 'ANSWERED' : 'BLOCKED', 'PROVIDER_POLICY_RESEARCH',
      providerRows.length ? ['research-record-is-not-an-activated-provider'] : ['provider-policy-registry-not-supplied'],
      'artifacts/outreach/free-first-provider-registry-2026-09-01.json'),

    question('WHICH_AUTHORITY',
      'None. businessEffectAuthority is NONE everywhere in this packet and no owner outbound authorization exists.',
      'OWNER_ACTION_REQUIRED', 'OWNER_DECISION', gates.outboundAuthority.reasonCodes, 'src/deliverability-guard.mjs'),

    question('WHAT_OFFER',
      `${FIRST_CASH_OFFER.name} - ${FIRST_CASH_OFFER.deliveryModel.toLowerCase().replaceAll('_', ' ')}.`,
      'ANSWERED', 'OWNER_DECISION', [], 'src/lead-path-sprint-fulfillment.mjs'),

    question('WHAT_PRICE',
      `${FIRST_CASH_OFFER.currency} ${(FIRST_CASH_OFFER.priceCents / 100).toFixed(2)} fixed, one-time, payment before fulfilment.`,
      'ANSWERED', 'OWNER_DECISION', ['price-is-a-decision-not-a-measured-willingness-to-pay'], 'src/lead-path-sprint-fulfillment.mjs'),

    question('WHAT_PAYMENT_LINK',
      `None yet. The only implemented rail is Lemon Squeezy; the rail doctor reports ${rail.state}. ${UNIMPLEMENTED_PAYMENT_RAILS.paypal}.`,
      'BLOCKED', 'INTERNAL_CODE', gates.paymentRailLiveReady.reasonCodes, 'src/payment-rail-doctor.mjs'),

    question('HOW_RECONCILED',
      'Signed provider webhook -> signature admission -> durable inbox -> planner -> claim lease -> provider verification -> canonical receipt -> RECONCILED. Without a configured provider verifier the worker claims nothing at all.',
      'EXTERNAL_PROOF_REQUIRED', 'INTERNAL_CODE',
      ['payment-provider-verifier-not-configured'], 'src/payment-reconciliation-worker.mjs'),

    question('HOW_DELIVERED',
      `A ${LEAD_PATH_SPRINT_STATES.length}-state sprint composing the canonical fulfilment engine: ${LEAD_PATH_SPRINT_STATES.join(' -> ')}.`,
      'ANSWERED', 'INTERNAL_CODE', ['zero-deliveries-have-occurred'], 'src/lead-path-sprint-fulfillment.mjs'),

    question('HOW_ACCEPTED',
      'CUSTOMER_ACCEPTED requires EXTERNAL_CUSTOMER evidence in the canonical engine. Internal QA, a synthetic canary and a model claim can never produce it.',
      'EXTERNAL_PROOF_REQUIRED', 'EXTERNAL_CUSTOMER', ['no-external-customer-acceptance-evidence-exists'], 'src/service-fulfillment.mjs'),

    question('ON_REFUND_OR_DISPUTE',
      'order_refunded classifies as REFUND_OR_DISPUTE with revenueSign -1; the refund reverses recorded revenue and never reverses an acceptance that an external customer actually gave.',
      'ANSWERED', 'INTERNAL_CODE', ['no-payment-exists-to-refund'], 'src/payments.mjs'),

    question('ON_REPLY',
      'An inbound reply is classified and routed to the owner. No automated reply is sent, and a reply is not consent to keep sending.',
      'ANSWERED', 'INTERNAL_CODE', ['reply-handling-unexercised-zero-messages-sent'], 'src/inbound-classify.mjs'),

    question('ON_BOUNCE',
      'A hard bounce suppresses the recipient and counts against the sender-health pause threshold, which pauses the sender rather than continuing.',
      'ANSWERED', 'INTERNAL_CODE', ['bounce-handling-unexercised-zero-messages-sent'], 'src/deliverability-guard.mjs'),

    question('ON_COMPLAINT',
      'A complaint suppresses the recipient permanently and pauses the sender at a threshold of one. Suppression is never lifted by a later campaign.',
      'ANSWERED', 'INTERNAL_CODE', ['complaint-handling-unexercised-zero-messages-sent'], 'src/deliverability-guard.mjs'),

    question('ON_UNCERTAIN_SEND',
      'No blind retry. The effect stays UNCERTAIN and the business key stays held; only ABORTED_BEFORE_DISPATCH and RECONCILED_NOT_SUBMITTED release it for a resend.',
      'ANSWERED', 'INTERNAL_CODE', ['uncertain-effect-must-be-reconciled-before-resend'], 'src/omnia-v9/integrations/external-effect-state-machine.mjs'),

    question('AFTER_FIVE_CONVERSATIONS',
      `${FIRST_CASH_CANARY_DOCTRINE.rule} The verdict at five is ${canaryVerdictForConversation(5)}; at six it is ${canaryVerdictForConversation(6)}.`,
      'ANSWERED', 'OWNER_DECISION', ['kill-or-rethink-is-a-decision-the-owner-must-take'], 'src/first-cash-canary-packet.mjs')
  ];

  const missingQuestions = FIRST_CASH_QUESTIONS.filter(id => !questions.some(row => row.question === id));
  const unexpectedQuestions = questions.map(row => row.question).filter(id => !FIRST_CASH_QUESTIONS.includes(id));

  return {
    ok: missingQuestions.length === 0 && unexpectedQuestions.length === 0,
    policyVersion: FIRST_CASH_CANARY_PACKET_VERSION,
    schemaVersion: 'uberbond-first-cash-canary-packet-1.0.0',
    generatedAt: atIso,
    packetId: `firstcash_${digest({ version: FIRST_CASH_CANARY_PACKET_VERSION, atIso, gates }).slice(0, 24)}`,
    status: canContact ? 'CONTACT_PERMITTED_WITHIN_SCOPE' : 'NO_CONTACT_PERMITTED',
    mode: 'PREPARATION_ONLY_NO_CONTACT_NO_CHECKOUT',
    canContact,
    blockingGates,
    gates,
    offer: { ...FIRST_CASH_OFFER },
    canaryDoctrine: { ...FIRST_CASH_CANARY_DOCTRINE, decisionAfterLimit: [...FIRST_CASH_CANARY_DOCTRINE.decisionAfterLimit] },
    questionCount: questions.length,
    missingQuestions,
    unexpectedQuestions,
    questions,
    paymentRail: {
      state: rail.state,
      liveReady: isPaymentRailLiveReady(rail),
      implementedRails: [...(rail.implementedRails || [])],
      paypalRail: UNIMPLEMENTED_PAYMENT_RAILS.paypal,
      ownerActionQueue: [...(railSummary.ownerActionQueue || [])]
    },
    policyVersions: {
      firstCashPacket: FIRST_CASH_CANARY_PACKET_VERSION,
      freeFirstRouter: FREE_FIRST_ROUTER_VERSION,
      paymentRailDoctor: PAYMENT_RAIL_DOCTOR_VERSION,
      leadPathSprint: LEAD_PATH_SPRINT_FULFILLMENT_VERSION,
      paymentTruth: PAYMENT_TRUTH_POLICY_VERSION
    },
    // The four numbers this packet exists to protect. Nothing in it can move
    // them; only an independent external buyer can.
    commercialTruth: {
      realCustomers: 0,
      clearedRevenueCents: 0,
      acceptedPaidDeliveries: 0,
      retainedCustomers: 0
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

/**
 * The packet plus proof that the delivery machine will not open without money.
 *
 * The earlier version of this walked a rehearsal sprint through every state to
 * show the delivery half worked. That rehearsal is no longer possible, and the
 * reason it is impossible is worth more than the walk was: the canonical sprint
 * refuses to open without a payment truth whose digest recomputes, whose
 * provider event reads as a live one-time order, and whose reference is not
 * marked sandbox, synthetic, fixture, fake or test.
 *
 * So the rehearsal now demonstrates the refusal. It hands the machine exactly
 * the evidence an internal process can manufacture, and records that the door
 * stayed shut. A canary that could open it would be reporting that anybody
 * could.
 */
export function compileFirstCashCanaryArtifact({ providers = [], date = new Date() } = {}) {
  const packet = compileFirstCashCanaryPacket({ providers, date });

  const syntheticAttempt = createLeadPathSprint({
    customerRef: 'canary:no-such-customer',
    paymentLeadId: 'canary-lead',
    canonicalPaymentTruth: {
      ok: true,
      policyVersion: 'payment-renewal-truth-1.6.0',
      leadId: 'canary-lead',
      status: 'PROVIDER_CLEARED_PAYMENT_PROVEN',
      verifiedFirstPaymentProduct: LEAD_PATH_SPRINT_SKU,
      verifiedProviderEventRefs: ['order_created:synthetic-canary'],
      economics: {
        netProviderClearedRevenueCents: LEAD_PATH_SPRINT_PRICE.amountCents,
        currency: LEAD_PATH_SPRINT_PRICE.currency,
        verifiedPaymentCount: 1,
        verifiedRenewalCount: 0,
        verifiedReversalCount: 0
      }
    },
    at: date.toISOString()
  });

  return {
    ...packet,
    canonicalDeliveryRefusal: {
      // The whole assertion. `ok: false` here is the healthy reading.
      sprintOpened: syntheticAttempt.ok === true,
      refused: syntheticAttempt.ok !== true,
      reasonCodes: Array.isArray(syntheticAttempt.reasonCodes) ? [...syntheticAttempt.reasonCodes] : [],
      declaredStates: [...LEAD_PATH_SPRINT_STATES],
      fulfillmentPolicyVersion: LEAD_PATH_SPRINT_FULFILLMENT_VERSION,
      truthBoundary: 'A refused synthetic sprint proves the gate holds. It proves nothing about demand, payment or delivery.'
    },
    commercialDeliveryCount: 0,
    acceptedDeliveryCount: 0
  };
}

// ---------------------------------------------------------------------------
// Convergence-lane API
// ---------------------------------------------------------------------------

/** The canonical champion offer name, as the research canon recorded it. */
export const CURRENT_CHAMPION_OFFER = FIRST_CASH_OFFER.name;

/**
 * The canary decision for a conversation/pilot count.
 *
 * `INVALID` covers the two shapes that cannot have happened: a negative count,
 * and a paid pilot with no qualified conversation behind it. Neither is a
 * cautious reading of a real number -- both mean the number is wrong, and a
 * decision derived from a wrong number is worse than no decision.
 */
export function canaryDecision({ qualifiedConversationCount = 0, paidPilotCount = 0 } = {}) {
  // The cap itself lives in first-cash-canary-guard.mjs and is evaluated there.
  // Two modules each holding "at most five" is two places to change it and one
  // of them to forget, so this maps the guard's status onto the decision word
  // rather than re-deciding.
  const verdict = evaluateFirstCashCanary({
    qualifiedConversations: qualifiedConversationCount,
    paidPilots: paidPilotCount
  });
  if (verdict.status === 'INVALID') return 'INVALID';
  if (verdict.status === 'CANARY_VIOLATION' || verdict.status === 'KILL_OR_RETHINK') return 'KILL_OR_RETHINK';
  return 'CONTINUE';
}

/**
 * The convergence-lane name for the packet, with the fields that lane reads.
 *
 * `commercialTruth` is restated in its vocabulary and stays all zeroes, because
 * nothing in this process can move it.
 */
export function buildFirstCashCanaryPacket({
  gates = {},
  qualifiedConversationCount = 0,
  paidPilotCount = 0,
  providers = [],
  date = new Date()
} = {}) {
  const packet = compileFirstCashCanaryPacket({ providers, date, gates });
  const decision = canaryDecision({ qualifiedConversationCount, paidPilotCount });
  const gateValues = FIRST_CASH_CONTACT_GATES.map(gate => gates?.[gate.id ?? gate] === true);
  return {
    ...packet,
    offer: FIRST_CASH_OFFER.name,
    sku: LEAD_PATH_SPRINT_SKU,
    // Every gate must hold. A single false is a refusal, and the packet's own
    // derivation is used when the caller supplied no gates at all.
    canContact: gateValues.length > 0 ? gateValues.every(Boolean) : packet.canContact === true,
    canaryDecision: decision,
    qualifiedConversationCount,
    paidPilotCount,
    commercialTruth: {
      realCustomers: 0,
      clearedRevenueUsd: 0,
      acceptedPaidDeliveries: 0,
      retainedCustomers: 0
    },
    businessEffectAuthority: 'NONE'
  };
}
