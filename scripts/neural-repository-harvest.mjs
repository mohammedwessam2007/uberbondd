#!/usr/bin/env node
import path from 'node:path';
import { compileNeuralAtlasPlan, NEURAL_REPOSITORY_TARGET, NEURAL_FINAL_CAPABILITY_TARGET } from '../src/neural-repository-atlas.mjs';
import { compileNeuralGithubPartitions, executeNeuralGithubPartitions } from '../src/neural-github-harvest.mjs';
import { normalizeNeuralCapabilityObservation } from '../src/neural-exocortex-genome.mjs';
import { writeNeuralHarvestBatch, readNeuralHarvestState, writeNeuralHarvestState, readNeuralFinalManifest } from '../src/neural-exocortex-store.mjs';

const args = new Map(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)]; }));
const execute = args.has('--execute-github');
const corpusBase = process.env.UBERBOND_CAPABILITY_GENOME_CORPUS_DIR || '';
const rootDir = corpusBase ? path.resolve(corpusBase, 'neural-exocortex') : '';
const networkAuthorized = process.env.UBERBOND_CAPABILITY_GENOME_NETWORK_READS === '1';
const atlasBatchSize = Math.max(1, Math.min(50, Number(args.get('--atlas-batch-size') || 12)));
const windowDays = Math.max(1, Math.min(90, Number(args.get('--window-days') || 30)));
const maxProviderCalls = Math.max(1, Math.min(500, Number(args.get('--max-provider-calls') || 100)));
const refinementBatchSize = Math.max(1, Math.min(100, Number(args.get('--refinement-batch-size') || 20)));
const earliestDate = String(args.get('--earliest-date') || '2008-01-01');
const refreshIntervalSec = Math.max(3600, Number(args.get('--refresh-interval-sec') || 21600));
const atlas = compileNeuralAtlasPlan();

