import crypto from 'node:crypto';
import { compileUberBondCognitiveGraph, cognitiveGraphIntegrity } from './uberbond-cognitive-graph.mjs';
import { FINAL_NEURAL_CAPABILITY_TARGET, ACTIVE_NEURAL_CORTEX_MAX } from './neural-exocortex-genome.mjs';

export const NEURAL_EXOCORTEX_COGNITIVE_BINDING_VERSION = 'uberbond.neural-exocortex-cognitive-binding.v1';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const NEURAL_EXOCORTEX_NODE = Object.freeze({ id: 'neural-exocortex', kind: 'PERSONAL_EXOCORTEX', label: 'Neural Exocortex Genome', truthClass: 'VERIFIED_CURRENT' });
export const NEURAL_EXOCORTEX_EDGES = Object.freeze([
  { from: 'world-sensing', to: 'neural-exocortex', type: 'FEEDS' },
  { from: 'truth-evidence', to: 'neural-exocortex', type: 'CONSTRAINS' },
  { from: 'capability-genome', to: 'neural-exocortex', type: 'SUPPLIES' },
  { from: 'open-model-universe', to: 'neural-exocortex', type: 'SUPPLIES' },
  { from: 'context-spine', to: 'neural-exocortex', type: 'SUPPLIES' },
  { from: 'neural-exocortex', to: 'world-brain', type: 'SUPPLIES' },
  { from: 'neural-exocortex', to: 'avengers', type: 'SUPPLIES' },
  { from: 'neural-exocortex', to: 'max-council', type: 'SUPPLIES' },
  { from: 'neural-exocortex', to: 'capability-genome', type: 'FEEDBACK_TO' },
  { from: 'neural-exocortex', to: 'economic-memory', type: 'FEEDS' }
]);

export function compileNeuralExocortexCognitiveGraph() {
  const graph = compileUberBondCognitiveGraph({ extraNodes: [NEURAL_EXOCORTEX_NODE], extraEdges: NEURAL_EXOCORTEX_EDGES });
  if (!graph.ok) return graph;
  const integrity = cognitiveGraphIntegrity(graph);
  return {
    ...graph,
    ok: integrity.ok,
    status: integrity.ok ? 'NEURAL_EXOCORTEX_BOUND_TO_WHOLE_BRAIN' : 'NEURAL_EXOCORTEX_GRAPH_BINDING_INVALID',
    integrity,
    neuralExocortex: {
      nodeId: NEURAL_EXOCORTEX_NODE.id,
      immutableFinalCapabilityTarget: FINAL_NEURAL_CAPABILITY_TARGET,
      activeCortexMaximum: ACTIVE_NEURAL_CORTEX_MAX,
      bindingDigest: hash({ node: NEURAL_EXOCORTEX_NODE, edges: NEURAL_EXOCORTEX_EDGES }),
      authorityLaw: 'REFERENCE_CAPABILITY_PRESENCE_NEVER_CREATES_EXECUTION_OR_CONSEQUENCE_AUTHORITY'
    },
    truthBoundary: 'THE_NEURAL_EXOCORTEX_IS_BOUND_INTO_THE_WHOLE_BRAIN_INFORMATION_GRAPH__THE_ONE_MILLION_TARGET_IS_A_REFERENCE_CAPABILITY_LIBRARY__ONLY_SEPARATELY_APPROVED_SECURITY_REVIEWED_BENCHMARKED_CAPABILITIES_MAY_ENTER_A_MISSION_ACTIVE_CORTEX__THIS_IS_NOT_ASI_PROOF'
  };
}
