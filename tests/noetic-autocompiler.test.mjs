import assert from 'node:assert/strict';
import test from 'node:test';
import { certifyPairedZeroLoss } from '../src/absolute-frontier-quality-invariant.mjs';
import {
  assessRealityDrift,
  compileSemanticProgram,
  executeSemanticProgram,
  planSemanticExecution,
  proposeCognitiveCompilation
} from '../src/noetic-autocompiler.mjs';

function program() {
  return compileSemanticProgram({
    programId: 'lead-reflex-v1',
    purpose: 'Cheap shadow judgements before expensive cognition.',
    instructions: [
      { id: 'worthResearch', op: 'NOUL', question: 'Is further research likely to change the decision?', escalateBelow: 0.8 },
      { id: 'route', op: 'CHOICE', question: 'Which route fits?', criteria: { code: null, jev: null, frontier: null }, escalateBelow: 0.75 },
      { id: 'value', op: 'SCORE', question: 'Expected value?', criteria: ['low', 'medium', 'high'], escalateBelow: 0.7 }
    ]
  }).program;
}

test('semantic program is content-addressed and judgement-only', () => {
  const result = compileSemanticProgram({
    programId: 'p', purpose: 'test',
    instructions: [{ id: 'x', op: 'NOUL', question: 'X?' }]
  });
  assert.equal(result.ok, true);
  assert.match(result.program.programDigest, /^sha256:/);
  assert.equal(result.program.authority, 'NONE');
  assert.equal(result.program.consequenceClass, 'JUDGEMENT_ONLY');
});

