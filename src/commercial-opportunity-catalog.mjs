// Canonical, evidence-labeled catalog for the three immediate commercial
// experiments plus the explicit opportunity universe from the UberBond
// thread. This is a preparation registry, not a revenue database, scraper,
// checkout, campaign sender, or provider integration.
import crypto from 'node:crypto';
import { compileTaskBlueprint } from './task-universe.mjs';
import { THREAD_OPPORTUNITY_UNIVERSE } from './thread-opportunity-universe.mjs';

export const COMMERCIAL_OPPORTUNITY_CATALOG_POLICY_VERSION = 'commercial-opportunity-catalog-1.0.0';

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function claim(value, claimType) {
  return { value, claimType };
}

function source(url, title, observedAt = '2026-08-18') {
  return { url, title, observedAt, claimType: 'BUYER_SIGNAL' };
}

function taskBlueprint({ id, purpose, outputs, killConditions }) {
  return {
    id,
    version: '1.0.0',
    purpose,
    inputs: ['opportunityId', 'publicEvidenceRefs', 'optionalCustomerAuthorizedRefs'],
    outputs,
    eligibility: {
      requiredFields: ['opportunityId'],
      requiredEvidenceRefs: [],
      allowSyntheticFixtures: true
    },
    policy: {
      consequenceClass: 'LOCAL_PREPARATION',
      externalEffects: [],
      requiresOwner: false,
      purpose: 'Prepare an evidence-backed commercial experiment without external effects.'
    },
    evaluator: {
      type: 'DETERMINISTIC',
      requiredOutputs: outputs,
      successConditions: [
        'Every finding maps to an evidence reference or is explicitly labeled as a hypothesis.',
        'Unknown external state remains UNKNOWN or EXTERNAL_PROOF_REQUIRED.',
        'The packet contains a bounded seven-day experiment and kill conditions.'
      ],
      killConditions
    },
    retryStrategy: { maxAttempts: 2, backoffMs: 0, retryableErrors: [], nonRetryableErrors: [] },
    ownerBurden: { minutes: 5, reason: 'Owner review is required before publication, access, spend, or contact.' },
    expiration: { maxAgeMs: SEVEN_DAYS_MS },
    successConditions: ['Local packet is complete and reproducible.'],
    killConditions
  };
}

