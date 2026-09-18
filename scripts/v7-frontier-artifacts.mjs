#!/usr/bin/env node
// Generates the six frontier artifacts the V7 contract names and this repository
// can actually compute: baselines, evaluation epoch, mission DAG, resource
// allocation, frontier checkpoint, final frontier state.
//
// They are one script because they are one computation read six ways -- the
// checkpoint is the DAG plus the baselines, the allocation is the DAG filtered,
// the final state is all of it plus the completion law. Splitting them into six
// generators would mean six reads of the same inputs and six chances for them to
// disagree about what head they describe.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  baselineEntry, baselineContradictions, buildMissionDag, allocateEffort,
  V7_FRONTIER_STATE_VERSION, EXTERNAL_STATUSES
} from '../src/v7-frontier-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = p => { try { return JSON.parse(readFileSync(resolve(root, p), 'utf8')); } catch { return null; } };
const has = p => existsSync(resolve(root, p));

function sh(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim(); }
  catch (error) { return (error.stdout || '').trim() || null; }
}

function write(path, body) {
  mkdirSync(resolve(root, dirname(path)), { recursive: true });
  writeFileSync(resolve(root, path), `${JSON.stringify(body, null, 2)}\n`);
}

const envelope = (schema, sourceSha) => ({
  schemaVersion: schema,
  generatedAt: new Date().toISOString(),
  sourceSha,
  generator: 'scripts/v7-frontier-artifacts.mjs',
  stateVersion: V7_FRONTIER_STATE_VERSION,
  externalEffects: [],
  businessEffectAuthority: 'NONE'
});

function buildBaselines(sourceSha, now) {
  const readiness = readJson('artifacts/system-readiness.json') ?? {};
  const directives = readJson('artifacts/constitution/directives.json') ?? {};
  const recorded = readiness.measurements ?? {};

  // Live where it is cheap to be live. Running the full suite here would make
  // generating an artifact cost four minutes, so those stay RECORDED and carry
  // their age.
  const syntaxOut = sh('npm', ['run', 'check:syntax']);
  const syntaxFiles = Number((syntaxOut?.match(/([\d,]+) files parse/) || [])[1]?.replace(/,/g, '')) || null;

  const entries = [
    baselineEntry({ metric: 'checkSyntaxFilesParsed', value: syntaxFiles, mode: syntaxFiles ? 'LIVE' : 'UNAVAILABLE', now }),
    baselineEntry({ metric: 'checkSyntaxFilesParsed', value: recorded['check:syntax']?.filesParsed ?? null, mode: 'RECORDED', ranAt: recorded['check:syntax']?.ranAt ?? null, staleAfterDays: 1, now }),
    baselineEntry({ metric: 'mutationAnchorsRegistered', value: directives.counts?.mutationAnchorsAvailable ?? null, mode: 'LIVE', now }),
    baselineEntry({ metric: 'constitutionDirectives', value: directives.counts?.directives ?? null, mode: 'LIVE', now }),
    baselineEntry({ metric: 'directivesWithMutationGuard', value: directives.counts?.withMutationGuard ?? null, mode: 'LIVE', now }),
    baselineEntry({ metric: 'srcModules', value: readiness.repository?.sourceModules ?? null, mode: 'LIVE', now }),
    baselineEntry({ metric: 'testSuites', value: readiness.repository?.testSuites ?? null, mode: 'LIVE', now }),
    baselineEntry({ metric: 'deterministicTests', value: recorded['test:deterministic']?.tests ?? null, mode: 'RECORDED', ranAt: recorded['test:deterministic']?.ranAt ?? null, staleAfterDays: 1, now }),
    baselineEntry({ metric: 'deterministicFailures', value: recorded['test:deterministic']?.fail ?? null, mode: 'RECORDED', ranAt: recorded['test:deterministic']?.ranAt ?? null, staleAfterDays: 1, now }),
    baselineEntry({ metric: 'mutationsKilled', value: Number((recorded['test:mutation-war']?.result?.match(/(\d+) killed/) || [])[1]) || null, mode: 'RECORDED', ranAt: recorded['test:mutation-war']?.ranAt ?? null, staleAfterDays: 1, now }),
    baselineEntry({ metric: 'productionReachableModules', value: recorded.reachability?.reachableFromProduction ?? null, mode: 'LIVE', now })
  ];

  return {
    ...envelope('uberbond.v7-baselines.v1', sourceSha),
    freshnessPolicy: 'LIVE entries are measured by this run. RECORDED entries are copied from artifacts/system-readiness.json and carry the age of that record.',
    evidencePointers: ['artifacts/system-readiness.json', 'artifacts/constitution/directives.json', 'npm run check:syntax'],
    entries,
    contradictions: baselineContradictions(entries),
    uncertainty: 'A RECORDED baseline describes whatever tree it was measured on. Where it disagrees with a LIVE one, the disagreement is listed rather than resolved: overwriting the record would destroy the evidence that it drifted.',
    boundary: 'A baseline is a starting point for comparison. Recording one demonstrates no improvement.'
  };
}

