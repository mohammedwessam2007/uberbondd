import fs from 'node:fs/promises';
import path from 'node:path';
import {
  UBEROUTBOUND_GENOME_VERSION,
  UBEROUTBOUND_SAMPLE_SIZE_PRIORS,
  compileUberOutboundGenomeDecision,
  compileUberOutboundLearningPacket,
  compileUberOutboundOutcomeReceipt
} from '../src/uberoutbound-genome.mjs';

const root = process.cwd();
const researchPath = path.join(root, 'artifacts/outbound-genome/research-2026-09-14.json');
const canonPath = path.join(root, 'docs/UBEROUTBOUND_GENOME_CANON.md');
const schemaPath = path.join(root, 'schemas/uberoutbound-genome.schema.json');

const research = JSON.parse(await fs.readFile(researchPath, 'utf8'));
const canon = await fs.readFile(canonPath, 'utf8');
const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });

add('version-v2', UBEROUTBOUND_GENOME_VERSION === 'uberbond.uberoutbound-genome.v2', UBEROUTBOUND_GENOME_VERSION);
add('research-cutoff', research.researchCutoff === '2026-09-14', research.researchCutoff);
add('25-strongest-findings', Array.isArray(research.strongestFindings) && research.strongestFindings.length === 25, research.strongestFindings?.length);
add('atom-families', Array.isArray(research.atomFamilies) && research.atomFamilies.length >= 15, research.atomFamilies?.length);
add('research-gaps', Array.isArray(research.researchGaps) && research.researchGaps.length === 10, research.researchGaps?.length);
add('missing-downloads-explicit', Array.isArray(research.missingReferencedDownloads) && research.missingReferencedDownloads.length >= 9, research.missingReferencedDownloads?.length);
add('sample-size-priors', UBEROUTBOUND_SAMPLE_SIZE_PRIORS.length === 7, UBEROUTBOUND_SAMPLE_SIZE_PRIORS.length);
add('canon-capacity-not-quota', canon.includes('capacity horizon, never a quota'), 'canon law present');
add('schema-zero-authority', schema?.properties?.externalEffectAuthority?.const === 'NONE', schema?.properties?.externalEffectAuthority?.const);

const decision = compileUberOutboundGenomeDecision({
  prospect: {
    accountId: 'doctor-account',
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
  },
  sender: { status: 'GREEN', authenticationReady: true, providerBudgetAvailable: true },
  authorization: { outreachAuthorized: true },
  legalDecision: {
    status: 'PASSED',
    jurisdiction: 'US',
    basis: 'DOCTOR_FIXTURE_ONLY',
    policyVersion: 'doctor-v1',
    evidenceId: 'doctor-legal-fixture',
    recipientType: 'CORPORATE'
  },
  messageCandidates: [{
    candidateId: 'offer-short',
    wordCount: 80,
    sentenceCount: 4,
    subjectWordCount: 3,
    ctaType: 'OFFER',
    personalizationClass: 'COMPANY',
    problemAltitude: 'STRATEGIC',
    problemBeforeProduct: true,
    relevantProof: true,
    sequencePosition: 1
  }],
  experiment: {
    experimentId: 'doctor-experiment',
    primaryMetric: 'QUALIFIED_POSITIVE_REPLY',
    arms: ['OFFER', 'MEETING'],
    holdoutRate: 0.1
  }
});

add('synthetic-decision-ready', decision.state === 'READY_FOR_GOVERNED_SEND_REVIEW', decision.state);
add('decision-zero-authority', decision.externalEffectAuthority === 'NONE' && decision.messagesSent === 0 && decision.providerCalls === 0, `${decision.externalEffectAuthority}/${decision.messagesSent}/${decision.providerCalls}`);
add('terminal-objective-not-opens', decision.evidencePolicy.openRateTerminalMetric === false && decision.evidencePolicy.volumeQuotaTerminalMetric === false, decision.evidencePolicy.terminalObjective);

const blocked = compileUberOutboundGenomeDecision({
  prospect: {
    accountId: 'doctor-blocked',
    seniority: 'CEO',
    safeForOutreach: true,
    verificationStatus: 'VERIFIED',
    suppressed: true,
    problemEvidenceScore: 1,
    roleOwnershipScore: 1,
    accountValueScore: 1,
    contactabilityScore: 1,
    trigger: { type: 'OBSERVED_PROBLEM', confidence: 1, freshness: 1, problemLinked: true }
  },
  sender: { status: 'GREEN', authenticationReady: true, providerBudgetAvailable: true },
  authorization: { outreachAuthorized: true },
  legalDecision: {
    status: 'PASSED', jurisdiction: 'US', basis: 'FIXTURE', policyVersion: 'v1', evidenceId: 'e1'
  },
  messageCandidates: [{ candidateId: 'x', wordCount: 50, sentenceCount: 3, ctaType: 'OFFER', sequencePosition: 1 }],
  experiment: { experimentId: 'x', primaryMetric: 'QUALIFIED_POSITIVE_REPLY', arms: ['A', 'B'] }
});
add('suppression-dominates', blocked.recommendedAction === 'ABSTAIN' && blocked.blockers.includes('suppression-dominates'), blocked.recommendedAction);

const outcomeA = compileUberOutboundOutcomeReceipt({
  experimentAssignment: { arm: 'A' },
  outcome: { qualifiedPositiveReply: true },
  economics: { clearedContributionCents: 100, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
});
const outcomeB = compileUberOutboundOutcomeReceipt({
  experimentAssignment: { arm: 'B' },
  outcome: { qualifiedPositiveReply: false },
  economics: { clearedContributionCents: 0, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
});
const learning = compileUberOutboundLearningPacket({ outcomes: [outcomeA, outcomeB], policy: { minSamplesPerArm: 1 } });
add('learning-refuses-auto-winner', learning.automaticWinner === null, learning.automaticWinner);

const failed = checks.filter(check => !check.ok);
const report = {
  doctor: 'uberoutbound-genome',
  version: UBEROUTBOUND_GENOME_VERSION,
  state: failed.length ? 'NOT_READY' : 'READY_INTERNAL_V1',
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  truthBoundary: 'READY_INTERNAL_V1 means the declared research-to-policy genome is internally represented and fail-closed. It does not prove live deliverability, causal lift, legal clearance for any real recipient, customers, revenue, or 100k/day utilization.'
};

console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
