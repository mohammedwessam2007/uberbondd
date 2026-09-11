import {
  MILLION_WORMHOLE_CANDIDATE_COUNT,
  encodeMillionWormholeIndex,
  renderMillionWormholeCandidate
} from './million-wormhole-universe.mjs';
import { MILLION_WORMHOLE_OPERATORS } from './million-wormhole-operators.mjs';
import { incrementalBuildDistance } from './opportunity-registry.mjs';
import { listCapabilities } from './capability-graph.mjs';

export const INVARIANT_COGNITION_COMPILER_VERSION = 'uberbond.invariant-cognition-compiler.v1';
export const INVARIANT_COGNITION_MAX_GLOBAL_TOP_K = 64;
export const INVARIANT_COGNITION_AUTHORITY = Object.freeze({ promotionAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' });
export const INVARIANT_COGNITION_TRUTH_BOUNDARY = 'PURE_INVARIANT_COMPILATION_ONLY__SEMANTIC_IDENTITY_REQUIRED__NO_EXTERNAL_EFFECT';

const HIGH_OPERATORS = new Set([
  'DELETE_REQUIREMENT','TOPOLOGY_DELETE','THOUGHT_COMPILATION','DYNAMIC_MODEL_ROUTING',
  'DYNAMIC_EXPERT_ROUTING','COMPILE_TO_CODE','SYMBOLIC_SOLVE','FORMALIZE',
  'COUNTERFACTUAL_SEARCH','EXTERNALIZE_MEMORY','EXTERNALIZE_TOOL','META_LEARN','PROGRAM_SYNTHESIS'
]);
const LOW_COST_SUBSTRATES = new Set(['LOCAL_CPU','OPEN_MODEL_MESH','SYMBOLIC_FORMAL_STACK','WORLD_TOOL_MEMORY_FABRIC']);
const STRONG_VERIFIERS = new Set(['HOSTILE_ADVERSARIAL','HELDOUT_BENCHMARK','FORMAL_PROPERTY','COUNTERFACTUAL_ABLATION','INDEPENDENT_PANEL']);
const HIGH_OPERATOR_IDS = MILLION_WORMHOLE_OPERATORS.map((name, index) => HIGH_OPERATORS.has(name) ? index : null).filter(Number.isInteger);

const axisProbe = ({ organFamilyId = 0, organFunctionId = 0, operatorId = 0, substrateId = 0, verifierId = 0 }) =>
  renderMillionWormholeCandidate(encodeMillionWormholeIndex({ organFamilyId, organFunctionId, operatorId, substrateId, verifierId }));
const SPECIAL_ORGAN_FAMILY_IDS = Array.from({ length: 32 }, (_, organFamilyId) => organFamilyId)
  .filter(organFamilyId => /Wormhole|Reality Compiler|UberMind|Capability Lab|UberDNA/.test(axisProbe({ organFamilyId }).organ));
const LOW_COST_SUBSTRATE_IDS = Array.from({ length: 8 }, (_, substrateId) => substrateId)
  .filter(substrateId => LOW_COST_SUBSTRATES.has(axisProbe({ substrateId }).substrate));
const STRONG_VERIFIER_IDS = Array.from({ length: 8 }, (_, verifierId) => verifierId)
  .filter(verifierId => STRONG_VERIFIERS.has(axisProbe({ verifierId }).verification));

const MAX_PRIOR_INDICES = Object.freeze((() => {
  const indices = [];
  for (const organFamilyId of SPECIAL_ORGAN_FAMILY_IDS) {
    for (let organFunctionId = 0; organFunctionId < 8; organFunctionId++) {
      for (const operatorId of HIGH_OPERATOR_IDS) {
        for (const substrateId of LOW_COST_SUBSTRATE_IDS) {
          for (const verifierId of STRONG_VERIFIER_IDS) {
            indices.push(encodeMillionWormholeIndex({ organFamilyId, organFunctionId, operatorId, substrateId, verifierId }));
          }
        }
      }
    }
  }
  indices.sort((a, b) => a - b);
  return indices;
})());

if (MAX_PRIOR_INDICES.length < INVARIANT_COGNITION_MAX_GLOBAL_TOP_K) throw new Error('invariant-cognition-max-prior-space-too-small');

export function compileMillionWormholeGlobalPriorTopK(topK = 32) {
  if (!Number.isSafeInteger(topK) || topK < 1 || topK > INVARIANT_COGNITION_MAX_GLOBAL_TOP_K) throw new Error('bounded-global-top-k-required');
  const indices = MAX_PRIOR_INDICES.slice(0, topK);
  return { ok: true, version: INVARIANT_COGNITION_COMPILER_VERSION, candidateUniverse: MILLION_WORMHOLE_CANDIDATE_COUNT, selected: indices.map(index => ({ ...renderMillionWormholeCandidate(index), staticPrior: 0.98 })), ...INVARIANT_COGNITION_AUTHORITY, truthBoundary: INVARIANT_COGNITION_TRUTH_BOUNDARY };
}

export function compileBuildDistanceBatch({ requiredCapabilities = [], existingCapabilities = [], repetitions = 1 } = {}) {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 10_000) throw new Error('bounded-build-distance-repetitions-required');
  const compiled = incrementalBuildDistance(requiredCapabilities, existingCapabilities);
  return { ok: true, version: INVARIANT_COGNITION_COMPILER_VERSION, rows: Array.from({ length: repetitions }, () => compiled), final: compiled, ...INVARIANT_COGNITION_AUTHORITY, truthBoundary: INVARIANT_COGNITION_TRUTH_BOUNDARY };
}

export function computeCapabilityTopology(capabilities = listCapabilities()) {
  if (!Array.isArray(capabilities) || !capabilities.length) throw new Error('capability-graph-required');
  const normalized = capabilities.map(row => ({ id: String(row?.id || '').trim(), dependencies: Array.isArray(row?.dependencies) ? row.dependencies.map(String) : [] }));
  if (normalized.some(row => !row.id)) throw new Error('capability-id-required');
  if (new Set(normalized.map(row => row.id)).size !== normalized.length) throw new Error('duplicate-capability-id');
  const ids = new Set(normalized.map(row => row.id));
  if (normalized.some(row => row.dependencies.some(dep => !ids.has(dep)))) throw new Error('unknown-capability-dependency');
  const indegree = new Map(normalized.map(row => [row.id, row.dependencies.length]));
  const children = new Map(normalized.map(row => [row.id, []]));
  const depth = new Map(normalized.map(row => [row.id, 0]));
  for (const row of normalized) for (const dependency of row.dependencies) children.get(dependency).push(row.id);
  for (const values of children.values()) values.sort();
  const queue = normalized.map(row => row.id).filter(id => indegree.get(id) === 0).sort();
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const child of children.get(id)) {
      depth.set(child, Math.max(depth.get(child), depth.get(id) + 1));
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) { queue.push(child); queue.sort(); }
    }
  }
  if (order.length !== normalized.length) throw new Error('capability-graph-cycle-refused');
  const maxDepth = Math.max(...depth.values(), 0);
  return { order, waves: Array.from({ length: maxDepth + 1 }, (_, wave) => ({ wave, capabilities: order.filter(id => depth.get(id) === wave) })), depth: Object.fromEntries([...depth.entries()].sort(([a], [b]) => a.localeCompare(b))) };
}

const COMPILED_CAPABILITY_TOPOLOGY = computeCapabilityTopology();

export function compileCapabilityTopologyBatch(tasks = []) {
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 10_000) throw new Error('bounded-topology-task-batch-required');
  return { ok: true, version: INVARIANT_COGNITION_COMPILER_VERSION, rows: tasks.map(task => ({ task, topology: COMPILED_CAPABILITY_TOPOLOGY })), ...INVARIANT_COGNITION_AUTHORITY, truthBoundary: INVARIANT_COGNITION_TRUTH_BOUNDARY };
}

export function invariantCognitionCompilerDescriptor() {
  return { version: INVARIANT_COGNITION_COMPILER_VERSION, mechanisms: ['MILLION_WORMHOLE_GLOBAL_PRIOR_TOPK','OPPORTUNITY_BUILD_DISTANCE_BATCH','CAPABILITY_GRAPH_TOPOLOGY_BATCH'], globalTopKLimit: INVARIANT_COGNITION_MAX_GLOBAL_TOP_K, maxPriorCandidateCount: MAX_PRIOR_INDICES.length, ...INVARIANT_COGNITION_AUTHORITY, truthBoundary: INVARIANT_COGNITION_TRUTH_BOUNDARY };
}
