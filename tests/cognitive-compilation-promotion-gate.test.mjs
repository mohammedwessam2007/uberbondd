import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import { compileSealedArchitectureTrial } from '../src/apex-sealed-tournament.mjs';
import { certifyPairedZeroLoss } from '../src/absolute-frontier-quality-invariant.mjs';
import {
  certifyCanonicalZeroLoss,
  validateCanonicalZeroLossCertificate
} from '../src/canonical-zero-loss-certificate.mjs';
import {
  assessRealityDrift,
  compileSemanticProgram,
  proposeCognitiveCompilation,
  validateCognitiveCompilationProposalOrigin,
  validateRealityDriftAssessmentOrigin,
  validateSemanticProgramOrigin
} from '../src/noetic-autocompiler.mjs';
import { assessCognitiveCompilationPromotion } from '../src/cognitive-compilation-promotion-gate.mjs';

const suiteVersion = 'canonical-promotion-v1';
const COMMITTED_AT = '2026-09-29T00:00:00.000Z';
const FROZEN_AT = '2026-09-29T00:01:00.000Z';
const OBSERVED_AT = '2026-09-29T00:02:00.000Z';

const stable = value => Array.isArray(value)
  ? value.map(stable)
  : (!value || typeof value !== 'object'
      ? value
      : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const rawDigest = value => crypto.createHash('sha256').update(String(value)).digest('hex');

function semanticProgram() {
  const compiled = compileSemanticProgram({
    programId: 'canonical-reflex',
    purpose: 'Test a zero-loss bounded semantic reflex.',
    instructions: [{ id: 'keep', op: 'NOUL', question: 'Does the verified rule apply?' }]
  });
  assert.equal(compiled.ok, true);
  return compiled.program;
}

function manifest(count = 100) {
  return Array.from({ length: count }, (_, i) => {
    const taskId = `task-${i + 1}`;
    return {
      taskId,
      family: 'SEMANTIC_REFLEX',
      tier: 'SEALED_HOLDOUT',
      difficulty: 0.8,
      answerDigest: sealedAnswerDigest({ suiteVersion, taskId, answer: 'yes' })
    };
  });
}
function corpusDigestFor(rows) {
  return rawDigest(JSON.stringify(rows.map(row => [row.taskId, row.family, row.tier, row.answerDigest])));
}
function manifestDigestFor(rows) {
  return digest(rows.map(row => ({
    taskId: row.taskId,
    family: row.family,
    tier: row.tier,
    difficulty: row.difficulty,
    answerDigest: row.answerDigest
  })));
}
function commitmentFor(rows) {
  return {
    commitmentRef: `holdout://${manifestDigestFor(rows)}`,
    committedAt: COMMITTED_AT,
    sourceFreezeRef: 'source-freeze://canonical-promotion',
    evaluatorRef: 'evaluator://independent',
    suiteVersion,
    corpusDigest: corpusDigestFor(rows),
    manifestDigest: manifestDigestFor(rows),
    taskCount: rows.length,
    rawHoldoutsStoredInRepository: false,
    optimizerAccessBeforeEvaluation: false,
    candidateAccessBeforeEvaluation: false,
    plaintextAnswersExposedBeforeEvaluation: false,
    evaluatorIndependent: true
  };
}
function compileTrial(architectureId, costUsd) {
  const rows = manifest();
  return compileSealedArchitectureTrial({
    architectureId,
    architectureClass: architectureId === 'frontier-baseline' ? 'INCUMBENT' : 'CHALLENGER',
    architectureDigest: digest({ architectureId, revision: 'r1' }),
    architectureRevision: 'r1',
    architectureSourceRef: `source://${encodeURIComponent(architectureId)}`,
    architectureFrozenAt: FROZEN_AT,
    taskClass: 'semantic-reflex',
    suiteVersion,
    corpusDigest: corpusDigestFor(rows),
    sealedManifest: rows,
    holdoutCommitment: commitmentFor(rows),
    runs: rows.map((row, i) => ({
      taskId: row.taskId,
      runId: `${architectureId}-run-${i}`,
      evidenceRef: `runtime://${encodeURIComponent(architectureId)}/${i}`,
      observedAt: OBSERVED_AT,
      response: 'yes',
      costUsd,
      latencyMs: 10,
      founderMinutes: 0,
      verifierIndependent: true,
      holdoutPromptExposedToOptimizer: false,
      modelJudgedOwnIdentityMarkedAnswer: false
    })),
    processScore: 1,
    processEvidenceRef: `review://${encodeURIComponent(architectureId)}`,
    verifierId: 'independent-verifier',
    architectureDesignerId: 'architecture-builder'
  });
}

function validStack() {
  const program = semanticProgram();
  const baseline = compileTrial('frontier-baseline', 0.01);
  const candidate = compileTrial(program.programDigest, 0.0001);
  assert.equal(baseline.ok, true, JSON.stringify(baseline));
  assert.equal(candidate.ok, true, JSON.stringify(candidate));

  const analysisCertificate = certifyPairedZeroLoss({
    baselineTrial: baseline,
    candidateTrial: candidate,
    requireEconomicsImprovement: true
  });
  assert.equal(analysisCertificate.ok, true, JSON.stringify(analysisCertificate));

  const proposal = proposeCognitiveCompilation({
    program,
    programDigest: program.programDigest,
    outcomeCount: 100,
    accuracy: 1,
    calibrationError: 0,
    stableWindows: 5,
    zeroLossCertificate: analysisCertificate
  });
  assert.equal(proposal.eligible, true, JSON.stringify(proposal));

  const canonical = certifyCanonicalZeroLoss({
    baselineTrial: baseline,
    candidateTrial: candidate,
    requireEconomicsImprovement: true
  });
  assert.equal(canonical.ok, true, JSON.stringify(canonical));

  const drift = assessRealityDrift({
    baseline: { accuracy: 1, calibrationError: 0 },
    recent: { accuracy: 1, calibrationError: 0, count: 100 }
  });
  assert.equal(drift.ok, true);
  assert.equal(drift.drift, false);

  return { program, baseline, candidate, proposal, canonical: canonical.certificate, drift };
}

test('canonical semantic program, proposal, no-drift assessment and sealed zero-loss certificate reach manual review only', () => {
  const stack = validStack();
  assert.equal(validateSemanticProgramOrigin(stack.program).ok, true);
  assert.equal(validateCognitiveCompilationProposalOrigin(stack.proposal).ok, true);
  assert.equal(validateRealityDriftAssessmentOrigin(stack.drift).ok, true);
  assert.equal(validateCanonicalZeroLossCertificate(stack.canonical, {
    expectedCandidateArchitectureId: stack.program.programDigest,
    minimumTaskCount: 100
  }).ok, true);

  const out = assessCognitiveCompilationPromotion({
    semanticProgram: stack.program,
    compilationProposal: stack.proposal,
    canonicalZeroLossCertificate: stack.canonical,
    driftAssessment: stack.drift
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'COGNITIVE_COMPILATION_ELIGIBLE_FOR_MANUAL_ACTIVATION_REVIEW');
  assert.equal(out.promotionAuthority, 'NONE');
  assert.equal(out.automaticPromotion, false);
  assert.equal(out.productionMutationAuthorized, false);
  assert.equal(out.ownerOrGovernedActivationStillRequired, true);
});

test('copying any promotion evidence object destroys its authority', () => {
  const stack = validStack();
  for (const mutation of [
    { semanticProgram: structuredClone(stack.program) },
    { compilationProposal: structuredClone(stack.proposal) },
    { canonicalZeroLossCertificate: structuredClone(stack.canonical) },
    { driftAssessment: structuredClone(stack.drift) }
  ]) {
    const out = assessCognitiveCompilationPromotion({
      semanticProgram: stack.program,
      compilationProposal: stack.proposal,
      canonicalZeroLossCertificate: stack.canonical,
      driftAssessment: stack.drift,
      ...mutation
    });
    assert.equal(out.ok, false, JSON.stringify(out));
  }
});

test('analysis-only paired zero-loss certificate cannot impersonate canonical promotion evidence', () => {
  const stack = validStack();
  const analysisOnly = certifyPairedZeroLoss({
    baselineTrial: stack.baseline,
    candidateTrial: stack.candidate,
    requireEconomicsImprovement: true
  });
  assert.equal(analysisOnly.ok, true);

  const out = assessCognitiveCompilationPromotion({
    semanticProgram: stack.program,
    compilationProposal: stack.proposal,
    canonicalZeroLossCertificate: analysisOnly,
    driftAssessment: stack.drift
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('canonical-zero-loss-certificate-producer-origin-required'));
});
