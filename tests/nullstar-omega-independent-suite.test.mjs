import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_PATHS,
  SUITE_FAMILIES,
  defineIndependentTask,
  compileIndependentSuite,
  retireSuite
} from '../src/nullstar-omega-independent-suite.mjs';

const task = (overrides = {}) => defineIndependentTask({
  taskId: 'planning.critical-path',
  family: 'PLANNING',
  question: 'What is the longest dependency chain among the OMEGA scripts?',
  answerPath: EVIDENCE_PATHS.SOURCE_ANALYSIS,
  answerLocator: 'import statements across scripts/nullstar-omega-*.mjs',
  observePath: EVIDENCE_PATHS.EXECUTED_COMMAND,
  observeLocator: 'node scripts/nullstar-omega-plan-probe.mjs',
  difficulty: 0.6,
  whyIndependent: 'The truth comes from reading imports; the answer comes from running a planner that never reads them as a list.',
  ...overrides
});

test('a task with two distinct paths and locators is accepted', () => {
  assert.equal(task().ok, true);
});

test('a task whose answer and observation share a path is refused', () => {
  // The live defect: `answer` and `observe` were the same expression over the
  // same artifact, so every tree scored full marks against itself.
  const result = task({ observePath: EVIDENCE_PATHS.SOURCE_ANALYSIS });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(c => c.startsWith('tautological-task-answer-and-observation-share-a-path')));
});

test('a task reading the same locator twice is the same tautology relabelled', () => {
  const result = task({
    observePath: EVIDENCE_PATHS.GENERATED_ARTIFACT,
    answerPath: EVIDENCE_PATHS.EXECUTED_COMMAND,
    observeLocator: 'import statements across scripts/nullstar-omega-*.mjs',
    answerLocator: 'import statements across scripts/nullstar-omega-*.mjs'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('tautological-task-answer-and-observation-read-the-same-locator'));
});

test('a task must say why its paths are independent', () => {
  assert.ok(task({ whyIndependent: null }).reasonCodes.includes('task-must-say-why-its-two-paths-are-independent'));
});

test('difficulty must be a real number in range', () => {
  assert.ok(task({ difficulty: 3 }).reasonCodes.includes('difficulty-between-zero-and-one-required'));
  assert.ok(task({ difficulty: null }).reasonCodes.includes('difficulty-between-zero-and-one-required'));
});

const second = (overrides = {}) => task({
  taskId: 'causality.intervention',
  family: 'CAUSALITY',
  question: 'Which change actually caused the suite to separate?',
  answerPath: EVIDENCE_PATHS.VERSION_CONTROL,
  answerLocator: 'git log over the generation artifacts',
  observePath: EVIDENCE_PATHS.MULTI_STEP_DERIVATION,
  observeLocator: 'reasoning over generation vectors and their declarations',
  ...overrides
});

test('a suite compiles from valid tasks across families', () => {
  const suite = compileIndependentSuite({ suiteVersion: 'omega-independent-suite-1.0.0', tasks: [task(), second()] });
  assert.equal(suite.ok, true);
  assert.equal(suite.counts.tasks, 2);
  assert.equal(suite.counts.families, 2);
  assert.ok(suite.digest.startsWith('sha256:'));
});

test('a suite containing a rejected task is refused rather than silently dropping it', () => {
  const suite = compileIndependentSuite({
    suiteVersion: 'v', tasks: [task(), task({ taskId: 'bad', observePath: EVIDENCE_PATHS.SOURCE_ANALYSIS })]
  });
  assert.equal(suite.ok, false);
  assert.ok(suite.reasonCodes.includes('every-task-must-be-valid'));
  assert.ok(suite.rejectedReasons.some(c => c.startsWith('tautological')));
});

test('a suite in one family measures one thing and is refused', () => {
  const suite = compileIndependentSuite({
    suiteVersion: 'v', tasks: [task(), task({ taskId: 'planning.second' })]
  });
  assert.equal(suite.ok, false);
  assert.ok(suite.reasonCodes.includes('a-suite-in-one-family-measures-one-thing'));
});

test('duplicate task ids are refused', () => {
  const suite = compileIndependentSuite({ suiteVersion: 'v', tasks: [task(), second({ taskId: 'planning.critical-path' })] });
  assert.equal(suite.ok, false);
  assert.ok(suite.reasonCodes.includes('duplicate-task-id'));
});

test('every declared family is representable', () => {
  for (const family of SUITE_FAMILIES) {
    assert.equal(task({ taskId: `t.${family}`, family }).ok, true, family);
  }
});

test('retiring a suite keeps its scores and states the defect', () => {
  const result = retireSuite({
    suiteVersion: 'omega-local-evidence-suite-1.0.0',
    reason: 'Answer and observation were the same expression, so any tree scored full marks against itself.',
    evidenceRef: 'artifacts/nullstar-omega/baselines.json',
    replacedBy: 'omega-independent-suite-1.0.0'
  });
  assert.equal(result.status, 'SUITE_RETIRED');
  assert.equal(result.comparableWithSuccessor, false);
  assert.match(result.historyPolicy, /marked contaminated rather than deleted/i);
});

test('retirement without a stated defect or evidence is refused', () => {
  const bare = retireSuite({ suiteVersion: 'v' });
  assert.equal(bare.ok, false);
  assert.ok(bare.reasonCodes.includes('retirement-must-state-the-defect'));
  assert.ok(bare.reasonCodes.includes('retirement-must-point-at-the-evidence'));
});
