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
import { buildMechanismAssimilationBatch } from '../src/genesis-mechanism-assimilation.mjs';
import { genesisMechanismDonorRegistry } from '../src/genesis-mechanism-donor-registry.mjs';
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
  objective: 'Assimilate frontier mechanisms into UberBond without depending on one model session.',
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

const registry = genesisMechanismDonorRegistry();
assert(registry.ok && registry.donorCount === 8, 'expected exactly eight bounded donor mechanisms');
assert(registry.sourceInstructionAuthority === 'NONE', 'donor registry acquired instruction authority');

const assimilation = buildMechanismAssimilationBatch({
  mechanisms: registry.donors,
  knownConcepts: [
    'sequential agent loop',
    'manual checkpoint handoff',
    'single provider autonomous agent',
    'passive transcript memory',
    'fixed task DAG'
  ],
  maxMechanisms: 8,
  maxVariantsPerMechanism: 16,
  maxShockwavePerMechanism: 16
});
assert(assimilation.ok, 'GENESIS assimilation batch failed');
assert(assimilation.assimilatedCount === registry.donorCount, 'not every donor mechanism was assimilated');
assert(assimilation.rejectedCount === 0, 'a donor mechanism was rejected');
assert(assimilation.sourceInstructionAuthority === 'NONE', 'source acquired instruction authority');
assert(assimilation.executionAuthority === 'NONE', 'assimilation acquired execution authority');
assert(JSON.stringify(assimilation.externalEffectLedger) === JSON.stringify(ZERO_EXTERNAL_EFFECTS), 'assimilation external-effect ledger widened');

const totalVariants = assimilation.results.reduce((sum, item) => sum + Number(item.variantCount || 0), 0);
const totalShockwaves = assimilation.results.reduce((sum, item) => sum + Number(item.opportunityShockwaveCount || 0), 0);
assert(totalVariants === registry.donorCount * 16, 'donor genome did not generate the full bounded N+1 population');
assert(assimilation.results.every(item => item.variants.some(variant => variant.mutations.includes('topology-learning'))), 'one donor population lacks topology-learning mutation');
assert(assimilation.results.every(item => item.variants.some(variant => variant.mutations.length === 2)), 'one donor population lacks paired N+1 mutations');

const topVariants = assimilation.results.map(item => item.variants[0]).filter(Boolean).map(variant => ({
  variantId: variant.variantId,
  sourceMechanismId: variant.sourceMechanismId,
  mutations: variant.mutations,
  genesisScore: variant.genesisScore,
  opportunityReach: variant.capabilityMultiplication?.touchedOpportunityCount || 0
}));

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
  donorGenome: {
    registryDigest: registry.registryDigest,
    donorCount: registry.donorCount,
    donorIds: registry.donors.map(item => item.id)
  },
  assimilation: {
    assimilatedCount: assimilation.assimilatedCount,
    rejectedCount: assimilation.rejectedCount,
    totalVariants,
    totalShockwaves,
    topVariants
  },
  sourceInstructionAuthority: 'NONE',
  promotionAuthority: 'NONE',
  executionAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  truthBoundary: 'DETERMINISTIC INTERNAL DOCTOR EVIDENCE ONLY; DONOR MECHANISMS AND GENERATED N+1 POPULATIONS DO NOT PROVE EXTERNAL DEMAND, PROVIDER CAPACITY, PRODUCTION AUTHORITY OR ECONOMIC VALUE.'
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: true,
  status: receipt.status,
  graphDigest: receipt.continuation.graphDigest,
  checkpointDigest: receipt.continuation.checkpointDigest,
  donorCount: receipt.donorGenome.donorCount,
  totalVariants: receipt.assimilation.totalVariants,
  totalShockwaves: receipt.assimilation.totalShockwaves,
  output,
  externalEffectAuthority: 'NONE'
}, null, 2)}\n`);
