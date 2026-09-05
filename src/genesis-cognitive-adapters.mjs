import { compileCognitiveEvent } from './uberbond-cognitive-bus.mjs';

export const GENESIS_COGNITIVE_ADAPTER_VERSION = 'genesis-cognitive-adapters-1.0.0';

function text(value, max = 1800) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function integer(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}
function ref(value, fallback) {
  return text(value, 1500) || fallback;
}

export function eventFromGenesisEvolution(artifact, { evidenceRef = 'artifact:genesis-evolution-latest' } = {}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return null;
  const summary = artifact.summary || {};
  return compileCognitiveEvent({
    kind: 'IDEA_CANDIDATE',
    sourceNodeId: 'genesis-evolution',
    subjectType: 'EVOLUTION_BATCH',
    subjectId: `genesis-evolution:${text(artifact.generatedAt, 100) || 'latest'}`,
    summary: `Genesis Evolution compiled ${integer(summary.cycles)} cycles with ${integer(summary.generatedHypotheses)} generated hypotheses, ${integer(summary.impossibleTasksReopenedForReview)} impossible-task revalidation candidates, and ${integer(summary.antiUberBondChallenges)} anti-UberBond challenges. These are invention/falsification candidates, not demand or approved product decisions.`,
    evidenceRefs: [ref(evidenceRef, 'artifact:genesis-evolution-latest')],
    truthClass: 'RESEARCH_ASSET',
    observedAt: artifact.generatedAt
  });
}

export function eventFromGenesisScientist(artifact, { evidenceRef = 'artifact:genesis-scientist-latest' } = {}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return null;
  const summary = artifact.summary || {};
  return compileCognitiveEvent({
    kind: 'GENESIS_SCIENTIST_AGENDA',
    sourceNodeId: 'genesis-scientist',
    subjectType: 'SCIENTIST_BATCH',
    subjectId: `genesis-scientist:${text(artifact.generatedAt, 100) || 'latest'}`,
    summary: `Genesis Scientist prepared ${integer(summary.laboratories)} laboratories (${integer(summary.ready)} ready), ${integer(summary.syntheticWorlds)} counterfactual worlds, and ${integer(summary.syntheticFutureMemories)} synthetic future memories. These are falsifiable research designs and counterfactuals, not causal or market proof.`,
    evidenceRefs: [ref(evidenceRef, 'artifact:genesis-scientist-latest')],
    truthClass: 'RESEARCH_ASSET',
    observedAt: artifact.generatedAt
  });
}

export function eventFromGenesisOntology(artifact, { evidenceRef = 'artifact:genesis-ontology-latest' } = {}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return null;
  const summary = artifact.summary || {};
  const unresolved = artifact.unresolvedInputCounts || {};
  return compileCognitiveEvent({
    kind: 'ONTOLOGY_CANDIDATE',
    sourceNodeId: 'genesis-ontology',
    subjectType: 'ONTOLOGY_BATCH',
    subjectId: `genesis-ontology:${text(artifact.generatedAt, 100) || 'latest'}`,
    summary: `Genesis Ontology proposed ${integer(summary.candidateConcepts)} candidate concepts and ${integer(summary.generatedQuestions)} research questions from ${integer(unresolved.unknowns)} unknowns, ${integer(unresolved.anomalies)} anomalies, and ${integer(unresolved.contradictions)} contradictions. Candidate vocabulary is not canonical fact until separately evidenced and useful.`,
    evidenceRefs: [ref(evidenceRef, 'artifact:genesis-ontology-latest')],
    truthClass: 'RESEARCH_ASSET',
    observedAt: artifact.generatedAt
  });
}

export function eventFromGenesisMetabolism(artifact, { evidenceRef = 'artifact:genesis-metabolism-latest' } = {}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return null;
  const inputCounts = artifact.inputCounts && typeof artifact.inputCounts === 'object' ? artifact.inputCounts : {};
  const organs = artifact.organs && typeof artifact.organs === 'object' ? artifact.organs : {};
  const statuses = Object.entries(organs).map(([name, value]) => `${name}:${text(value?.status, 100) || 'UNKNOWN'}`).slice(0, 20).join(', ');
  return compileCognitiveEvent({
    kind: 'METABOLISM_UPDATE',
    sourceNodeId: 'genesis-metabolism',
    subjectType: 'METABOLIC_BATCH',
    subjectId: `genesis-metabolism:${text(artifact.generatedAt, 100) || 'latest'}`,
    summary: `Genesis Metabolism integrated the current frontier organs with input counts ${JSON.stringify(inputCounts).slice(0, 900)} and organ statuses [${statuses || 'none'}]. This is internal consolidation and prioritization evidence, not external commercial truth.`,
    evidenceRefs: [ref(evidenceRef, 'artifact:genesis-metabolism-latest')],
    truthClass: 'RESEARCH_ASSET',
    observedAt: artifact.generatedAt
  });
}

export function compileGenesisLobeEvents({ evolution = null, scientist = null, ontology = null, metabolism = null, refs = {} } = {}) {
  const events = [
    eventFromGenesisEvolution(evolution, { evidenceRef: refs.evolution }),
    eventFromGenesisScientist(scientist, { evidenceRef: refs.scientist }),
    eventFromGenesisOntology(ontology, { evidenceRef: refs.ontology }),
    eventFromGenesisMetabolism(metabolism, { evidenceRef: refs.metabolism })
  ].filter(Boolean);
  return {
    ok: events.every(event => event?.ok),
    policyVersion: GENESIS_COGNITIVE_ADAPTER_VERSION,
    status: events.every(event => event?.ok) ? 'GENESIS_COGNITIVE_EVENTS_READY' : 'GENESIS_COGNITIVE_EVENT_REJECTED',
    events,
    eventCount: events.length,
    businessEffectAuthority: 'NONE'
  };
}
