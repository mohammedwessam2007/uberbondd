import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { compileUberBondCognitiveGraph, cognitiveGraphIntegrity } from './uberbond-cognitive-graph.mjs';

export const UBERBOND_COMMAND_CENTER_SCHEMA = 'uberbond.command-center.v1';
export const UBERBOND_COMMAND_CENTER_POLICY_VERSION = 'uberbond-command-center-1.0.0';

const DAY = 24 * 60 * 60 * 1000;
const RECEIPTS = Object.freeze([
  ['cognitiveCycle', 'Whole-brain cognitive cycle', 'artifacts/uberbond-cognitive-cycle-latest.json', DAY],
  ['featureGenome', 'Repository Feature Genome', 'artifacts/uberbond-feature-genome-latest.json', 7 * DAY],
  ['featureAtomAtlas', 'Feature Atom Atlas', 'artifacts/uberbond-feature-atom-atlas-latest.json', 7 * DAY],
  ['synapticMap', 'Synaptic Map', 'artifacts/uberbond-synaptic-map-latest.json', 7 * DAY],
  ['metacognition', 'Metacognitive synthesis', 'artifacts/uberbond-metacognitive-synthesis-latest.json', DAY],
  ['genesisReactivation', 'GENESIS associative reactivation', 'artifacts/uberbond-genesis-reactivation-latest.json', DAY],
  ['genesis', 'Perpetual Frontier GENESIS', 'artifacts/perpetual-frontier-genesis-latest.json', DAY],
  ['genesisEvolution', 'GENESIS evolution', 'artifacts/genesis-evolution-latest.json', DAY],
  ['genesisScientist', 'GENESIS scientist', 'artifacts/genesis-scientist-latest.json', DAY],
  ['genesisOntology', 'GENESIS ontology', 'artifacts/genesis-ontology-latest.json', DAY],
  ['genesisMetabolism', 'GENESIS metabolism', 'artifacts/genesis-metabolism-latest.json', DAY],
  ['frontierModels', 'Frontier model team doctor', 'artifacts/cognitive/frontier-model-team-doctor-latest.json', DAY],
  ['computeSovereignty', 'Compute Sovereignty doctor', 'artifacts/cognitive/compute-sovereignty-doctor-latest.json', DAY],
  ['capabilityGenome', 'Capability Genome doctor', 'artifacts/cognitive/capability-genome-doctor-latest.json', DAY],
  ['eventHorizon', 'Event Horizon doctor', 'artifacts/cognitive/event-horizon-doctor-latest.json', DAY],
  ['selfMaintainer', 'Trusted self-maintainer', 'artifacts/cognitive/self-maintainer-latest.json', DAY],
  ['gamechanger', 'Gamechanger Mesh', 'artifacts/gamechanger-mesh-latest.json', DAY]
].map(([id, label, relativePath, maxAgeMs]) => Object.freeze({ id, label, relativePath, maxAgeMs })));

const SOURCE_FILES = Object.freeze([
  ['frontierModelRegistry', 'Frontier model candidate registry', 'config/frontier-model-candidates.json'],
  ['genesisImplementationLedger', 'GENESIS implementation ledger', 'artifacts/perpetual-frontier-implementation-ledger.json']
].map(([id, label, relativePath]) => Object.freeze({ id, label, relativePath })));

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function scalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
}
function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function documentTimestamp(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  for (const key of ['generatedAt', 'observedAt', 'checkedAt', 'evaluatedAt', 'createdAt', 'updatedAt', 'time', 'timestamp']) {
    const parsed = timestamp(data[key]);
    if (parsed) return parsed;
  }
  return null;
}
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
function fixedPath(root, relativePath) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error('command-center-path-escaped-root');
  return resolved;
}
function pick(data, keys) {
  const out = {};
  for (const key of keys) {
    const value = scalar(data?.[key]);
    if (value !== null) out[key] = value;
  }
  return out;
}
function count(value) {
  return Array.isArray(value) ? value.length : null;
}
function compactSummary(id, data) {
  const common = pick(data, ['ok', 'status', 'health', 'policyVersion', 'businessEffectAuthority', 'externalEffectAuthority']);
  if (id === 'featureGenome') return {
    ...common,
    ...pick(data, ['genomeDigest', 'repositoryArtifactCount', 'sourceDependencyEdgeCount', 'operatorScriptCount', 'readinessCapabilityCount', 'reachabilityModuleCount', 'activationGateCount', 'totalBrainAtomCount', 'genesisIdeaCount', 'donorLineageCount', 'fallbackArtifactCount'])
  };
  if (id === 'featureAtomAtlas') return {
    ...common,
    ...pick(data, ['atlasDigest', 'featureGenomeDigest', 'atomCount']),
    classCounts: data?.classCounts && typeof data.classCounts === 'object' ? data.classCounts : null,
    genesisMaturityCounts: data?.genesisMaturityCounts && typeof data.genesisMaturityCounts === 'object' ? data.genesisMaturityCounts : null,
    genesisImplementationStatusCounts: data?.genesisImplementationStatusCounts && typeof data.genesisImplementationStatusCounts === 'object' ? data.genesisImplementationStatusCounts : null
  };
  if (id === 'synapticMap') return {
    ...common,
    ...pick(data, ['mapDigest', 'featureGenomeDigest', 'nodeCount', 'edgeCount']),
    edgeTypeCounts: data?.edgeTypeCounts && typeof data.edgeTypeCounts === 'object' ? data.edgeTypeCounts : null,
    orphanArtifacts: count(data?.orphanArtifacts),
    orphanFeatureAtoms: count(data?.orphanFeatureAtoms),
    orphanOrgans: count(data?.orphanOrgans)
  };
  if (id === 'frontierModels') return {
    ...common,
    ...pick(data, ['configuredCandidateCount', 'callableCandidateCount', 'callableTruth'])
  };
  if (id === 'cognitiveCycle') return {
    ...common,
    ...pick(data, ['cycleId', 'graphDigest', 'featureGenomeDigest']),
    eventCount: count(data?.events),
    routeCount: count(data?.routes),
    wallbreakerReflexCount: count(data?.wallbreakerReflexes)
  };
  return {
    ...common,
    ...pick(data, ['digest', 'reason', 'objective', 'candidateCount', 'selectedCount', 'ideaCount', 'hypothesisCount', 'agendaCount']),
    reasonCodes: Array.isArray(data?.reasonCodes) ? data.reasonCodes.slice(0, 24) : null
  };
}

