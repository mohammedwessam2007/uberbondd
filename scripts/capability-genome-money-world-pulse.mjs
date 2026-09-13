#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  planGithubRepositorySearchPartitions,
  executeGithubRepositorySearch,
  buildMeasuredRepositoryCorpus,
  writeMeasuredCorpusBatch
} from '../src/capability-genome-harvest.mjs';
import {
  MONEY_CAPABILITY_TARGETS,
  buildMoneyCapabilitySearchAtlas,
  selectMoneyCapabilityTournament
} from '../src/capability-genome-money-atlas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = process.env.UBERBOND_CAPABILITY_GENOME_CORPUS_DIR || '';
const networkAuthorized = process.env.UBERBOND_CAPABILITY_GENOME_NETWORK_READS === '1';
const args = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));
const execute = args.has('--execute-github');
const queryBatchSize = Math.max(1, Math.min(25, Number(args.get('--query-batch-size') || 10)));
const windowDays = Math.max(1, Math.min(90, Number(args.get('--window-days') || 30)));
const maxProviderCalls = Math.max(1, Math.min(200, Number(args.get('--max-provider-calls') || 80)));
const refreshIntervalSec = Math.max(3600, Number(args.get('--refresh-interval-sec') || 21600));
const earliestDate = String(args.get('--earliest-date') || '2008-01-01');
const atlas = buildMoneyCapabilitySearchAtlas();

function isoDay(date) { return date.toISOString().slice(0, 10); }
function addDays(iso, delta) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDay(d);
}
function statePath() { return path.join(corpusDir, 'money-world-harvest-state.json'); }
function readState() {
  const today = isoDay(new Date());
  const fallback = { version: 1, queryCursor: 0, windowEnd: today, cycles: 0, providerCalls: 0, repositoryObservations: 0, lastRunAt: null, nextEligibleAt: null };
  if (!corpusDir) return fallback;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return { ...fallback, ...parsed };
  } catch { return fallback; }
}
function writeState(state) {
  fs.mkdirSync(corpusDir, { recursive: true, mode: 0o700 });
  const target = statePath();
  const temp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, target);
}
function emit(value, code = 0) {
  console.log(JSON.stringify(value, null, 2));
  process.exitCode = code;
}

