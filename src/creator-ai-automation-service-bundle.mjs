// Structured capture of a creator-posted "10 AI automations" service bundle.
//
// SOURCE TRUTH BOUNDARY
// The source supplied by the owner is a screenshot of a social-media post.
// It claims ten monthly prices totalling $14,750/mo. Those prices are preserved
// exactly as CREATOR_CLAIM evidence. They are not buyer signals, transactions,
// verified market prices, UberBond revenue, or proof that any customer will pay.
//
// This module is intentionally local-preparation only. It exposes no send,
// provider, payment, deployment, credential, DNS, or production-mutation path.

export const CREATOR_AI_AUTOMATION_BUNDLE_POLICY_VERSION = 'creator-ai-automation-bundle-1.0.0';
export const CREATOR_AI_AUTOMATION_BUNDLE_SOURCE = Object.freeze({
  sourceType: 'OWNER_SUPPLIED_SCREENSHOT',
  observedAt: '2026-08-22',
  claimType: 'CREATOR_CLAIM',
  sourceSummary: 'Social-media post titled "Exposing 10 AI Automations worth $14,750/mo combined (and you can sell every single one)".',
  paymentProof: 'ABSENT',
  buyerProof: 'ABSENT',
  marketPriceVerification: 'ABSENT'
});

import { ZERO_EXTERNAL_EFFECTS as CREATOR_AI_AUTOMATION_ZERO_EFFECTS } from './effect-ledgers.mjs';

export { CREATOR_AI_AUTOMATION_ZERO_EFFECTS };

const COMMON_BOUNDARIES = Object.freeze([
  'Client-authorized systems and data only.',
  'No outbound message, review response, CRM write, booking change, campaign action, or phone call is executed without the applicable authorization gate.',
  'Consent, opt-out, suppression, privacy, recording, telemarketing, and platform-policy requirements remain jurisdiction/channel specific.',
  'Creator-posted pricing remains CREATOR_CLAIM until independently verified by buyer evidence or transaction evidence.',
  'Synthetic tests and demos never become customer, payment, delivery, or retention proof.'
]);