async function readJson(root, spec, { nowMs, receipt }) {
  const file = fixedPath(root, spec.relativePath);
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    return {
      id: spec.id,
      label: spec.label,
      path: spec.relativePath,
      state: error?.code === 'ENOENT' ? 'UNAVAILABLE' : 'UNREADABLE',
      freshness: 'UNKNOWN',
      timestamp: null,
      summary: null
    };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { id: spec.id, label: spec.label, path: spec.relativePath, state: 'INVALID', freshness: 'UNKNOWN', timestamp: null, summary: null };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { id: spec.id, label: spec.label, path: spec.relativePath, state: 'INVALID', freshness: 'UNKNOWN', timestamp: null, summary: null };
  }
  const observedAt = documentTimestamp(data);
  let freshness = 'UNVERIFIED';
  if (receipt && observedAt) freshness = nowMs - Date.parse(observedAt) > spec.maxAgeMs ? 'STALE' : 'FRESH';
  return {
    id: spec.id,
    label: spec.label,
    path: spec.relativePath,
    state: 'AVAILABLE',
    freshness,
    timestamp: observedAt,
    summary: receipt ? compactSummary(spec.id, data) : null,
    data
  };
}

function frontierRegistrySummary(source) {
  if (source.state !== 'AVAILABLE') return null;
  const data = source.data;
  const candidates = Array.isArray(data?.candidates) ? data.candidates : Array.isArray(data) ? data : [];
  return {
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 24).map(candidate => ({
      id: scalar(candidate?.id),
      label: scalar(candidate?.label) || scalar(candidate?.name),
      provider: scalar(candidate?.provider),
      model: scalar(candidate?.model) || scalar(candidate?.modelId),
      state: scalar(candidate?.promotionState) || 'CANDIDATE_ONLY'
    }))
  };
}

function genesisLedgerSummary(source) {
  if (source.state !== 'AVAILABLE') return null;
  const data = source.data;
  const entries = Array.isArray(data?.ideas) ? data.ideas : Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
  const maturityCounts = {};
  const implementationStatusCounts = {};
  for (const entry of entries) {
    const maturity = scalar(entry?.maturity);
    const implementation = scalar(entry?.implementationStatus) || scalar(entry?.status);
    if (maturity) maturityCounts[maturity] = (maturityCounts[maturity] || 0) + 1;
    if (implementation) implementationStatusCounts[implementation] = (implementationStatusCounts[implementation] || 0) + 1;
  }
  return { ideaCount: entries.length, maturityCounts, implementationStatusCounts };
}