const CORE_CATALOG = [
  {
    id: 'paid-media-revenue-assurance',
    rank: 1,
    name: 'Paid Media Revenue Assurance',
    category: 'revenue-assurance',
    verdict: 'TEST_FIRST',
    buyerSegments: ['Ecommerce brands', 'Local-service businesses', 'Performance agencies'],
    mechanism: 'Reconcile ad-platform, analytics, tag-manager, booking, call, checkout, and order evidence before a buyer increases paid-media spend.',
    observedBuyerSignals: [
      { amountUsd: 600, scope: 'TikTok Ads audit with Pixel/conversion tracking, CPA/ROAS, campaign structure, and scaling readiness.', source: source('https://www.upwork.com/freelance-jobs/apply/TikTok-Ads-Expert-Needed-Audit-Baby-Products-commerce-Account_~022089708779464665972/', 'TikTok Ads audit buyer request') },
      { amountUsd: 250, scope: 'Google Ads, GA4, GTM, BookingKoala and call-conversion tracking audit with live tests.', source: source('https://www.upwork.com/freelance-jobs/apply/Google-Ads-GA4-Conversion-Tracking-Audit-for-Local-Service-Business_~022089676068978998930/', 'Google Ads and GA4 tracking audit buyer request') }
    ],
    evidence: {
      classification: 'BUYER_SIGNAL',
      observedTraction: 'Two fresh paid audit requests on 2026-08-18 showed buyer budgets of $250 and $600; marketplace proposal counts are demand signals, not cleared-payment proof.',
      sources: [
        source('https://ads.tiktok.com/help/article/get-started-pixel', 'TikTok Pixel setup and verification'),
        source('https://ads.tiktok.com/help/article/conversion-discrepancies', 'TikTok conversion discrepancies'),
        source('https://developers.google.com/analytics/devguides/collection/ga4/validate-ecommerce', 'Google Analytics ecommerce validation')
      ]
    },
    candidate: {
      id: 'paid-media-revenue-assurance',
      name: 'Paid Media Revenue Assurance',
      category: 'revenue-assurance',
      timeToCashDays: claim(21, 'ESTIMATE'),
      acquisition: claim('emerging', 'BUYER_SIGNAL'),
      capital: claim('low', 'ESTIMATE'),
      platformDependency: claim('medium', 'INFERENCE'),
      partnerLeverage: claim('strong', 'HYPOTHESIS'),
      dataAsset: claim('compounding', 'HYPOTHESIS'),
      automationPotential: claim(75, 'INFERENCE'),
      founderBurden: claim(25, 'ESTIMATE'),
      recurringTrigger: claim('Monthly tracking and revenue-attribution monitoring', 'HYPOTHESIS'),
      failureMode: claim('Attribution differences are mistaken for defects, or authenticated evidence is unavailable.', 'INFERENCE')
    },
    priceHypotheses: [
      { label: 'Public preflight', amountUsd: 99, classification: 'HYPOTHESIS' },
      { label: 'Authenticated audit', amountUsd: 250, classification: 'HYPOTHESIS' },
      { label: 'Cross-platform assurance audit', amountUsd: 600, classification: 'HYPOTHESIS' }
    ],
    deliverables: ['Canonical conversion-event map', 'Duplicate/missing/misaligned event matrix', 'Evidence-backed discrepancy report', 'Approved remediation plan', 'Recurring monitoring proposal'],
    exclusions: ['Changing campaigns, tags, budgets, checkout, or provider settings without written authorization', 'Guaranteeing ROAS, rankings, or revenue lift', 'Treating public scans as proof of server-side tracking'],
    constraints: ['Customer-granted analytics access is required for authenticated proof.', 'TikTok/GA4/Meta attribution differences may be legitimate.', 'Consent and personal-data handling remain jurisdiction-specific.'],
    recurringRoute: 'Monthly revenue-measurement and conversion-path monitoring',
    testCost: { lowUsd: 0, highUsd: 30, classification: 'ESTIMATE' },
    firstRevenueWindowDays: { low: 7, high: 21, classification: 'ESTIMATE' },
    competitiveRisk: 'HIGH: generic ad-audit competition is visible; UberBond must differentiate through evidence lineage and cross-platform reconciliation.',
    sevenDayExperiment: [
      'Define canonical lead, booking, qualified-call, checkout, and purchase events.',
      'Create synthetic fixtures for missing, duplicated, delayed, and misattributed events.',
      'Run public-only preflight checks on ten suitable websites without contacting them.',
      'Produce one anonymized discrepancy report with every claim classified.',
      'Prepare $99, $250, and $600 pricing hypotheses without calling them market truth.',
      'Keep customer access, publication, and outreach owner-gated.',
      'Promote only after cleared payment and accepted delivery; otherwise revise or kill.'
    ],
    taskBlueprint: taskBlueprint({
      id: 'commercial.paid-media-revenue-assurance.preflight',
      purpose: 'Prepare a cross-platform paid-media tracking and revenue-attribution assurance packet.',
      outputs: ['canonicalEventMap', 'discrepancyMatrix', 'sampleEvidenceReport', 'nextActionPacket'],
      killConditions: ['Authenticated evidence cannot be obtained lawfully.', 'Attribution contradiction remains unresolved.', 'The proposed fix would require unauthorized production mutation.']
    })
  },
  {
    id: 'ai-automation-reliability',
    rank: 2,
    name: 'AI Automation Reliability Pilot',
    category: 'automation-reliability',
    verdict: 'TEST_SECOND',
    buyerSegments: ['Agencies', 'SMB operations teams', 'Teams running n8n, Make, Zapier, CRMs, or LLM workflows'],
    mechanism: 'Find silent automation failures and unsafe cost/retry behavior, then prepare a bounded reliability pilot with validation, receipts, and human approvals.',
    observedBuyerSignals: [
      { amountUsd: 3000, scope: 'Production process automation with PostgreSQL, LLM validation, retries, cost tracking, human review, CRM, calendar, payment, and reporting.', source: source('https://www.upwork.com/freelance-jobs/apply/Integration-and-Custom-Development-Business-Process-Automation_~022089658913580579331/', 'Business-process automation buyer request') },
      { amountUsd: 350, scope: 'Audit and lean automation pilot using APIs, webhooks, publishing, membership, CRM, and analytics.', source: source('https://www.upwork.com/freelance-jobs/apply/Automation-Systems-Architect-Needed-for-Pilot_~022089656641820121331/', 'Automation systems architect pilot request') }
    ],
    evidence: {
      classification: 'BUYER_SIGNAL',
      observedTraction: 'Fresh buyer requests show both a small bounded pilot and a larger production integration; neither is payment proof for UberBond.',
      sources: [
        source('https://www.upwork.com/freelance-jobs/apply/Integration-and-Custom-Development-Business-Process-Automation_~022089658913580579331/', 'Production automation integration request'),
        source('https://www.upwork.com/freelance-jobs/apply/Automation-Systems-Architect-Needed-for-Pilot_~022089656641820121331/', 'Automation pilot request')
      ]
    },
    candidate: {
      id: 'ai-automation-reliability',
      name: 'AI Automation Reliability Pilot',
      category: 'automation-reliability',
      timeToCashDays: claim(30, 'ESTIMATE'),
      acquisition: claim('emerging', 'BUYER_SIGNAL'),
      capital: claim('low', 'ESTIMATE'),
      platformDependency: claim('medium', 'INFERENCE'),
      partnerLeverage: claim('strong', 'HYPOTHESIS'),
      automationPotential: claim(70, 'INFERENCE'),
      founderBurden: claim(40, 'ESTIMATE'),
      recurringTrigger: claim('Reliability monitoring, incident review, and cost/quality regression checks', 'HYPOTHESIS'),
      failureMode: claim('Custom integrations expand scope, or cheaper routing reduces quality.', 'INFERENCE')
    },
    priceHypotheses: [
      { label: 'Reliability preflight', amountUsd: 150, classification: 'HYPOTHESIS' },
      { label: 'Bounded pilot', amountUsd: 350, classification: 'HYPOTHESIS' },
      { label: 'Production integration', amountUsd: 3000, classification: 'HYPOTHESIS' }
    ],
    deliverables: ['Workflow inventory', 'Failure and retry matrix', 'Cost/quality measurement plan', 'Secret and authorization boundary map', 'One bounded pilot packet', 'Monitoring and incident proposal'],
    exclusions: ['Taking credentials into prompts or receipts', 'Changing production workflows without owner authorization', 'Claiming reliability or savings before measured runs'],
    constraints: ['Client-authorized access only.', 'External writes remain behind owner approval.', 'Every model-routing or cost-saving change needs a quality regression test.'],
    recurringRoute: 'Monthly workflow reliability, cost, and regression monitoring',
    testCost: { lowUsd: 0, highUsd: 25, classification: 'ESTIMATE' },
    firstRevenueWindowDays: { low: 7, high: 30, classification: 'ESTIMATE' },
    competitiveRisk: 'MEDIUM-HIGH: service scope can become custom consulting; preserve a fixed pilot boundary.',
    sevenDayExperiment: [
      'Instrument three local UberBond workflows without enabling external actions.',
      'Inject timeout, duplicate, malformed-output, provider-failure, and retry scenarios.',
      'Measure recovery, cost, latency, quality, and owner-repair burden.',
      'Create a sanitized reliability report and incident receipt example.',
      'Prepare $150 preflight and $350 pilot hypotheses.',
      'Define the exact boundary between local preparation and customer-authorized change.',
      'Kill or narrow the model if the pilot cannot remain fixed-scope.'
    ],
    taskBlueprint: taskBlueprint({
      id: 'commercial.ai-automation-reliability.preflight',
      purpose: 'Prepare an AI-automation reliability and bounded pilot packet.',
      outputs: ['workflowInventory', 'failureMatrix', 'costQualityPlan', 'boundedPilotPacket'],
      killConditions: ['The workflow requires uncontrolled credentials.', 'The pilot has no deterministic acceptance test.', 'The scope cannot remain bounded.']
    })
  },
  {
    id: 'conversational-funnel-reliability',
    rank: 3,
    name: 'Conversational Funnel Reliability Audit',
    category: 'conversational-funnel-reliability',
    verdict: 'TEST_THIRD',
    buyerSegments: ['Creators', 'Coaches', 'Small businesses using ManyChat, ConvertKit, Zapier, or DM funnels'],
    mechanism: 'Audit conversational states, triggers, tags, handoffs, stale automations, and failed email transitions before a customer loses demand.',
    observedBuyerSignals: [
      { amountUsd: 150, scope: 'ManyChat audit, old-automation cleanup, glitch testing, ConvertKit/Zapier connection, and comment/DM funnel review.', source: source('https://www.upwork.com/freelance-jobs/apply/ManyChat-audit-funnel-setup_~022089636191433587203/', 'ManyChat audit and funnel setup request') }
    ],
    evidence: {
      classification: 'BUYER_SIGNAL',
      observedTraction: 'A fresh $150 audit request showed 15–20 proposals, five interviews, and seven invitations; this indicates demand but also price pressure.',
      sources: [source('https://www.upwork.com/freelance-jobs/apply/ManyChat-audit-funnel-setup_~022089636191433587203/', 'ManyChat audit and funnel setup request')]
    },
    candidate: {
      id: 'conversational-funnel-reliability',
      name: 'Conversational Funnel Reliability Audit',
      category: 'conversational-funnel-reliability',
      timeToCashDays: claim(21, 'ESTIMATE'),
      acquisition: claim('emerging', 'BUYER_SIGNAL'),
      capital: claim('low', 'ESTIMATE'),
      platformDependency: claim('high', 'INFERENCE'),
      partnerLeverage: claim('moderate', 'HYPOTHESIS'),
      automationPotential: claim(80, 'INFERENCE'),
      founderBurden: claim(25, 'ESTIMATE'),
      recurringTrigger: claim('Monthly trigger, tag, handoff, and funnel-health monitoring', 'HYPOTHESIS'),
      failureMode: claim('Platform policy or authenticated access changes break the funnel.', 'INFERENCE')
    },
    priceHypotheses: [
      { label: 'Public funnel preflight', amountUsd: 75, classification: 'HYPOTHESIS' },
      { label: 'Authenticated audit', amountUsd: 150, classification: 'HYPOTHESIS' },
      { label: 'Recurring monitoring', amountUsd: 99, classification: 'HYPOTHESIS' }
    ],
    deliverables: ['Conversation state machine', 'Trigger/tag coverage matrix', 'Dead-branch and stale-automation findings', 'Email/CRM handoff evidence', 'Approved repair plan', 'Monitoring proposal'],
    exclusions: ['Sending DMs or messages', 'Changing automations without written authorization', 'Bypassing platform access controls or scraping private data'],
    constraints: ['Customer-granted ManyChat/CRM access only.', 'Platform terms and messaging permissions govern any future execution.', 'Synthetic fixtures cannot prove live account state.'],
    recurringRoute: 'Monthly conversational-funnel health and handoff monitoring',
    testCost: { lowUsd: 0, highUsd: 20, classification: 'ESTIMATE' },
    firstRevenueWindowDays: { low: 7, high: 21, classification: 'ESTIMATE' },
    competitiveRisk: 'HIGH and price-sensitive; package around reliability evidence and recurring monitoring rather than generic setup.',
    sevenDayExperiment: [
      'Create a deterministic funnel state machine and synthetic webhook fixtures.',
      'Test duplicate triggers, dead branches, stale campaigns, missing tags, and failed email handoffs.',
      'Produce a sample evidence report with no private account access.',
      'Prepare $75 preflight, $150 audit, and $99 monitoring hypotheses.',
      'Define customer-authorized access and no-message boundaries.',
      'Measure report completeness and owner review time.',
      'Kill or narrow the offer if the price cannot support reliable delivery.'
    ],
    taskBlueprint: taskBlueprint({
      id: 'commercial.conversational-funnel-reliability.preflight',
      purpose: 'Prepare a conversational-funnel reliability audit and bounded monitoring packet.',
      outputs: ['funnelStateMachine', 'triggerCoverageMatrix', 'handoffFindings', 'sampleEvidenceReport'],
      killConditions: ['Private or authenticated state is unavailable lawfully.', 'The result would require sending a message.', 'The price hypothesis cannot support bounded delivery.']
    })
  }
];

