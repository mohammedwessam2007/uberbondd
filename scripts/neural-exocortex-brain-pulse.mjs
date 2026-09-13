#!/usr/bin/env node
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { compileNeuralExocortexCognitiveGraph } from '../src/neural-exocortex-cognitive-binding.mjs';
import { readNeuralFinalManifest } from '../src/neural-exocortex-store.mjs';
import { FINAL_NEURAL_CAPABILITY_TARGET } from '../src/neural-exocortex-genome.mjs';

const corpusBase = process.env.UBERBOND_CAPABILITY_GENOME_CORPUS_DIR || '';
if (!corpusBase) {
  console.log(JSON.stringify({ ok: false, status: 'NEURAL_EXOCORTEX_EXTERNAL_CORPUS_REQUIRED' }, null, 2));
  process.exitCode = 2;
} else {
  const root = path.resolve(corpusBase, 'neural-exocortex');
  const graph = compileNeuralExocortexCognitiveGraph();
  const finalManifest = await readNeuralFinalManifest(root);
  const receipt = {
    schemaVersion: 'uberbond.neural-exocortex-brain-receipt.v1', generatedAt: new Date().toISOString(), ok: graph.ok,
    status: graph.ok ? 'NEURAL_EXOCORTEX_BRAIN_BINDING_OBSERVED' : 'NEURAL_EXOCORTEX_BRAIN_BINDING_REFUSED',
    graphDigest: graph.graphDigest || null, graphIntegrityStatus: graph.integrity?.status || null,
    neuralNodePresent: graph.nodes?.some(node => node.id === 'neural-exocortex') === true,
    immutableFinalCapabilityTarget: FINAL_NEURAL_CAPABILITY_TARGET,
    retainedReferenceCapabilities: Number(finalManifest?.retainedCapabilityRecords || 0),
    finalTargetSatisfied: Number(finalManifest?.retainedCapabilityRecords || 0) >= FINAL_NEURAL_CAPABILITY_TARGET,
    activeCortexMaximum: graph.neuralExocortex?.activeCortexMaximum || null,
    executionAuthority: 'NONE', consequenceAuthority: 'NONE', truthBoundary: graph.truthBoundary
  };
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(path.join(root, 'brain-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.ok) process.exitCode = 1;
}
