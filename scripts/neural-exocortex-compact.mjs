#!/usr/bin/env node
import path from 'node:path';
import { compactNeuralExocortexCorpus } from '../src/neural-exocortex-store.mjs';
import { FINAL_NEURAL_CAPABILITY_TARGET } from '../src/neural-exocortex-genome.mjs';

const corpusBase = process.env.UBERBOND_CAPABILITY_GENOME_CORPUS_DIR || '';
if (!corpusBase) {
  console.log(JSON.stringify({ ok: false, status: 'NEURAL_EXOCORTEX_EXTERNAL_CORPUS_REQUIRED', reasonCodes: ['UBERBOND_CAPABILITY_GENOME_CORPUS_DIR-required'] }, null, 2));
  process.exitCode = 2;
} else {
  const rootDir = path.resolve(corpusBase, 'neural-exocortex');
  const result = await compactNeuralExocortexCorpus({ rootDir, target: FINAL_NEURAL_CAPABILITY_TARGET, shardCount: 256 });
  console.log(JSON.stringify({ ...result, finalTarget: FINAL_NEURAL_CAPABILITY_TARGET, executionAuthority: 'NONE', truthBoundary: 'COMPACTION_SELECTS_THE_FINAL_DEDUPED_REFERENCE_LIBRARY_ONLY__ACTIVE_CORTEX_STILL_REQUIRES_SECURITY_BENCHMARK_AND_PROMOTION' }, null, 2));
  if (!result.ok) process.exitCode = 1;
}
