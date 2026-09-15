import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASELINE_IDS,
  recordBaseline,
  compileBaselineSet
} from '../src/nullstar-omega-baselines.mjs';

const executed = (id, correct, attempted = 7, method = 'ran the suite') =>
  recordBaseline({ id, status: 'EXECUTED', tasksCorrect: correct, tasksAttempted: attempted, method });

const blocked = (id, overrides = {}) => recordBaseline({
  id,
  status: 'BLOCKED_EXTERNAL',
  reason: 'no provider credential and every weight host is refused by network policy',
  blockingDependency: 'a model provider credential or a policy-permitted weight host',
  whatWasTried: 'probed five credential env vars, ran the provider doctor, installed onnxruntime, probed six weight hosts',
  nextUnblockCondition: 'a credential in the environment, or an allowed weight host plus Genome admission evidence',
  ...overrides
});

test('an executed baseline must say what it attempted and how', () => {
  assert.ok(recordBaseline({ id: 'B0', status: 'EXECUTED' }).reasonCodes.includes('an-executed-baseline-must-say-how-many-tasks-it-attempted'));
  assert.ok(recordBaseline({ id: 'B0', status: 'EXECUTED', tasksAttempted: 7, tasksCorrect: 3 }).reasonCodes.includes('an-executed-baseline-must-say-how-it-answered'));
});

test('a blocked baseline must name dependency, attempt and unblock condition', () => {
  const bare = recordBaseline({ id: 'B1', status: 'BLOCKED_EXTERNAL' });
  assert.equal(bare.ok, false);
  for (const code of [
    'a-blocked-baseline-must-say-why',
    'a-blocked-baseline-must-name-the-dependency',
    'a-blocked-baseline-must-say-what-was-actually-attempted',
    'a-blocked-baseline-must-say-what-would-clear-it'
  ]) assert.ok(bare.reasonCodes.includes(code), code);
});

test('a fully described blocked baseline is accepted', () => {
  const result = blocked('B1');
  assert.equal(result.ok, true);
  assert.equal(result.score, null);
  assert.match(result.whatWasTried, /probed/);
});

test('correct cannot exceed attempted', () => {
  const result = recordBaseline({ id: 'B0', status: 'EXECUTED', tasksAttempted: 7, tasksCorrect: 9, method: 'x' });
  assert.ok(result.reasonCodes.includes('correct-cannot-exceed-attempted'));
});

test('a set missing a baseline is refused as the unexplained null it is', () => {
  const result = compileBaselineSet({
    baselines: [executed('B0', 3), executed('B5', 7)],
    suiteVersion: 's', sourceCommit: 'a'.repeat(40)
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('baseline-missing:B1'));
  assert.match(result.note, /unexplained null/);
});

const fullSet = (currentCorrect, trivialCorrect) => compileBaselineSet({
  baselines: [
    executed('B0', trivialCorrect, 7, 'constant answer'),
    blocked('B1'), blocked('B2'), blocked('B3'),
    executed('B4', 5, 7, 'ancestor commit'),
    executed('B5', currentCorrect, 7, 'exact head')
  ],
  suiteVersion: 'omega-local-evidence-suite-1.0.0',
  sourceCommit: 'a'.repeat(40)
});

test('a complete set with named blockers compiles and reports zero unexplained nulls', () => {
  const result = fullSet(7, 3);
  assert.equal(result.status, 'BASELINE_SET_PARTIAL_WITH_NAMED_BLOCKERS');
  assert.equal(result.unexplainedNulls, 0);
  assert.deepEqual(result.blockedBaselines, ['B1', 'B2', 'B3']);
  assert.deepEqual(result.executedBaselines, ['B0', 'B4', 'B5']);
  assert.equal(result.baselines.length, BASELINE_IDS.length);
});

test('beating the trivial baseline is reported with its margin', () => {
  assert.match(fullSet(7, 3).trivialComparison, /^CURRENT_BEATS_TRIVIAL_BY_0\./);
});

test('tying the trivial baseline says the suite measures nothing', () => {
  assert.equal(fullSet(7, 7).trivialComparison, 'CURRENT_TIES_TRIVIAL__THE_SUITE_MEASURES_NOTHING');
});

test('losing to the trivial baseline is reported rather than hidden', () => {
  assert.match(fullSet(2, 5).trivialComparison, /^TRIVIAL_BEATS_CURRENT_BY_0\./);
});

test('a set where the trivial baseline did not run cannot claim a margin', () => {
  const result = compileBaselineSet({
    baselines: [blocked('B0'), blocked('B1'), blocked('B2'), blocked('B3'), executed('B4', 5), executed('B5', 7)],
    suiteVersion: 's', sourceCommit: 'a'.repeat(40)
  });
  assert.equal(result.trivialComparison, 'NOT_COMPARABLE__ONE_OR_BOTH_DID_NOT_EXECUTE');
});
