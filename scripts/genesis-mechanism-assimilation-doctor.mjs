#!/usr/bin/env node
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileContinuationGraph,
  recordContinuationResult,
  buildContinuationCheckpoint,
  resumeContinuationGraph,
  continuationCapabilityAtom
} from '../src/continuation-graph-runtime.mjs';
import { assimilateFrontierMechanism } from '../src/genesis-mechanism-assimilation.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, process.argv[2] || 'artifacts/cognitive/genesis-mechanism-assimilation-doctor-latest.json');

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const graph = compileContinuationGraph({
  objective: 'Assimilate a frontier mechanism into UberBond without depending on one model session.',
  maxParallel: 2,
  nodes: [
    { id: 'extract', objective: 'Extract changed mechanism primitives', maxAttempts: 2 },
    { id: 'falsify', objective: 'Search for failure modes and donor assumptions', maxAttempts: 2 },
    { id: 'mutate', objective: 'Generate N+1 variants', dependsOn: ['extract', 'falsify'], proofRequirements: ['variant receipt'] },
    { id: 'shockwave', objective: 'Translate surviving variants into opportunity hypotheses', dependsOn: ['mutate'], proofRequirements: ['opportunity shockwave receipt'] }
  ]
});
assert(graph.ok, 'continuation graph failed to compile');
assert(JSON.stringify(graph.state.runnableNodeIds) === JSON.stringify(['extract', 'falsify']), 'unexpected initial runnable frontier');

let advanced = recordContinuationResult({
  graph,
  nodeId: 'extract',
  result: { status: 'COMPLETED', receiptDigest: sha('extract-complete'), evidencePointers: ['receipt:doctor:extract'] }
});
assert(advanced.ok, 'extract result was rejected');
advanced = recordContinuationResult({
  graph: advanced,
  nodeId: 'falsify',
  result: { status: 'COMPLETED', receiptDigest: sha('falsify-complete'), evidencePointers: ['receipt:doctor:falsify'] }
});
assert(advanced.ok, 'falsify result was rejected');
assert(JSON.stringify(advanced.state.runnableNodeIds) === JSON.stringify(['mutate']), 'dependencies did not unlock mutate node');

const checkpoint = buildContinuationCheckpoint({
  graph: advanced,
  sourceRevision: 'doctor-fixture-v1',
  memoryPointers: ['memory:mechanism-assimilation', 'receipt:doctor:extract', 'receipt:doctor:falsify']
});
assert(checkpoint.ok, 'checkpoint failed');
const resumed = resumeContinuationGraph({
  graph: advanced,
  checkpoint: checkpoint.checkpoint,
  currentSourceRevision: 'doctor-fixture-v1'
});
assert(resumed.ok && resumed.status === 'CONTINUATION_RESUME_READY', 'checkpoint could not resume exact graph state');

const capabilityAtom = continuationCapabilityAtom();
assert(capabilityAtom.ok, 'continuation Capability Genome atom did not normalize');

const assimilation = assimilateFrontierMechanism({
  mechanism: {
    id: 'doctor-resumable-work-graph',
    name: 'Resumable work graph',
    sourceUrl: 'internal-doctor:resumable-work-graph',
    mechanism: 'Compile long-horizon work into dependency-safe packets with externalized state, local retry, proof-carrying completion and lawful continuation across replaceable reasoning providers.',
    changedPrimitives: ['dependency graph', 'durable checkpoint', 'local retry', 'provider-independent continuation'],
    domains: ['agent infrastructure', 'workflow reliability', 'research automation'],
    assumptions: ['one context owns continuity'],
    failureModes: ['stale checkpoint', 'duplicate continuation', 'provider capacity unavailable'],
    inputs: ['objective', 'work graph', 'evidence'],
    outputs: ['runnable frontier', 'checkpoint', 'verified continuation receipt'],
    evidenceRefs: ['signal:doctor-resumable-work-graph']
  },
  knownConcepts: ['sequential agent loop', 'manual checkpoint resume'],
  maxVariants: 16,
  maxShockwave: 16
});
assert(assimilation.ok, 'GENESIS assimilation failed');
assert(assimilation.variantCount === 16, 'assimilation did not produce the requested bounded N+1 population');
assert(assimilation.variants.some(item => item.mutations.includes('topology-learning')), 'topology-learning mutation missing');
assert(assimilation.sourceInstructionAuthority === 'NONE', 'source acquired instruction authority');
assert(assimilation.executionAuthority === 'NONE', 'assimilation acquired execution authority');
assert(JSON.stringify(assimilation.externalEffectLedger) === JSON.stringify(ZERO_EXTERNAL_EFFECTS), 'assimilation external-effect ledger widened');

const receipt = {
  schema: 'uberbond.genesis-mechanism-assimilation-doctor.v1',
  status: 'GENESIS_MECHANISM_ASSIMILATION_DOCTOR_PASSED',
  continuation: {
    graphDigest: graph.graphDigest,
    checkpointDigest: checkpoint.checkpoint.checkpointDigest,
    initialRunnableNodeIds: graph.state.runnableNodeIds,
    resumedRunnableNodeIds: resumed.state.runnableNodeIds,
    capabilityAtom: capabilityAtom.atom
  },
  assimilation: {
    assimilationDigest: assimilation.assimilationDigest,
    variantCount: assimilation.variantCount,
    opportunityShockwaveCount: assimilation.opportunityShockwaveCount,
    topVariant: assimilation.variants[0] ? {
      variantId: assimilation.variants[0].variantId,
      mutations: assimilation.variants[0].mutations,
      genesisScore: assimilation.variants[0].genesisScore
    } : null
  },
  sourceInstructionAuthority: 'NONE',
  promotionAuthority: 'NONE',
  executionAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  truthBoundary: 'DETERMINISTIC INTERNAL DOCTOR EVIDENCE ONLY; IT DOES NOT PROVE EXTERNAL DEMAND, PROVIDER CAPACITY, PRODUCTION AUTHORITY OR ECONOMIC VALUE.'
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: true,
  status: receipt.status,
  graphDigest: receipt.continuation.graphDigest,
  checkpointDigest: receipt.continuation.checkpointDigest,
  variantCount: receipt.assimilation.variantCount,
  opportunityShockwaveCount: receipt.assimilation.opportunityShockwaveCount,
  output,
  externalEffectAuthority: 'NONE'
}, null, 2)}\n`);
