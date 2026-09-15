import {
  UBEROUTBOUND_GENOME_VERSION,
  compileUberOutboundGenomeDecision,
  compileUberOutboundMessageGenotype,
  compileUberOutboundRenderedMessageReceipt
} from '../src/uberoutbound-genome.mjs';
import {
  UBEROUTBOUND_POLICY_REGISTRY_VERSION,
  compileUberOutboundContextPolicy,
  compileUberOutboundResearchCoverage,
  compileUberOutboundSequenceDecision
} from '../src/uberoutbound-policy-registry.mjs';
import {
  UBEROUTBOUND_RESEARCH_IMPORT_VERSION,
  compileUberOutboundResearchImport,
  reconcileUberOutboundResearchAssets
} from '../src/uberoutbound-research-import.mjs';
import {
  UBEROUTBOUND_PROMOTION_GATE_VERSION,
  compileUberOutboundPromotionDecision,
  compileUberOutboundDegradationDecision
} from '../src/uberoutbound-promotion-gate.mjs';
import { UBERREACH_VERSION, compileUberReachReadiness } from '../src/uberreach-control-plane.mjs';

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });

add('genome-version', UBEROUTBOUND_GENOME_VERSION === 'uberbond.uberoutbound-genome.v2.2', UBEROUTBOUND_GENOME_VERSION);
add('policy-registry-version', UBEROUTBOUND_POLICY_REGISTRY_VERSION === 'uberbond.uberoutbound-policy-registry.v1', UBEROUTBOUND_POLICY_REGISTRY_VERSION);
add('research-import-version', UBEROUTBOUND_RESEARCH_IMPORT_VERSION === 'uberbond.uberoutbound-research-import.v1', UBEROUTBOUND_RESEARCH_IMPORT_VERSION);
add('promotion-gate-version', UBEROUTBOUND_PROMOTION_GATE_VERSION === 'uberbond.uberoutbound-promotion-gate.v1', UBEROUTBOUND_PROMOTION_GATE_VERSION);
add('uberreach-version', UBERREACH_VERSION === 'uberbond.uberreach.v1.4', UBERREACH_VERSION);

const coverage = compileUberOutboundResearchCoverage();
add('report-visible-coverage-state', coverage.state === 'REPORT_VISIBLE_CORPUS_COMPLETE_EXTERNAL_DOWNLOADS_PENDING', coverage.state);
add('full-source-ledger-count-preserved', coverage.reportVisible.reportedFullSourceLedgerRows === 26, coverage.reportVisible.reportedFullSourceLedgerRows);
add('expert-universe-count-preserved', coverage.reportVisible.expertResearchUniverseRows === 71, coverage.reportVisible.expertResearchUniverseRows);
add('full-hypothesis-count-preserved', coverage.reportVisible.reportedFullHypotheses === 100, coverage.reportVisible.reportedFullHypotheses);
add('full-unknown-count-preserved', coverage.reportVisible.reportedFullUnknownUnknowns === 50, coverage.reportVisible.reportedFullUnknownUnknowns);
add('missing-downloads-explicit', coverage.externalResearchAssetsPending.length === 9, coverage.externalResearchAssetsPending.length);

const validImport = compileUberOutboundResearchImport({
  assetType: 'SOURCE_LEDGER',
  assetId: 'final-doctor-source-ledger-fixture',
  sourceArtifactName: 'source-ledger-fixture.csv',
  researchCutoff: '2026-09-14',
  expectedRowCount: 1,
  provenance: {
    origin: 'SYNTHETIC_FINAL_DOCTOR_FIXTURE',
    receiptId: 'final-doctor-import-1',
    sourceDigest: 'sha256:fixture'
  },
  rows: [{
    id: 'fixture-source',
    title: 'Fixture source',
    sourceUrl: 'https://example.com/source',
    sourceDate: '2026-09-14',
    finding: 'Synthetic fixture only',
    evidenceState: 'PROBABLE'
  }],
  now: new Date('2026-09-14T18:00:00Z')
});
add('research-import-accepted-for-review-only', validImport.state === 'RESEARCH_ASSET_ACCEPTED_FOR_REVIEW' && validImport.promotionState === 'RESEARCH_ASSET_ONLY', `${validImport.state}/${validImport.promotionState}`);
add('research-import-no-auto-promotion', validImport.policyPromotionAuthorized === false && validImport.experimentPromotionAuthorized === false, `${validImport.policyPromotionAuthorized}/${validImport.experimentPromotionAuthorized}`);
add('research-import-zero-authority', validImport.externalEffectAuthority === 'NONE' && validImport.businessEffectAuthority === 'NONE', `${validImport.externalEffectAuthority}/${validImport.businessEffectAuthority}`);

