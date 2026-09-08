import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileCurrentRealityFreeze,
  extractArtifactSourceCommit,
  extractPresentTenseMainClaims
} from '../src/current-reality-freeze.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OLD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const current = (over = {}) => ({
  headSha: HEAD,
  branch: 'main',
  workingTreeClean: true,
  handoff: {
    activeMission: `FULL REALIZATION from exact current main ${HEAD}`,
    sourceCommit: OLD,
    currentTruth: { main: HEAD },
    latestOrchestrationCheckpoint: { observedMain: OLD }
  },
  readiness: { repository: { head: HEAD } },
  coverage: { sourceCommit: HEAD },
  orchestrator: { checkpoint: { observedMain: OLD } },
  sourceChangedByPresentClaim: {
    'currentTruth.main': false,
    'activeMission.currentMain': false
  },
  sourceChangedByArtifact: {
    'system-readiness': false,
    'sovereign-coverage': false
  },
  ...over
});

test('exact present-tense main with current artifacts freezes cleanly', () => {
  const out = compileCurrentRealityFreeze(current());
  assert.equal(out.ok, true);
  assert.equal(out.status, 'CURRENT_REALITY_FROZEN');
  assert.deepEqual(out.staleGeneratedArtifactIds, []);
  assert.equal(out.handoff.planningObservationIsHistorical, true);
  assert.equal(out.closureBoundary.runtimeTruth, 'NOT_INFERRED_FROM_REPOSITORY_FREEZE');
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('a planning observation may be historical without becoming a present-tense contradiction', () => {
  const input = current();
  input.handoff.latestOrchestrationCheckpoint.observedMain = OLD;
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.ok, true);
  assert.equal(out.handoff.planningObservedMain, OLD);
  assert.equal(out.handoff.stalePresentTenseClaims.length, 0);
});

test('truth-only commits may advance HEAD while older current-main claims remain source-equivalent', () => {
  const input = current({
    handoff: {
      activeMission: `FULL REALIZATION from exact current main ${OLD}`,
      sourceCommit: OLD,
      currentTruth: { main: OLD },
      latestOrchestrationCheckpoint: { observedMain: OLD }
    },
    sourceChangedByPresentClaim: {
      'currentTruth.main': false,
      'activeMission.currentMain': false
    }
  });
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.ok, true);
  assert.equal(out.status, 'CURRENT_REALITY_FROZEN');
  assert.ok(out.handoff.presentTenseMainClaims.every(row => row.status === 'CURRENT_SOURCE_EQUIVALENT'));
});

test('stale currentTruth.main refuses only when relevant source changed after its claim', () => {
  const input = current();
  input.handoff.currentTruth.main = OLD;
  input.sourceChangedByPresentClaim['currentTruth.main'] = true;
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.ok, false);
  assert.equal(out.status, 'CURRENT_REALITY_REFUSED__PRESENT_TENSE_SOURCE_CHANGED');
  assert.ok(out.reasonCodes.includes('handoff-present-tense-source-changed-since-claim'));
  assert.ok(out.handoff.stalePresentTenseClaims.some(row => row.pointer === 'currentTruth.main'));
});

test('stale current-main language in activeMission is independently caught after relevant source changes', () => {
  const input = current();
  input.handoff.activeMission = `continue from exact current main ${OLD}`;
  input.sourceChangedByPresentClaim['activeMission.currentMain'] = true;
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.ok, false);
  assert.ok(out.handoff.stalePresentTenseClaims.some(row => row.pointer === 'activeMission.currentMain'));
});

test('unreadable history for a non-head present-tense claim stays unknown', () => {
  const input = current();
  input.handoff.currentTruth.main = OLD;
  input.sourceChangedByPresentClaim['currentTruth.main'] = null;
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.ok, true);
  assert.equal(out.status, 'CURRENT_REALITY_FROZEN__PRESENT_TENSE_FRESHNESS_UNKNOWN');
  assert.equal(out.handoff.unknownPresentTenseClaims.length, 1);
});

