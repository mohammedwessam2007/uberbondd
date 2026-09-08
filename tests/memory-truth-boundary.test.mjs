import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerFromCount, resolveExistence, resolveRecalledName, describePortfolio, reconcile,
  COUNT_CLASSES, QUESTION_KINDS, COMMERCIAL_QUESTIONS, MEMORY_STATES
} from '../src/memory-truth-boundary.mjs';

// Both failures have already happened here. Inflation: 438 opportunity IDs and
// 2,000 scored combinations read like traction when quoted without their class.
// Amputation: a feature the current handoff does not mention reads as a feature
// that never existed.

test('a historical offer count cannot answer a customer question', () => {
  const asked = answerFromCount({
    count: 2000, countClass: 'INVENTORY', describes: 'scored offer combinations',
    question: 'HOW_MANY_CUSTOMERS'
  });
  assert.equal(asked.status, 'COUNT_MAY_NOT_ANSWER_THIS');
  assert.equal(asked.answer, null);
  assert.match(asked.refusal, /not evidence about customers/);
  assert.match(asked.law, /ONLY_A_COMMERCIAL_RECEIPT_ANSWERS_A_COMMERCIAL_QUESTION/);
});

test('the number still travels, with its class attached', () => {
  // Withholding it would be a different failure. It is real and useful for the
  // question it can answer; it just cannot be quoted bare.
  const asked = answerFromCount({
    count: 438, countClass: 'INVENTORY', describes: 'opportunity IDs', question: 'HOW_MUCH_REVENUE'
  });
  assert.equal(asked.count, 438);
  assert.equal(asked.countClass, 'INVENTORY');
  assert.equal(asked.describes, 'opportunity IDs');
});

test('OMNIA synthetic scale is not market or economic proof', () => {
  for (const question of COMMERCIAL_QUESTIONS) {
    const asked = answerFromCount({
      count: 2872898, countClass: 'SYNTHETIC_SCALE', describes: 'generated registry rows', question
    });
    assert.equal(asked.answer, null, `${question} must not be answered by synthetic scale`);
  }
});

test('an inventory count answers an inventory question', () => {
  const asked = answerFromCount({
    count: 438, countClass: 'INVENTORY', describes: 'opportunity IDs', question: 'HOW_MUCH_INVENTORY_EXISTS'
  });
  assert.equal(asked.status, 'COUNT_ANSWERS_THIS');
  assert.equal(asked.answer, 438);
});

test('a commercial receipt answers a commercial question', () => {
  const asked = answerFromCount({
    count: 0, countClass: 'COMMERCIAL_RECEIPT', describes: 'cleared payments', question: 'HOW_MANY_CUSTOMERS'
  });
  assert.equal(asked.answer, 0);
});

test('an internal receipt is not a commercial receipt', () => {
  const asked = answerFromCount({
    count: 12, countClass: 'INTERNAL_RECEIPT', describes: 'the system recording its own sends',
    question: 'IS_THERE_DEMAND'
  });
  assert.equal(asked.answer, null);
});

test('a number with no stated subject is refused', () => {
  const bare = answerFromCount({ count: 5, countClass: 'INVENTORY', question: 'HOW_MANY_CUSTOMERS' });
  assert.equal(bare.ok, false);
  assert.deepEqual(bare.reasonCodes, ['count-subject-required']);
  assert.match(bare.note, /every inflated claim already travels in/);
});

test('an absence claim with no stated search is refused', () => {
  const lazy = resolveExistence({ name: 'Everest' });
  assert.equal(lazy.ok, false);
  assert.deepEqual(lazy.reasonCodes, ['sources-searched-required']);
  assert.match(lazy.note, /a claim about the speaker/);
});

test('never-existed is not a reachable conclusion', () => {
  const missing = resolveExistence({ name: 'Everest', sourcesSearched: ['docs/CURRENT_HANDOFF.json'] });
  assert.equal(missing.state, 'NOT_FOUND_IN_SEARCHED_SOURCES');
  assert.ok(!MEMORY_STATES.includes('NEVER_EXISTED'));
  assert.match(missing.law, /SILENCE_IS_NOT_DELETION/);
});

test('a partial search reports which required sources it did not reach', () => {
  const partial = resolveExistence({
    name: 'Everest',
    sourcesSearched: ['docs/CURRENT_HANDOFF.json'],
    requiredSources: ['docs/CURRENT_HANDOFF.json', 'artifacts/uberbond-memory-index.json', 'docs/UBERBOND_TOTAL_BRAIN.md']
  });
  assert.equal(partial.searchComplete, false);
  assert.deepEqual(partial.requiredSourcesNotSearched, [
    'artifacts/uberbond-memory-index.json', 'docs/UBERBOND_TOTAL_BRAIN.md'
  ]);
});

