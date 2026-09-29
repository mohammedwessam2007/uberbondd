import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compilePreInferenceRoleAuction,
  decideAdaptiveExpansion,
  compileAdversarialSynthesis,
  compileLosslessFrontierDeltaPacket,
  compileExactCacheDecision,
  governMonthlyCognitionBudget,
  compileOpenRouterProviderPolicy,
  compileSpeculativeReadOnlyPlan,
  compileShadowEscalationThresholdCandidate
} from '../src/frontier-quality-market-compiler.mjs';

const sha = char => char.repeat(64);
const candidate = ({ id, model, lineage, correlationGroup, quality, reliability = 0.95, confidence = 0.95, input, output }) => ({
  candidateId: id,
  model,
  lineage,
  errorCorrelationGroup: correlationGroup,
  taskClasses: ['research'],
  qualityEvidence: { score: quality, reliability, evidenceConfidence: confidence },
  pricing: {
    inputUsdPerMillion: input,
    outputUsdPerMillion: output,
    sourceRef: `pricing://${id}`,
    verifiedAt: '2026-09-29T12:00:00.000Z'
  }
});

test('pre-inference auction prefers evidence-backed cheap quality while preserving error diversity', () => {
  const out = compilePreInferenceRoleAuction({
    taskClass: 'research',
    initialAgentCount: 2,
    maximumAgentCount: 6,
    candidates: [
      candidate({ id: 'mimo-a', model: 'xiaomi/mimo-flash', lineage: 'xiaomi', correlationGroup: 'mimo', quality: 0.88, input: 0.07, output: 0.14 }),
      candidate({ id: 'mimo-b', model: 'xiaomi/mimo-pro', lineage: 'xiaomi', correlationGroup: 'mimo', quality: 0.94, input: 0.2175, output: 0.435 }),
      candidate({ id: 'deep', model: 'deepseek/v4.1-flash', lineage: 'deepseek', correlationGroup: 'deepseek', quality: 0.91, input: 0.15, output: 0.60 }),
      candidate({ id: 'qwen', model: 'qwen/qwen-flash', lineage: 'qwen', correlationGroup: 'qwen', quality: 0.90, input: 0.11, output: 0.38 })
    ]
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.initialAgents.length, 2);
  assert.equal(new Set(out.initialAgents.map(x => x.correlationGroup)).size, 2);
  assert.equal(out.authority, 'EXPLORATION_ONLY');
});

test('adaptive N stops cheap search only without granting semantic authority and escalates at ceiling', () => {
  const easy = decideAdaptiveExpansion({ currentAgentCount: 2, maximumAgentCount: 16, disagreement: 0, uncertainty: 0.1 });
  assert.equal(easy.status, 'CHEAP_SWARM_STOP_SEARCH');
  assert.equal(easy.semanticAuthority, 'NONE');

  const hard = decideAdaptiveExpansion({ currentAgentCount: 4, maximumAgentCount: 16, disagreement: 0.9, uncertainty: 0.8 });
  assert.equal(hard.status, 'EXPAND_CHEAP_SWARM');
  assert.ok(hard.nextAgentCount > 4);

  const ceiling = decideAdaptiveExpansion({ currentAgentCount: 16, maximumAgentCount: 16, disagreement: 0.9, uncertainty: 0.9 });
  assert.equal(ceiling.status, 'ESCALATE_TO_FRONTIER_CROWN');
  assert.equal(ceiling.semanticAuthority, 'FRONTIER_ONLY');
});

test('Adversarial Synthesis preserves minority claims and has zero self-certification authority', () => {
  const out = compileAdversarialSynthesis({
    claimIds: ['C1', 'C2', 'C3'],
    minorityClaimIds: ['C3'],
    disputedClaimIds: ['C2'],
    evidenceRefs: ['evidence://1'],
    artifactRefs: ['artifact://1']
  });
  assert.equal(out.ok, true);
  assert.ok(out.roles.includes('MINORITY_PRESERVER'));
  assert.deepEqual(out.minorityClaimIds, ['C3']);
  assert.equal(out.majorityVoteAuthority, 'NONE');
  assert.equal(out.synthesisAuthority, 'NONE');
});

test('frontier delta packet is exact/reference-only and refuses oversized inline payloads', () => {
  const out = compileLosslessFrontierDeltaPacket({
    missionId: 'mission-1',
    baselineArtifactDigest: sha('a'),
    claimRecords: [
      { claimId: 'C1', exactClaim: 'Stable claim', state: 'VERIFIED', evidenceRefs: ['e://1'] },
      { claimId: 'C2', exactClaim: 'Disputed exact proposition', state: 'DISPUTED', evidenceRefs: ['e://2'] }
    ],
    unresolvedClaimIds: ['C2'],
    evidenceRefs: ['e://2'],
    artifactRefs: ['artifact://baseline']
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.compressionClass, 'LOSSLESS_REFERENCE_AND_EXACT_DELTA_ONLY');
  assert.equal(out.lossySummarizationAuthorized, false);
  assert.deepEqual(out.packet.unresolvedClaims.map(x => x.claimId), ['C2']);

  const tooLarge = compileLosslessFrontierDeltaPacket({
    missionId: 'mission-2',
    baselineArtifactDigest: sha('b'),
    claimRecords: [{ claimId: 'C', exactClaim: 'x'.repeat(5000), state: 'DISPUTED', evidenceRefs: [] }],
    unresolvedClaimIds: ['C'],
    maximumInlineBytes: 256
  });
  assert.equal(tooLarge.ok, false);
  assert.ok(tooLarge.reasonCodes.includes('frontier-delta-inline-budget-exceeded-use-artifact-references'));
});

test('semantic cache never becomes authority; exact request+state match may be reused', () => {
  const exact = compileExactCacheDecision({
    requestDigest: sha('a'),
    sourceStateDigest: sha('b'),
    cachedRequestDigest: sha('a'),
    cachedSourceStateDigest: sha('b'),
    dataClass: 'PUBLIC'
  });
  assert.equal(exact.reusableAsAuthority, true);
  assert.equal(exact.responseCacheEligible, true);

  const semantic = compileExactCacheDecision({
    requestDigest: sha('a'),
    sourceStateDigest: sha('b'),
    cachedRequestDigest: sha('a'),
    cachedSourceStateDigest: sha('b'),
    semanticSimilarityOnly: true
  });
  assert.equal(semantic.status, 'SEMANTIC_CACHE_SHADOW_ONLY');
  assert.equal(semantic.reusableAsAuthority, false);
});

test('$20 budget pressure queues work instead of buying lower quality', () => {
  const out = governMonthlyCognitionBudget({
    monthlyBudgetUsd: 20,
    spentUsd: 19.5,
    reservedUsd: 0.4,
    proposedUsd: 0.5,
    frontierQualityRequired: true
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'QUEUE_FOR_BUDGET_NOT_QUALITY_DOWNGRADE');
  assert.equal(out.qualityAction, 'DO_NOT_DOWNGRADE');
  assert.ok(out.allowedPressureRelief.includes('QUEUE'));
  assert.ok(out.forbiddenPressureRelief.includes('WEAKER_MODEL_AS_FINAL_AUTHORITY'));
});

test('OpenRouter provider policy permits same-model price routing but not model substitution', () => {
  const out = compileOpenRouterProviderPolicy({
    sort: 'price',
    requireZdr: true,
    allowProviderFallbacks: true,
    maxPromptUsdPerMillion: 1,
    maxCompletionUsdPerMillion: 2,
    sessionId: 'mission-abc'
  });
  assert.equal(out.ok, true);
  assert.equal(out.provider.sort, 'price');
  assert.equal(out.provider.zdr, true);
  assert.equal(out.provider.data_collection, 'deny');
  assert.equal(out.modelFallbacks, 'PROHIBITED_UNLESS_SEPARATELY_ZERO_LOSS_CERTIFIED');
  assert.equal(out.providerFailoverScope, 'SAME_MODEL_ONLY');
});


test('speculative execution is limited to read-only reversible work', () => {
  const safe = compileSpeculativeReadOnlyPlan({
    missionId: 'm1',
    operations: [
      { operationId: 'r1', kind: 'FILE_READ', targetRef: 'file://artifact', readOnly: true, reversible: true },
      { operationId: 'r2', kind: 'TEST_RUN', targetRef: 'repo://tests', readOnly: true, reversible: true }
    ]
  });
  assert.equal(safe.ok, true);
  assert.equal(safe.consequenceAuthority, 'NONE');

  const unsafe = compileSpeculativeReadOnlyPlan({
    missionId: 'm2',
    operations: [{ operationId: 'x', kind: 'DEPLOY', targetRef: 'prod://service', readOnly: false, reversible: false }]
  });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.reasonCodes.includes('only-read-only-reversible-speculation-allowed'));
});

test('online threshold optimization stays shadow-only until canonical zero-loss evidence exists', () => {
  const out = compileShadowEscalationThresholdCandidate({
    taskClass: 'research',
    disagreementThreshold: 0.2,
    uncertaintyThreshold: 0.3,
    minimumSamples: 500,
    evidenceRef: 'experiment://threshold-candidate'
  });
  assert.equal(out.ok, true);
  assert.equal(out.routingAuthority, 'SHADOW_ONLY');
  assert.equal(out.promotionAuthority, 'NONE');
  assert.ok(out.requiredPromotionEvidence.includes('canonical zero-loss certificate'));
});
