export const CURRENT_REALITY_FREEZE_VERSION = 'uberbond.current-reality-freeze.v1.1';

const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const SHA = /^[0-9a-f]{40}$/;

const asSha = value => {
  const out = String(value ?? '').trim().toLowerCase();
  return SHA.test(out) ? out : null;
};

const uniq = values => [...new Set(values.filter(Boolean))];

export function extractArtifactSourceCommit(document = {}) {
  const candidates = [
    document?.sourceCommit,
    document?.sourceSha,
    document?.sourceSHA,
    document?.repository?.head,
    document?.repository?.sha,
    document?.generatedFrom?.sourceCommit,
    document?.metadata?.sourceCommit
  ];
  return candidates.map(asSha).find(Boolean) || null;
}

export function extractPresentTenseMainClaims(handoff = {}) {
  const claims = [];
  const currentTruthMain = asSha(handoff?.currentTruth?.main);
  if (currentTruthMain) claims.push({
    pointer: 'currentTruth.main',
    sha: currentTruthMain,
    semantics: 'PRESENT_TENSE_SOURCE_BASE'
  });

  const activeMission = String(handoff?.activeMission ?? '');
  const missionMatch = activeMission.match(/(?:exact\s+)?current\s+main\s+([0-9a-f]{40})/i);
  const missionSha = asSha(missionMatch?.[1]);
  if (missionSha) claims.push({
    pointer: 'activeMission.currentMain',
    sha: missionSha,
    semantics: 'PRESENT_TENSE_SOURCE_BASE'
  });

  return claims;
}

function classifySourceBinding({ sha, headSha, sourceChangedSince = null } = {}) {
  if (sha === headSha) return 'CURRENT_EXACT_HEAD';
  if (sourceChangedSince === false) return 'CURRENT_SOURCE_EQUIVALENT';
  if (sourceChangedSince === true) return 'STALE_SOURCE_CHANGED';
  return 'UNKNOWN_HISTORY_NOT_PROVEN';
}

export function classifyGeneratedArtifact({
  id,
  document,
  headSha,
  sourceChangedSince = null
} = {}) {
  const sourceCommit = extractArtifactSourceCommit(document);
  if (!sourceCommit) {
    return {
      id,
      sourceCommit: null,
      status: 'UNKNOWN_MISSING_SOURCE_BINDING',
      sourceChangedSince: null
    };
  }
  return {
    id,
    sourceCommit,
    status: classifySourceBinding({ sha: sourceCommit, headSha, sourceChangedSince }),
    sourceChangedSince: sourceCommit === headSha ? false : sourceChangedSince
  };
}

