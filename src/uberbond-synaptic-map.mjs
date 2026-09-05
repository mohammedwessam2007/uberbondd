import crypto from 'node:crypto';
import { compileUberBondCognitiveGraph } from './uberbond-cognitive-graph.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERBOND_SYNAPTIC_MAP_SCHEMA = 'uberbond.synaptic-map.v1';
export const UBERBOND_SYNAPTIC_MAP_POLICY_VERSION = 'uberbond-synaptic-map-1.0.0';

const EDGE_TYPES = new Set([
  'IMPORTS', 'MEMBER_OF_ORGAN', 'DECLARED_IN', 'IMPLEMENTED_BY', 'TESTED_BY',
  'HAS_RUNTIME_RECEIPT', 'GATED_BY', 'GATE_APPLIES_TO', 'DONATES_TO',
  'OPERATOR_DECLARED_IN', 'OPERATOR_TARGETS', 'READINESS_DECLARED_IN',
  'GENESIS_DECLARED_IN', 'MEMORY_DECLARED_IN', 'ORGAN_RELATION'
]);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function text(value, max = 2000) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

function nodeIdForArtifact(path) { return `artifact:${path}`; }
function nodeIdForOrgan(id) { return `organ:${id}`; }
function nodeIdForAtom(id) { return `feature:${id}`; }
function edgeId(from, type, to) { return `syn_${digest([from, type, to]).slice(0, 24)}`; }

