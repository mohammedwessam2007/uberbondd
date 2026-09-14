import {
  UBEROUTBOUND_GENOME_VERSION,
  compileUberOutboundGenomeDecision,
  compileUberOutboundMessageGenotype
} from '../src/uberoutbound-genome.mjs';
import {
  UBEROUTBOUND_POLICY_REGISTRY_VERSION,
  UBEROUTBOUND_CLAIM_MATRIX,
  UBEROUTBOUND_CONTRADICTION_MAP,
  UBEROUTBOUND_DELIVERABILITY_CONSTITUTION,
  UBEROUTBOUND_EXPERT_RESEARCH_COUNCIL,
  UBEROUTBOUND_INDUSTRY_POLICIES,
  UBEROUTBOUND_LEGAL_MATRIX,
  UBEROUTBOUND_OFFER_TAXONOMY,
  UBEROUTBOUND_RESEARCH_GAPS,
  UBEROUTBOUND_SEGMENT_POLICIES,
  UBEROUTBOUND_TRIGGER_TAXONOMY,
  UBEROUTBOUND_VISIBLE_PRIORITY_HYPOTHESES,
  UBEROUTBOUND_VISIBLE_SOURCE_LEDGER,
  UBEROUTBOUND_VISIBLE_UNKNOWN_UNKNOWNS,
  compileUberOutboundContextPolicy,
  compileUberOutboundMonocultureAudit,
  compileUberOutboundResearchCoverage,
  compileUberOutboundSequenceDecision
} from '../src/uberoutbound-policy-registry.mjs';
import { compileUberReachReadiness, UBERREACH_VERSION } from '../src/uberreach-control-plane.mjs';

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
const expertCount = Object.values(UBEROUTBOUND_EXPERT_RESEARCH_COUNCIL).reduce((sum, rows) => sum + rows.length, 0);
const coverage = compileUberOutboundResearchCoverage();

add('genome-version-v2.2', UBEROUTBOUND_GENOME_VERSION === 'uberbond.uberoutbound-genome.v2.2', UBEROUTBOUND_GENOME_VERSION);
add('policy-registry-v1', UBEROUTBOUND_POLICY_REGISTRY_VERSION === 'uberbond.uberoutbound-policy-registry.v1', UBEROUTBOUND_POLICY_REGISTRY_VERSION);
add('uberreach-v1.4', UBERREACH_VERSION === 'uberbond.uberreach.v1.4', UBERREACH_VERSION);
add('visible-source-ledger-22', UBEROUTBOUND_VISIBLE_SOURCE_LEDGER.length === 22, UBEROUTBOUND_VISIBLE_SOURCE_LEDGER.length);
add('reported-full-source-ledger-26-preserved', coverage.reportVisible.reportedFullSourceLedgerRows === 26, coverage.reportVisible.reportedFullSourceLedgerRows);
add('expert-universe-71', expertCount === 71, expertCount);
add('trigger-taxonomy-8', UBEROUTBOUND_TRIGGER_TAXONOMY.length === 8, UBEROUTBOUND_TRIGGER_TAXONOMY.length);
add('offer-taxonomy-9', UBEROUTBOUND_OFFER_TAXONOMY.length === 9, UBEROUTBOUND_OFFER_TAXONOMY.length);
add('segment-policy-10', UBEROUTBOUND_SEGMENT_POLICIES.length === 10, UBEROUTBOUND_SEGMENT_POLICIES.length);
add('industry-policy-18', UBEROUTBOUND_INDUSTRY_POLICIES.length === 18, UBEROUTBOUND_INDUSTRY_POLICIES.length);
add('claim-matrix-visible-14', UBEROUTBOUND_CLAIM_MATRIX.length === 14, UBEROUTBOUND_CLAIM_MATRIX.length);
add('contradiction-map-5', UBEROUTBOUND_CONTRADICTION_MAP.length === 5, UBEROUTBOUND_CONTRADICTION_MAP.length);
add('deliverability-constitution-8', UBEROUTBOUND_DELIVERABILITY_CONSTITUTION.length === 8, UBEROUTBOUND_DELIVERABILITY_CONSTITUTION.length);
add('legal-matrix-9', UBEROUTBOUND_LEGAL_MATRIX.length === 9, UBEROUTBOUND_LEGAL_MATRIX.length);
add('visible-priority-hypotheses-15', UBEROUTBOUND_VISIBLE_PRIORITY_HYPOTHESES.length === 15, UBEROUTBOUND_VISIBLE_PRIORITY_HYPOTHESES.length);
add('reported-full-hypotheses-100-preserved', coverage.reportVisible.reportedFullHypotheses === 100, coverage.reportVisible.reportedFullHypotheses);
add('visible-unknown-unknowns-22', UBEROUTBOUND_VISIBLE_UNKNOWN_UNKNOWNS.length === 22, UBEROUTBOUND_VISIBLE_UNKNOWN_UNKNOWNS.length);
add('reported-full-unknowns-50-preserved', coverage.reportVisible.reportedFullUnknownUnknowns === 50, coverage.reportVisible.reportedFullUnknownUnknowns);
add('research-gaps-10', UBEROUTBOUND_RESEARCH_GAPS.length === 10, UBEROUTBOUND_RESEARCH_GAPS.length);
add('missing-downloads-not-fabricated', coverage.externalResearchAssetsPending.length >= 9 && coverage.state === 'REPORT_VISIBLE_CORPUS_COMPLETE_EXTERNAL_DOWNLOADS_PENDING', coverage.externalResearchAssetsPending.length);