export function compileCurrentRealityFreeze({
  headSha,
  branch = null,
  workingTreeClean = null,
  handoff = {},
  readiness = {},
  coverage = {},
  orchestrator = {},
  sourceChangedByPresentClaim = {},
  sourceChangedByArtifact = {}
} = {}) {
  const head = asSha(headSha);
  if (!head) {
    return {
      ok: false,
      version: CURRENT_REALITY_FREEZE_VERSION,
      status: 'FREEZE_INPUT_INVALID',
      reasonCodes: ['valid-head-sha-required'],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  const presentTenseClaims = extractPresentTenseMainClaims(handoff).map(row => ({
    ...row,
    status: classifySourceBinding({
      sha: row.sha,
      headSha: head,
      sourceChangedSince: sourceChangedByPresentClaim[row.pointer] ?? null
    })
  }));
  const stalePresentTenseClaims = presentTenseClaims.filter(row => row.status === 'STALE_SOURCE_CHANGED');
  const unknownPresentTenseClaims = presentTenseClaims.filter(row => row.status === 'UNKNOWN_HISTORY_NOT_PROVEN');

  const artifacts = [
    classifyGeneratedArtifact({
      id: 'system-readiness',
      document: readiness,
      headSha: head,
      sourceChangedSince: sourceChangedByArtifact['system-readiness'] ?? null
    }),
    classifyGeneratedArtifact({
      id: 'sovereign-coverage',
      document: coverage,
      headSha: head,
      sourceChangedSince: sourceChangedByArtifact['sovereign-coverage'] ?? null
    })
  ];

  const staleArtifacts = artifacts.filter(row => row.status === 'STALE_SOURCE_CHANGED');
  const unknownArtifacts = artifacts.filter(row => row.status.startsWith('UNKNOWN_'));

  const planningObservedMain = asSha(
    handoff?.latestOrchestrationCheckpoint?.observedMain
      ?? orchestrator?.checkpoint?.observedMain
      ?? orchestrator?.finalRealization?.observedMain
  );
  const handoffDocumentSourceCommit = asSha(handoff?.sourceCommit);

  const reasonCodes = [];
  if (stalePresentTenseClaims.length) reasonCodes.push('handoff-present-tense-source-changed-since-claim');
  if (unknownPresentTenseClaims.length) reasonCodes.push('handoff-present-tense-freshness-unknown');
  if (staleArtifacts.length) reasonCodes.push('generated-artifacts-stale-after-source-change');
  if (unknownArtifacts.length) reasonCodes.push('generated-artifact-freshness-unknown');
  if (workingTreeClean === false) reasonCodes.push('working-tree-not-clean');

  let status = 'CURRENT_REALITY_FROZEN';
  let ok = true;
  if (stalePresentTenseClaims.length) {
    status = 'CURRENT_REALITY_REFUSED__PRESENT_TENSE_SOURCE_CHANGED';
    ok = false;
  } else if (unknownPresentTenseClaims.length) {
    status = 'CURRENT_REALITY_FROZEN__PRESENT_TENSE_FRESHNESS_UNKNOWN';
  } else if (staleArtifacts.length) {
    status = 'CURRENT_REALITY_FROZEN__STALE_GENERATED_ARTIFACTS';
  } else if (unknownArtifacts.length) {
    status = 'CURRENT_REALITY_FROZEN__ARTIFACT_FRESHNESS_UNKNOWN';
  }

  return {
    ok,
    version: CURRENT_REALITY_FREEZE_VERSION,
    status,
    head: {
      sha: head,
      branch: branch ? String(branch) : null,
      workingTreeClean: typeof workingTreeClean === 'boolean' ? workingTreeClean : null
    },
    handoff: {
      presentTenseMainClaims: presentTenseClaims,
      stalePresentTenseClaims,
      unknownPresentTenseClaims,
      documentSourceCommit: handoffDocumentSourceCommit,
      planningObservedMain,
      planningObservationIsHistorical: Boolean(planningObservedMain && planningObservedMain !== head),
      note: 'A truth-only commit cannot name its own future SHA. Present-tense source claims may be older than HEAD only when Git proves no relevant source/canon change since that claim. Planning-observation SHAs are provenance and may be historical.'
    },
    generatedArtifacts: artifacts,
    staleGeneratedArtifactIds: staleArtifacts.map(row => row.id),
    unknownGeneratedArtifactIds: unknownArtifacts.map(row => row.id),
    reasonCodes: uniq(reasonCodes),
    closureBoundary: {
      sourceTruth: stalePresentTenseClaims.length
        ? 'REFUSED_SOURCE_CHANGED'
        : unknownPresentTenseClaims.length
          ? 'UNKNOWN'
          : 'PINNED_TO_HEAD_OR_PROVEN_SOURCE_EQUIVALENT',
      generatedTruth: staleArtifacts.length
        ? 'STALE_REGENERATION_REQUIRED'
        : unknownArtifacts.length
          ? 'UNKNOWN'
          : 'CURRENT_OR_SOURCE_EQUIVALENT',
      runtimeTruth: 'NOT_INFERRED_FROM_REPOSITORY_FREEZE',
      externalOutcomeTruth: 'NOT_INFERRED_FROM_REPOSITORY_FREEZE'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
