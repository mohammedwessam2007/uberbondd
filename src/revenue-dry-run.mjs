// Deterministic revenue dry run: fixture-only, pure and zero-effect.
//
// One simulated lead is walked through the commercial stages in order, and each
// stage records the checks it made. The run answers one question: does the
// existing chain refuse to turn a simulation into cash, acceptance or contact?
//
// Pure by construction. There is no store parameter, no file or network I/O and
// no provider call. Stages reuse existing pure modules where those exist:
// revenue-decision-desk (qualification scoring), offer-compiler (offer packet),
// reply-radar (deterministic reply classification), proposal-acceptance-engine
// (outcome eligibility), payments (classifier), payment-renewal-truth
// (reconciler) and commercial-outcome (paymentProof). The approval rule has no
// pure reusable gate, so it is a fixture-only rule.
//
// A dry-run result is a rehearsal. It is never a receipt of cash, acceptance,
// or customer contact, and no stage may report a cleared or proven state.

import { evaluateRevenueCandidate } from './revenue-decision-desk.mjs';
import { compileOfferPacket } from './offer-compiler.mjs';
import { compileReplyRadar } from './reply-radar.mjs';
import { summarizeProposalOutcome } from './proposal-acceptance-engine.mjs';
import { classifyPaymentEvent } from './payments.mjs';
import {
  reconcilePaymentRenewalTruth,
  isTestModeWitness,
  TEST_MODE_WITNESS_REFUSED
} from './payment-renewal-truth.mjs';
import { normalizeCommercialOutcome } from './commercial-outcome.mjs';

export const REVENUE_DRY_RUN_VERSION = 'uberbond.revenue-dry-run.v1';
export const SIMULATED_FIXTURE_PROVENANCE = 'SIMULATED_FIXTURE';
export const REVENUE_DRY_RUN_VERDICTS = Object.freeze({
  PASSED: 'DRY_RUN_PASSED',
  FAILED: 'DRY_RUN_INVARIANT_FAILED'
});
export const REVENUE_DRY_RUN_STAGES = Object.freeze([
  'evidence',
  'qualified-opportunity',
  'offer-draft',
  'approved-unsent-campaign',
  'simulated-reply',
  'simulated-acceptance',
  'simulated-payment',
  'reconciliation'
]);

const DEFAULT_FIXTURE_NOW = '2026-10-13T00:00:00.000Z';
const CLEARED_CLASSIFICATIONS = new Set(['CLEARED_ONE_TIME_PAYMENT', 'CLEARED_SUBSCRIPTION_PAYMENT']);
const PERMITTED_EVIDENCE_KIND = 'permitted-public-source';
const APPROVAL_REF = /^approval:[A-Za-z0-9._:-]{3,120}$/;

function referenceDate(value) {
  const parsed = new Date(value ?? DEFAULT_FIXTURE_NOW);
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_FIXTURE_NOW) : parsed;
}

