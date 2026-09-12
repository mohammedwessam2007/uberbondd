import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  compileCognitiveEvent as compileCanonicalCognitiveEvent,
  UBERBOND_COGNITIVE_EVENT_SCHEMA
} from './uberbond-cognitive-bus.mjs';

export const SOVEREIGN_CONTEXT_FABRIC_POLICY_VERSION = 'sovereign-context-fabric-1.1.0';
export const BRAINSTATE_CAPSULE_SCHEMA_VERSION = 'uberbond.brainstate-capsule.v1';
export const CONTEXT_ABI_VERSION = 'uberbond.context-abi.v1';
export const CONTEXT_COGNITIVE_EVENT_KINDS = Object.freeze([
  'CONTEXT_CHECKPOINT',
  'FOUNDER_DOCTRINE',
  'DECISION_UPDATE',
  'MEMORY_UPDATE',
  'SESSION_HANDOFF'
]);

const SHA40 = /^[a-f0-9]{40}$/i;
const SHA64 = /^[a-f0-9]{64}$/i;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const MAX_TEXT = 4000;
const MAX_LIST = 256;
const CONTEXT_EVENT_KIND_SET = new Set(CONTEXT_COGNITIVE_EVENT_KINDS);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function cleanText(value, max = MAX_TEXT) {
  const text = String(value ?? '').trim();
  return text && text.length <= max ? text : null;
}

function cleanStrings(value, maxItems = MAX_LIST, maxText = MAX_TEXT) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const out = [];
  for (const item of value) {
    const text = cleanText(item, maxText);
    if (!text) return null;
    out.push(text);
  }
  return out;
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: SOVEREIGN_CONTEXT_FABRIC_POLICY_VERSION,
    status: 'CONTEXT_FABRIC_REFUSED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

function normalizeInitiatives(value) {
  if (!Array.isArray(value) || value.length > MAX_LIST) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const id = cleanText(item.id, 160);
    const name = cleanText(item.name, 300);
    const status = cleanText(item.status, 120);
    if (!id || !SAFE_ID.test(id) || !name || !status || seen.has(id)) return null;
    seen.add(id);
    out.push({ id, name, status });
  }
  return out;
}

function normalizeUnresolved(value) {
  if (!Array.isArray(value) || value.length > MAX_LIST) return null;
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const name = cleanText(item.name, 300);
    const status = cleanText(item.status, 120);
    const action = cleanText(item.next || item.requiredAction || '', 1200);
    if (!name || !status) return null;
    out.push({ name, status, action });
  }
  return out;
}