const truncatedPack = compileUberOutboundResearchImport({
  assetType: 'HYPOTHESES',
  assetId: 'final-doctor-top-100-fixture',
  sourceArtifactName: 'top-100-fixture.csv',
  expectedRowCount: 100,
  provenance: { origin: 'SYNTHETIC_FINAL_DOCTOR_FIXTURE', receiptId: 'final-doctor-import-2' },
  rows: [{ id: 'h1', hypothesis: 'Synthetic fixture only' }]
});
add('research-pack-row-count-fails-closed', truncatedPack.state === 'RESEARCH_IMPORT_REJECTED' && truncatedPack.reasonCodes.includes('expected-row-count-mismatch'), `${truncatedPack.state}:${truncatedPack.reasonCodes.join(',')}`);

const conflictingA = compileUberOutboundResearchImport({
  assetType: 'CLAIM_MATRIX',
  assetId: 'final-doctor-claims-a',
  sourceArtifactName: 'claims-a.csv',
  provenance: { origin: 'SYNTHETIC_FINAL_DOCTOR_FIXTURE', receiptId: 'final-doctor-import-a' },
  rows: [{ id: 'claim-1', title: 'Fixture claim', claim: 'Treatment helps', sourceUrl: 'https://example.com/a', sourceDate: '2026-09-14', evidenceState: 'PROBABLE' }]
});
const conflictingB = compileUberOutboundResearchImport({
  assetType: 'CLAIM_MATRIX',
  assetId: 'final-doctor-claims-b',
  sourceArtifactName: 'claims-b.csv',
  provenance: { origin: 'SYNTHETIC_FINAL_DOCTOR_FIXTURE', receiptId: 'final-doctor-import-b' },
  rows: [{ id: 'claim-1', title: 'Fixture claim', claim: 'Treatment does not help', sourceUrl: 'https://example.com/b', sourceDate: '2026-09-14', evidenceState: 'UNKNOWN' }]
});
const reconciliation = reconcileUberOutboundResearchAssets([conflictingA, conflictingB]);
add('research-contradictions-preserved', reconciliation.state === 'RECONCILED_WITH_CONTRADICTIONS' && reconciliation.conflictCount === 1, `${reconciliation.state}/${reconciliation.conflictCount}`);

const promotion = compileUberOutboundPromotionDecision({
  candidate: { genotypeId: 'ubog_final_doctor_fixture' },
  experimentEvidence: {
    causalState: 'CAUSAL_SUPPORTED',
    primaryMetric: 'QUALIFIED_POSITIVE_REPLY',
    samplePerArm: 50000,
    minimumSamplePerArm: 42607,
    effectDirection: 'POSITIVE',
    uncertaintyState: 'NARROW',
    independentAnalysis: true,
    randomized: true,
    holdoutProtected: true
  },
  validationEvidence: { untouchedValidationPassed: true, sampleSize: 12000, minimumSampleSize: 10000 },
  reputationEvidence: {
    complaintRate: 0.0005,
    complaintCeiling: 0.001,
    hardBounceRate: 0.01,
    hardBounceCeiling: 0.03,
    legalIncidentCount: 0,
    providerPolicyIncidentCount: 0
  },
  economicEvidence: { incrementalClearedContributionCents: 50000, downFunnelObserved: true }
});
add('causal-promotion-enters-review-only', promotion.state === 'APPROVED_POLICY_CANDIDATE' && promotion.eligibleForPolicyReview === true, `${promotion.state}/${promotion.eligibleForPolicyReview}`);
add('causal-promotion-never-auto-runtime', promotion.automaticRuntimePromotionAuthorized === false, promotion.automaticRuntimePromotionAuthorized);
add('promotion-zero-authority', promotion.externalEffectAuthority === 'NONE' && promotion.businessEffectAuthority === 'NONE', `${promotion.externalEffectAuthority}/${promotion.businessEffectAuthority}`);

const vanityPromotion = compileUberOutboundPromotionDecision({
  candidate: { genotypeId: 'ubog_vanity_fixture' },
  experimentEvidence: {
    causalState: 'CAUSAL_SUPPORTED',
    primaryMetric: 'OPEN_RATE',
    samplePerArm: 999999,
    minimumSamplePerArm: 1,
    effectDirection: 'POSITIVE',
    uncertaintyState: 'NARROW',
    independentAnalysis: true,
    randomized: true,
    holdoutProtected: true
  },
  validationEvidence: { untouchedValidationPassed: true, sampleSize: 99999, minimumSampleSize: 1 },
  reputationEvidence: { complaintRate: 0, complaintCeiling: 0.001, hardBounceRate: 0, hardBounceCeiling: 0.03 },
  economicEvidence: { incrementalClearedContributionCents: 1, downFunnelObserved: true }
});
add('vanity-metric-cannot-promote', vanityPromotion.state === 'REVOKED' && vanityPromotion.fatalReasonCodes.includes('vanity-metric-cannot-promote-policy'), `${vanityPromotion.state}:${vanityPromotion.fatalReasonCodes.join(',')}`);