const context = compileUberOutboundContextPolicy({ seniority: 'CFO', department: 'Finance', industry: 'SaaS', intentState: 'COLD' });
add('context-policy-conditional', context.seniorityKey === 'C_SUITE' && context.departmentKey === 'FINANCE' && context.industryKey === 'SAAS', `${context.seniorityKey}/${context.departmentKey}/${context.industryKey}`);
add('context-zero-authority', context.externalEffectAuthority === 'NONE' && context.businessEffectAuthority === 'NONE', `${context.externalEffectAuthority}/${context.businessEffectAuthority}`);

const suppressedSequence = compileUberOutboundSequenceDecision({ unsubscribed: true, freshTrigger: true, qualifiedReply: true });
add('sequence-suppression-precedence', suppressedSequence.action === 'IMMEDIATE_GLOBAL_SUPPRESSION', suppressedSequence.action);
const reputationSequence = compileUberOutboundSequenceDecision({ reputationDeterioration: true, qualifiedReply: true });
add('sequence-reputation-precedence', reputationSequence.action === 'REDUCE_OR_FREEZE_AFFECTED_SENDER_PATH', reputationSequence.action);

const prospect = {
  accountId: 'completion-doctor-account',
  industry: 'SaaS',
  department: 'Finance',
  seniority: 'CFO',
  safeForOutreach: true,
  verificationStatus: 'VERIFIED',
  suppressed: false,
  unsubscribed: false,
  problemEvidenceScore: 0.9,
  roleOwnershipScore: 0.9,
  accountValueScore: 0.8,
  contactabilityScore: 0.95,
  trigger: { type: 'EXPLICIT_PRIORITY', confidence: 0.9, freshness: 0.9, problemLinked: true }
};
const candidate = {
  candidateId: 'completion-doctor-candidate',
  wordCount: 80,
  sentenceCount: 4,
  subjectWordCount: 3,
  subject: 'margin benchmark',
  body: 'Synthetic completion doctor fixture only.',
  subjectArchitecture: 'PRIORITY',
  openingArchitecture: 'TRIGGER_PROBLEM',
  problemArchitecture: 'COST_OF_INACTION',
  offerType: 'BENCHMARK',
  ctaType: 'OFFER',
  tone: 'PLAIN',
  personalizationClass: 'COMPANY',
  problemAltitude: 'STRATEGIC',
  problemBeforeProduct: true,
  relevantProof: true,
  triggerMentioned: true,
  sequencePosition: 1,
  modelId: 'fixture-model',
  modelVersion: 'fixture-v1',
  promptOrPolicyVersion: 'fixture-policy-v1',
  researchDepth: 'DEEP',
  sourceCount: 4,
  sourceFreshness: 1,
  factCheckStatus: 'PASSED'
};
const genotype = compileUberOutboundMessageGenotype(candidate, prospect);
add('content-addressed-genotype', /^ubog_[a-f0-9]{64}$/.test(genotype.genotypeId), genotype.genotypeId);