test('an unresolved owner-recalled name is kept, not guessed and not dropped', () => {
  const recalled = resolveRecalledName({ name: 'Everest', proposedMeaning: 'probably a milestone programme' });
  assert.equal(recalled.resolved, false);
  assert.equal(recalled.state, 'UNRESOLVED_OWNER_RECALLED');
  // The proposal survives, held apart from resolution.
  assert.equal(recalled.proposedMeaning, 'probably a milestone programme');
  assert.match(recalled.law, /GUESSING_WRITES_FICTION_INTO_CANON/);
  assert.match(recalled.droppingBoundary, /IS_NEVER_DROPPED/);
});

test('a confident narrative does not resolve a name; a source ref does', () => {
  const narrative = resolveRecalledName({ name: 'Everest', proposedMeaning: 'a very detailed story about what it was' });
  assert.equal(narrative.resolved, false);

  const sourced = resolveRecalledName({
    name: 'Everest', sourceRef: 'docs/history/EVEREST_2026-03.md', proposedMeaning: 'the founder-absence milestone ladder'
  });
  assert.equal(sourced.resolved, true);
  assert.equal(sourced.state, 'CURRENT');
});

test('an answer naming only the active experiment is refused, not caveated', () => {
  // The caveat is the part that gets dropped when the sentence is quoted.
  const reduced = describePortfolio({
    activeExperiment: 'website audit',
    portfolio: ['website audit', 'partner revenue assurance', 'AI reliability'],
    answerNames: ['website audit']
  });
  assert.equal(reduced.reducedToActive, true);
  assert.equal(reduced.status, 'ANSWER_REDUCES_PORTFOLIO_TO_ONE_EXPERIMENT');
  assert.match(reduced.law, /NOT_THE_PORTFOLIO/);
  assert.match(reduced.allocationBoundary, /NOT_A_DEFINITION_OF_THE_COMPANY/);
});

test('a portfolio answer naming the breadth is fine', () => {
  const described = describePortfolio({
    activeExperiment: 'website audit',
    portfolio: ['website audit', 'partner revenue assurance'],
    answerNames: ['website audit', 'partner revenue assurance']
  });
  assert.equal(described.reducedToActive, false);
  assert.equal(described.portfolioSize, 2);
});

test('an active experiment outside the portfolio is a second registry', () => {
  const orphan = describePortfolio({ activeExperiment: 'something else', portfolio: ['a', 'b'] });
  assert.equal(orphan.ok, false);
  assert.deepEqual(orphan.reasonCodes, ['active-experiment-must-be-in-portfolio']);
  assert.match(orphan.note, /how the portfolio stops being the truth/);
});

test('current truth wins the present tense and never deletes what it superseded', () => {
  const reconciled = reconcile({
    claim: 'how outbound is sent',
    currentTruth: 'the distribution control plane',
    historicalMemory: 'the offline revenue factory',
    donated: ['suppression semantics', 'QA packaging']
  });
  assert.equal(reconciled.presentTenseAnswer, 'the distribution control plane');
  assert.equal(reconciled.answerClass, 'CURRENT_REPOSITORY_OR_EXTERNAL_RECEIPT');
  assert.equal(reconciled.preserved.historicalMemory, 'the offline revenue factory');
  assert.deepEqual(reconciled.preserved.donated, ['QA packaging', 'suppression semantics']);
  assert.match(reconciled.law, /NEVER_DELETES_WHAT_IT_SUPERSEDED/);
});

test('a donation already carried by current truth is not a reason to resurrect the architecture', () => {
  const reconciled = reconcile({
    claim: 'x', currentTruth: 'the new path', historicalMemory: 'the old path', donated: ['the useful semantics']
  });
  assert.match(reconciled.resurrectionBoundary, /REUSE_THE_SEMANTICS_NOT_THE_OLD_ARCHITECTURE/);
});

test('memory with no current truth answers, and is labelled as memory', () => {
  const historical = reconcile({ claim: 'x', historicalMemory: 'what the old system did' });
  assert.equal(historical.status, 'HISTORICAL_ONLY');
  assert.equal(historical.answerClass, 'HISTORICAL_MEMORY__NOT_CURRENT_TRUTH');
  assert.equal(historical.preserved.historicalMemory, 'what the old system did');
});

test('agreeing sources are consistent, with nothing to preserve', () => {
  const agreed = reconcile({ claim: 'x', currentTruth: 'same', historicalMemory: 'same' });
  assert.equal(agreed.status, 'CONSISTENT');
  assert.equal(agreed.preserved, null);
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(COUNT_CLASSES), true);
  assert.equal(Object.isFrozen(QUESTION_KINDS), true);
  assert.equal(Object.isFrozen(COMMERCIAL_QUESTIONS), true);
  assert.equal(Object.isFrozen(MEMORY_STATES), true);
  assert.equal(describePortfolio({ portfolio: ['a'] }).businessEffectAuthority, 'NONE');
  assert.equal(reconcile({ claim: 'x', currentTruth: 'y' }).businessEffectAuthority, 'NONE');
});
