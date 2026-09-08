export const CURRENT_REALITY_FREEZE_VERSION = 'uberbond.current-reality-freeze.v1';

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
    semantics: 'PRESENT_TENSE_MAIN'
  });

  const activeMission = String(handoff?.activeMission ?? '');
  const missionMatch = activeMission.match(/(?:exact\s+)?current\s+main\s+([0-9a-f]{40})/i);
  const missionSha = asSha(missionMatch?.[1]);
  if (missionSha) claims.push({
    pointer: 'activeMission.currentMain',
    sha: missionSha,
    semantics: 'PRESENT_TENSE_MAIN'
  });

  return claims;
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
  if (sourceCommit === headSha) {
    return {
      id,
      sourceCommit,
      status: 'CURRENT_EXACT_HEAD',
      sourceChangedSince: false
    };
  }
  if (sourceChangedSince === false) {
    return {
      id,
      sourceCommit,
      status: 'CURRENT_SOURCE_EQUIVALENT',
      sourceChangedSince: false
    };
  }
  if (sourceChangedSince === true) {
    return {
      id,
      sourceCommit,
      status: 'STALE_SOURCE_CHANGED',
      sourceChangedSince: true
    };
  }
  return {
    id,
    sourceCommit,
    status: 'UNKNOWN_HISTORY_NOT_PROVEN',
    sourceChangedSince: null
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

  const presentTenseClaims = extractPresentTenseMainClaims(handoff);
  const stalePresentTenseClaims = presentTenseClaims.filter(row => row.sha !== head);

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
  if (stalePresentTenseClaims.length) reasonCodes.push('handoff-present-tense-main-contradicts-head');
  if (staleArtifacts.length) reasonCodes.push('generated-artifacts-stale-after-source-change');
  if (unknownArtifacts.length) reasonCodes.push('generated-artifact-freshness-unknown');
  if (workingTreeClean === false) reasonCodes.push('working-tree-not-clean');

  let status = 'CURRENT_REALITY_FROZEN';
  let ok = true;
  if (stalePresentTenseClaims.length) {
    status = 'CURRENT_REALITY_REFUSED__PRESENT_TENSE_CONTRADICTION';
    ok = false;
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
      presentTenseMainClaims,
      stalePresentTenseClaims,
      documentSourceCommit: handoffDocumentSourceCommit,
      planningObservedMain,
      planningObservationIsHistorical: Boolean(planningObservedMain && planningObservedMain !== head),
      note: 'Planning-observation SHAs are provenance and may be historical. Only fields that claim present-tense current main are required to equal HEAD.'
    },
    generatedArtifacts: artifacts,
    staleGeneratedArtifactIds: staleArtifacts.map(row => row.id),
    unknownGeneratedArtifactIds: unknownArtifacts.map(row => row.id),
    reasonCodes: uniq(reasonCodes),
    closureBoundary: {
      sourceTruth: stalePresentTenseClaims.length ? 'REFUSED' : 'PINNED_TO_HEAD',
      generatedTruth: staleArtifacts.length ? 'STALE_REGENERATION_REQUIRED' : unknownArtifacts.length ? 'UNKNOWN' : 'CURRENT_OR_SOURCE_EQUIVALENT',
      runtimeTruth: 'NOT_INFERRED_FROM_REPOSITORY_FREEZE',
      externalOutcomeTruth: 'NOT_INFERRED_FROM_REPOSITORY_FREEZE'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