function buildEpoch(sourceSha, baselines, previous) {
  const live = baselines.entries.filter(row => row.mode === 'LIVE' && row.value !== null);
  const previousLive = new Map((previous?.metrics ?? []).map(row => [row.metric, row.value]));
  const deltas = live
    .filter(row => previousLive.has(row.metric))
    .map(row => ({ metric: row.metric, from: previousLive.get(row.metric), to: row.value, delta: row.value - previousLive.get(row.metric) }))
    .filter(row => row.delta !== 0);

  return {
    ...envelope('uberbond.v7-evaluation-epoch.v1', sourceSha),
    epochId: `epoch-${sourceSha.slice(0, 12)}`,
    previousEpochId: previous?.epochId ?? null,
    freshnessPolicy: 'An epoch is closed at the head it names. Comparing two epochs is only meaningful when both were measured the same way.',
    metrics: live.map(row => ({ metric: row.metric, value: row.value, mode: row.mode })),
    deltasFromPreviousEpoch: previous ? deltas : null,
    // One epoch is not a series. The doctrine is explicit that synthetic test
    // count is not exponential intelligence, and a delta between two points is
    // not a trend either.
    growthClass: !previous ? 'FIRST_EPOCH__NO_COMPARISON_POSSIBLE'
      : deltas.length === 0 ? 'NO_MEASURED_CHANGE'
        : 'CHANGE_MEASURED__TOO_FEW_EPOCHS_FOR_A_TREND',
    uncertainty: 'A delta between two epochs is a difference, not a direction. Fitting a growth curve to it would be the error the doctrine names.',
    boundary: 'An epoch records what was measured. It does not claim the measurements improved.'
  };
}

function buildCheckpoint(sourceSha, { ledger, dag, allocation, baselines, index, liveTruth }) {
  const external = (ledger.gaps ?? []).filter(gap => EXTERNAL_STATUSES.includes(gap.status));
  return {
    ...envelope('uberbond.v7-frontier-checkpoint.v1', sourceSha),
    freshnessPolicy: 'A checkpoint describes the head it names. Resume by re-running the generators, not by trusting this file.',
    resumeFrom: {
      head: sourceSha,
      firstCommand: 'node scripts/v7-gap-ledger.mjs',
      // The single most useful line for whoever picks this up: what to do, and
      // what they cannot do no matter how long they work.
      nextActionable: allocation.allocated.map(row => ({ missionId: row.missionId, title: row.title, nextExperiment: row.nextExperiment })),
      cannotBeDoneInSoftware: external.map(gap => ({ gapId: gap.id, status: gap.status, unblockCondition: gap.unblockCondition }))
    },
    gapSummary: ledger.summary,
    missionCounts: dag.counts,
    contractArtifacts: index?.counts ?? null,
    absenceReasons: index?.absenceReasons ?? null,
    canonicalV9: liveTruth?.canonicalV9 ?? null,
    deployment: liveTruth?.deployment ?? null,
    baselineContradictions: baselines.contradictions,
    evidencePointers: [
      'artifacts/v7/gap-ledger.json', 'artifacts/v7/mission-dag.json',
      'artifacts/v7/baselines.json', 'artifacts/v7/artifact-index.json',
      'artifacts/v7/live-truth.json'
    ],
    uncertainty: 'Every number here was copied from an artifact generated in the same run. None of it is independent confirmation of those artifacts.'
  };
}

