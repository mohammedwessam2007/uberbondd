import test from 'node:test';
import assert from 'node:assert/strict';
import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import {
  prepareFreshApexCampaign,
  admitFreshCustodianManifest,
  assessFreshCampaignRuntimeReadiness
} from '../src/apex-fresh-campaign.mjs';

const SUITE = 'apex-frontier-quality-compression-v1';
const FREEZE = '2026-09-29T00:27:00.000Z';
const COMMIT = '2026-09-29T00:28:00.000Z';
const OBSERVED = '2026-09-29T00:29:00.000Z';

function architectures() {
  return [
    {
      architectureId: 'opus-frontier-baseline',
      architectureClass: 'INCUMBENT',
      architectureRevision: 'main@5a1384b',
      architectureSourceRef: 'github://mohammedwessam2007/uberbondd@5a1384b',
      architectureFrozenAt: FREEZE,
      topologyRef: 'apex://direct-frontier',
      contextPolicyRef: 'canon://minimum-sufficient-context',
      verifierPolicyRef: 'apex://independent-sealed-verifier',
      promptContractRef: 'apex://frontier-max-contract',
      executionModeRef: 'INTERACTIVE',
      jevMode: 'NONE',
      deterministicCrystallization: false,
      trialSpendCeilingUsd: 4,
      modelRequirements: [
        {
          candidateId: 'anthropic-claude-opus-5-5',
          role: 'SOVEREIGN_REASONER',
          reasoningSettingRef: 'anthropic:effort=max',
          pricingModeRef: 'INTERACTIVE',
          count: 1,
          transportClass: 'ANY_VERIFIED'
        }
      ]
    },
    {
      architectureId: 'opus-astra-blind-council',
      architectureClass: 'CHALLENGER',
      architectureRevision: 'main@5a1384b',
      architectureSourceRef: 'github://mohammedwessam2007/uberbondd@5a1384b',
      architectureFrozenAt: FREEZE,
      topologyRef: 'apex://blind-council',
      contextPolicyRef: 'canon://artifact-first-delta-context',
      verifierPolicyRef: 'apex://identity-blind-independent-adjudication',
      promptContractRef: 'apex://frontier-max-contract',
      executionModeRef: 'INTERACTIVE',
      jevMode: 'NONE',
      deterministicCrystallization: false,
      trialSpendCeilingUsd: 3,
      modelRequirements: [
        {
          candidateId: 'anthropic-claude-opus-5-5',
          role: 'PRIMARY',
          reasoningSettingRef: 'anthropic:effort=max',
          pricingModeRef: 'INTERACTIVE',
          count: 1,
          transportClass: 'DIRECT'
        },
        {
          candidateId: 'openai-gpt-6-astra',
          role: 'INDEPENDENT_APEX_CHALLENGER',
          reasoningSettingRef: 'openai:reasoning=max',
          pricingModeRef: 'INTERACTIVE',
          count: 1,
          transportClass: 'DIRECT'
        }
      ]
    },
    {
      architectureId: 'opus-diverse-worker-compression',
      architectureClass: 'CHALLENGER',
      architectureRevision: 'main@5a1384b',
      architectureSourceRef: 'github://mohammedwessam2007/uberbondd@5a1384b',
      architectureFrozenAt: FREEZE,
      topologyRef: 'apex://parallel-frontier-heterogeneous',
      contextPolicyRef: 'canon://artifact-first-delta-context',
      verifierPolicyRef: 'apex://frontier-final-adjudication',
      promptContractRef: 'apex://frontier-quality-compression',
      executionModeRef: 'DEFERRED_BATCH',
      jevMode: 'SHADOW_ONLY',
      deterministicCrystallization: true,
      trialSpendCeilingUsd: 3,
      modelRequirements: [
        {
          candidateId: 'anthropic-claude-opus-5-5',
          role: 'ORCHESTRATOR_AND_FINAL_JUDGE',
          reasoningSettingRef: 'anthropic:effort=max',
          pricingModeRef: 'INTERACTIVE',
          count: 1,
          transportClass: 'DIRECT'
        },
        {
          candidateId: 'deepseek-v4-1-flash',
          role: 'DIVERSE_WORKER',
          reasoningSettingRef: 'deepseek:effort=max',
          pricingModeRef: 'INTERACTIVE',
          count: 8,
          transportClass: 'DIRECT'
        },
        {
          candidateId: 'zai-glm-5-3',
          role: 'DIVERSE_WORKER',
          reasoningSettingRef: 'zai:reasoning=high',
          pricingModeRef: 'INTERACTIVE',
          count: 4,
          transportClass: 'DIRECT'
        }
      ]
    }
  ];
}