function isoDay(value = new Date()) { return new Date(value).toISOString().slice(0, 10); }
function addDays(day, delta) { const d = new Date(`${day}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); }
function defaultState() { return { schemaVersion: 'uberbond.neural-exocortex-harvest-state.v1', atlasCursor: 0, windowEnd: isoDay(), refinementQueue: [], unresolvedSaturatedLeaves: [], historicalSweepsCompleted: 0, providerCalls: 0, repositoryObservations: 0, capabilityObservations: 0, batches: 0, lastRunAt: null, nextEligibleAt: null, immutableFinalCapabilityTarget: NEURAL_FINAL_CAPABILITY_TARGET }; }
function emit(value, code = 0) { console.log(JSON.stringify(value, null, 2)); process.exitCode = code; }
function uniquePartitions(partitions = []) { const byId = new Map(); for (const part of partitions) if (part?.id && !byId.has(part.id)) byId.set(part.id, part); return [...byId.values()]; }

const state = await readNeuralHarvestState(rootDir, defaultState());
const finalManifest = rootDir ? await readNeuralFinalManifest(rootDir) : null;
if (!execute) {
  emit({ ok: true, status: 'NEURAL_EXOCORTEX_HARVEST_PLAN_ONLY', repositoryDiscoveryTarget: NEURAL_REPOSITORY_TARGET, finalDedupedCapabilityTarget: NEURAL_FINAL_CAPABILITY_TARGET, atlasFamilies: atlas.familyCount, atlasQueries: atlas.queryCount, atlasBatchSize, windowDays, refinementQueueDepth: state.refinementQueue?.length || 0, measuredFinalRetainedCapabilities: Number(finalManifest?.retainedCapabilityRecords || 0), finalTargetSatisfied: finalManifest?.immutableProgramTarget === NEURAL_FINAL_CAPABILITY_TARGET && finalManifest?.retainedCapabilityRecords >= NEURAL_FINAL_CAPABILITY_TARGET, networkReadsExecuted: false, revenueRuntimeDependency: 'NONE', promotionAuthority: 'NONE', consequenceAuthority: 'NONE' });
} else if (!networkAuthorized) {
  emit({ ok: false, status: 'NEURAL_EXOCORTEX_NETWORK_READS_NOT_AUTHORIZED', reasonCodes: ['UBERBOND_CAPABILITY_GENOME_NETWORK_READS=1-required'], revenueRuntimeDependency: 'NONE' }, 2);
} else if (!rootDir) {
  emit({ ok: false, status: 'NEURAL_EXOCORTEX_EXTERNAL_CORPUS_REQUIRED', reasonCodes: ['UBERBOND_CAPABILITY_GENOME_CORPUS_DIR-required'], revenueRuntimeDependency: 'NONE' }, 2);
} else if (state.nextEligibleAt && Date.now() < new Date(state.nextEligibleAt).getTime() && !args.has('--force')) {
  emit({ ok: true, status: 'NEURAL_EXOCORTEX_HARVEST_NOT_DUE', nextEligibleAt: state.nextEligibleAt, measuredFinalRetainedCapabilities: Number(finalManifest?.retainedCapabilityRecords || 0), state, revenueRuntimeDependency: 'NONE' });
} else {
  const priorRefinements = uniquePartitions(state.refinementQueue || []);
  let selectedPartitions = priorRefinements.slice(0, refinementBatchSize), windowStart = null;
  let windowEnd = state.windowEnd || isoDay(), source = 'REFINEMENT_QUEUE';
  if (!selectedPartitions.length) {
    source = 'ATLAS_SWEEP';
    const cursor = Math.max(0, Number(state.atlasCursor || 0)) % atlas.queries.length, entries = [];
    for (let i = 0; i < atlasBatchSize; i += 1) entries.push(atlas.queries[(cursor + i) % atlas.queries.length]);
    windowStart = addDays(windowEnd, -(windowDays - 1)); if (windowStart < earliestDate) windowStart = earliestDate;
    const compiled = compileNeuralGithubPartitions({ atlasEntries: entries, startDate: windowStart, endDate: windowEnd, maxEntries: entries.length });
    if (!compiled.ok) emit({ ...compiled, status: 'NEURAL_EXOCORTEX_PARTITION_COMPILE_REFUSED', revenueRuntimeDependency: 'NONE' }, 1);
    else selectedPartitions = compiled.partitions;
  }
  if (selectedPartitions.length) {
    const execution = await executeNeuralGithubPartitions({ partitions: selectedPartitions, maxProviderCalls });
    if (!execution.ok) emit({ ...execution, revenueRuntimeDependency: 'NONE' }, 1);
    else {
      const repositories = execution.receipts.flatMap(receipt => receipt.repositories || []), capabilities = [];
      let rejectedCapabilityObservations = 0;
      for (const repository of repositories) { const normalized = normalizeNeuralCapabilityObservation(repository, { observedAt: repository.observedAt || new Date() }); if (!normalized.ok) { rejectedCapabilityObservations += 1; continue; } capabilities.push(normalized.capability); }
      const stored = await writeNeuralHarvestBatch({ rootDir, repositories, capabilities, manifest: { source, providerCalls: execution.providerCalls, executionStatus: execution.status, requestedPartitionCount: selectedPartitions.length, processedPartitionCount: execution.processedPartitionIds?.length || execution.receipts.length, refinementCount: execution.refinements.length, unresolvedSaturatedLeafCount: execution.unresolvedSaturatedLeaves.length, rejectedCapabilityObservations, immutableFinalCapabilityTarget: NEURAL_FINAL_CAPABILITY_TARGET } });
      if (!stored.ok) emit({ ...stored, status: 'NEURAL_EXOCORTEX_BATCH_STORE_REFUSED', revenueRuntimeDependency: 'NONE' }, 1);
      else {
        const processedIds = new Set((execution.processedPartitionIds || execution.receipts.map(receipt => receipt.partitionId)).filter(Boolean));
        const processedPartitionCount = processedIds.size;
        let nextAtlasCursor = Number(state.atlasCursor || 0), nextWindowEnd = windowEnd, historicalSweepsCompleted = Number(state.historicalSweepsCompleted || 0);
        let remainingRefinements;
        if (source === 'REFINEMENT_QUEUE') {
          const untouchedPrior = priorRefinements.filter(partition => !processedIds.has(partition.id));
          remainingRefinements = uniquePartitions([...untouchedPrior, ...(execution.refinements || [])]);
        } else {
          nextAtlasCursor += processedPartitionCount;
          remainingRefinements = uniquePartitions([...(execution.refinements || [])]);
          if (nextAtlasCursor >= atlas.queries.length) { nextAtlasCursor = 0; const priorWindowEnd = addDays(windowStart, -1); if (priorWindowEnd < earliestDate) { historicalSweepsCompleted += 1; nextWindowEnd = isoDay(); } else nextWindowEnd = priorWindowEnd; }
        }
        const unresolved = [...(state.unresolvedSaturatedLeaves || []), ...(execution.unresolvedSaturatedLeaves || [])];
        const uniqueUnresolved = [...new Map(unresolved.filter(x => x?.partitionId).map(x => [x.partitionId, x])).values()].slice(-10000);
        const nextState = { ...state, atlasCursor: nextAtlasCursor, windowEnd: nextWindowEnd, refinementQueue: remainingRefinements, unresolvedSaturatedLeaves: uniqueUnresolved, historicalSweepsCompleted, providerCalls: Number(state.providerCalls || 0) + Number(execution.providerCalls || 0), repositoryObservations: Number(state.repositoryObservations || 0) + repositories.length, capabilityObservations: Number(state.capabilityObservations || 0) + capabilities.length, batches: Number(state.batches || 0) + 1, lastRunAt: new Date().toISOString(), nextEligibleAt: new Date(Date.now() + refreshIntervalSec * 1000).toISOString(), immutableFinalCapabilityTarget: NEURAL_FINAL_CAPABILITY_TARGET };
        await writeNeuralHarvestState(rootDir, nextState);
        const afterManifest = await readNeuralFinalManifest(rootDir);
        emit({ ok: true, status: execution.status === 'NEURAL_HARVEST_RATE_LIMITED_NO_BLIND_RETRY' ? execution.status : 'NEURAL_EXOCORTEX_HARVEST_BATCH_RECORDED', source, providerCalls: execution.providerCalls, requestedPartitions: selectedPartitions.length, processedPartitions: processedPartitionCount, repositoriesObservedThisBatch: repositories.length, capabilityClaimsThisBatch: capabilities.length, batchId: stored.batchId, queuedRefinements: nextState.refinementQueue.length, unresolvedSaturatedLeaves: nextState.unresolvedSaturatedLeaves.length, historicalSweepsCompleted: nextState.historicalSweepsCompleted, measuredFinalRetainedCapabilities: Number(afterManifest?.retainedCapabilityRecords || finalManifest?.retainedCapabilityRecords || 0), finalDedupedCapabilityTarget: NEURAL_FINAL_CAPABILITY_TARGET, finalTargetSatisfied: Number(afterManifest?.retainedCapabilityRecords || 0) >= NEURAL_FINAL_CAPABILITY_TARGET, state: nextState, revenueRuntimeDependency: 'NONE', promotionAuthority: 'NONE', consequenceAuthority: 'NONE', truthBoundary: 'HARVEST_BATCHES_ACCUMULATE_DISCOVERY_CLAIMS_ONLY__UNPROCESSED_OR_INTERRUPTED_PARTITIONS_REMAIN_QUEUED__THE_FINAL_ONE_MILLION_COUNT_COMES_ONLY_FROM_DEDUPED_COMPACTION__NO_DISCOVERED_RECORD_IS_EXECUTABLE_WITHOUT_SEPARATE_SECURITY_BENCHMARK_AND_APPROVAL' });
      }
    }
  }
}