function fail(reasonCodes, status = 'SYNAPTIC_MAP_BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: UBERBOND_SYNAPTIC_MAP_POLICY_VERSION,
    status,
    reasonCodes: unique(reasonCodes || []),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function addNode(state, node) {
  if (!node?.id || state.nodes.has(node.id)) return;
  state.nodes.set(node.id, node);
}

function addEdge(state, from, type, to, evidence = null) {
  if (!state.nodes.has(from) || !state.nodes.has(to) || !EDGE_TYPES.has(type) || from === to) return;
  const id = edgeId(from, type, to);
  if (state.edges.has(id)) return;
  state.edges.set(id, {
    id,
    from,
    to,
    type,
    ...(evidence ? { evidence } : {}),
    consequenceAuthority: 'NONE'
  });
}

function commandTargets(command, artifactPaths) {
  const raw = String(command || '');
  const hits = [];
  for (const path of artifactPaths) {
    if (!path || path === 'package.json') continue;
    if (raw.includes(path)) hits.push(path);
  }
  return hits.slice(0, 128);
}

export function compileUberBondSynapticMap({ featureGenome, featureAtomAtlas } = {}) {
  const reasons = [];
  if (!featureGenome?.ok || !featureGenome?.genomeDigest || !Array.isArray(featureGenome?.artifactNodes)) reasons.push('valid-feature-genome-required');
  if (!featureAtomAtlas?.ok || !featureAtomAtlas?.atlasDigest || !Array.isArray(featureAtomAtlas?.allAtoms)) reasons.push('valid-feature-atom-atlas-required');
  if (featureGenome?.genomeDigest && featureAtomAtlas?.featureGenomeDigest !== featureGenome.genomeDigest) reasons.push('feature-atlas-genome-digest-mismatch');
  const cognitive = compileUberBondCognitiveGraph();
  if (!cognitive.ok) reasons.push('valid-cognitive-graph-required');
  if (reasons.length) return fail(reasons);

  const state = { nodes: new Map(), edges: new Map() };
  const artifactPaths = new Set(featureGenome.artifactNodes.map(item => item.path));
  const organIds = new Set(cognitive.nodes.map(item => item.id));

  for (const organ of cognitive.nodes) {
    addNode(state, {
      id: nodeIdForOrgan(organ.id),
      class: 'COGNITIVE_ORGAN',
      organId: organ.id,
      label: organ.label,
      kind: organ.kind,
      truthClass: organ.truthClass
    });
  }
  for (const artifact of featureGenome.artifactNodes) {
    const id = nodeIdForArtifact(artifact.path);
    addNode(state, {
      id,
      class: 'REPOSITORY_ARTIFACT',
      path: artifact.path,
      artifactKind: artifact.kind,
      primaryFamily: artifact.primaryFamily,
      families: artifact.families,
      classificationConfidence: artifact.classificationConfidence
    });
    for (const organ of artifact.organs || []) {
      if (organIds.has(organ)) addEdge(state, id, 'MEMBER_OF_ORGAN', nodeIdForOrgan(organ), 'feature-genome-classification');
    }
  }
  for (const atom of featureAtomAtlas.allAtoms) {
    const id = nodeIdForAtom(atom.id);
    addNode(state, {
      id,
      class: atom.class,
      featureAtomId: atom.id,
      name: text(atom.name, 1000),
      truthClass: atom.truthClass || null,
      maturity: atom.maturity || null,
      implementationStatus: atom.implementationStatus || null
    });
    for (const organ of unique([...(atom.organs || []), ...(atom.livingOrgans || [])])) {
      if (organIds.has(organ)) addEdge(state, id, 'MEMBER_OF_ORGAN', nodeIdForOrgan(organ), 'feature-atom-organ-binding');
    }
  }

  for (const dependency of featureGenome.dependencyEdges || []) {
    addEdge(state, nodeIdForArtifact(dependency.from), 'IMPORTS', nodeIdForArtifact(dependency.to), dependency.specifier || null);
  }

  const packageNode = state.nodes.has(nodeIdForArtifact('package.json')) ? nodeIdForArtifact('package.json') : null;
  const reachabilityNode = state.nodes.has(nodeIdForArtifact('config/reachability-classification.json')) ? nodeIdForArtifact('config/reachability-classification.json') : null;
  const readinessNode = state.nodes.has(nodeIdForArtifact('config/system-readiness-input.json')) ? nodeIdForArtifact('config/system-readiness-input.json') : null;
  const genesisCanonNode = state.nodes.has(nodeIdForArtifact('docs/PERPETUAL_FRONTIER_GENESIS_CANON.md')) ? nodeIdForArtifact('docs/PERPETUAL_FRONTIER_GENESIS_CANON.md') : null;
  const totalBrainNode = state.nodes.has(nodeIdForArtifact('artifacts/uberbond-total-brain.json')) ? nodeIdForArtifact('artifacts/uberbond-total-brain.json') : null;
  const lineageNode = state.nodes.has(nodeIdForArtifact('config/uberbond-cognitive-lineage.json')) ? nodeIdForArtifact('config/uberbond-cognitive-lineage.json') : null;

  for (const atom of featureAtomAtlas.allAtoms) {
    const atomNode = nodeIdForAtom(atom.id);
    if (atom.sourcePath && artifactPaths.has(atom.sourcePath)) addEdge(state, atomNode, 'DECLARED_IN', nodeIdForArtifact(atom.sourcePath), 'atom-source-path');

    if (atom.class === 'EXPORTED_CODE_FEATURE' && atom.sourcePath && artifactPaths.has(atom.sourcePath)) {
      addEdge(state, atomNode, 'DECLARED_IN', nodeIdForArtifact(atom.sourcePath), 'export-declaration');
    } else if (atom.class === 'OPERATOR_COMMAND') {
      if (packageNode) addEdge(state, atomNode, 'OPERATOR_DECLARED_IN', packageNode, 'package-script');
      for (const target of commandTargets(atom.command, artifactPaths)) addEdge(state, atomNode, 'OPERATOR_TARGETS', nodeIdForArtifact(target), 'package-script-command');
    } else if (atom.class === 'READINESS_CAPABILITY') {
      if (readinessNode) addEdge(state, atomNode, 'READINESS_DECLARED_IN', readinessNode, 'canonical-readiness-input');
      for (const target of atom.evidence || []) if (artifactPaths.has(target)) addEdge(state, atomNode, 'IMPLEMENTED_BY', nodeIdForArtifact(target), 'readiness-evidence');
      for (const target of atom.tests || []) if (artifactPaths.has(target)) addEdge(state, atomNode, 'TESTED_BY', nodeIdForArtifact(target), 'readiness-test');
    } else if (atom.class === 'ACTIVATION_GATE') {
      if (reachabilityNode) addEdge(state, atomNode, 'DECLARED_IN', reachabilityNode, 'reachability-gate');
    } else if (atom.class === 'GENESIS_IDEA') {
      if (genesisCanonNode) addEdge(state, atomNode, 'GENESIS_DECLARED_IN', genesisCanonNode, 'genesis-canon');
      for (const target of atom.implementationSources || []) if (artifactPaths.has(target)) addEdge(state, atomNode, 'IMPLEMENTED_BY', nodeIdForArtifact(target), 'genesis-implementation-ledger');
      for (const target of atom.implementationTests || []) if (artifactPaths.has(target)) addEdge(state, atomNode, 'TESTED_BY', nodeIdForArtifact(target), 'genesis-implementation-ledger');
      for (const target of atom.runtimeReceipts || []) if (artifactPaths.has(target)) addEdge(state, atomNode, 'HAS_RUNTIME_RECEIPT', nodeIdForArtifact(target), 'genesis-implementation-ledger');
    } else if (atom.class === 'TOTAL_BRAIN_MEMORY_ATOM') {
      if (totalBrainNode) addEdge(state, atomNode, 'MEMORY_DECLARED_IN', totalBrainNode, 'total-brain-memory');
    } else if (atom.class === 'HISTORICAL_DONOR') {
      if (lineageNode) addEdge(state, atomNode, 'DECLARED_IN', lineageNode, 'cognitive-lineage');
      for (const organ of atom.livingOrgans || []) if (organIds.has(organ)) addEdge(state, atomNode, 'DONATES_TO', nodeIdForOrgan(organ), 'cognitive-lineage');
    }
  }

  const gateAtomByName = new Map((featureAtomAtlas?.classes?.activationGates || []).map(atom => [atom.name, nodeIdForAtom(atom.id)]));
  for (const row of featureGenome.reachabilityModules || []) {
    if (!row?.path || !row?.gate || !artifactPaths.has(row.path)) continue;
    const gateNode = gateAtomByName.get(row.gate);
    if (!gateNode) continue;
    addEdge(state, nodeIdForArtifact(row.path), 'GATED_BY', gateNode, row.category || 'reachability-classification');
    addEdge(state, gateNode, 'GATE_APPLIES_TO', nodeIdForArtifact(row.path), row.category || 'reachability-classification');
  }

  for (const relation of cognitive.edges) {
    addEdge(state, nodeIdForOrgan(relation.from), 'ORGAN_RELATION', nodeIdForOrgan(relation.to), relation.type);
  }

  const nodes = [...state.nodes.values()];
  const edges = [...state.edges.values()];
  const degree = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  const orphanArtifacts = featureGenome.artifactNodes
    .map(item => nodeIdForArtifact(item.path))
    .filter(id => (degree.get(id) || 0) === 0);
  const orphanFeatureAtoms = featureAtomAtlas.allAtoms
    .map(item => nodeIdForAtom(item.id))
    .filter(id => (degree.get(id) || 0) === 0);
  const orphanOrgans = cognitive.nodes
    .map(item => nodeIdForOrgan(item.id))
    .filter(id => (degree.get(id) || 0) === 0);

  const typeCounts = {};
  for (const edge of edges) typeCounts[edge.type] = (typeCounts[edge.type] || 0) + 1;
  const classCounts = {};
  for (const node of nodes) classCounts[node.class] = (classCounts[node.class] || 0) + 1;
  const core = {
    schemaVersion: UBERBOND_SYNAPTIC_MAP_SCHEMA,
    featureGenomeDigest: featureGenome.genomeDigest,
    featureAtomAtlasDigest: featureAtomAtlas.atlasDigest,
    cognitiveGraphDigest: cognitive.graphDigest,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    classCounts,
    edgeTypeCounts: typeCounts,
    nodes,
    edges
  };
  return {
    ok: orphanArtifacts.length === 0 && orphanFeatureAtoms.length === 0 && orphanOrgans.length === 0,
    policyVersion: UBERBOND_SYNAPTIC_MAP_POLICY_VERSION,
    status: orphanArtifacts.length || orphanFeatureAtoms.length || orphanOrgans.length ? 'SYNAPTIC_MAP_DISCONNECTED' : 'SYNAPTIC_MAP_COMPLETE',
    ...core,
    mapDigest: digest(core),
    orphanArtifacts,
    orphanFeatureAtoms,
    orphanOrgans,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'THE SYNAPTIC MAP CONNECTS REPOSITORY DECLARATIONS, IMPORTS, TESTS, GATES, MEMORY, GENESIS IDEAS AND LIVING COGNITIVE ORGANS. AN EDGE PROVES A DECLARED OR STRUCTURAL RELATIONSHIP ONLY; IT DOES NOT PROVE CORRECTNESS, MARKET VALUE, EXTERNAL TRUTH OR CONSEQUENCE AUTHORITY.'
  };
}

export function querySynapticNeighbors(map, { nodeId, direction = 'BOTH', edgeTypes = [], limit = 200 } = {}) {
  if (!map?.ok || !Array.isArray(map.nodes) || !Array.isArray(map.edges)) return fail(['valid-synaptic-map-required'], 'SYNAPTIC_QUERY_BLOCKED');
  const id = text(nodeId, 1000);
  if (!id || !map.nodes.some(node => node.id === id)) return fail(['known-node-required'], 'SYNAPTIC_QUERY_BLOCKED');
  const mode = String(direction || 'BOTH').toUpperCase();
  if (!['IN', 'OUT', 'BOTH'].includes(mode)) return fail(['recognized-direction-required'], 'SYNAPTIC_QUERY_BLOCKED');
  const types = new Set((Array.isArray(edgeTypes) ? edgeTypes : []).map(item => String(item).toUpperCase()).filter(item => EDGE_TYPES.has(item)));
  const cap = Number.isSafeInteger(Number(limit)) ? Math.max(1, Math.min(2000, Number(limit))) : 200;
  const edges = map.edges.filter(edge => {
    if (types.size && !types.has(edge.type)) return false;
    return mode === 'IN' ? edge.to === id : mode === 'OUT' ? edge.from === id : edge.from === id || edge.to === id;
  }).slice(0, cap);
  const neighborIds = unique(edges.map(edge => edge.from === id ? edge.to : edge.from));
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  return {
    ok: true,
    status: 'SYNAPTIC_QUERY_COMPLETE',
    node: byId.get(id),
    edgeCount: edges.length,
    edges,
    neighbors: neighborIds.map(neighborId => byId.get(neighborId)).filter(Boolean),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