function plan(extra = {}) {
  return prepareFreshApexCampaign({
    campaignId: 'frontier-quality-compression-2026-09-29-a',
    suiteVersion: SUITE,
    taskClass: 'hard-general-reasoning',
    minimumTaskCount: 40,
    architectureFrozenAt: FREEZE,
    qualityFloorPolicy: {
      mode: 'LEXICOGRAPHIC_FRONTIER_FIRST',
      frontierBaselineArchitectureId: 'opus-frontier-baseline',
      maxQualityDelta: 0,
      requireNoWorseFalsePositiveUpperBound: true
    },
    budgetPolicy: {
      normalization: 'COMMON_CEILING',
      maxMeanCostUsd: 2,
      maxMeanLatencyMs: 300000,
      maxMeanFounderMinutes: 0.1,
      maxTotalCampaignSpendUsd: 10
    },
    custodianPolicy: {
      rawStorage: 'OUTSIDE_REPOSITORY',
      evaluatorIndependenceRequired: true,
      architectureFreezeBeforeCommitmentRequired: true,
      freshGenerationRequired: true,
      previouslyEvaluatedItemReuseAllowed: false
    },
    architectures: architectures(),
    ...extra
  });
}

function manifest(count = 40) {
  return Array.from({ length: count }, (_, index) => {
    const taskId = `fresh-task-${String(index + 1).padStart(3, '0')}`;
    return {
      taskId,
      family: index % 2 === 0 ? 'CAUSAL_REASONING' : 'DEBUGGING',
      tier: 'SEALED_HOLDOUT',
      difficulty: 0.8,
      answerDigest: sealedAnswerDigest({
        suiteVersion: SUITE,
        taskId,
        answer: `private-answer-${index + 1}`
      })
    };
  });
}


test('campaign plan freezes architecture identities and preserves frontier-first economics', () => {
  const out = plan();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'FRESH_APEX_CAMPAIGN_PREPARED');
  assert.equal(out.architectureRoster.length, 3);
  assert.equal(out.qualityFloorPolicy.mode, 'LEXICOGRAPHIC_FRONTIER_FIRST');
  assert.equal(out.qualityFloorPolicy.frontierBaselineArchitectureId, 'opus-frontier-baseline');
  assert.equal(out.qualityFloorPolicy.maxQualityDelta, 0);
  assert.equal(out.custodianPolicy.rawStorage, 'OUTSIDE_REPOSITORY');
  assert.equal(out.budgetPolicy.maxTotalCampaignSpendUsd, 10);
  assert.equal(out.budgetPolicy.sumTrialSpendCeilingsUsd, 10);
  assert.equal(out.providerCallAuthority, 'NONE');
  assert.equal(out.spendAuthority, 'NONE');
  assert.equal(out.executionAuthority, 'NONE');
  for (const row of out.architectureRoster) assert.match(row.architectureDigest, /^[a-f0-9]{64}$/);
});



test('campaign plan refuses architecture budgets that exceed total experiment cap', () => {
  const rows = architectures();
  rows[0].trialSpendCeilingUsd = 8;
  const out = plan({ architectures: rows });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('architecture-trial-ceilings-exceed-total-campaign-spend-cap'));
});

test('campaign plan refuses raw holdout material and previously-evaluated reuse policy', () => {
  const raw = plan({ custodianPolicy: { prompt: 'secret task' } });
  assert.equal(raw.ok, false);
  assert.ok(raw.reasonCodes.includes('raw-holdout-material-prohibited-in-campaign-plan'));

  const reused = plan({
    custodianPolicy: {
      rawStorage: 'OUTSIDE_REPOSITORY',
      evaluatorIndependenceRequired: true,
      architectureFreezeBeforeCommitmentRequired: true,
      freshGenerationRequired: true,
      previouslyEvaluatedItemReuseAllowed: true
    }
  });
  assert.equal(reused.ok, false);
  assert.ok(reused.reasonCodes.includes('previously-evaluated-item-reuse-prohibited'));
});

