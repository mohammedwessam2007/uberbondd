import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERBOND_ULTIMATE_GRAPH_SCHEMA = 'uberbond.ultimate-graph.v1';
export const UBERBOND_ULTIMATE_GRAPH_POLICY_VERSION = 'uberbond-ultimate-graph-1.0.0';

const DEEP_EDGE_TYPES = new Set(['DETAIL_DECLARED_IN', 'DETAIL_MEMBER_OF_ORGAN']);
function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function deepNodeId(id) { return `detail:${id}`; }
function artifactNodeId(path) { return `artifact:${path}`; }
function organNodeId(id) { return `organ:${id}`; }
function edgeId(from, type, to) { return `ult_${digest([from, type, to]).slice(0, 24)}`; }

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: UBERBOND_ULTIMATE_GRAPH_POLICY_VERSION,
    status: 'ULTIMATE_GRAPH_BLOCKED',
    reasonCodes: unique(reasonCodes),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileUberBondUltimateGraph({ featureGenome, featureAtomAtlas, synapticMap, repositoryDeepAtlas } = {}) {
  const reasons = [];
  if (!featureGenome?.ok || !featureGenome?.genomeDigest || !Array.isArray(featureGenome?.artifactNodes)) reasons.push('valid-feature-genome-required');
  if (!featureAtomAtlas?.ok || !featureAtomAtlas?.atlasDigest || !Array.isArray(featureAtomAtlas?.allAtoms)) reasons.push('valid-feature-atom-atlas-required');
  if (!synapticMap?.ok || !synapticMap?.mapDigest || !Array.isArray(synapticMap?.nodes) || !Array.isArray(synapticMap?.edges)) reasons.push('valid-synaptic-map-required');
  if (!repositoryDeepAtlas?.ok || !repositoryDeepAtlas?.atlasDigest || !Array.isArray(repositoryDeepAtlas?.details)) reasons.push('valid-repository-deep-atlas-required');
  if (featureAtomAtlas?.featureGenomeDigest && featureAtomAtlas.featureGenomeDigest !== featureGenome?.genomeDigest) reasons.push('feature-atlas-genome-digest-mismatch');
  if (synapticMap?.featureGenomeDigest && synapticMap.featureGenomeDigest !== featureGenome?.genomeDigest) reasons.push('synaptic-map-genome-digest-mismatch');
  if (repositoryDeepAtlas?.featureGenomeDigest && repositoryDeepAtlas.featureGenomeDigest !== featureGenome?.genomeDigest) reasons.push('deep-atlas-genome-digest-mismatch');
  if (synapticMap?.featureAtomAtlasDigest && synapticMap.featureAtomAtlasDigest !== featureAtomAtlas?.atlasDigest) reasons.push('synaptic-map-feature-atlas-digest-mismatch');
  if (reasons.length) return fail(reasons);

  const nodes = new Map(synapticMap.nodes.map(node => [node.id, structuredClone(node)]));
  const edges = new Map(synapticMap.edges.map(edge => [edge.id, structuredClone(edge)]));
  const artifactPaths = new Set(featureGenome.artifactNodes.map(item => item.path));
  const organIds = new Set([...nodes.keys()].filter(id => id.startsWith('organ:')));

  for (const detail of repositoryDeepAtlas.details) {
    const id = deepNodeId(detail.id);
    if (nodes.has(id)) continue;
    nodes.set(id, {
      id,
      class: `DEEP_${detail.class}`,
      detailId: detail.id,
      name: detail.name || null,
      sourcePath: detail.sourcePath,
      line: detail.line ?? null,
      truthClass: detail.truthClass || null,
      families: detail.families || [],
      organs: detail.organs || []
    });
    const artifactId = artifactNodeId(detail.sourcePath);
    if (artifactPaths.has(detail.sourcePath) && nodes.has(artifactId)) {
      const idEdge = edgeId(id, 'DETAIL_DECLARED_IN', artifactId);
      edges.set(idEdge, { id: idEdge, from: id, to: artifactId, type: 'DETAIL_DECLARED_IN', evidence: 'repository-deep-atlas', consequenceAuthority: 'NONE' });
    }
    for (const organ of unique(detail.organs || [])) {
      const organId = organNodeId(organ);
      if (!organIds.has(organId)) continue;
      const idEdge = edgeId(id, 'DETAIL_MEMBER_OF_ORGAN', organId);
      edges.set(idEdge, { id: idEdge, from: id, to: organId, type: 'DETAIL_MEMBER_OF_ORGAN', evidence: 'inherited-artifact-organ-binding', consequenceAuthority: 'NONE' });
    }
  }

  const allNodes = [...nodes.values()];
  const allEdges = [...edges.values()];
  const degree = new Map(allNodes.map(node => [node.id, 0]));
  for (const edge of allEdges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  const orphanNodes = allNodes.filter(node => (degree.get(node.id) || 0) === 0).map(node => node.id);
  const missingArtifacts = featureGenome.artifactNodes.map(item => artifactNodeId(item.path)).filter(id => !nodes.has(id));
  const missingFeatureAtoms = featureAtomAtlas.allAtoms.map(item => `feature:${item.id}`).filter(id => !nodes.has(id));
  const missingDeepFeatures = repositoryDeepAtlas.details.map(item => deepNodeId(item.id)).filter(id => !nodes.has(id));

  const classCounts = {};
  for (const node of allNodes) classCounts[node.class] = (classCounts[node.class] || 0) + 1;
  const edgeTypeCounts = {};
  for (const edge of allEdges) edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + 1;
  const incomingByArtifact = new Map();
  const outgoingByArtifact = new Map();
  for (const edge of allEdges) {
    if (edge.to?.startsWith('artifact:')) incomingByArtifact.set(edge.to, (incomingByArtifact.get(edge.to) || 0) + 1);
    if (edge.from?.startsWith('artifact:')) outgoingByArtifact.set(edge.from, (outgoingByArtifact.get(edge.from) || 0) + 1);
  }
  const deepCountByArtifact = new Map();
  for (const edge of allEdges) {
    if (edge.type !== 'DETAIL_DECLARED_IN') continue;
    deepCountByArtifact.set(edge.to, (deepCountByArtifact.get(edge.to) || 0) + 1);
  }
  const artifactCards = featureGenome.artifactNodes.map(artifact => {
    const id = artifactNodeId(artifact.path);
    return {
      artifactId: id,
      path: artifact.path,
      kind: artifact.kind,
      primaryFamily: artifact.primaryFamily,
      families: artifact.families || [],
      organs: artifact.organs || [],
      outgoingEdgeCount: outgoingByArtifact.get(id) || 0,
      incomingEdgeCount: incomingByArtifact.get(id) || 0,
      deepFeatureCount: deepCountByArtifact.get(id) || 0
    };
  });
  const core = {
    schemaVersion: UBERBOND_ULTIMATE_GRAPH_SCHEMA,
    featureGenomeDigest: featureGenome.genomeDigest,
    featureAtomAtlasDigest: featureAtomAtlas.atlasDigest,
    synapticMapDigest: synapticMap.mapDigest,
    repositoryDeepAtlasDigest: repositoryDeepAtlas.atlasDigest,
    repositoryArtifactCount: featureGenome.artifactNodes.length,
    featureAtomCount: featureAtomAtlas.allAtoms.length,
    deepFeatureCount: repositoryDeepAtlas.details.length,
    nodeCount: allNodes.length,
    edgeCount: allEdges.length,
    classCounts,
    edgeTypeCounts,
    artifactCards,
    nodes: allNodes,
    edges: allEdges
  };
  const ok = orphanNodes.length === 0 && missingArtifacts.length === 0 && missingFeatureAtoms.length === 0 && missingDeepFeatures.length === 0;
  return {
    ok,
    policyVersion: UBERBOND_ULTIMATE_GRAPH_POLICY_VERSION,
    status: ok ? 'ULTIMATE_GRAPH_COMPLETE' : 'ULTIMATE_GRAPH_DISCONNECTED',
    ...core,
    graphDigest: digest(core),
    orphanNodes,
    missingArtifacts,
    missingFeatureAtoms,
    missingDeepFeatures,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    memoryContract: {
      canonicalPointer: 'artifacts/cognitive/uberbond-ultimate-graph-latest.json',
      cycleSummaryPointer: 'artifacts/uberbond-cognitive-cycle-latest.json',
      persistenceLaw: 'FULL GRAPH IS STORED AS DURABLE COGNITIVE EVIDENCE; EACH COGNITIVE CYCLE BINDS ITS DIGEST AND COVERAGE SUMMARY SO FUTURE REASONING CAN DETECT STALE OR AMPUTATED MAPS.'
    },
    truthBoundary: 'THE ULTIMATE GRAPH IS A REPOSITORY-COMPLETE SELF-MAP: EVERY FEATURE-GENOME ARTIFACT, FEATURE-ATOM, COGNITIVE ORGAN AND DISCOVERED DEEP DECLARATION MUST BE CONNECTED. IT IS STRUCTURAL MEMORY, NOT PROOF THAT EVERY DECLARATION IS CORRECT, LIVE, MARKET-VALID OR AUTHORIZED TO CAUSE EXTERNAL EFFECTS.'
  };
}

export function queryUberBondUltimateGraph(graph, { text: query = '', nodeClasses = [], paths = [], edgeTypes = [], limit = 250 } = {}) {
  if (!graph?.ok || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return { ok: false, status: 'ULTIMATE_GRAPH_QUERY_BLOCKED', reasonCodes: ['valid-ultimate-graph-required'] };
  const needle = String(query || '').trim().toLowerCase();
  const classes = new Set((nodeClasses || []).map(item => String(item).toUpperCase()));
  const pathSet = new Set(paths || []);
  const typeSet = new Set((edgeTypes || []).map(item => String(item).toUpperCase()));
  const cap = Number.isSafeInteger(Number(limit)) ? Math.max(1, Math.min(5000, Number(limit))) : 250;
  const nodes = graph.nodes.filter(node => {
    if (classes.size && !classes.has(String(node.class || '').toUpperCase())) return false;
    if (pathSet.size && !pathSet.has(node.path || node.sourcePath || '')) return false;
    if (!needle) return true;
    return JSON.stringify(node).toLowerCase().includes(needle);
  }).slice(0, cap);
  const ids = new Set(nodes.map(node => node.id));
  const edges = graph.edges.filter(edge => {
    if (typeSet.size && !typeSet.has(String(edge.type || '').toUpperCase())) return false;
    return ids.has(edge.from) || ids.has(edge.to);
  }).slice(0, cap * 4);
  return { ok: true, status: 'ULTIMATE_GRAPH_QUERY_COMPLETE', query: needle || null, nodeCount: nodes.length, edgeCount: edges.length, nodes, edges };
}
