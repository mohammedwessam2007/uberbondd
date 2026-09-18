// Baselines, epochs, the mission DAG and allocation.
//
// One idea runs through all of them: a number's provenance is part of the
// number. This repository has a readiness artifact recording 871 files parsed
// and 3,683 tests against a tree that parses 2,189 files and runs over 7,700,
// and every one of those figures was written down in good faith at a moment when
// it was true. What makes them dangerous is that they read the same as a
// measurement taken now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  baselineEntry,
  baselineContradictions,
  buildMissionDag,
  allocateEffort,
  EXTERNAL_STATUSES
} from '../src/v7-frontier-state.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const readJson = p => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const NOW = new Date('2026-09-18T12:00:00.000Z');

test('a live measurement is current by construction; a recorded one is only as current as its timestamp', () => {
  const live = baselineEntry({ metric: 'm', value: 1, mode: 'LIVE', now: NOW });
  assert.equal(live.stale, false);

  const fresh = baselineEntry({ metric: 'm', value: 1, mode: 'RECORDED', ranAt: '2026-09-18T11:00:00.000Z', staleAfterDays: 1, now: NOW });
  assert.equal(fresh.stale, false);

  const old = baselineEntry({ metric: 'm', value: 1, mode: 'RECORDED', ranAt: '2026-09-05T12:00:00.000Z', staleAfterDays: 1, now: NOW });
  assert.equal(old.stale, true);
  assert.ok(old.ageDays > 12);
});

test('a recorded number with no timestamp is stale, not fresh', () => {
  // Worse than old: currency can never be established for it at all. Defaulting
  // to fresh would make the least trustworthy figure look like the best one.
  const entry = baselineEntry({ metric: 'm', value: 1, mode: 'RECORDED', ranAt: null, now: NOW });
  assert.equal(entry.stale, true);
  assert.match(entry.staleReason, /currency cannot be established/);
});

test('a live and a recorded value that disagree are reported, not reconciled', () => {
  // Overwriting the record destroys the evidence that it drifted; averaging them
  // produces a number describing no tree at all.
  const entries = [
    baselineEntry({ metric: 'filesParsed', value: 2189, mode: 'LIVE', now: NOW }),
    baselineEntry({ metric: 'filesParsed', value: 871, mode: 'RECORDED', ranAt: '2026-09-05T12:00:33Z', now: NOW })
  ];
  const [found] = baselineContradictions(entries);
  assert.equal(found.metric, 'filesParsed');
  assert.equal(found.live, 2189);
  assert.equal(found.recorded, 871);
});

test('agreeing values are not reported as a contradiction', () => {
  const entries = [
    baselineEntry({ metric: 'm', value: 7, mode: 'LIVE', now: NOW }),
    baselineEntry({ metric: 'm', value: 7, mode: 'RECORDED', ranAt: '2026-09-05T12:00:33Z', now: NOW })
  ];
  assert.deepEqual(baselineContradictions(entries), []);
});

test('an unknown measurement mode is refused rather than trusted', () => {
  const entry = baselineEntry({ metric: 'm', value: 1, mode: 'VIBES', now: NOW });
  assert.equal(entry.mode, 'UNAVAILABLE');
  assert.equal(entry.value, null);
});

const gaps = [
  { id: 'A', title: 'a', family: 'SOFTWARE', status: 'OPEN', dependencies: [] },
  { id: 'B', title: 'b', family: 'SOFTWARE', status: 'OPEN', dependencies: ['A'] },
  { id: 'C', title: 'c', family: 'EXTERNAL', status: 'EXTERNAL_BLOCKED', dependencies: [], unblockCondition: 'someone supplies a file' },
  { id: 'D', title: 'd', family: 'SOFTWARE', status: 'CLOSED', dependencies: [] }
];

test('a closed gap produces no mission', () => {
  const dag = buildMissionDag(gaps);
  assert.deepEqual(dag.nodes.map(n => n.gapId).sort(), ['A', 'B', 'C']);
});

test('a dependency block and an external block are different kinds of stuck', () => {
  // A dependency is ours to clear. An external blocker is not, and conflating
  // them turns a waiting list into a to-do list nobody can finish.
  const dag = buildMissionDag(gaps);
  const byGap = Object.fromEntries(dag.nodes.map(n => [n.gapId, n]));
  assert.equal(byGap.A.actionable, true);
  assert.equal(byGap.B.actionable, false);
  assert.match(byGap.B.blockedReason, /waiting on A/);
  assert.equal(byGap.C.actionable, false);
  assert.match(byGap.C.blockedReason, /^external:/);
  assert.equal(dag.counts.actionable, 1);
  assert.equal(dag.counts.externallyBlocked, 1);
  assert.equal(dag.counts.dependencyBlocked, 1);
});

test('an externally blocked mission is never actionable even with no dependencies', () => {
  for (const status of EXTERNAL_STATUSES) {
    const dag = buildMissionDag([{ id: 'X', title: 'x', family: 'EXTERNAL', status, dependencies: [], unblockCondition: 'u' }]);
    assert.equal(dag.nodes[0].actionable, false, `${status} must not be actionable`);
  }
});

test('allocation covers actionable missions only, and says why it is not a ranking', () => {
  const allocation = allocateEffort(buildMissionDag(gaps));
  assert.deepEqual(allocation.allocated.map(r => r.gapId), ['A']);
  assert.equal(allocation.counts.waiting, 2);
  assert.equal(allocation.basis, 'ACTIONABILITY_ONLY');
  assert.match(allocation.whyNotExpectedValue, /no economic prior/i);
  for (const row of allocation.waiting) assert.ok(row.blockedReason, 'a waiting mission must say what it waits on');
});

test('shares divide across the actionable missions rather than being invented', () => {
  const two = allocateEffort(buildMissionDag([
    { id: 'A', title: 'a', family: 'SOFTWARE', status: 'OPEN', dependencies: [] },
    { id: 'B', title: 'b', family: 'SOFTWARE', status: 'OPEN', dependencies: [] }
  ]));
  assert.deepEqual(two.allocated.map(r => r.share), [50, 50]);
  const none = allocateEffort(buildMissionDag([]));
  assert.deepEqual(none.allocated, []);
});

test('the committed frontier artifacts carry provenance and refuse to overclaim', () => {
  const final = readJson('artifacts/v7/final-frontier-state.json');
  assert.ok(final.terminationLaw.includes('does not terminate'),
    'source-side completion is a mode change, not the end of the program');
  assert.ok(final.notClaimed.length >= 3);
  for (const blocker of final.remainingBlockers) {
    assert.ok(blocker.unblockCondition, `${blocker.gapId} must name what would unblock it`);
  }

  const epoch = readJson('artifacts/v7/evaluation-epoch.json');
  assert.ok(['FIRST_EPOCH__NO_COMPARISON_POSSIBLE', 'NO_MEASURED_CHANGE', 'CHANGE_MEASURED__TOO_FEW_EPOCHS_FOR_A_TREND'].includes(epoch.growthClass),
    'an epoch may not claim a trend');

  const baselines = readJson('artifacts/v7/baselines.json');
  for (const entry of baselines.entries) assert.ok(entry.mode, 'every baseline states how it was obtained');

  const checkpoint = readJson('artifacts/v7/frontier-checkpoint.json');
  assert.ok(Array.isArray(checkpoint.resumeFrom.cannotBeDoneInSoftware));
  assert.ok(checkpoint.uncertainty.includes('independent confirmation') === false
    || checkpoint.uncertainty.length > 0);
});