const decision = compileUberOutboundGenomeDecision({
  prospect,
  sender: { senderId: 'fixture-sender', status: 'GREEN', authenticationReady: true, providerBudgetAvailable: true },
  authorization: { outreachAuthorized: true },
  legalDecision: { status: 'PASSED', jurisdiction: 'US', basis: 'SYNTHETIC_FIXTURE_ONLY', policyVersion: 'fixture-v1', evidenceId: 'fixture-legal-1', recipientType: 'CORPORATE' },
  messageCandidates: [candidate],
  experiment: { experimentId: 'fixture-exp', primaryMetric: 'QUALIFIED_POSITIVE_REPLY', treatmentDimension: 'CTA', causalQuestion: 'Synthetic fixture only', arms: ['OFFER', 'MEETING'] },
  policy: { policyVersion: 'fixture-outbound-v1' }
});
add('decision-ready-but-zero-authority', decision.state === 'READY_FOR_GOVERNED_SEND_REVIEW' && decision.externalEffectAuthority === 'NONE' && decision.messagesSent === 0, `${decision.state}/${decision.externalEffectAuthority}/${decision.messagesSent}`);

const monoculture = compileUberOutboundMonocultureAudit({
  genotypes: Array.from({ length: 8 }, (_, index) => ({ ...genotype, genotypeId: `${genotype.genotypeId}-${index}` })),
  policy: { minStructuralDiversityRatio: 0.25 }
});
add('monoculture-observability', monoculture.state === 'MONOCULTURE_RISK_CANDIDATE' && monoculture.evidenceState === 'SPECULATIVE', `${monoculture.state}/${monoculture.structuralDiversityRatio}`);

const mailboxes = [{ mailboxId: 'mbx-1', address: 'fixture@uberbond.cloud', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false, currentDailyCap: 10 }];
const mailboxObservations = { 'mbx-1': { warmupDays: 21, observedDeliveries: 100, complaintRate: 0, hardBounceRate: 0.01, inboxPlacementRate: 0.95, providerDailyCap: 40 } };
const contacts = [{
  email: 'fixture@example.com',
  sourceEvidence: [{ value: 'fixture@example.com', sourceType: 'public_website', sourceUrl: 'https://example.com', evidenceClass: 'DIRECT_PUBLIC', confidence: 0.95, exact: true, inferred: false, observedAt: '2026-09-14T18:00:00.000Z' }],
  verifications: [{ route: 'fixture@example.com', state: 'VALID', provider: 'fixture', evidenceClass: 'LICENSED_PROVIDER', checkedAt: '2026-09-14T18:00:00.000Z', confidence: 0.95 }]
}];
const reach = compileUberReachReadiness({
  mailboxes,
  mailboxObservations,
  contacts,
  genomeInputs: {
    prospect,
    sender: { status: 'GREEN', authenticationReady: true, providerBudgetAvailable: true },
    authorization: { outreachAuthorized: true },
    legalDecision: { status: 'PASSED', jurisdiction: 'US', basis: 'SYNTHETIC_FIXTURE_ONLY', policyVersion: 'fixture-v1', evidenceId: 'fixture-legal-2' },
    messageCandidates: [candidate],
    experiment: { experimentId: 'fixture-exp-2', primaryMetric: 'QUALIFIED_POSITIVE_REPLY', arms: ['A', 'B'] },
    sequenceInputs: { qualifiedReply: true },
    enforce: true
  },
  now: new Date('2026-09-14T18:00:00Z')
});
add('uberreach-sequence-exit-boundary', reach.state === 'PREPARATION_BLOCKED' && reach.blockers.includes('outbound-sequence-exits-cold-send-path'), `${reach.state}:${reach.blockers.join(',')}`);
add('uberreach-zero-effects', reach.messagesSent === 0 && reach.providerCalls === 0 && reach.externalEffectAuthority === 'NONE', `${reach.messagesSent}/${reach.providerCalls}/${reach.externalEffectAuthority}`);

const failed = checks.filter(check => !check.ok);
const report = {
  doctor: 'uberoutbound-genome-completion',
  state: failed.length ? 'NOT_READY' : 'READY_INTERNAL_REPORT_VISIBLE_V1_EXTERNAL_RESEARCH_PACK_PENDING',
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  coverage,
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  truthBoundary: 'READY_INTERNAL_REPORT_VISIBLE_V1_EXTERNAL_RESEARCH_PACK_PENDING means the complete policy material visible in the founder-supplied report is represented across executable genome, policy registry, causal lineage, sequence controls, legal/provider gates, research coverage and UberReach integration. It does not mean the separately referenced downloads were present, that 100k/day is live or optimal, that any copy treatment has causal proof, or that any real recipient is legally eligible or authorized for contact.'
};

console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