const degraded = compileUberOutboundDegradationDecision({
  currentState: 'APPROVED_POLICY_CANDIDATE',
  complaintRate: 0.002,
  complaintCeiling: 0.001,
  providerPolicyIncidentCount: 1
});
add('harm-can-revoke', degraded.nextState === 'REVOKED', degraded.nextState);

const prospect = {
  accountId: 'final-doctor-account',
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
const messageCandidate = {
  candidateId: 'final-doctor-message',
  subject: 'margin benchmark',
  body: 'Synthetic final doctor fixture only.',
  wordCount: 80,
  sentenceCount: 4,
  subjectWordCount: 3,
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
const genotype = compileUberOutboundMessageGenotype(messageCandidate, prospect);
const rendered = compileUberOutboundRenderedMessageReceipt(messageCandidate, genotype);
add('strategy-genotype-content-addressed', /^ubog_[a-f0-9]{64}$/.test(genotype.genotypeId), genotype.genotypeId);
add('rendered-message-content-addressed', /^ubom_[a-f0-9]{64}$/.test(rendered.renderedMessageId), rendered.renderedMessageId);
add('rendered-message-binds-genotype', rendered.genotypeId === genotype.genotypeId, `${rendered.genotypeId}/${genotype.genotypeId}`);

const context = compileUberOutboundContextPolicy({ seniority: 'CFO', department: 'Finance', industry: 'SaaS', intentState: 'COLD' });
add('context-policy-conditional', context.seniorityKey === 'C_SUITE' && context.departmentKey === 'FINANCE' && context.industryKey === 'SAAS', `${context.seniorityKey}/${context.departmentKey}/${context.industryKey}`);
const sequence = compileUberOutboundSequenceDecision({ unsubscribed: true, freshTrigger: true, qualifiedReply: true });
add('sequence-suppression-dominates', sequence.action === 'IMMEDIATE_GLOBAL_SUPPRESSION', sequence.action);

const decision = compileUberOutboundGenomeDecision({
  prospect,
  sender: { senderId: 'fixture-sender', status: 'GREEN', authenticationReady: true, providerBudgetAvailable: true },
  authorization: { outreachAuthorized: true },
  legalDecision: { status: 'PASSED', jurisdiction: 'US', basis: 'SYNTHETIC_FIXTURE_ONLY', policyVersion: 'fixture-v1', evidenceId: 'fixture-legal-1', recipientType: 'CORPORATE' },
  messageCandidates: [messageCandidate],
  experiment: { experimentId: 'final-doctor-exp', primaryMetric: 'QUALIFIED_POSITIVE_REPLY', treatmentDimension: 'CTA', causalQuestion: 'Synthetic fixture only', arms: ['OFFER', 'MEETING'] },
  policy: { policyVersion: 'fixture-policy-v1' }
});
add('decision-ready-zero-effect', decision.state === 'READY_FOR_GOVERNED_SEND_REVIEW' && decision.messagesSent === 0 && decision.externalEffectAuthority === 'NONE', `${decision.state}/${decision.messagesSent}/${decision.externalEffectAuthority}`);

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
    messageCandidates: [messageCandidate],
    experiment: { experimentId: 'final-doctor-exp-2', primaryMetric: 'QUALIFIED_POSITIVE_REPLY', arms: ['A', 'B'] },
    sequenceInputs: { qualifiedReply: true },
    enforce: true
  },
  now: new Date('2026-09-14T18:00:00Z')
});
add('uberreach-sequence-exit-blocks-cold-path', reach.state === 'PREPARATION_BLOCKED' && reach.blockers.includes('outbound-sequence-exits-cold-send-path'), `${reach.state}:${reach.blockers.join(',')}`);
add('uberreach-zero-effects', reach.messagesSent === 0 && reach.providerCalls === 0 && reach.externalEffectAuthority === 'NONE', `${reach.messagesSent}/${reach.providerCalls}/${reach.externalEffectAuthority}`);

const failed = checks.filter(check => !check.ok);
const report = {
  doctor: 'uberoutbound-genome-final-doctor',
  state: failed.length ? 'NOT_READY' : 'REPORT_VISIBLE_V1_STRUCTURALLY_CLOSED_EXACT_HEAD_EXECUTION_PENDING',
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  coverage,
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  truthBoundary: 'REPORT_VISIBLE_V1_STRUCTURALLY_CLOSED_EXACT_HEAD_EXECUTION_PENDING means every material mechanism visible in the founder-supplied report has a bounded executable representation or an explicit external-evidence frontier, including missing-pack ingestion and causal promotion/revocation. It is not a claim that the nine separately referenced files were supplied, that source tests executed on this exact head, that any copy treatment has causal lift, or that live outreach, legal eligibility, customers, revenue or 100000/day capacity are proven.'
};

console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;