function objectOr(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function provenanceOk(section) {
  return section?.provenance === SIMULATED_FIXTURE_PROVENANCE;
}

function parseUrl(value) {
  try {
    return new URL(String(value ?? ''));
  } catch {
    return null;
  }
}

// A ledger value that is not a number is not evidence of zero, so it counts as one effect.
function effectUnits(ledger) {
  if (!ledger || typeof ledger !== 'object') return 0;
  return Object.values(ledger).reduce((sum, value) => {
    const number = Number(value);
    return sum + (Number.isFinite(number) ? Math.abs(number) : 1);
  }, 0);
}

// Every check is a named invariant. A check that is false is reported by name,
// so a failing run says exactly which rule it broke.
function stageResult(stage, {
  provenance = null,
  checks,
  facts = {},
  clearedCents = 0,
  proofStatus = 'NOT_PROVEN',
  externalEffects = 0
}) {
  const results = {};
  for (const [name, passed] of Object.entries(checks)) results[name] = passed === true;
  const failedChecks = Object.keys(results).filter(name => !results[name]);
  return {
    stage,
    label: 'SIMULATED',
    provenance,
    status: failedChecks.length ? 'SIMULATED_FAILED' : 'SIMULATED_PASSED',
    proofStatus,
    clearedCents,
    externalEffects,
    checks: results,
    failedChecks,
    facts
  };
}

function evidenceStage(section) {
  const url = parseUrl(section.url);
  const host = url?.hostname ?? null;
  const reservedHost = Boolean(host) && /\.invalid$/i.test(host);
  return stageResult('evidence', {
    provenance: section.provenance ?? null,
    checks: {
      'simulated-record-missing-provenance': provenanceOk(section),
      'evidence-kind-permitted-public-source': section.kind === PERMITTED_EVIDENCE_KIND,
      'evidence-url-reserved-invalid-host': url?.protocol === 'https:' && reservedHost
    },
    facts: {
      kind: section.kind ?? null,
      // Only a reserved host is echoed. Any other host is reported as not reserved, never named.
      host: reservedHost ? host : 'NOT_RESERVED',
      evidenceRef: section.evidenceRef ?? null
    }
  });
}

function opportunityStage(section, { evidenceRef }) {
  const candidate = objectOr(section.candidate);
  const decision = evaluateRevenueCandidate(candidate, { archive: [] });
  return stageResult('qualified-opportunity', {
    provenance: section.provenance ?? null,
    checks: {
      'simulated-record-missing-provenance': provenanceOk(section),
      'opportunity-scored-green-light': decision.verdict === 'GREEN_LIGHT',
      'lineage-evidence-ref-linked': Boolean(evidenceRef)
        && Array.isArray(candidate.evidenceRefs)
        && candidate.evidenceRefs.includes(evidenceRef)
    },
    facts: {
      candidateId: decision.candidateId,
      verdict: decision.verdict,
      reasons: decision.reasons,
      scoringRule: 'revenue-decision-desk.evaluateRevenueCandidate',
      estimateOnly: true,
      consequenceAuthority: 'NONE'
    }
  });
}

function offerStage(section, { campaign, at }) {
  const offer = compileOfferPacket({
    prospect: section.prospect,
    campaign,
    cfg: objectOr(section.cfg),
    product: section.product || 'full',
    date: at
  });
  const priceUsd = offer.price?.amountUsd ?? null;
  const deliverables = Array.isArray(offer.deliverables) ? offer.deliverables : [];
  const exclusions = Array.isArray(offer.exclusions) ? offer.exclusions : [];
  return stageResult('offer-draft', {
    provenance: section.provenance ?? null,
    checks: {
      'simulated-record-missing-provenance': provenanceOk(section),
      'offer-packet-compiled': offer.ok === true,
      'offer-price-configured': offer.price?.status === 'CONFIGURED' && Number(priceUsd) > 0,
      'offer-scope-declared': deliverables.length > 0 && exclusions.length > 0
    },
    facts: {
      product: offer.product ?? null,
      priceUsd,
      deliverableCount: deliverables.length,
      exclusionCount: exclusions.length,
      readyToOffer: offer.readyToOffer === true,
      scoringRule: 'offer-compiler.compileOfferPacket',
      consequenceAuthority: 'NONE'
    }
  });
}

// Fixture-only approval rule. outreach-governance verifies a signed envelope that
// needs an HMAC secret, and its import graph was not audited as pure, so its
// decision rule is reproduced here instead of reused. This rule never sends.
function campaignStage(section, { opportunityId }) {
  return stageResult('approved-unsent-campaign', {
    provenance: section.provenance ?? null,
    checks: {
      'simulated-record-missing-provenance': provenanceOk(section),
      'campaign-approved': section.approved === true,
      'campaign-sent-flag-explicit-false': section.sent === false,
      'approved-campaign-marked-sent': section.sent !== true,
      'approval-ref-present': APPROVAL_REF.test(String(section.approvalRef ?? '')),
      'lineage-opportunity-id-linked': Boolean(opportunityId) && section.opportunityId === opportunityId
    },
    facts: {
      approved: section.approved === true,
      sent: section.sent === true,
      approvalRefPresent: APPROVAL_REF.test(String(section.approvalRef ?? '')),
      approvalRule: 'fixture-only (outreach-governance not reused)',
      consequenceAuthority: 'NONE'
    }
  });
}

function replyStage(section, { prospectId, at }) {
  const reply = section.reply && typeof section.reply === 'object' ? section.reply : null;
  const radar = compileReplyRadar({ replies: reply ? [reply] : [], now: at.getTime() });
  const item = radar.items[0] ?? null;
  const body = typeof reply?.body === 'string' ? reply.body.trim() : '';
  return stageResult('simulated-reply', {
    provenance: section.provenance ?? null,
    checks: {
      'simulated-record-missing-provenance': provenanceOk(section),
      'reply-fixture-has-body': body.length > 0,
      'lineage-prospect-linked': Boolean(prospectId) && reply?.prospectId === prospectId,
      'reply-human-stops-prospect-automation': radar.counts.halted === 1
        && item?.automation === 'STOP_ALL_PROSPECT_AUTOMATION',
      'reply-authority-manual-only': item?.authority === 'MANUAL_MOHAMED' && item?.autoReplyAllowed === false,
      'reply-no-outbound-authority': radar.outboundAuthority === 'NONE'
    },
    facts: {
      label: item?.label ?? null,
      material: Boolean(item),
      automation: item?.automation ?? null,
      injectionFlagCount: item?.injectionFlags?.length ?? 0,
      classifier: 'uberreply-taxonomy.classifyUberReply (deterministic, no model call)',
      consequenceAuthority: 'NONE'
    },
    externalEffects: effectUnits(radar.externalEffectLedger)
  });
}

function acceptanceStage(section) {
  const outcome = summarizeProposalOutcome({
    status: section.status,
    sentAt: section.sentAt,
    decidedAt: section.decidedAt,
    founderMinutes: section.founderMinutes ?? 0,
    revenueCleared: section.revenueCleared ?? 0,
    currency: section.currency ?? null,
    paymentEvidence: section.paymentEvidence ?? null
  });
  return stageResult('simulated-acceptance', {
    provenance: section.provenance ?? null,
    checks: {
      'simulated-record-missing-provenance': provenanceOk(section),
      'acceptance-outcome-valid': outcome.ok === true,
      'acceptance-not-commercial-truth': outcome.commercialTruthEligible !== true
    },
    facts: {
      simulated: true,
      status: outcome.status ?? null,
      commercialTruthEligible: outcome.commercialTruthEligible === true,
      eligibilityBlockers: outcome.eligibilityBlockers ?? [],
      commercialTruthBoundary: outcome.commercialTruthBoundary ?? null
    }
  });
}

// Witness rows as RevenueEngine would write them. The order and audit rows carry
// the test markers; the revenue row deliberately does not, so the refusal must
// come from the witness rows and not from a marker on the revenue row.
function witnessRowsFor({ event, lead, decision, at }) {
  if (decision.shouldRecordRevenue !== true || !CLEARED_CLASSIFICATIONS.has(decision.classification)) return {};
  const eventName = String(event.eventName ?? '');
  const eventId = String(event.eventId ?? '');
  const providerEventId = `${eventName}:${eventId}`;
  const amountCents = Number(event.amountCents);
  const currency = String(event.currency ?? '').toUpperCase();
  const product = event.custom?.product ?? null;
  const markers = { testMode: event.testMode, environment: event.environment };
  return {
    order: {
      provider: 'lemonsqueezy', providerEventId: eventId, eventName, status: 'paid',
      leadId: lead.id, prospectId: lead.prospectId ?? null, product, amountCents, currency,
      createdAt: at.toISOString(), ...markers
    },
    audit: {
      type: 'payment_classification', classification: decision.classification, eventName, eventId,
      leadId: lead.id, prospectId: lead.prospectId ?? null, product, amountCents, currency,
      policyVersion: decision.policyVersion, timestamp: at.toISOString(), ...markers
    },
    revenue: {
      providerEventId, kind: 'sale', leadId: lead.id, prospectId: lead.prospectId ?? null,
      product, amountCents, currency, createdAt: at.toISOString()
    }
  };
}

function paymentStage(section, { opportunityId, at }) {
  const event = objectOr(section.event);
  const lead = objectOr(section.lead);
  const provenance = section.provenance ?? null;
  const provenanceCheck = provenanceOk(section);

  // A fixture that claims a live environment is refused before any witness row exists.
  if (!isTestModeWitness(event)) {
    return stageResult('simulated-payment', {
      provenance,
      checks: {
        'simulated-record-missing-provenance': provenanceCheck,
        'payment-fixture-is-simulated': false
      },
      facts: { refusedBeforeReconciliation: true, refusalReason: 'LIVE_ENVIRONMENT_CLAIM_IN_SIMULATION' },
      proofStatus: 'NOT_PROVEN',
      clearedCents: 0
    });
  }

  const cfgRevenue = objectOr(objectOr(section.cfg).revenue);
  const decisionDefault = classifyPaymentEvent({
    event, lead, cfg: { revenue: { ...cfgRevenue, allowTestUnlock: false } }
  });
  // The test-unlock path (allowTestUnlock on) is exercised deliberately so the
  // reconciler is shown to refuse the witnesses that path would produce.
  const decisionUnlocked = classifyPaymentEvent({
    event, lead, cfg: { revenue: { ...cfgRevenue, allowTestUnlock: true } }
  });
  const rows = witnessRowsFor({ event, lead, decision: decisionUnlocked, at });
  const reconciled = reconcilePaymentRenewalTruth({
    lead,
    leadId: lead.id ?? null,
    leadResolved: Boolean(lead.id),
    orders: rows.order ? [rows.order] : [],
    revenueEvents: rows.revenue ? [rows.revenue] : [],
    auditLog: rows.audit ? [rows.audit] : [],
    fulfillment: null
  });
  const outcome = normalizeCommercialOutcome({
    outcome: {
      eventId: event.eventId,
      outcomeType: 'PAYMENT_CLEARED',
      opportunityId,
      providerEventId: event.eventId,
      amountCents: event.amountCents,
      currency: event.currency,
      testMode: event.testMode,
      environment: event.environment
    },
    paymentDecision: decisionUnlocked,
    date: at
  });
  const clearedCents = reconciled.economics.providerClearedRevenueCents;
  return stageResult('simulated-payment', {
    provenance,
    checks: {
      'simulated-record-missing-provenance': provenanceCheck,
      'payment-fixture-is-simulated': true,
      'payment-fixture-event-id-present': String(event.eventId ?? '').trim().length > 0,
      'payment-default-classifier-not-cleared': !CLEARED_CLASSIFICATIONS.has(decisionDefault.classification),
      'payment-reconciler-refuses-test-witness': reconciled.stages.CLEARED_PAYMENT.status === 'NOT_PROVEN'
        && clearedCents === 0
        && reconciled.verifiedProviderEventRefs.length === 0,
      'payment-commercial-outcome-refuses-test-witness': outcome.ok === false
        && Array.isArray(outcome.reasonCodes)
        && outcome.reasonCodes.includes(TEST_MODE_WITNESS_REFUSED)
    },
    facts: {
      defaultClassification: decisionDefault.classification,
      unlockedClassification: decisionUnlocked.classification,
      reconcilerStatus: reconciled.status,
      refusalReason: reconciled.stages.CLEARED_PAYMENT.reason ?? null,
      refusedTestModeEventCount: Array.isArray(reconciled.refusedTestModeEventRefs)
        ? reconciled.refusedTestModeEventRefs.length
        : null,
      commercialOutcomeReasonCodes: outcome.reasonCodes ?? []
    },
    proofStatus: reconciled.stages.CLEARED_PAYMENT.status,
    clearedCents,
    externalEffects: effectUnits(reconciled.externalEffectLedger) + effectUnits(outcome.externalEffectLedger)
  });
}

function reconciliationStage(stages) {
  const clearedCashCents = stages.reduce((sum, item) => sum + (item.clearedCents || 0), 0);
  const externalEffectCount = stages.reduce((sum, item) => sum + (item.externalEffects || 0), 0);
  const claimingCleared = stages
    .filter(item => item.proofStatus === 'PROVEN' || item.status === 'CLEARED' || item.status === 'PROVEN')
    .map(item => item.stage);
  return stageResult('reconciliation', {
    provenance: SIMULATED_FIXTURE_PROVENANCE,
    checks: {
      'stage-claimed-cleared-or-proven': claimingCleared.length === 0,
      'cleared-cash-is-zero': clearedCashCents === 0,
      'external-effects-are-zero': externalEffectCount === 0
    },
    facts: {
      clearedCashCents,
      externalEffectCount,
      storeWriteCount: 0,
      stagesClaimingCleared: claimingCleared
    }
  });
}

// Pure. Takes caller-supplied fixtures only. Every section must carry
// provenance 'SIMULATED_FIXTURE', or the run fails the provenance invariant.
export function runRevenueDryRun({ fixtures = {}, now = DEFAULT_FIXTURE_NOW } = {}) {
  const at = referenceDate(now);
  const input = objectOr(fixtures);
  const candidate = objectOr(objectOr(input.opportunity).candidate);
  const opportunityId = String(candidate.id ?? '').trim() || null;
  const evidenceRef = String(objectOr(input.evidence).evidenceRef ?? '').trim() || null;
  const prospectId = String(objectOr(objectOr(input.offer).prospect).id ?? '').trim() || null;
  const campaign = objectOr(input.campaign);

  const core = [
    evidenceStage(objectOr(input.evidence)),
    opportunityStage(objectOr(input.opportunity), { evidenceRef }),
    offerStage(objectOr(input.offer), { campaign, at }),
    campaignStage(campaign, { opportunityId }),
    replyStage(objectOr(input.reply), { prospectId, at }),
    acceptanceStage(objectOr(input.acceptance)),
    paymentStage(objectOr(input.payment), { opportunityId, at })
  ];
  const stages = [...core, reconciliationStage(core)];
  const failingInvariants = [...new Set(stages.flatMap(item => item.failedChecks))];
  const clearedCashCents = core.reduce((sum, item) => sum + (item.clearedCents || 0), 0);
  const externalEffectCount = core.reduce((sum, item) => sum + (item.externalEffects || 0), 0);

  return {
    version: REVENUE_DRY_RUN_VERSION,
    label: 'SIMULATED',
    provenance: SIMULATED_FIXTURE_PROVENANCE,
    verdict: failingInvariants.length === 0
      ? REVENUE_DRY_RUN_VERDICTS.PASSED
      : REVENUE_DRY_RUN_VERDICTS.FAILED,
    failingInvariants,
    clearedCashCents,
    externalEffectCount,
    storeWriteCount: 0,
    businessEffectAuthority: 'NONE',
    claimBoundary: 'REHEARSAL_ONLY__NOT_CASH__NOT_ACCEPTANCE__NOT_CONTACT__NOT_PROOF',
    stages
  };
}

// The canonical fixture set. Every section is marked SIMULATED_FIXTURE and uses
// reserved names only (.invalid hosts, reserved sample identifiers).
export function buildSimulatedRevenueFixtures({ now = DEFAULT_FIXTURE_NOW } = {}) {
  const at = referenceDate(now).toISOString();
  const provenance = SIMULATED_FIXTURE_PROVENANCE;
  const opportunityId = 'opp_fixture_0001';
  const prospectId = 'prospect_fixture_0001';
  const leadId = 'lead_fixture_0001';
  const evidenceRef = 'evidence:fixture-permitted-public-source-0001';
  const evidenceUrl = 'https://evidence.invalid/fixture/public-page';
  return {
    evidence: {
      provenance, kind: PERMITTED_EVIDENCE_KIND, url: evidenceUrl, evidenceRef, capturedAt: at
    },
    opportunity: {
      provenance,
      candidate: {
        id: opportunityId,
        fingerprint: 'fp_fixture_0001',
        evidenceRefs: [evidenceRef],
        evidenceRevision: 1,
        evidenceQuality: 0.7,
        // Scoring authority only. This module holds no consequence authority.
        authority: 'authorized',
        stopConditions: ['stop-on-human-reply', 'stop-if-evidence-superseded'],
        expectedClearedContribution: 900,
        probability: 0.3,
        downside: 50,
        founderMinutes: 60,
        reversibility: 0.9
      }
    },
    offer: {
      provenance,
      product: 'full',
      prospect: {
        id: prospectId,
        company: 'Fixture Agency Co',
        website: 'https://fixture-company.invalid',
        contactName: 'Fixture Contact',
        country: 'XX',
        issue: {
          title: 'Fixture missing booking confirmation',
          category: 'lead-leak',
          severity: 3,
          evidenceUrl,
          evidenceExcerpt: 'Fixture excerpt from a permitted public page',
          confidence: 0.8,
          safeForOutreach: true
        },
        score: { total: 72, tier: 'A' }
      },
      cfg: { revenue: { fullAuditPrice: 450, fullAuditCheckoutUrl: 'https://checkout.invalid/fixture-full' } }
    },
    campaign: {
      provenance,
      id: 'campaign_fixture_0001',
      opportunityId,
      approved: true,
      sent: false,
      approvalRef: 'approval:fixture-unsent-0001'
    },
    reply: {
      provenance,
      reply: {
        id: 'reply_fixture_0001',
        prospectId,
        body: 'Yes, interested. Let us talk next week.',
        receivedAt: at
      }
    },
    acceptance: {
      provenance,
      status: 'WON',
      sentAt: '2026-10-01T00:00:00.000Z',
      decidedAt: '2026-10-05T00:00:00.000Z',
      founderMinutes: 0,
      revenueCleared: 0,
      currency: 'USD',
      paymentEvidence: null
    },
    payment: {
      provenance,
      lead: { id: leadId, prospectId, paymentStatus: 'open' },
      cfg: { revenue: { fullAuditPrice: 450 } },
      event: {
        eventName: 'order_created',
        eventId: 'evt_sandbox_fixture_0001',
        custom: { lead_id: leadId, prospect_id: prospectId, product: 'full' },
        amountCents: 45000,
        currency: 'USD',
        status: 'paid',
        testMode: true,
        environment: 'sandbox',
        createdAt: at
      }
    }
  };
}