test('plan-only execution makes no provider call', async () => {
  let calls = 0;
  const decisionAdapter = { evaluate: async () => { calls++; return { ok: true }; } };
  const result = await executeSemanticProgram({ program: program(), state: { lead: 1 }, decisionAdapter, mode: 'PLAN_ONLY' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SEMANTIC_EXECUTION_PLAN_ONLY');
  assert.equal(calls, 0);
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});

test('shadow execution creates registers and escalates low-confidence semantics', async () => {
  const decisionAdapter = {
    evaluate: async ({ providerCallAuthorized, dataClass, spendCeilingUsd }) => {
      assert.equal(providerCallAuthorized, true);
      assert.equal(dataClass, 'INTERNAL_NON_SENSITIVE');
      assert.equal(spendCeilingUsd, 0.001);
      return {
        ok: true,
        provider: 'typesafe-direct', requestedModel: 'jev-latest', observedModel: 'jev-1.13', requestDigest: 'sha256:req', latencyMs: 100,
        usage: { inputTokens: 10, outputTokens: 0, costUsd: 0.00000042, costCents: 0.000042 },
        pricingEvidence: { sourceRef: 'official', verifiedAt: '2026-09-19T00:00:00.000Z', inputUsdPerMillion: 0.042, outputUsdPerMillion: 0 },
        answers: {
          worthResearch: { type: 'noul', probability: 0.51, confidence: 0.02 },
          route: { type: 'choice', choice: 'jev', confidence: 0.9, probabilities: { code: 0.05, jev: 0.9, frontier: 0.05 } },
          value: { type: 'score', score: 1.8, confidence: 0.85, probabilities: { '0': 0.05, '1': 0.1, '2': 0.85 } }
        },
        externalEffectLedger: { customerMessages: 0, providerCalls: 1, spendCents: 0.000042, deployments: 0, dnsChanges: 0, credentialChanges: 0, paymentMutations: 0, productionMutations: 0 }
      };
    }
  };
  const result = await executeSemanticProgram({ program: program(), state: { lead: 1 }, decisionAdapter, mode: 'SHADOW', providerCallAuthorized: true, dataClass: 'INTERNAL_NON_SENSITIVE', spendCeilingUsd: 0.001 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SEMANTIC_SHADOW_OBSERVED__FRONTIER_REVIEW_REQUIRED');
  assert.equal(result.registers.route.value, 'jev');
  assert.deepEqual(result.escalations.map(row => row.instructionId), ['worthResearch']);
  assert.equal(result.actionAuthority, 'NONE');
});

test('reality drift decompiles a formerly stable reflex', () => {
  const result = assessRealityDrift({
    baseline: { accuracy: 0.99, calibrationError: 0.01 },
    recent: { accuracy: 0.9, calibrationError: 0.08, count: 50 }
  });
  assert.equal(result.ok, true);
  assert.equal(result.drift, true);
  assert.equal(result.status, 'REALITY_DRIFT_DETECTED__DECOMPILE');
});

test('deterministic compilation requires exact paired zero-loss proof, not merely high accuracy', () => {
  const programDigest = 'sha256:x';
  const outcomes = Array.from({ length: 100 }, (_, index) => ({ taskId: `t-${index}`, outcome: 'CORRECT' }));
  const baselineTrial = {
    architectureId: 'frontier-baseline',
    suiteVersion: 'jev-zero-loss-v1',
    corpusDigest: 'a'.repeat(64),
    manifestDigest: 'b'.repeat(64),
    taskClass: 'semantic-reflex',
    taskOutcomeDigest: 'c'.repeat(64),
    pairedTaskOutcomes: outcomes,
    statistics: { verifiedSuccessRate: 1, falsePositiveRate: 0 },
    arenaTrial: { processScore: 1 },
    economics: { meanCostUsd: 1 }
  };
  const candidateTrial = {
    ...baselineTrial,
    architectureId: programDigest,
    taskOutcomeDigest: 'd'.repeat(64),
    economics: { meanCostUsd: 0.001 }
  };
  const certificate = certifyPairedZeroLoss({ baselineTrial, candidateTrial, requireEconomicsImprovement: true, provenanceValidator: () => ({ ok: true }) });
  assert.equal(certificate.ok, true, JSON.stringify(certificate));

  const highButNotPerfect = proposeCognitiveCompilation({
    programDigest,
    outcomeCount: 500,
    accuracy: 0.995,
    calibrationError: 0.01,
    stableWindows: 5,
    zeroLossCertificate: certificate
  });
  assert.equal(highButNotPerfect.eligible, false);
  assert.ok(highButNotPerfect.reasonCodes.includes('accuracy-below-zero-loss-threshold'));

  const noCertificate = proposeCognitiveCompilation({
    programDigest,
    outcomeCount: 500,
    accuracy: 1,
    calibrationError: 0,
    stableWindows: 5
  });
  assert.equal(noCertificate.eligible, false);
  assert.ok(noCertificate.reasonCodes.includes('paired-zero-loss-certificate-required'));

  const strong = proposeCognitiveCompilation({
    programDigest,
    outcomeCount: 100,
    accuracy: 1,
    calibrationError: 0,
    stableWindows: 5,
    zeroLossCertificate: certificate
  });
  assert.equal(strong.eligible, true, JSON.stringify(strong));
  assert.equal(strong.status, 'DETERMINISTIC_COMPILATION_CANDIDATE');
  assert.equal(strong.automaticCodeMutationAuthorized, false);
});

test('planner exposes the exact typed questions without executing them', () => {
  const result = planSemanticExecution({ program: program(), state: { x: 1 }, mode: 'SHADOW' });
  assert.equal(result.ok, true);
  assert.equal(result.questions.worthResearch.type, 'noul');
  assert.equal(result.questions.route.type, 'choice');
  assert.equal(result.questions.value.type, 'score');
});


test('any measured regression decompiles immediately', () => {
  const tinyAccuracyLoss = assessRealityDrift({
    baseline: { accuracy: 1, calibrationError: 0 },
    recent: { accuracy: 0.999999, calibrationError: 0, count: 100 }
  });
  assert.equal(tinyAccuracyLoss.drift, true);
  assert.equal(tinyAccuracyLoss.action, 'IMMEDIATE_DECOMPILE_TO_FRONTIER_AND_REVALIDATE');

  const tinyCalibrationLoss = assessRealityDrift({
    baseline: { accuracy: 1, calibrationError: 0 },
    recent: { accuracy: 1, calibrationError: 0.000001, count: 100 }
  });
  assert.equal(tinyCalibrationLoss.drift, true);
});