export function compileContextIdentity(packet = {}) {
  const reasonCodes = [];
  if (packet?.project !== 'UberBond') reasonCodes.push('uberbond-project-required');
  const sourceCommit = cleanText(packet?.sourceCommit, 64)?.toLowerCase() || null;
  if (!sourceCommit || !SHA40.test(sourceCommit)) reasonCodes.push('exact-source-commit-required');
  const contextDigest = cleanText(packet?.contextDigest, 80)?.toLowerCase() || null;
  if (!contextDigest || !SHA64.test(contextDigest)) reasonCodes.push('context-digest-required');
  const memoryDigest = cleanText(packet?.memoryDigest, 80)?.toLowerCase() || null;
  if (!memoryDigest || !SHA64.test(memoryDigest)) reasonCodes.push('memory-digest-required');
  const memoryReconciliationDigest = cleanText(packet?.memoryReconciliationDigest, 80)?.toLowerCase() || null;
  if (!memoryReconciliationDigest || !SHA64.test(memoryReconciliationDigest)) reasonCodes.push('memory-reconciliation-digest-required');
  const externalCapabilityDigest = cleanText(packet?.externalCapabilityDigest, 80)?.toLowerCase() || null;
  if (!externalCapabilityDigest || !SHA64.test(externalCapabilityDigest)) reasonCodes.push('external-capability-digest-required');
  const capabilityGraphDigest = cleanText(packet?.capabilityGenome?.capabilityGraphDigest, 80)?.toLowerCase() || null;
  if (!capabilityGraphDigest || !SHA64.test(capabilityGraphDigest)) reasonCodes.push('capability-graph-digest-required');
  if (reasonCodes.length) return fail(reasonCodes);

  const identity = {
    project: 'UberBond',
    sourceCommit,
    contextDigest,
    memoryDigest,
    memoryReconciliationDigest,
    externalCapabilityDigest,
    capabilityGraphDigest
  };
  return {
    ok: true,
    policyVersion: SOVEREIGN_CONTEXT_FABRIC_POLICY_VERSION,
    status: 'CONTEXT_IDENTITY_COMPILED',
    contextAbiVersion: CONTEXT_ABI_VERSION,
    identity,
    identityDigest: digest(identity),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function capsulePayload(capsule = {}) {
  return {
    schemaVersion: capsule.schemaVersion,
    contextAbiVersion: capsule.contextAbiVersion,
    project: capsule.project,
    sourceCommit: capsule.sourceCommit,
    contextIdentity: capsule.contextIdentity,
    objective: capsule.objective,
    economicNorthStar: capsule.economicNorthStar,
    endState: capsule.endState,
    frontier: capsule.frontier,
    memory: capsule.memory,
    externalProofGates: capsule.externalProofGates,
    laws: capsule.laws,
    provenance: capsule.provenance
  };
}

export function verifyBrainstateIntegrity(capsule = {}) {
  if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule)) return fail(['brainstate-capsule-object-required']);
  if (capsule.schemaVersion !== BRAINSTATE_CAPSULE_SCHEMA_VERSION) return fail(['unsupported-brainstate-schema']);
  const claimed = cleanText(capsule.brainstateId, 80)?.toLowerCase() || null;
  const observed = digest(capsulePayload(capsule));
  if (!claimed || !SHA64.test(claimed) || claimed !== observed) {
    return fail(['brainstate-integrity-mismatch'], { claimedBrainstateId: claimed, observedBrainstateId: observed });
  }
  return {
    ok: true,
    policyVersion: SOVEREIGN_CONTEXT_FABRIC_POLICY_VERSION,
    status: 'BRAINSTATE_INTEGRITY_VERIFIED',
    brainstateId: claimed,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function compileBrainstateCapsule({ packet, generatedAt = new Date() } = {}) {
  const identity = compileContextIdentity(packet);
  if (!identity.ok) return identity;

  const completed = cleanStrings(packet?.currentHandoff?.completed || [], 160, 1600);
  const blockers = cleanStrings(packet?.currentHandoff?.blockers || [], 160, 1600);
  const nextActions = cleanStrings(packet?.currentHandoff?.nextActions || [], 160, 1600);
  const initiatives = normalizeInitiatives(packet?.namedInitiatives || []);
  const unresolved = normalizeUnresolved(packet?.unresolvedNames || []);
  const proofGates = cleanStrings(packet?.externalProofGates || [], 160, 1600);
  const startupProtocol = cleanStrings(packet?.startupProtocol || [], 80, 1600);
  const activeMission = cleanText(packet?.currentHandoff?.activeMission, 2000);
  const objective = cleanText(packet?.objective, 4000);
  const economicNorthStar = cleanText(packet?.economicNorthStar, 2000);
  const endState = cleanText(packet?.endState, 4000);
  const truthLaw = cleanText(packet?.truthLaw, 4000);
  const memoryLaw = cleanText(packet?.memoryLaw, 4000);
  const generated = new Date(generatedAt);

  const reasonCodes = [];
  if (!completed) reasonCodes.push('bounded-completed-frontier-required');
  if (!blockers) reasonCodes.push('bounded-blocker-frontier-required');
  if (!nextActions) reasonCodes.push('bounded-next-action-frontier-required');
  if (!initiatives) reasonCodes.push('bounded-initiative-index-required');
  if (!unresolved) reasonCodes.push('bounded-unresolved-index-required');
  if (!proofGates) reasonCodes.push('bounded-external-proof-gates-required');
  if (!startupProtocol) reasonCodes.push('bounded-startup-protocol-required');
  if (!activeMission) reasonCodes.push('active-mission-required');
  if (!objective || !economicNorthStar || !endState) reasonCodes.push('north-star-context-required');
  if (!truthLaw || !memoryLaw) reasonCodes.push('truth-and-memory-law-required');
  if (!Number.isFinite(generated.getTime())) reasonCodes.push('valid-generated-at-required');
  if (reasonCodes.length) return fail(reasonCodes);

  const capsule = {
    schemaVersion: BRAINSTATE_CAPSULE_SCHEMA_VERSION,
    policyVersion: SOVEREIGN_CONTEXT_FABRIC_POLICY_VERSION,
    contextAbiVersion: CONTEXT_ABI_VERSION,
    generatedAt: generated.toISOString(),
    project: 'UberBond',
    sourceCommit: identity.identity.sourceCommit,
    contextIdentity: { ...identity.identity, identityDigest: identity.identityDigest },
    objective,
    economicNorthStar,
    endState,
    frontier: {
      activeMission,
      activeBranch: packet.currentHandoff?.activeBranch || null,
      activePullRequest: Number.isSafeInteger(packet.currentHandoff?.activePullRequest) ? packet.currentHandoff.activePullRequest : null,
      handoffBasisSha: packet.currentHandoff?.handoffBasisSha || null,
      handoffFreshAgainstSourceCommit: packet.currentHandoff?.freshAgainstSourceCommit === true,
      completed,
      blockers,
      nextActions
    },
    memory: { initiativeCount: initiatives.length, initiatives, unresolvedNames: unresolved },
    externalProofGates: proofGates,
    laws: {
      truthLaw,
      memoryLaw,
      capabilityNeverCreatesAuthority: true,
      zeroRetellingLaw: 'FOUNDER_MUST_NOT_RECONSTRUCT_MACHINE_RECOVERABLE_UBERBOND_CONTEXT',
      sessionLaw: 'A_SESSION_MAY_BE_NEW__UBERBOND_MAY_NOT_BE_NEW',
      staleContextLaw: 'CONTEXT_DRIFT_MUST_RECOMPILE_BEFORE_SUBSTANTIVE_EXECUTION'
    },
    provenance: {
      bootstrap: 'UBERBOND_BOOTSTRAP.json',
      masterMemory: 'docs/UBERBOND_MASTER_MEMORY.md',
      memoryIndex: 'artifacts/uberbond-memory-index.json',
      currentHandoff: 'docs/CURRENT_HANDOFF.json',
      continuityCanon: 'docs/CROSS_CHAT_CONTINUITY.md',
      compiler: 'scripts/uberbond-brain-bootstrap.mjs',
      cognitiveEventSchema: UBERBOND_COGNITIVE_EVENT_SCHEMA,
      cognitiveBus: 'src/uberbond-cognitive-bus.mjs'
    },
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  capsule.brainstateId = digest(capsulePayload(capsule));
  return {
    ok: true,
    policyVersion: SOVEREIGN_CONTEXT_FABRIC_POLICY_VERSION,
    status: 'BRAINSTATE_CAPSULE_COMPILED',
    capsule,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function verifyBrainstateFreshness({ capsule, currentPacket } = {}) {
  const integrity = verifyBrainstateIntegrity(capsule);
  if (!integrity.ok) return integrity;
  const current = compileBrainstateCapsule({ currentPacket, packet: currentPacket, generatedAt: capsule.generatedAt });
  if (!current.ok) return fail(['current-brainstate-recompile-failed', ...(current.reasonCodes || [])]);

  const reasonCodes = [];
  if (capsule.sourceCommit !== current.capsule.sourceCommit) reasonCodes.push('source-commit-drift');
  if (capsule.contextIdentity?.contextDigest !== current.capsule.contextIdentity.contextDigest) reasonCodes.push('context-digest-drift');
  if (capsule.contextIdentity?.memoryDigest !== current.capsule.contextIdentity.memoryDigest) reasonCodes.push('memory-digest-drift');
  if (capsule.contextIdentity?.memoryReconciliationDigest !== current.capsule.contextIdentity.memoryReconciliationDigest) reasonCodes.push('memory-reconciliation-drift');
  if (capsule.contextIdentity?.externalCapabilityDigest !== current.capsule.contextIdentity.externalCapabilityDigest) reasonCodes.push('external-capability-drift');
  if (capsule.contextIdentity?.capabilityGraphDigest !== current.capsule.contextIdentity.capabilityGraphDigest) reasonCodes.push('capability-graph-drift');
  if (digest(capsule.frontier) !== digest(current.capsule.frontier)) reasonCodes.push('frontier-drift');
  if (digest(capsule.externalProofGates) !== digest(current.capsule.externalProofGates)) reasonCodes.push('external-proof-gate-drift');
  if (digest(capsule.laws) !== digest(current.capsule.laws)) reasonCodes.push('constitutional-context-drift');

  return {
    ok: reasonCodes.length === 0,
    policyVersion: SOVEREIGN_CONTEXT_FABRIC_POLICY_VERSION,
    status: reasonCodes.length ? 'CONTEXT_DRIFT__RECOMPILE_REQUIRED' : 'CONTEXT_CURRENT',
    reasonCodes,
    brainstateId: capsule.brainstateId,
    currentBrainstateId: current.capsule.brainstateId,
    requiresRecompile: reasonCodes.length > 0,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function tokens(value) {
  return new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 3));
}

export function compileMissionContext({ capsule, mission, maxInitiatives = 24 } = {}) {
  const integrity = verifyBrainstateIntegrity(capsule);
  if (!integrity.ok) return integrity;
  const missionText = cleanText(mission || capsule.frontier?.activeMission, 4000);
  if (!missionText) return fail(['mission-required']);
  const boundedMax = Number(maxInitiatives);
  if (!Number.isSafeInteger(boundedMax) || boundedMax < 1 || boundedMax > 64) return fail(['valid-mission-context-limit-required']);

  const missionTokens = tokens(missionText);
  const scored = (capsule.memory?.initiatives || []).map(item => {
    const haystack = tokens(`${item.id} ${item.name} ${item.status}`);
    let score = 0;
    for (const token of missionTokens) if (haystack.has(token)) score += 1;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  const relevant = scored.filter(row => row.score > 0).slice(0, boundedMax).map(row => row.item);
  const selected = relevant.length ? relevant : scored.slice(0, Math.min(8, boundedMax)).map(row => row.item);

  const context = {
    schemaVersion: 'uberbond.mission-context.v1',
    contextAbiVersion: CONTEXT_ABI_VERSION,
    brainstateId: capsule.brainstateId,
    sourceCommit: capsule.sourceCommit,
    mission: missionText,
    constitutionalCore: {
      objective: capsule.objective,
      economicNorthStar: capsule.economicNorthStar,
      sessionLaw: capsule.laws.sessionLaw,
      zeroRetellingLaw: capsule.laws.zeroRetellingLaw,
      capabilityNeverCreatesAuthority: true
    },
    activeFrontier: capsule.frontier,
    relevantInitiatives: selected,
    unresolvedNames: capsule.memory?.unresolvedNames || [],
    externalProofGates: capsule.externalProofGates,
    provenance: capsule.provenance,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  context.missionContextId = digest(context);
  return {
    ok: true,
    policyVersion: SOVEREIGN_CONTEXT_FABRIC_POLICY_VERSION,
    status: 'MISSION_CONTEXT_COMPILED',
    context,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function compileContextCognitiveEvent({
  kind = 'CONTEXT_CHECKPOINT',
  sourceNodeId = 'context-spine',
  subjectType = 'BRAINSTATE',
  subjectId,
  summary,
  evidenceRefs = [],
  payloadRef = null,
  truthClass = 'CURRENT_REPOSITORY_CANON',
  observedAt = new Date(),
  parentEventIds = []
} = {}) {
  const normalizedKind = cleanText(kind, 80)?.toUpperCase();
  if (!normalizedKind || !CONTEXT_EVENT_KIND_SET.has(normalizedKind)) {
    return fail(['recognized-context-event-kind-required']);
  }
  const compiled = compileCanonicalCognitiveEvent({
    kind: normalizedKind,
    sourceNodeId,
    subjectType,
    subjectId,
    summary,
    evidenceRefs,
    payloadRef,
    truthClass,
    observedAt,
    parentEventIds
  });
  if (!compiled.ok) return fail(['canonical-cognitive-event-refused', ...(compiled.reasonCodes || [])]);
  return compiled;
}
