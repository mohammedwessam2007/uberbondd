import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoReadyWhileBlocked, verifyRenderedVerdictConsistency, computeLaunchVerdict, LaunchGateError
} from '../../revenue-os/src/launch-gate.mjs';

// --- assertNoReadyWhileBlocked ---

test('assertNoReadyWhileBlocked passes for a ready claim with zero blockers', () => {
  assert.equal(assertNoReadyWhileBlocked('READY', []), true);
  assert.equal(assertNoReadyWhileBlocked('System is ready to launch.', []), true);
});

test('assertNoReadyWhileBlocked passes for a non-ready claim regardless of blockers', () => {
  assert.equal(assertNoReadyWhileBlocked('3 blockers remain.', [{ code: 'x' }, { code: 'y' }, { code: 'z' }]), true);
});

test('hostile: assertNoReadyWhileBlocked throws for the exact named defect -- READY cached while blockers exist', () => {
  assert.throws(() => assertNoReadyWhileBlocked('READY', [{ code: 'payment-not-verified' }]), LaunchGateError);
  assert.throws(() => assertNoReadyWhileBlocked('All systems Ready for launch', [{ code: 'qa-failed' }]), LaunchGateError);
});

test('hostile: "already" and other words containing "read" do not false-positive the ready-word match', () => {
  assert.equal(assertNoReadyWhileBlocked('This is already blocked, not readable yet.', [{ code: 'x' }]), true);
});

test('assertNoReadyWhileBlocked error message names the exact blockers', () => {
  assert.throws(() => assertNoReadyWhileBlocked('READY', [{ code: 'missing-payment' }, { code: 'missing-backup' }]), (err) => {
    assert.ok(err instanceof LaunchGateError);
    assert.ok(err.message.includes('missing-payment'));
    assert.ok(err.message.includes('missing-backup'));
    return true;
  });
});

// --- verifyRenderedVerdictConsistency: post-hoc auditor for any format ---

test('verifyRenderedVerdictConsistency flags an HTML document that claims READY while the caller reports blocked', () => {
  const html = '<h1>Status: READY</h1>';
  const result = verifyRenderedVerdictConsistency(html, true);
  assert.equal(result.consistent, false);
});

test('verifyRenderedVerdictConsistency accepts a READY claim when the caller reports not blocked', () => {
  const result = verifyRenderedVerdictConsistency('<h1>READY</h1>', false);
  assert.equal(result.consistent, true);
});

test('verifyRenderedVerdictConsistency is format-agnostic -- works on JSON and plain text too', () => {
  assert.equal(verifyRenderedVerdictConsistency('{"status":"READY"}', true).consistent, false);
  assert.equal(verifyRenderedVerdictConsistency('Launch status: ready', true).consistent, false);
  assert.equal(verifyRenderedVerdictConsistency('Launch status: blocked', true).consistent, true);
});

// --- computeLaunchVerdict: the verdict IS the gates, never a cached summary ---

test('computeLaunchVerdict reports READY only when every gate is unblocked', () => {
  const result = computeLaunchVerdict([
    { name: 'delivery', blocked: false, blockers: [] },
    { name: 'implementation', blocked: false, blockers: [] }
  ]);
  assert.equal(result.verdict, 'READY');
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockingGates, []);
});

test('computeLaunchVerdict reports BLOCKED and names every blocking gate when any gate is blocked', () => {
  const result = computeLaunchVerdict([
    { name: 'delivery', blocked: false, blockers: [] },
    { name: 'implementation', blocked: true, blockers: [{ code: 'missing-backup' }] },
    { name: 'scheduler', blocked: true, blockers: [{ code: 'unknown-store-backend' }] }
  ]);
  assert.equal(result.verdict, 'BLOCKED');
  assert.equal(result.ready, false);
  assert.equal(result.blockingGates.length, 2);
  assert.deepEqual(result.blockingGates.map(g => g.name), ['implementation', 'scheduler']);
});

test('computeLaunchVerdict on an empty gate list is READY -- vacuously true, matching "no gate reported false"', () => {
  assert.equal(computeLaunchVerdict([]).verdict, 'READY');
});

test('computeLaunchVerdict ignores a null/undefined entry in the gate list rather than crashing', () => {
  const result = computeLaunchVerdict([null, undefined, { name: 'ok', blocked: false, blockers: [] }]);
  assert.equal(result.verdict, 'READY');
});