test('fresh custodian admission binds exact safe manifest and rejects old/evaluated evidence', async () => {
  const prepared = plan();
  const sealedManifest = manifest(40);
  const { sealedManifestCommitmentDigest, sealedCorpusDigestFromManifest } = await import('../src/apex-sealed-tournament.mjs');
  const baseReceipt = {
    campaignId: prepared.campaignId,
    campaignDigest: prepared.campaignDigest,
    suiteVersion: prepared.suiteVersion,
    manifestDigest: sealedManifestCommitmentDigest(sealedManifest),
    corpusDigest: sealedCorpusDigestFromManifest(sealedManifest),
    taskCount: sealedManifest.length,
    commitmentRef: 'custodian://fresh/apex-fqc-a',
    committedAt: COMMIT,
    sourceFreezeRef: 'github://mohammedwessam2007/uberbondd@5a1384b',
    evaluatorRef: 'evaluator://independent-v1',
    custodianRef: 'custodian://independent-v1',
    rawHoldoutsStoredInRepository: false,
    optimizerAccessBeforeEvaluation: false,
    candidateAccessBeforeEvaluation: false,
    plaintextAnswersExposedBeforeEvaluation: false,
    evaluatorIndependent: true,
    custodianIndependent: true,
    freshlyGeneratedForCampaign: true,
    tasksPreviouslyEvaluated: false,
    tasksDerivedFromPreviouslyEvaluatedItems: false,
    legacyEvidenceReuse: false,
    secretFreeReceipt: true
  };

  const admitted = admitFreshCustodianManifest({
    campaignPlan: prepared,
    sealedManifest,
    custodianReceipt: baseReceipt
  });
  assert.equal(admitted.ok, true, JSON.stringify(admitted));
  assert.equal(admitted.status, 'FRESH_CUSTODIAN_MANIFEST_ADMITTED');
  assert.equal(admitted.taskCount, 40);
  assert.equal(admitted.legacyEvidenceReuse, false);
  assert.equal(admitted.holdoutCommitment.rawHoldoutsStoredInRepository, false);

  const legacy = admitFreshCustodianManifest({
    campaignPlan: prepared,
    sealedManifest,
    custodianReceipt: {
      ...baseReceipt,
      commitmentRef: 'omega-v4://historical-donor',
      tasksPreviouslyEvaluated: true,
      legacyEvidenceReuse: true
    }
  });
  assert.equal(legacy.ok, false);
  assert.ok(legacy.reasonCodes.includes('previously-evaluated-task-reuse-prohibited'));
  assert.ok(legacy.reasonCodes.includes('legacy-evidence-reuse-prohibited'));
});

