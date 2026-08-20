import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listCapabilities, getCapability, existingCapabilityIds, capabilityGraphSummary,
  validateCapabilityGraph, CAPABILITY_STATUSES, CAPABILITY_GRAPH_POLICY_VERSION
} from '../src/capability-graph.mjs';
import { incrementalBuildDistance } from '../src/opportunity-registry.mjs';

test('the registry is internally consistent: no unknown dependency references, no duplicate ids', () => {
  const result = validateCapabilityGraph();
  assert.equal(result.ok, true, JSON.stringify(result.problems));
});

test('every entry uses a declared status and has the required shape', () => {
  for (const entry of listCapabilities()) {
    assert.ok(CAPABILITY_STATUSES.includes(entry.status), `${entry.id} has an undeclared status: ${entry.status}`);
    assert.ok(entry.id && entry.name, `entry missing id/name`);
    assert.ok(Array.isArray(entry.dependencies));
    assert.ok(Array.isArray(entry.testRefs));
    assert.equal(typeof entry.productionReadiness, 'string');
  }
});

test('listCapabilities() with no filter returns everything', () => {
  assert.ok(listCapabilities().length > 15);
});

test('listCapabilities({status}) filters correctly', () => {
  const missing = listCapabilities({ status: 'MISSING' });
  assert.ok(missing.length > 0);
  assert.ok(missing.every(entry => entry.status === 'MISSING'));
});

test('getCapability() returns null for an unknown id rather than throwing', () => {
  assert.equal(getCapability('does-not-exist'), null);
  assert.ok(getCapability('postgres-store'));
});

test('the Prometheus economic spine and safe commercial slices are visible in the capability graph', () => {
  for (const id of ['market-signal-registry', 'prometheus-economic-spine', 'commercial-experiment-compiler', 'distribution-channel-registry', 'commercial-outcome-lineage', 'commercial-learning-memory', 'task-universe-engine', 'self-upgrade-pipeline', 'prometheus-control-tower', 'agent-relay-bus', 'mechanism-recombination-lab', 'business-model-fitness', 'adapter-contracts', 'capital-allocation-planner']) {
    const entry = getCapability(id);
    assert.equal(entry.status, 'TEST_VERIFIED');
    assert.ok(entry.testRefs.length > 0);
  }
});

test('the OMNIA V9 kernel was recovered onto this branch from the historical archive and is no longer stranded', () => {
  const v9 = getCapability('omnia-v9-kernel');
  assert.equal(v9.status, 'TEST_VERIFIED');
  assert.match(v9.productionReadiness, /Recovered/);
  assert.ok(v9.testRefs.length > 0);
});

test('the stranded-but-real Canon/V3 lineage is still honestly marked MISSING here, with a pointer to where it actually exists', () => {
  const canon = getCapability('canon-v3-acquisition-cycle');
  assert.equal(canon.status, 'MISSING');
  assert.match(canon.productionReadiness, /PR #7/);
});

test('VERIFIED_LIVE is reserved for capabilities with a real external receipt, and is not handed out cheaply', () => {
  // VERIFIED_LIVE outranks TEST_VERIFIED: it asserts a real task crossed the
  // real system on real infrastructure, not that a suite went green. Guard it
  // so a future edit cannot quietly promote something that only has tests.
  const live = listCapabilities({ status: 'VERIFIED_LIVE' });
  assert.ok(live.length > 0, 'expected at least one genuinely live-proven capability');
  for (const entry of live) {
    assert.ok(entry.testRefs.length > 0, `${entry.id} claims VERIFIED_LIVE with no test references`);
    // A live claim has to point at concrete evidence someone else can go look
    // at -- an issue number, a deployment, a receipt -- not just prose.
    assert.match(
      entry.productionReadiness,
      /issue #\d+|#\d+|receipt|deployment/i,
      `${entry.id} claims VERIFIED_LIVE without citing an externally-addressable artifact`
    );
  }
});

test('postgres-store reflects this wave\'s real live-proof result, not the old disclosed gap', () => {
  const entry = getCapability('postgres-store');
  assert.equal(entry.status, 'TEST_VERIFIED');
  assert.match(entry.productionReadiness, /live-proven/i);
  assert.ok(entry.testRefs.includes('tests/postgres-store-live.test.mjs'));
});

test('capabilityGraphSummary() counts add up to the total and match CAPABILITY_STATUSES', () => {
  const summary = capabilityGraphSummary();
  assert.equal(summary.policyVersion, CAPABILITY_GRAPH_POLICY_VERSION);
  const sum = Object.values(summary.counts).reduce((a, b) => a + b, 0);
  assert.equal(sum, summary.total);
  assert.deepEqual(Object.keys(summary.counts).sort(), [...CAPABILITY_STATUSES].sort());
});

test('existingCapabilityIds() excludes RESEARCH_ONLY, PARTIAL, and MISSING (including the still-stranded Canon/V3 lineage), but includes the now-recovered OMNIA V9 kernel', () => {
  const ids = existingCapabilityIds();
  assert.ok(!ids.includes('planetary-signal-adapters'));
  assert.ok(ids.includes('omnia-v9-kernel'));
  assert.ok(!ids.includes('canon-v3-acquisition-cycle'));
  assert.ok(!ids.includes('live-outbound-send'));
  assert.ok(ids.includes('postgres-store'));
  assert.ok(ids.includes('opportunity-registry'));
});

test('incrementalBuildDistance() driven by the real capability graph: a hypothetical opportunity reusing only shipped capabilities has zero distance', () => {
  const existing = existingCapabilityIds();
  const result = incrementalBuildDistance(['deterministic-audit', 'payment-truth'], existing);
  assert.equal(result.distance, 0);
});

test('incrementalBuildDistance() driven by the real capability graph: an opportunity requiring the stranded Canon/V3 cycle has nonzero distance even though the code technically exists elsewhere', () => {
  const existing = existingCapabilityIds();
  const result = incrementalBuildDistance(['canon-v3-acquisition-cycle', 'deterministic-audit'], existing);
  assert.equal(result.distance, 0.5);
  assert.deepEqual(result.missing, ['canon-v3-acquisition-cycle']);
});

test('incrementalBuildDistance() driven by the real capability graph: an opportunity reusing the now-recovered V9 kernel has zero distance', () => {
  const existing = existingCapabilityIds();
  const result = incrementalBuildDistance(['omnia-v9-kernel', 'deterministic-audit'], existing);
  assert.equal(result.distance, 0);
  assert.deepEqual(result.missing, []);
});