function synapticPreview(source) {
  if (source?.state !== 'AVAILABLE' || !source.data) return null;
  const nodes = Array.isArray(source.data.nodes) ? source.data.nodes : [];
  const edges = Array.isArray(source.data.edges) ? source.data.edges : [];
  const nodeLimit = 260;
  const edgeLimit = 620;
  return {
    nodes: nodes.slice(0, nodeLimit).map(node => ({
      id: scalar(node?.id),
      kind: scalar(node?.kind) || scalar(node?.type),
      label: scalar(node?.label) || scalar(node?.name),
      truthClass: scalar(node?.truthClass),
      nodeClass: scalar(node?.nodeClass)
    })).filter(node => node.id),
    edges: edges.slice(0, edgeLimit).map(edge => ({
      from: scalar(edge?.from),
      to: scalar(edge?.to),
      type: scalar(edge?.type)
    })).filter(edge => edge.from && edge.to),
    nodeCount: finite(source.data.nodeCount) ?? nodes.length,
    edgeCount: finite(source.data.edgeCount) ?? edges.length,
    truncated: nodes.length > nodeLimit || edges.length > edgeLimit
  };
}

function runtimeTruth(runtime = {}) {
  return {
    platform: scalar(runtime.platform) || 'UNKNOWN',
    environment: scalar(runtime.environment) || 'UNKNOWN',
    sourceCommit: scalar(runtime.sourceCommit),
    region: scalar(runtime.region),
    adminAuthConfigured: runtime.adminAuthConfigured === true,
    runtimeObservedAt: new Date().toISOString()
  };
}

export async function buildUberBondCommandCenterStatus({ root = process.cwd(), now = new Date(), runtime = {} } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('valid-now-required');
  const graph = compileUberBondCognitiveGraph();
  const graphIntegrity = cognitiveGraphIntegrity(graph);
  const nowMs = date.getTime();
  const receiptReads = await Promise.all(RECEIPTS.map(spec => readJson(root, spec, { nowMs, receipt: true })));
  const sourceReads = await Promise.all(SOURCE_FILES.map(spec => readJson(root, { ...spec, maxAgeMs: 0 }, { nowMs, receipt: false })));
  const receipts = Object.fromEntries(receiptReads.map(item => [item.id, { ...item, data: undefined }]));
  const sources = Object.fromEntries(sourceReads.map(item => [item.id, { ...item, data: undefined }]));
  const invalid = receiptReads.filter(item => ['INVALID', 'UNREADABLE'].includes(item.state));
  const stale = receiptReads.filter(item => item.freshness === 'STALE');
  const unavailable = receiptReads.filter(item => item.state === 'UNAVAILABLE');
  const observed = receiptReads.filter(item => item.state === 'AVAILABLE');
  const synapticSource = receiptReads.find(item => item.id === 'synapticMap');
  const registrySource = sourceReads.find(item => item.id === 'frontierModelRegistry');
  const genesisSource = sourceReads.find(item => item.id === 'genesisImplementationLedger');
  const truthState = !graphIntegrity.ok || invalid.length
    ? 'DEGRADED'
    : unavailable.length || stale.length
      ? 'PARTIAL_OBSERVABILITY'
      : 'OBSERVED';
  return {
    schemaVersion: UBERBOND_COMMAND_CENTER_SCHEMA,
    policyVersion: UBERBOND_COMMAND_CENTER_POLICY_VERSION,
    generatedAt: date.toISOString(),
    truthState,
    truthBoundary: 'DISPLAYED_COUNTS_AND_STATES_COME_FROM_SOURCE_COMPILED_GRAPH_OR_FIXED_ALLOWLISTED_RECEIPTS. MISSING_STALE_OR_INVALID_EVIDENCE IS NEVER REPLACED WITH A DEMO VALUE.',
    cognitive: {
      graph: {
        status: graph.status,
        graphDigest: graph.graphDigest,
        nodes: graph.nodes,
        edges: graph.edges,
        nodeCount: graph.nodes?.length || 0,
        edgeCount: graph.edges?.length || 0
      },
      integrity: graphIntegrity
    },
    observability: {
      observedReceiptCount: observed.length,
      unavailableReceiptCount: unavailable.length,
      staleReceiptCount: stale.length,
      invalidReceiptCount: invalid.length,
      unavailable: unavailable.map(item => item.id),
      stale: stale.map(item => item.id),
      invalid: invalid.map(item => item.id)
    },
    receipts,
    sources,
    synapticPreview: synapticPreview(synapticSource),
    frontierModelRegistry: frontierRegistrySummary(registrySource),
    genesisImplementationLedger: genesisLedgerSummary(genesisSource),
    runtime: runtimeTruth(runtime),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    reasonCodes: unique([
      ...(!graphIntegrity.ok ? graphIntegrity.reasonCodes : []),
      ...invalid.map(item => `invalid:${item.id}`),
      ...stale.map(item => `stale:${item.id}`),
      ...unavailable.map(item => `unavailable:${item.id}`)
    ])
  };
}

export const UBERBOND_COMMAND_CENTER_RECEIPTS = RECEIPTS;