test('custodian commitment must follow architecture freeze', async () => {
  const prepared = plan();
  const sealedManifest = manifest(40);
  const { sealedManifestCommitmentDigest, sealedCorpusDigestFromManifest } = await import('../src/apex-sealed-tournament.mjs');
  const out = admitFreshCustodianManifest({
    campaignPlan: prepared,
    sealedManifest,
    custodianReceipt: {
      campaignId: prepared.campaignId,
      campaignDigest: prepared.campaignDigest,
      suiteVersion: prepared.suiteVersion,
      manifestDigest: sealedManifestCommitmentDigest(sealedManifest),
      corpusDigest: sealedCorpusDigestFromManifest(sealedManifest),
      taskCount: sealedManifest.length,
      commitmentRef: 'custodian://too-early',
      committedAt: '2026-09-29T00:26:00.000Z',
      sourceFreezeRef: 'source://frozen',
      evaluatorRef: 'evaluator://independent',
      custodianRef: 'custodian://independent',
      rawHoldoutsStoredInRepository: false,
      optimizerAccessBeforeEvaluation: false,
      candidateAccessBeforeEvaluation: false,
      plaintextAnswersExposedBeforeEvaluation: false,
      evaluatorIndependent: true,
      custodianIndependent: true,
      freshlyGeneratedForCampaign: true,
      tasksPreviouslyEvaluated: false,
      tasksDerivedFromPreviouslyEvaluatedItems: false,
      legacyEvidenceReuse: false,
      secretFreeReceipt: true
    }
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('holdout-commitment-must-follow-architecture-freeze'));
});

test('runtime readiness refuses missing live callability/pricing and remains plan-only', async () => {
  const prepared = plan();
  const sealedManifest = manifest(40);
  const { sealedManifestCommitmentDigest, sealedCorpusDigestFromManifest } = await import('../src/apex-sealed-tournament.mjs');
  const admitted = admitFreshCustodianManifest({
    campaignPlan: prepared,
    sealedManifest,
    custodianReceipt: {
      campaignId: prepared.campaignId,
      campaignDigest: prepared.campaignDigest,
      suiteVersion: prepared.suiteVersion,
      manifestDigest: sealedManifestCommitmentDigest(sealedManifest),
      corpusDigest: sealedCorpusDigestFromManifest(sealedManifest),
      taskCount: sealedManifest.length,
      commitmentRef: 'custodian://fresh/apex-fqc-runtime',
      committedAt: COMMIT,
      sourceFreezeRef: 'source://frozen',
      evaluatorRef: 'evaluator://independent',
      custodianRef: 'custodian://independent',
      rawHoldoutsStoredInRepository: false,
      optimizerAccessBeforeEvaluation: false,
      candidateAccessBeforeEvaluation: false,
      plaintextAnswersExposedBeforeEvaluation: false,
      evaluatorIndependent: true,
      custodianIndependent: true,
      freshlyGeneratedForCampaign: true,
      tasksPreviouslyEvaluated: false,
      tasksDerivedFromPreviouslyEvaluatedItems: false,
      legacyEvidenceReuse: false,
      secretFreeReceipt: true
    }
  });
  assert.equal(admitted.ok, true);

  const blocked = assessFreshCampaignRuntimeReadiness({
    campaignPlan: prepared,
    admittedCampaign: admitted
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.some(code => code.includes('missing-runtime-proof:anthropic-claude-opus-5-5')));
  assert.ok(blocked.reasonCodes.some(code => code.includes('missing-pricing-proof:anthropic-claude-opus-5-5')));
  assert.equal(blocked.providerCallsPerformedByThisAssessment, 0);
  assert.equal(blocked.spendUsd, 0);
});

test('runtime readiness accepts exact receipts, including DIRECT proof for ANY_VERIFIED slot, without authorizing execution', async () => {
  const prepared = plan();
  const sealedManifest = manifest(40);
  const { sealedManifestCommitmentDigest, sealedCorpusDigestFromManifest } = await import('../src/apex-sealed-tournament.mjs');
  const admitted = admitFreshCustodianManifest({
    campaignPlan: prepared,
    sealedManifest,
    custodianReceipt: {
      campaignId: prepared.campaignId,
      campaignDigest: prepared.campaignDigest,
      suiteVersion: prepared.suiteVersion,
      manifestDigest: sealedManifestCommitmentDigest(sealedManifest),
      corpusDigest: sealedCorpusDigestFromManifest(sealedManifest),
      taskCount: sealedManifest.length,
      commitmentRef: 'custodian://fresh/apex-fqc-ready',
      committedAt: COMMIT,
      sourceFreezeRef: 'source://frozen',
      evaluatorRef: 'evaluator://independent',
      custodianRef: 'custodian://independent',
      rawHoldoutsStoredInRepository: false,
      optimizerAccessBeforeEvaluation: false,
      candidateAccessBeforeEvaluation: false,
      plaintextAnswersExposedBeforeEvaluation: false,
      evaluatorIndependent: true,
      custodianIndependent: true,
      freshlyGeneratedForCampaign: true,
      tasksPreviouslyEvaluated: false,
      tasksDerivedFromPreviouslyEvaluatedItems: false,
      legacyEvidenceReuse: false,
      secretFreeReceipt: true
    }
  });

  const runtimeReceipts = [
    ['anthropic-claude-opus-5-5', 'anthropic:effort=max', 'DIRECT'],
    ['openai-gpt-6-astra', 'openai:reasoning=max', 'DIRECT'],
    ['deepseek-v4-1-flash', 'deepseek:effort=max', 'DIRECT'],
    ['zai-glm-5-3', 'zai:reasoning=high', 'DIRECT']
  ].map(([candidateId, reasoningSettingRef, transportClass]) => ({
    candidateId,
    reasoningSettingRef,
    transportClass,
    observedAt: OBSERVED,
    evidenceRef: `runtime://${candidateId}`,
    callableNow: true,
    exactModelIdentityMatched: true,
    exactReasoningSettingMatched: true,
    transportVerified: true,
    providerCallObserved: true
  }));

  const pricingReceipts = [
    'anthropic-claude-opus-5-5',
    'openai-gpt-6-astra',
    'deepseek-v4-1-flash',
    'zai-glm-5-3'
  ].map(candidateId => ({
    candidateId,
    pricingMode: 'INTERACTIVE',
    observedAt: OBSERVED,
    evidenceRef: `pricing://${candidateId}`,
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 1,
    cacheReadUsdPerMillion: 0.1,
    officialOrMeteredEvidence: true
  }));

  const ready = assessFreshCampaignRuntimeReadiness({
    campaignPlan: prepared,
    admittedCampaign: admitted,
    runtimeReceipts,
    pricingReceipts
  });

  assert.equal(ready.ok, true, JSON.stringify(ready));
  assert.equal(ready.status, 'FRESH_CAMPAIGN_READY_FOR_SEPARATELY_AUTHORIZED_EXECUTION');
  assert.equal(ready.executionAuthority, 'NONE');
  assert.equal(ready.providerCallAuthority, 'NONE');
  assert.equal(ready.spendAuthority, 'NONE');
  assert.equal(ready.providerCallsPerformedByThisAssessment, 0);
  assert.equal(ready.spendUsd, 0);
  assert.match(ready.readinessDigest, /^[a-f0-9]{64}$/);
});