const state = readState();
const now = new Date();
if (!execute) {
  emit({
    ok: true,
    status: 'MONEY_WORLD_CAPABILITY_PULSE_PLAN_ONLY',
    atlasQueries: atlas.length,
    target: MONEY_CAPABILITY_TARGETS,
    queryBatchSize,
    windowDays,
    maxProviderCalls,
    revenueRuntimeDependency: 'NONE',
    externalEffectAuthority: 'PUBLIC_READ_ONLY_WHEN_EXPLICITLY_ENABLED',
    promotionAuthority: 'NONE'
  });
} else if (!networkAuthorized) {
  emit({ ok: false, status: 'MONEY_WORLD_CAPABILITY_NETWORK_READS_NOT_AUTHORIZED_ON_HOST', reasonCodes: ['UBERBOND_CAPABILITY_GENOME_NETWORK_READS=1-required'], revenueRuntimeDependency: 'NONE' }, 2);
} else if (!corpusDir) {
  emit({ ok: false, status: 'MONEY_WORLD_CAPABILITY_EXTERNAL_CORPUS_REQUIRED', reasonCodes: ['UBERBOND_CAPABILITY_GENOME_CORPUS_DIR-required'], revenueRuntimeDependency: 'NONE' }, 2);
} else if (state.nextEligibleAt && now.getTime() < new Date(state.nextEligibleAt).getTime()) {
  emit({ ok: true, status: 'MONEY_WORLD_CAPABILITY_PULSE_NOT_DUE', nextEligibleAt: state.nextEligibleAt, state, revenueRuntimeDependency: 'NONE' });
} else {
  const startCursor = Number(state.queryCursor || 0) % atlas.length;
  const batch = [];
  for (let i = 0; i < queryBatchSize; i += 1) batch.push(atlas[(startCursor + i) % atlas.length]);
  const windowEnd = state.windowEnd || isoDay(now);
  const windowStart = addDays(windowEnd, -(windowDays - 1));
  const plan = planGithubRepositorySearchPartitions({
    baseQueries: batch.map(entry => entry.query),
    startDate: windowStart < earliestDate ? earliestDate : windowStart,
    endDate: windowEnd,
    partitionDays: windowDays,
    perPage: 100,
    maxPagesPerPartition: 10
  });
  if (!plan.ok) {
    emit({ ...plan, status: 'MONEY_WORLD_CAPABILITY_PLAN_REFUSED', revenueRuntimeDependency: 'NONE' }, 1);
  } else {
    const execution = await executeGithubRepositorySearch({ partitions: plan.partitions, maxProviderCalls });
    if (!execution.ok && (!execution.queryReceipts || execution.queryReceipts.length === 0)) {
      emit({ ok: false, status: execution.status || 'MONEY_WORLD_CAPABILITY_EXECUTION_FAILED', execution, revenueRuntimeDependency: 'NONE' }, 1);
    } else {
      const corpus = buildMeasuredRepositoryCorpus({ sourceId: 'github-public-capability-search', queryReceipts: execution.queryReceipts || [], observedAt: now });
      const stored = corpus.ok ? writeMeasuredCorpusBatch({ corpusDir, corpus, repositoryRoot: root }) : corpus;
      const tournament = corpus.ok ? selectMoneyCapabilityTournament(corpus.candidates || [], { limit: MONEY_CAPABILITY_TARGETS.tournamentEntrants, now }) : null;

      const nextCursorRaw = startCursor + batch.length;
      const completedAtlasPass = nextCursorRaw >= atlas.length;
      let nextWindowEnd = windowEnd;
      let nextCursor = nextCursorRaw % atlas.length;
      let cycles = Number(state.cycles || 0);
      if (completedAtlasPass) {
        cycles += 1;
        const priorWindowEnd = addDays(windowStart, -1);
        nextWindowEnd = priorWindowEnd < earliestDate ? isoDay(now) : priorWindowEnd;
        nextCursor = 0;
      }
      const nextEligibleAt = new Date(now.getTime() + refreshIntervalSec * 1000).toISOString();
      const nextState = {
        version: 1,
        queryCursor: nextCursor,
        windowEnd: nextWindowEnd,
        cycles,
        providerCalls: Number(state.providerCalls || 0) + Number(execution.providerCalls || 0),
        repositoryObservations: Number(state.repositoryObservations || 0) + Number(corpus?.manifest?.candidateCount || corpus?.candidates?.length || 0),
        lastRunAt: now.toISOString(),
        nextEligibleAt,
        lastBatchId: stored?.batchId || null,
        target: MONEY_CAPABILITY_TARGETS
      };
      if (stored.ok) writeState(nextState);
      emit({
        ok: Boolean(corpus.ok && stored.ok),
        status: corpus.ok && stored.ok ? 'MONEY_WORLD_CAPABILITY_PULSE_RECORDED' : 'MONEY_WORLD_CAPABILITY_PULSE_PARTIAL',
        queryFamilies: [...new Set(batch.map(entry => entry.family))],
        queries: batch.map(entry => entry.query),
        window: { startDate: windowStart < earliestDate ? earliestDate : windowStart, endDate: windowEnd },
        executionStatus: execution.status,
        providerCalls: execution.providerCalls,
        corpusManifest: corpus.manifest || null,
        storage: stored.ok ? { batchId: stored.batchId, batchDir: stored.batchDir } : stored,
        tournament: tournament ? { observed: tournament.observed, unique: tournament.unique, selected: tournament.selected, truth: tournament.truth } : null,
        state: nextState,
        target: MONEY_CAPABILITY_TARGETS,
        revenueRuntimeDependency: 'NONE',
        businessEffectAuthority: 'NONE',
        promotionAuthority: 'NONE',
        moneyMovementAuthority: 'NONE'
      }, corpus.ok && stored.ok ? 0 : 1);
    }
  }
}
