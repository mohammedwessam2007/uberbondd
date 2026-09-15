import test from 'node:test';
import assert from 'node:assert/strict';
import { recordFailure, compileFailureDebt } from '../src/nullstar-failure-debt.mjs';

const entry = (overrides = {}) => recordFailure({
  id: 'F001',
  timestamp: '2026-09-15T04:00:00.000Z',
  sourceSha: 'a'.repeat(40),
  mission: 'terminal completion war',
  gate: 'production coverage ratchet',
  expected: 'every production-reachable module is executed by some gate',
  observed: 'src/outreach-100k-runtime-control.mjs had only a regex-over-source test',
  failureClass: 'UNTESTED_PRODUCTION_PATH',
  rootCause: 'A test that reads a module as text satisfies "a test exists" without executing a line of it.',
  severity: 'HIGH',
  status: 'OPEN',
  ...overrides
});

test('a failure needs a diagnosed root cause, not just a symptom', () => {
  const result = entry({ rootCause: null });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('root-cause-required'));
});

test('closing requires a regression test and a repair commit', () => {
  const bare = entry({ status: 'CLOSED_WITH_PROOF' });
  assert.equal(bare.ok, false);
  assert.ok(bare.reasonCodes.includes('closing-requires-a-regression-test-that-would-catch-it-again'));
  assert.ok(bare.reasonCodes.includes('closing-requires-the-repair-commit'));

  const proved = entry({
    status: 'CLOSED_WITH_PROOF',
    regressionTest: 'tests/outreach-100k-runtime-control-behaviour.test.mjs',
    repairCommit: 'b'.repeat(40)
  });
  assert.equal(proved.ok, true);
});

test('an unknown failure class or severity is refused rather than coerced', () => {
  assert.ok(entry({ failureClass: 'SOMETHING_WENT_WRONG' }).reasonCodes.includes('known-failure-class-required'));
  assert.ok(entry({ severity: 'VERY_BAD' }).reasonCodes.includes('known-severity-required'));
});

test('a ledger compiles and counts what still needs work', () => {
  const ledger = compileFailureDebt({
    failures: [entry(), entry({ id: 'F002', status: 'CLOSED_WITH_PROOF', regressionTest: 't', repairCommit: 'c'.repeat(40) })],
    sourceSha: 'a'.repeat(40)
  });
  assert.equal(ledger.ok, true);
  assert.equal(ledger.counts.total, 2);
  assert.equal(ledger.counts.openRequiringWork, 1);
  assert.deepEqual(ledger.openIds, ['F001']);
});

test('a failure cannot leave the ledger by being omitted', () => {
  const ledger = compileFailureDebt({
    failures: [entry({ id: 'F002' })],
    previousIds: ['F001', 'F002'],
    sourceSha: 'a'.repeat(40)
  });
  assert.equal(ledger.ok, false);
  assert.ok(ledger.reasonCodes.includes('failure-may-not-be-removed:F001'));
  assert.match(ledger.note, /never by being omitted/);
});

test('duplicate failure ids are refused', () => {
  const ledger = compileFailureDebt({ failures: [entry(), entry()], sourceSha: 'a'.repeat(40) });
  assert.equal(ledger.ok, false);
  assert.ok(ledger.reasonCodes.includes('duplicate-failure-id'));
});

test('an invalid entry fails the whole ledger rather than being dropped', () => {
  const ledger = compileFailureDebt({
    failures: [entry(), entry({ id: 'F003', rootCause: null })],
    sourceSha: 'a'.repeat(40)
  });
  assert.equal(ledger.ok, false);
  assert.ok(ledger.rejectedReasons.includes('root-cause-required'));
});
