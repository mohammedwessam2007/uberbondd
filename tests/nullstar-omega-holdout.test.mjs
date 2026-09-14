import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORPUS_TIERS, TASK_FAMILIES, compileHoldoutCorpus, normalizeTask,
  scoreSealedResponse, sealedAnswerDigest
} from '../src/nullstar-omega-holdout.mjs';

const SUITE = 'omega-suite-1.0.0';
const task = (over = {}) => ({
  taskId: 't1', family: 'REASONING', tier: 'SEALED_HOLDOUT',
  prompt: 'A sealed question.', difficulty: 0.5, answer: 'the answer', ...over
});
const corpus = (tasks) => compileHoldoutCorpus({ suiteVersion: SUITE, tasks });

test('a sealed task never returns its plaintext answer', () => {
  // A sealed task that carried its answer out would break the seal on the first
  // caller that logged the corpus.
  const out = normalizeTask(task(), { suiteVersion: SUITE });
  assert.equal(out.ok, true);
  assert.equal(out.answer, null);
  assert.equal(out.sealed, true);
  assert.match(out.answerDigest, /^[0-9a-f]{64}$/);
});

test('a visible task may carry its answer, because nothing is hidden there', () => {
  const out = normalizeTask(task({ taskId: 't2', tier: 'VISIBLE_EVAL' }), { suiteVersion: SUITE });
  assert.equal(out.answer, 'the answer');
  assert.equal(out.sealed, false);
});

test('the digest is salted per suite and task, so a common answer is not matchable', () => {
  const a = sealedAnswerDigest({ suiteVersion: SUITE, taskId: 't1', answer: '42' });
  const b = sealedAnswerDigest({ suiteVersion: SUITE, taskId: 't2', answer: '42' });
  const c = sealedAnswerDigest({ suiteVersion: 'other-suite', taskId: 't1', answer: '42' });
  assert.notEqual(a, b, 'same answer in two tasks must not share a digest');
  assert.notEqual(a, c, 'same task in two suites must not share a digest');
});

test('an invented family or tier is refused', () => {
  assert.ok(normalizeTask(task({ family: 'VIBES' }), { suiteVersion: SUITE })
    .reasonCodes.some(c => c.startsWith('recognized-task-family-required:')));
  assert.ok(normalizeTask(task({ tier: 'SORT_OF_SEALED' }), { suiteVersion: SUITE })
    .reasonCodes.some(c => c.startsWith('recognized-corpus-tier-required:')));
  assert.ok(TASK_FAMILIES.length > 0 && CORPUS_TIERS.length === 3);
});

test('a corpus with no sealed task is refused', () => {
  // A corpus of only visible tasks measures tuning, not generalization.
  const out = corpus([task({ tier: 'VISIBLE_EVAL' })]);
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('corpus-must-contain-at-least-one-sealed-task'));
});

test('a sealed digest appearing in the visible corpus fails the compile', () => {
  const sealed = normalizeTask(task(), { suiteVersion: SUITE });
  const out = corpus([
    task(),
    task({ taskId: 't2', tier: 'VISIBLE_EVAL', prompt: `leaked ${sealed.answerDigest}`, answer: 'x' })
  ]);
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(c => c.startsWith('sealed-answer-digest-appears-in-visible-corpus:')));
});

test('duplicate task ids are refused', () => {
  const out = corpus([task(), task()]);
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(c => c.startsWith('duplicate-task-id:')));
});

test('the committed manifest carries no prompts and no answers', () => {
  const out = corpus([task(), task({ taskId: 't2', tier: 'VISIBLE_EVAL', answer: 'v' })]);
  assert.equal(out.ok, true);
  const serialized = JSON.stringify(out.manifest);
  assert.ok(!serialized.includes('A sealed question.'), 'sealed prompts must not travel in the manifest');
  assert.ok(!serialized.includes('the answer'), 'answers must never travel in the manifest');
  for (const row of out.manifest) assert.match(row.answerDigest, /^[0-9a-f]{64}$/);
});

test('scoring matches on exact digest and never reveals the answer', () => {
  const sealed = normalizeTask(task(), { suiteVersion: SUITE });
  const right = scoreSealedResponse({ suiteVersion: SUITE, taskId: 't1', answerDigest: sealed.answerDigest, response: 'the answer' });
  const wrong = scoreSealedResponse({ suiteVersion: SUITE, taskId: 't1', answerDigest: sealed.answerDigest, response: 'nearly the answer' });
  assert.equal(right.outcome, 'CORRECT');
  assert.equal(wrong.outcome, 'INCORRECT');
  assert.ok(!JSON.stringify(right).includes('the answer'));
});

test('an abstention is scored apart from a wrong answer', () => {
  // Collapsing them punishes calibrated refusal, which the constitution asks
  // to reward.
  const sealed = normalizeTask(task(), { suiteVersion: SUITE });
  const out = scoreSealedResponse({ suiteVersion: SUITE, taskId: 't1', answerDigest: sealed.answerDigest, response: null });
  assert.equal(out.outcome, 'ABSTAINED');
});

test('the corpus carries no authority and a zero effect ledger', () => {
  const out = corpus([task()]);
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectLedger.providerCalls, 0);
  assert.match(out.truthBoundary, /DOES_NOT_PROVE_A_CANDIDATE_NEVER_SAW_THESE_TASKS_ELSEWHERE/);
});