const SERVICE_DEFINITIONS = [
  {
    id: 'creator-ai-voice-receptionist',
    name: 'AI Voice Receptionist',
    claimedMonthlyUsd: 2500,
    category: 'voice-automation',
    buyerHypothesis: ['Local service businesses', 'Clinics', 'Home services', 'High-call-volume SMBs'],
    mechanism: 'Answer inbound calls, classify intent, answer bounded FAQs, capture lead details, route or schedule next steps, and create a traceable CRM event.',
    recurringTrigger: 'Every inbound call and after-hours coverage window',
    reusableCapabilities: ['telephony-adapter', 'conversation-state-machine', 'knowledge-retrieval', 'lead-capture', 'calendar-routing', 'crm-state', 'consent-record', 'quality-monitoring'],
    deliveryRisks: ['Call-recording law', 'Emergency/high-stakes misrouting', 'Hallucinated policy or pricing', 'Telephony/provider dependence']
  },
  {
    id: 'creator-missed-call-text-back',
    name: 'Missed Call Text-Back',
    claimedMonthlyUsd: 500,
    category: 'lead-response-automation',
    buyerHypothesis: ['Local service businesses', 'Appointment businesses', 'Sales teams'],
    mechanism: 'Detect an unanswered eligible inbound call, reconcile consent/suppression state, prepare a bounded follow-up, and track reply or booking outcome.',
    recurringTrigger: 'Eligible missed inbound calls',
    reusableCapabilities: ['telephony-events', 'consent-and-suppression', 'message-preparation', 'crm-state', 'reply-classification', 'booking-attribution'],
    deliveryRisks: ['SMS consent', 'Duplicate messages', 'Wrong-number handling', 'Carrier/provider policy']
  },
  {
    id: 'creator-review-management',
    name: 'Review Management',
    claimedMonthlyUsd: 750,
    category: 'reputation-automation',
    buyerHypothesis: ['Local businesses', 'Multi-location operators', 'Agencies'],
    mechanism: 'Monitor review events from authorized sources, classify issues, prepare response drafts, route escalations, and measure response-time/coverage without fabricating reviews.',
    recurringTrigger: 'New review or unresolved-review event',
    reusableCapabilities: ['review-source-adapters', 'sentiment-and-risk-classification', 'response-drafting', 'approval-routing', 'reputation-dashboard'],
    deliveryRisks: ['Platform terms', 'Fake-review incentives', 'Defamation/privacy issues', 'Unauthorized public posting']
  },
  {
    id: 'creator-lead-follow-up-system',
    name: 'Lead Follow-Up System',
    claimedMonthlyUsd: 1500,
    category: 'lead-nurture-automation',
    buyerHypothesis: ['SMBs with inbound leads', 'Agencies', 'Sales teams'],
    mechanism: 'Normalize lead events, prioritize by evidence and freshness, prepare channel-appropriate follow-up sequences, track replies, and stop on suppression or terminal states.',
    recurringTrigger: 'New or stale eligible lead event',
    reusableCapabilities: ['lead-ingestion', 'identity-resolution', 'priority-scoring', 'sequence-state-machine', 'consent-and-suppression', 'reply-classification', 'crm-attribution'],
    deliveryRisks: ['Spam/telemarketing law', 'Bad enrichment', 'Sequence over-contact', 'Attribution ambiguity']
  },
  {
    id: 'creator-customer-re-engagement',
    name: 'Customer Re-Engagement',
    claimedMonthlyUsd: 1500,
    category: 'retention-automation',
    buyerHypothesis: ['Local services', 'Subscription businesses', 'Ecommerce', 'Appointment businesses'],
    mechanism: 'Detect eligible dormant customer states, select evidence-backed re-engagement reasons, prepare bounded outreach, and measure return, booking, purchase, or opt-out outcomes.',
    recurringTrigger: 'Dormancy or lifecycle trigger',
    reusableCapabilities: ['customer-state', 'lifecycle-triggers', 'consent-and-suppression', 'offer-rules', 'message-preparation', 'revenue-attribution'],
    deliveryRisks: ['Consent and retention rules', 'Inappropriate targeting', 'Discount leakage', 'False attribution']
  },
  {
    id: 'creator-appointment-reminders',
    name: 'Appointment Reminders',
    claimedMonthlyUsd: 800,
    category: 'booking-automation',
    buyerHypothesis: ['Clinics', 'Salons', 'Home services', 'Professional services'],
    mechanism: 'Read authorized booking state, prepare reminder/confirmation messages, capture reschedule/cancel intent, and reconcile final appointment status.',
    recurringTrigger: 'Upcoming appointment milestones',
    reusableCapabilities: ['calendar-adapters', 'contact-preference', 'consent-and-suppression', 'message-preparation', 'reschedule-routing', 'booking-state-reconciliation'],
    deliveryRisks: ['Health/privacy data', 'Wrong-recipient reminders', 'Timezone errors', 'Unapproved booking mutations']
  },
  {
    id: 'creator-cold-outreach-system',
    name: 'Cold Outreach System',
    claimedMonthlyUsd: 2000,
    category: 'distribution-automation',
    buyerHypothesis: ['B2B agencies', 'Service businesses', 'Sales teams'],
    mechanism: 'Research lawful prospects, preserve contact provenance, score fit, draft evidence-grounded personalization, and prepare governed sequences behind consent/suppression/deliverability/consequence gates.',
    recurringTrigger: 'Approved campaign/prospect cohort',
    reusableCapabilities: ['prospect-research', 'contact-provenance', 'fit-scoring', 'personalization', 'deliverability-guard', 'suppression', 'sequence-state-machine', 'reply-classification', 'revenue-attribution'],
    deliveryRisks: ['Anti-spam/telemarketing law', 'Platform/provider policy', 'Deliverability', 'Contact provenance', 'Complaint risk']
  },
  {
    id: 'creator-full-backend-crm',
    name: 'Full Backend CRM',
    claimedMonthlyUsd: 3000,
    category: 'crm-operations',
    buyerHypothesis: ['SMBs', 'Agencies', 'Multi-location operators'],
    mechanism: 'Maintain a canonical account/contact/lead/customer lifecycle graph, task state, attribution, payment/delivery references, and auditable automation triggers.',
    recurringTrigger: 'Every commercial lifecycle state transition',
    reusableCapabilities: ['identity-graph', 'crm-state', 'task-universe', 'audit-log', 'attribution', 'permissions', 'integration-adapters', 'reporting'],
    deliveryRisks: ['Migration scope', 'Sensitive data', 'Permission errors', 'Vendor lock-in', 'Unbounded customization']
  },
  {
    id: 'creator-custom-dashboard',
    name: 'Custom Dashboard',
    claimedMonthlyUsd: 1500,
    category: 'analytics-automation',
    buyerHypothesis: ['SMBs', 'Agencies', 'Operations teams'],
    mechanism: 'Reconcile authorized source data into decision-grade metrics with provenance, freshness, contradiction flags, and economic outcomes rather than vanity metrics.',
    recurringTrigger: 'Source updates and reporting cadence',
    reusableCapabilities: ['data-adapters', 'metric-contracts', 'provenance', 'freshness-monitoring', 'contradiction-detection', 'economic-outcome-graph', 'operator-ui'],
    deliveryRisks: ['Metric-definition drift', 'Stale data', 'Dashboard theater', 'Sensitive data exposure']
  },
  {
    id: 'creator-estimate-follow-up',
    name: 'Estimate Follow-Up',
    claimedMonthlyUsd: 700,
    category: 'quote-conversion-automation',
    buyerHypothesis: ['Home services', 'Contractors', 'Local professional services', 'B2B services'],
    mechanism: 'Detect open estimates/quotes, classify age and next-best action, prepare authorized reminders, capture objections or decisions, and reconcile won/lost/expired outcomes.',
    recurringTrigger: 'Eligible open-estimate lifecycle milestones',
    reusableCapabilities: ['estimate-state', 'crm-state', 'consent-and-suppression', 'message-preparation', 'objection-classification', 'revenue-attribution'],
    deliveryRisks: ['Over-contact', 'Quote-version mismatch', 'Expired pricing', 'Unapproved discounts or commitments']
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(definition, rank) {
  return Object.freeze({
    ...definition,
    rank,
    sourceClaim: {
      amountUsdMonthly: definition.claimedMonthlyUsd,
      claimType: 'CREATOR_CLAIM',
      verification: 'UNVERIFIED_CREATOR_PRICE_CLAIM'
    },
    evidence: {
      classification: 'CREATOR_CLAIM',
      source: CREATOR_AI_AUTOMATION_BUNDLE_SOURCE,
      buyerSignal: 'ABSENT',
      transactionEvidence: 'ABSENT'
    },
    currentStatus: 'RESEARCH_ONLY',
    commercialTruth: 'CREATOR_CLAIM_ONLY__NO_BUYER_OR_PAYMENT_PROOF',
    executionAuthority: 'LOCAL_PREPARATION_ONLY',
    constraints: [...COMMON_BOUNDARIES],
    externalEffectLedger: { ...CREATOR_AI_AUTOMATION_ZERO_EFFECTS }
  });
}

export const CREATOR_AI_AUTOMATION_SERVICE_BUNDLE = Object.freeze(
  SERVICE_DEFINITIONS.map((definition, index) => normalize(definition, index + 1))
);

export function listCreatorAiAutomationServices() {
  return clone(CREATOR_AI_AUTOMATION_SERVICE_BUNDLE);
}

export function getCreatorAiAutomationService(serviceId) {
  const found = CREATOR_AI_AUTOMATION_SERVICE_BUNDLE.find(item => item.id === String(serviceId || '').trim());
  return found ? clone(found) : null;
}

export function summarizeCreatorAiAutomationBundle() {
  const services = listCreatorAiAutomationServices();
  const claimedMonthlyUsd = services.reduce((sum, service) => sum + service.claimedMonthlyUsd, 0);
  const capabilities = [...new Set(services.flatMap(service => service.reusableCapabilities))].sort();
  return {
    ok: true,
    policyVersion: CREATOR_AI_AUTOMATION_BUNDLE_POLICY_VERSION,
    serviceCount: services.length,
    claimedMonthlyUsd,
    claimType: 'CREATOR_CLAIM',
    verifiedMarketPriceUsd: null,
    verifiedRevenueUsd: 0,
    paymentProof: 'ABSENT',
    buyerProof: 'ABSENT',
    uniqueReusableCapabilities: capabilities,
    strategy: 'MASTER_SHARED_CAPABILITIES__COMPOSE_MULTIPLE_OFFERS',
    externalEffectLedger: { ...CREATOR_AI_AUTOMATION_ZERO_EFFECTS }
  };
}