// The three ranked lanes remain the immediate finalists. The broader thread
// universe is retained as research-only candidates so the system can compare
// them without pretending that every idea is commercially proven.
const CATALOG = [...CORE_CATALOG, ...THREAD_OPPORTUNITY_UNIVERSE];

function validDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

export function listCommercialOpportunityCatalog() {
  return clone(CATALOG).sort((a, b) => a.rank - b.rank);
}

export function getCommercialOpportunity(opportunityId) {
  const entry = CATALOG.find(candidate => candidate.id === String(opportunityId || '').trim());
  return entry ? clone(entry) : null;
}

export function buildOpportunityCandidate(opportunityId, overrides = {}) {
  const entry = getCommercialOpportunity(opportunityId);
  if (!entry) return null;
  return { ...entry.candidate, ...clone(overrides), id: entry.id, name: entry.name, category: entry.category };
}

export function compileCommercialOpportunity({ opportunityId, date = new Date() } = {}) {
  const at = validDate(date);
  const entry = getCommercialOpportunity(opportunityId);
  if (!entry) {
    return {
      ok: false,
      policyVersion: COMMERCIAL_OPPORTUNITY_CATALOG_POLICY_VERSION,
      reason: 'unknown-opportunity-id',
      opportunityId: String(opportunityId || ''),
      timestamp: at.toISOString(),
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  const blueprint = compileTaskBlueprint({ ...entry.taskBlueprint, date: at });
  if (!blueprint?.ok || blueprint.status !== 'COMPILED') {
    return {
      ok: false,
      policyVersion: COMMERCIAL_OPPORTUNITY_CATALOG_POLICY_VERSION,
      reason: 'task-blueprint-compilation-failed',
      opportunityId: entry.id,
      blueprint,
      timestamp: at.toISOString(),
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  const experimentId = `catalog_exp_${digest({ catalog: COMMERCIAL_OPPORTUNITY_CATALOG_POLICY_VERSION, opportunityId: entry.id, timestamp: at.toISOString() }).slice(0, 24)}`;
  return {
    ok: true,
    policyVersion: COMMERCIAL_OPPORTUNITY_CATALOG_POLICY_VERSION,
    status: 'READY_FOR_LOCAL_PREPARATION',
    timestamp: at.toISOString(),
    opportunityId: entry.id,
    rank: entry.rank,
    verdict: entry.verdict,
    name: entry.name,
    category: entry.category,
    buyerSegments: entry.buyerSegments,
    mechanism: entry.mechanism,
    evidence: entry.evidence,
    observedBuyerSignals: entry.observedBuyerSignals,
    candidate: buildOpportunityCandidate(entry.id),
    priceHypotheses: entry.priceHypotheses,
    deliverables: entry.deliverables,
    exclusions: entry.exclusions,
    constraints: entry.constraints,
    recurringRoute: entry.recurringRoute,
    testCost: entry.testCost,
    firstRevenueWindowDays: entry.firstRevenueWindowDays,
    competitiveRisk: entry.competitiveRisk,
    sevenDayExperiment: entry.sevenDayExperiment,
    taskBlueprint: blueprint,
    experiment: {
      experimentId,
      stage: 'PROBE',
      mode: 'LOCAL_PREPARATION_ONLY',
      durationDays: 7,
      primaryMetric: 'CLEARED_PAYMENT',
      secondaryMetrics: ['ACCEPTED_DELIVERY', 'SECOND_PAYMENT_OR_RENEWAL', 'POSITIVE_CONTRIBUTION_MARGIN'],
      promotion: { current: 'DISCOVERED', next: 'EVIDENCED', advanced: false },
      paymentTruth: 'EXTERNAL_PROOF_REQUIRED',
      authorization: {
        externalActions: 'OWNER_REQUIRED',
        providerCalls: 'DISABLED',
        messages: 'DISABLED',
        spend: 'DISABLED',
        deploy: 'DISABLED'
      }
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function compileAllCommercialOpportunities({ date = new Date() } = {}) {
  const at = validDate(date);
  const entries = listCommercialOpportunityCatalog().map(entry => compileCommercialOpportunity({ opportunityId: entry.id, date: at }));
  return {
    ok: entries.every(entry => entry.ok),
    policyVersion: COMMERCIAL_OPPORTUNITY_CATALOG_POLICY_VERSION,
    status: entries.every(entry => entry.ok) ? 'CATALOG_COMPILED' : 'CATALOG_REVIEW_REQUIRED',
    timestamp: at.toISOString(),
    entries,
    catalogCount: entries.length,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export async function logCommercialOpportunityCatalog(store, result) {
  if (!store || typeof store.log !== 'function' || !result?.ok) return null;
  return store.log('commercial_opportunity_catalog', {
    policyVersion: result.policyVersion,
    status: result.status,
    timestamp: result.timestamp,
    catalogCount: result.catalogCount,
    opportunityIds: result.entries.map(entry => entry.opportunityId),
    statuses: result.entries.map(entry => ({ opportunityId: entry.opportunityId, status: entry.status, verdict: entry.verdict })),
    externalEffectLedger: result.externalEffectLedger
  });
}

export const COMMERCIAL_OPPORTUNITY_CATALOG_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
