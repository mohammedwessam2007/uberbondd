import crypto from 'node:crypto';

export const EXECUTION_LEAF_GRAPH_RECEIPT_DIGEST_VERSION = 'uberbond.execution-leaf-graph-receipt-digest.v1.2';
const SHA = /^[0-9a-f]{40}$/;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function recomputeExecutionLeafGraphDigest(graph = {}) {
  const sourceCommit = String(graph?.sourceCommit ?? '').trim().toLowerCase();
  if (!SHA.test(sourceCommit)) return null;
  if (!Array.isArray(graph?.requirements) || !Array.isArray(graph?.leaves) || !Array.isArray(graph?.topologicalWaves) || !Array.isArray(graph?.criticalPath)) return null;
  const stable = {
    sourceCommit,
    requirements: graph.requirements,
    leaves: graph.leaves,
    topologicalWaves: graph.topologicalWaves,
    criticalPath: graph.criticalPath
  };
  // New graphs cryptographically bind the concurrency proof. The conditional
  // keeps historical source fixtures readable, but cannot make a new graph's
  // proof optional because its stored digest was created with this field.
  if (graph?.parallelismProof && typeof graph.parallelismProof === 'object') stable.parallelismProof = graph.parallelismProof;
  return digest(stable);
}

export function recomputeCanonicalExecutionBindingDigest(binding = {}) {
  const sourceCommit = String(binding?.sourceCommit ?? '').trim().toLowerCase();
  if (!SHA.test(sourceCommit)) return null;
  if (!Array.isArray(binding?.canonicalRequirementIds)) return null;
  const canonicalBinding = {
    sourceCommit,
    coverageContentDigest: binding?.coverageContentDigest ?? null,
    canonicalRequirementIds: binding.canonicalRequirementIds,
    coverageRows: binding?.coverageRows ?? null,
    extractedConcepts: binding?.extractedConcepts ?? null,
    coverageStates: binding?.coverageStates ?? {},
    graphDigest: binding?.graphDigest ?? null
  };
  return digest(canonicalBinding);
}