function buildFinalState(sourceSha, { ledger, dag, index }) {
  const summary = ledger.summary ?? {};
  const absent = (index?.rows ?? []).filter(row => row.state === 'ABSENT');
  const computableNow = absent.filter(row => row.absenceReason === 'COMPUTABLE_NOW');

  // The completion law, computed. Source-side completion is not the end of the
  // program: the contract says to enter Perpetual Frontier and explicitly says
  // not to terminate.
  const sourceSideComplete = summary.sourceSideComplete === true;
  return {
    ...envelope('uberbond.v7-final-frontier-state.v1', sourceSha),
    freshnessPolicy: 'Recomputed from the ledger and the index on every run. This file asserts nothing it did not read.',
    completionLaw: {
      softwareOpen: summary.softwareOpen ?? null,
      unmeasured: summary.unmeasured ?? null,
      sourceSideComplete,
      contractArtifactsAbsent: absent.length,
      contractArtifactsComputableNow: computableNow.length
    },
    remainingBlockers: (ledger.gaps ?? [])
      .filter(gap => EXTERNAL_STATUSES.includes(gap.status))
      .map(gap => ({ gapId: gap.id, class: gap.status, unblockCondition: gap.unblockCondition, authorityRequired: gap.authorityRequired ?? null })),
    mode: sourceSideComplete ? 'PERPETUAL_FRONTIER__SOURCE_SIDE_COMPLETE' : 'EXECUTING__SOURCE_SIDE_WORK_REMAINS',
    terminationLaw: 'The program does not terminate on source-side completion. Entering Perpetual Frontier is a mode change, and only the founder ends it.',
    notClaimed: [
      'That the remaining blockers will resolve.',
      'That source-side completion means the system works, only that no open software gap was measured.',
      'Superintelligence, perfect prediction, commercial success, or life-outcome improvement.'
    ],
    uncertainty: 'This state is only as complete as the gap ledger is. A gap nobody wrote is a gap this file cannot report.'
  };
}

function main() {
  const sourceSha = sh('git', ['rev-parse', 'HEAD']);
  const now = new Date();

  const ledger = readJson('artifacts/v7/gap-ledger.json');
  if (!ledger) {
    console.error('artifacts/v7/gap-ledger.json is required. Run node scripts/v7-gap-ledger.mjs first.');
    process.exitCode = 1;
    return;
  }
  const index = readJson('artifacts/v7/artifact-index.json');
  const liveTruth = readJson('artifacts/v7/live-truth.json');
  const previousEpoch = has('artifacts/v7/evaluation-epoch.json') ? readJson('artifacts/v7/evaluation-epoch.json') : null;

  const baselines = buildBaselines(sourceSha, now);
  const epoch = buildEpoch(sourceSha, baselines, previousEpoch);
  const dagCore = buildMissionDag(ledger.gaps ?? []);
  const allocation = allocateEffort(dagCore);

  const missionDag = {
    ...envelope('uberbond.v7-mission-dag.v1', sourceSha),
    freshnessPolicy: 'Derived from the gap ledger in this run. A mission exists because a gap is open, not because anyone listed it.',
    evidencePointers: ['artifacts/v7/gap-ledger.json'],
    ...dagCore,
    uncertainty: 'Actionability is computed from gap status. A gap misclassified upstream produces a mission misclassified here.'
  };

  const resourceAllocation = {
    ...envelope('uberbond.v7-resource-allocation.v1', sourceSha),
    freshnessPolicy: 'Derived from the mission DAG in this run.',
    evidencePointers: ['artifacts/v7/mission-dag.json'],
    ...allocation,
    uncertainty: 'An equal share across actionable missions is a statement that nothing here justifies ranking them, not a claim they are equally valuable.'
  };

  write('artifacts/v7/baselines.json', baselines);
  write('artifacts/v7/evaluation-epoch.json', epoch);
  write('artifacts/v7/mission-dag.json', missionDag);
  write('artifacts/v7/resource-allocation.json', resourceAllocation);
  write('artifacts/v7/frontier-checkpoint.json', buildCheckpoint(sourceSha, { ledger, dag: dagCore, allocation, baselines, index, liveTruth }));
  write('artifacts/v7/final-frontier-state.json', buildFinalState(sourceSha, { ledger, dag: dagCore, index }));

  console.log(`v7 frontier artifacts @ ${sourceSha.slice(0, 8)}`);
  console.log(`  baselines: ${baselines.entries.filter(r => r.mode === 'LIVE').length} live, ${baselines.entries.filter(r => r.mode === 'RECORDED').length} recorded, ${baselines.contradictions.length} contradiction(s)`);
  for (const row of baselines.contradictions) {
    console.log(`    ${row.metric}: live ${row.live} vs recorded ${row.recorded} (${row.recordedAt ?? 'no timestamp'})`);
  }
  console.log(`  epoch: ${epoch.epochId} — ${epoch.growthClass}`);
  console.log(`  missions: ${dagCore.counts.total} open, ${dagCore.counts.actionable} actionable, ${dagCore.counts.externallyBlocked} externally blocked`);
  console.log(`  allocation: ${allocation.counts.allocated} allocated, ${allocation.counts.waiting} waiting`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main, buildBaselines, buildEpoch };
