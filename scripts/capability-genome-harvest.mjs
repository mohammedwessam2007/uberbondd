#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPABILITY_GENOME_HARVEST_VERSION,
  planGithubRepositorySearchPartitions,
  executeGithubRepositorySearch,
  buildMeasuredRepositoryCorpus,
  writeMeasuredCorpusBatch
} from '../src/capability-genome-harvest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return index === -1 ? [arg, true] : [arg.slice(0, index), arg.slice(index + 1)];
}));
const execute = args.has('--execute-github');
const today = new Date().toISOString().slice(0, 10);
const defaultStart = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);
const baseQueries = ['"claude skill"', '"agent skills"', '"mcp server"'];
const plan = planGithubRepositorySearchPartitions({
  baseQueries,
  startDate: args.get('--start') || defaultStart,
  endDate: args.get('--end') || today,
  partitionDays: Number(args.get('--partition-days') || 7),
  perPage: 100,
  maxPagesPerPartition: 10
});
if (!plan.ok) {
  console.log(JSON.stringify(plan, null, 2));
  process.exitCode = 1;
} else if (!execute) {
  console.log(JSON.stringify({
    ...plan,
    ok: true,
    status: 'WORLD_HARVEST_PLAN_ONLY',
    version: CAPABILITY_GENOME_HARVEST_VERSION,
    networkReadsExecuted: false
  }, null, 2));
} else if (process.env.UBERBOND_CAPABILITY_GENOME_NETWORK_READS !== '1') {
  console.log(JSON.stringify({
    ok: false,
    status: 'WORLD_HARVEST_NETWORK_READS_NOT_AUTHORIZED_ON_HOST',
    reasonCodes: ['set-UBERBOND_CAPABILITY_GENOME_NETWORK_READS=1-for-public-read-only-execution'],
    businessEffectAuthority: 'NONE'
  }, null, 2));
  process.exitCode = 2;
} else if (!process.env.UBERBOND_CAPABILITY_GENOME_CORPUS_DIR) {
  console.log(JSON.stringify({
    ok: false,
    status: 'WORLD_HARVEST_EXTERNAL_CORPUS_DIR_REQUIRED',
    reasonCodes: ['UBERBOND_CAPABILITY_GENOME_CORPUS_DIR-required'],
    businessEffectAuthority: 'NONE'
  }, null, 2));
  process.exitCode = 2;
} else {
  const execution = await executeGithubRepositorySearch({
    partitions: plan.partitions,
    maxProviderCalls: Number(args.get('--max-provider-calls') || 100)
  });
  if (!execution.ok || !Array.isArray(execution.queryReceipts) || execution.queryReceipts.length === 0) {
    console.log(JSON.stringify({ plan, execution }, null, 2));
    process.exitCode = execution.ok ? 3 : 1;
  } else {
    const corpus = buildMeasuredRepositoryCorpus({ queryReceipts: execution.queryReceipts, observedAt: new Date() });
    const stored = corpus.ok ? writeMeasuredCorpusBatch({
      corpusDir: process.env.UBERBOND_CAPABILITY_GENOME_CORPUS_DIR,
      corpus,
      repositoryRoot: root
    }) : corpus;
    console.log(JSON.stringify({
      ok: execution.ok && corpus.ok && stored.ok,
      planDigest: plan.planDigest,
      executionStatus: execution.status,
      providerCalls: execution.providerCalls,
      partitionsRequiringRefinement: execution.partitionsRequiringRefinement || [],
      corpusManifest: corpus.manifest || null,
      storage: stored.ok ? { status: stored.status, batchId: stored.batchId, batchDir: stored.batchDir } : stored,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: execution.externalEffectLedger
    }, null, 2));
    if (!(execution.ok && corpus.ok && stored.ok)) process.exitCode = 1;
  }
}
