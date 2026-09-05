import { compileCognitiveEvent } from './uberbond-cognitive-bus.mjs';

export const WHOLE_BRAIN_COGNITIVE_ADAPTER_VERSION = 'uberbond.whole-brain-cognitive-adapters-1.1.0';

function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function count(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

export function eventFromFeatureGenome(genome, { ref = 'artifact:uberbond-feature-genome-latest' } = {}) {
  if (!genome || typeof genome !== 'object' || genome.ok !== true) return null;
  const digest = text(genome.genomeDigest, 128) || 'unknown';
  const artifacts = count(genome.repositoryArtifactCount);
  const edges = count(genome.sourceDependencyEdgeCount);
  const capabilities = count(genome.readinessCapabilityCount);
  const ideas = count(genome.genesisIdeaCount);
  const donors = count(genome.donorLineageCount);
  const fallback = count(genome.fallbackArtifactCount);
  return compileCognitiveEvent({
    kind: 'FEATURE_COVERAGE',
    sourceNodeId: 'context-spine',
    subjectType: 'FEATURE_GENOME',
    subjectId: `feature-genome:${digest.slice(0, 24)}`,
    summary: `Whole-repository Feature Genome indexes ${artifacts} repository artifacts, ${edges} real source dependency edges, ${capabilities} readiness capabilities, ${ideas} GENESIS ideas and ${donors} donor lineages. ${fallback} artifacts remain on the explicit semantic-review fallback queue; this is routing metadata, not evidence that those features are behaviorally understood or live.`,
    evidenceRefs: [ref],
    payloadRef: ref,
    truthClass: 'VERIFIED_CURRENT'
  });
}

export function eventFromFrontierModelTeamDoctor(report, { ref = 'artifact:frontier-model-team-doctor-latest' } = {}) {
  if (!report || typeof report !== 'object') return null;
  const valid = report?.candidateRegistry?.ok === true;
  const candidates = count(report?.candidateRegistry?.candidateCount);
  const configured = count(report?.configuredCandidateCount);
  const callable = count(report?.callableCandidateCount);
  const gaps = Array.isArray(report?.roleCoverage?.gaps) ? report.roleCoverage.gaps.length : 0;
  if (!valid) {
    return compileCognitiveEvent({
      kind: 'BLOCKER',
      sourceNodeId: 'open-model-universe',
      subjectType: 'FRONTIER_MODEL_TEAM',
      subjectId: 'frontier-model-team:registry-invalid',
      summary: 'Frontier model candidate registry failed its local contract. Treat this as a model-supply control-plane blocker, not as evidence that any provider or model is unavailable.',
      evidenceRefs: [ref],
      payloadRef: ref,
      truthClass: 'VERIFIED_CURRENT'
    });
  }
  return compileCognitiveEvent({
    kind: 'FRONTIER_MODEL_ROSTER',
    sourceNodeId: 'open-model-universe',
    subjectType: 'FRONTIER_MODEL_TEAM',
    subjectId: `frontier-model-team:${text(report?.teamMission?.missionDigest, 128)?.slice(0, 24) || 'latest'}`,
    summary: `Frontier model universe contains ${candidates} researched candidates, ${configured} identity-matched configured profiles and ${callable} callability-proven candidates in this doctor. Role-prior gaps: ${gaps}. Catalog membership never creates runtime authority; live routing still requires exact profile, pricing, callability and task benchmark evidence.`,
    evidenceRefs: [ref],
    payloadRef: ref,
    truthClass: 'RESEARCH_ASSET'
  });
}

export function eventFromComputeSovereignty(report, { ref = 'artifact:compute-sovereignty-doctor-latest' } = {}) {
  if (!report || typeof report !== 'object') return null;
  const admissible = count(report.admissibleOfferCount);
  const rejected = count(report.rejectedOfferCount);
  const freeTokens = count(report.zeroCostTokens);
  const paidTokens = count(report.paidTokens);
  if (!admissible) {
    return compileCognitiveEvent({
      kind: 'CAPABILITY_GAP',
      sourceNodeId: 'open-model-universe',
      subjectType: 'COMPUTE_CAPACITY',
      subjectId: 'compute-sovereignty:no-proven-supply',
      summary: `Compute Sovereignty observed no provenanced authorized compute supply in this runtime. Rejected offers: ${rejected}. This is a capacity gap to solve through lawful local/open/free/sponsored/paid supply discovery, caching, compression and routing; it is not permission to evade quotas, billing or provider controls.`,
      evidenceRefs: [ref],
      payloadRef: ref,
      truthClass: 'VERIFIED_CURRENT'
    });
  }
  return compileCognitiveEvent({
    kind: 'CAPABILITY_CANDIDATE',
    sourceNodeId: 'open-model-universe',
    subjectType: 'COMPUTE_CAPACITY',
    subjectId: `compute-sovereignty:${admissible}:${freeTokens}:${paidTokens}`,
    summary: `Compute Sovereignty observed ${admissible} admissible supply offers representing ${freeTokens} zero-cost authorized tokens and ${paidTokens} paid-capacity tokens in the supplied capacity window. Supply remains revision-, rights-, provenance- and task-bound; token reuse/compression may reduce fresh demand but never creates provider quota.`,
    evidenceRefs: [ref],
    payloadRef: ref,
    truthClass: 'VERIFIED_RUNTIME'
  });
}