test('old generated artifact is accepted only when repository history proves relevant source unchanged', () => {
  const input = current({
    readiness: { repository: { head: OLD } },
    coverage: { sourceCommit: OLD },
    sourceChangedByArtifact: {
      'system-readiness': false,
      'sovereign-coverage': false
    }
  });
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.status, 'CURRENT_REALITY_FROZEN');
  assert.ok(out.generatedArtifacts.every(row => row.status === 'CURRENT_SOURCE_EQUIVALENT'));
});

test('old generated artifact with relevant source changes is explicitly stale, not silently green', () => {
  const input = current({
    readiness: { repository: { head: OLD } },
    coverage: { sourceCommit: OLD },
    sourceChangedByArtifact: {
      'system-readiness': true,
      'sovereign-coverage': true
    }
  });
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.ok, true);
  assert.equal(out.status, 'CURRENT_REALITY_FROZEN__STALE_GENERATED_ARTIFACTS');
  assert.deepEqual(out.staleGeneratedArtifactIds.sort(), ['sovereign-coverage', 'system-readiness']);
  assert.equal(out.closureBoundary.generatedTruth, 'STALE_REGENERATION_REQUIRED');
});

test('unreadable artifact history stays unknown rather than pretending freshness', () => {
  const input = current({
    readiness: { repository: { head: OLD } },
    coverage: { sourceCommit: OLD },
    sourceChangedByArtifact: {
      'system-readiness': null,
      'sovereign-coverage': null
    }
  });
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.status, 'CURRENT_REALITY_FROZEN__ARTIFACT_FRESHNESS_UNKNOWN');
  assert.equal(out.unknownGeneratedArtifactIds.length, 2);
});

test('missing source binding stays unknown', () => {
  const input = current({ readiness: {}, coverage: {} });
  const out = compileCurrentRealityFreeze(input);
  assert.equal(out.status, 'CURRENT_REALITY_FROZEN__ARTIFACT_FRESHNESS_UNKNOWN');
  assert.ok(out.generatedArtifacts.every(row => row.status === 'UNKNOWN_MISSING_SOURCE_BINDING'));
});

test('dirty working tree is visible without inventing a runtime failure', () => {
  const out = compileCurrentRealityFreeze(current({ workingTreeClean: false }));
  assert.equal(out.ok, true);
  assert.ok(out.reasonCodes.includes('working-tree-not-clean'));
  assert.equal(out.closureBoundary.runtimeTruth, 'NOT_INFERRED_FROM_REPOSITORY_FREEZE');
});

test('invalid HEAD fails closed', () => {
  const out = compileCurrentRealityFreeze(current({ headSha: 'not-a-sha' }));
  assert.equal(out.ok, false);
  assert.equal(out.status, 'FREEZE_INPUT_INVALID');
  assert.deepEqual(out.reasonCodes, ['valid-head-sha-required']);
});

test('source commit extraction supports current readiness and coverage shapes', () => {
  assert.equal(extractArtifactSourceCommit({ repository: { head: HEAD } }), HEAD);
  assert.equal(extractArtifactSourceCommit({ sourceCommit: OLD }), OLD);
  assert.equal(extractArtifactSourceCommit({ generatedFrom: { sourceCommit: HEAD } }), HEAD);
});

test('only semantically present-tense handoff fields are treated as current-main claims', () => {
  const claims = extractPresentTenseMainClaims({
    sourceCommit: OLD,
    currentTruth: { main: HEAD },
    latestOrchestrationCheckpoint: { observedMain: OLD },
    activeMission: `work from current main ${HEAD}`
  });
  assert.deepEqual(claims.map(row => row.pointer).sort(), ['activeMission.currentMain', 'currentTruth.main']);
  assert.ok(claims.every(row => row.sha === HEAD));
});
