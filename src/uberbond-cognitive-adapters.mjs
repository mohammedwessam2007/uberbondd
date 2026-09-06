import { compileCognitiveEvent } from './uberbond-cognitive-bus.mjs';

export const UBERBOND_COGNITIVE_ADAPTER_POLICY_VERSION = 'uberbond-cognitive-adapters-1.1.0';

function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function integer(value, fallback = 0) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}
function stamp(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
function artifactRef(value, fallback) {
  return text(value, 1500) || fallback;
}

export function eventFromGamechangerArtifact(artifact, { ref = 'artifact:gamechanger-mesh-latest' } = {}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return null;
  const signals = Array.isArray(artifact.frontierSignals) ? artifact.frontierSignals.length : integer(artifact?.summary?.frontierSignals);
  const packets = Array.isArray(artifact.intelligencePackets) ? artifact.intelligencePackets.length : integer(artifact?.summary?.intelligencePackets);
  return compileCognitiveEvent({
    kind: 'GAMECHANGER_CANDIDATE',
    sourceNodeId: 'gamechanger',
    subjectType: 'FRONTIER_BATCH',
    subjectId: `gamechanger:${text(artifact.generatedAt, 100) || 'latest'}`,
    summary: `Gamechanger frontier batch contains ${signals} signals and ${packets} intelligence packets for downstream GENESIS, mechanism and opportunity reasoning.`,
    evidenceRefs: [artifactRef(ref, 'artifact:gamechanger-mesh-latest')],
    truthClass: 'RESEARCH_ASSET',
    observedAt: stamp(artifact.generatedAt)
  });
}

export function eventFromGenesisArtifact(artifact, { ref = 'artifact:perpetual-frontier-genesis-latest' } = {}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return null;
  const cycles = Array.isArray(artifact.cycles) ? artifact.cycles.length : integer(artifact?.summary?.cycles);
  const successful = integer(artifact?.summary?.successful);
  const resurrection = integer(artifact?.summary?.resurrectionReviewCandidates);
  return compileCognitiveEvent({
    kind: 'GENESIS_HYPOTHESIS',
    sourceNodeId: 'genesis',
    subjectType: 'GENESIS_BATCH',
    subjectId: `genesis:${text(artifact.generatedAt, 100) || 'latest'}`,
    summary: `GENESIS compiled ${cycles} cycles (${successful} successful) with ${resurrection} resurrection-review candidates for evolution, idea generation and opportunity allocation.`,
    evidenceRefs: [artifactRef(ref, 'artifact:perpetual-frontier-genesis-latest')],
    truthClass: 'RESEARCH_ASSET',
    observedAt: stamp(artifact.generatedAt)
  });
}

export function eventFromCapabilityGenomeResult(result, { ref = 'artifact:capability-genome' } = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const status = text(result.status, 160) || 'UNKNOWN';
  const state = result.state && typeof result.state === 'object' && !Array.isArray(result.state) ? result.state : {};
  const repositoryCandidates = integer(state.worldRepositoryCandidateCount ?? result.worldRepositoryCandidateCount);
  const skillBodies = integer(state.worldSkillBodyCount ?? result.worldSkillBodyCount);
  const normalized = integer(state.worldCapabilityRecordsNormalized ?? state.capabilityRecordCount ?? result.capabilityRecordCount);
  const approved = integer(state.approvedCapabilityCount ?? result.approvedCapabilityCount ?? result.approvedCount);
  const active = integer(state.activeCapabilityCount ?? result.activeCapabilityCount ?? result.activeCount);
  const revoked = integer(state.revokedCapabilityCount ?? result.revokedCapabilityCount);
  const unhealthy = result.ok === false || /UNHEALTHY|GAP|MISSING|BLOCKED|DEGRADED|REVOKED|INVALID|FAILED/i.test(status);
  const kind = unhealthy ? 'CAPABILITY_GAP' : 'CAPABILITY_CANDIDATE';
  return compileCognitiveEvent({
    kind,
    sourceNodeId: 'capability-genome',
    subjectType: 'CAPABILITY_BATCH',
    subjectId: `capability-genome:${status.toLowerCase()}`,
    summary: `Capability Genome status ${status}: ${repositoryCandidates} measured repository candidates, ${skillBodies} imported skill bodies, ${normalized} normalized capability records, ${approved} approved, ${active} active, ${revoked} revoked. ${unhealthy ? 'Route the evidenced gap to acquisition, Wallbreaker and adversarial review.' : 'Route candidates to capability economics, specialist selection and adversarial evaluation without treating discovery or normalization as approval.'}`,
    evidenceRefs: [artifactRef(ref, 'artifact:capability-genome')],
    truthClass: result.ok === true ? 'VERIFIED_CURRENT' : 'RESEARCH_ASSET',
    observedAt: stamp(result.evaluatedAt ?? state.lastRefresh)
  });
}

export function eventFromSelfMaintenanceResult(result, { ref = 'receipt:self-maintainer' } = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const ok = result.ok === true;
  const status = text(result.status, 160) || 'UNKNOWN';
  const kind = ok && /VERIFIED|PROMOTED/i.test(status) ? 'VERIFICATION_RESULT' : 'BLOCKER';
  return compileCognitiveEvent({
    kind,
    sourceNodeId: 'self-maintainer',
    subjectType: 'ENGINEERING_CYCLE',
    subjectId: text(result.changeSetId, 300) || text(result?.observedChangeSet?.changeSetId, 300) || `self-maintainer:${status.toLowerCase()}`,
    summary: `Trusted self-maintainer cycle status ${status}. ${ok ? 'Feed verified engineering evidence back into science, architecture and economic learning.' : 'Escalate the blocker to Wallbreaker and MAX Council without blind retry.'}`,
    evidenceRefs: [artifactRef(ref, 'receipt:self-maintainer')],
    truthClass: ok ? 'VERIFIED_CURRENT' : 'RESEARCH_ASSET'
  });
}

export function eventFromCommercialOutcome(outcome, { ref = 'receipt:commercial-outcome' } = {}) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return null;
  const subjectId = text(outcome.id ?? outcome.outcomeId ?? outcome.experimentId, 300) || 'commercial-outcome:latest';
  const summary = text(outcome.summary, 3000) || 'Observed commercial outcome available for opportunity, capability and allocation learning.';
  return compileCognitiveEvent({
    kind: 'COMMERCIAL_OUTCOME',
    sourceNodeId: 'payment-reconciliation',
    subjectType: 'COMMERCIAL_OUTCOME',
    subjectId,
    summary,
    evidenceRefs: [artifactRef(ref, 'receipt:commercial-outcome')],
    truthClass: text(outcome.truthClass, 80) || 'VERIFIED_CURRENT',
    observedAt: stamp(outcome.observedAt)
  });
}

export function compileCognitiveEventsFromArtifacts({
  gamechanger = null,
  genesis = null,
  capabilityGenome = null,
  selfMaintenance = null,
  commercialOutcome = null,
  refs = {}
} = {}) {
  const events = [
    eventFromGamechangerArtifact(gamechanger, { ref: refs.gamechanger }),
    eventFromGenesisArtifact(genesis, { ref: refs.genesis }),
    eventFromCapabilityGenomeResult(capabilityGenome, { ref: refs.capabilityGenome }),
    eventFromSelfMaintenanceResult(selfMaintenance, { ref: refs.selfMaintenance }),
    eventFromCommercialOutcome(commercialOutcome, { ref: refs.commercialOutcome })
  ].filter(Boolean);
  return {
    ok: events.every(event => event?.ok),
    policyVersion: UBERBOND_COGNITIVE_ADAPTER_POLICY_VERSION,
    status: events.every(event => event?.ok) ? 'COGNITIVE_ARTIFACT_EVENTS_READY' : 'COGNITIVE_ARTIFACT_EVENT_REJECTED',
    events,
    eventCount: events.length,
    businessEffectAuthority: 'NONE'
  };
}
