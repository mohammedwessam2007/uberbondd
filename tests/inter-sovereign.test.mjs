import test from 'node:test';
import assert from 'node:assert/strict';
import {
  modelOtherMind, mutuality, influenceBoundary, socialCalibration,
  strategicReality, realityToSelfFirewall, OTHER_MIND_BASIS, INTERACTION_SHAPES
} from '../src/inter-sovereign.mjs';

// A system built to serve one person will model everyone else as terrain --
// their preferences become parameters, their reactions become predictions, and
// nothing in the arithmetic notices the category error.

test('a guess about a person is not presented at the strength of something they said', () => {
  const guessed = modelOtherMind({ person: 'a colleague', claim: 'wants the role', basis: 'INFERRED_FROM_TYPE' });
  assert.equal(guessed.certainty, 'A_GUESS_ABOUT_A_PERSON');
  assert.equal(guessed.actionableAlone, false);

  const told = modelOtherMind({ person: 'a colleague', claim: 'wants the role', basis: 'THEY_SAID_SO', theyConfirmed: true });
  assert.equal(told.certainty, 'THEY_CONFIRMED_IT');
  assert.equal(told.actionableAlone, true);
});

test('another mind is never a solved variable, however strong the evidence', () => {
  const strongest = modelOtherMind({
    person: 'x', claim: 'y', basis: 'THEY_SAID_SO', theyConfirmed: true
  });
  assert.match(strongest.boundary, /NEVER A SOLVED VARIABLE/);
  assert.equal(Object.hasOwn(strongest, 'certain'), false);
  assert.ok(OTHER_MIND_BASIS.includes('ASSUMED'));
});

test('an arrangement requiring the other party not to understand it is refused', () => {
  // The cleanest available test for extraction, and a refusal rather than a
  // penalty: it does not become acceptable at a higher benefit.
  const extractive = mutuality({
    arrangement: 'the referral fee they are not told about',
    shape: 'REQUIRES_THEIR_IGNORANCE',
    benefitToFounder: 'substantial'
  });
  assert.equal(extractive.ok, false);
  assert.match(extractive.note, /Survives-being-understood is the test/);
});

test('a one-sided arrangement they do understand is allowed and labelled', () => {
  const understood = mutuality({
    arrangement: 'they are doing him a favour', shape: 'ONE_SIDED_EXTRACTION'
  });
  assert.equal(understood.status, 'ONE_SIDED_BUT_UNDERSTOOD');
  assert.equal(understood.survivesBeingUnderstood, true);
  assert.ok(INTERACTION_SHAPES.includes('GIFT'));
});

test('a good outcome does not make manipulation acceptable', () => {
  const manipulative = influenceBoundary({
    method: 'framing it so they cannot see the alternative',
    wouldTheyObjectOnLearning: true,
    outcomeGoodForThem: true
  });
  assert.equal(manipulative.status, 'MANIPULATION');
  assert.equal(manipulative.outcomeChangesVerdict, false);
  assert.match(manipulative.law, /WHATEVER_THE_OUTCOME/);
});

test('not knowing how they would react is not the same as them being fine with it', () => {
  const unknown = influenceBoundary({ method: 'x' });
  assert.equal(unknown.status, 'UNKNOWN_WHETHER_THEY_WOULD_OBJECT');
  assert.match(unknown.note, /not the same as them being fine with it/);
});

test('an unchecked model of people is reported as unchecked', () => {
  const none = socialCalibration([]);
  assert.equal(none.status, 'NO_PREDICTIONS_CHECKED');
  assert.match(none.boundary, /HAS BEEN CHECKED AGAINST WHAT PEOPLE ACTUALLY DID/);
});

test('social models are measured against behaviour, not against a theory', () => {
  const measured = socialCalibration([
    { predicted: 'they will say yes', observed: 'they said no', domain: 'negotiation' },
    { predicted: 'they will follow up', observed: 'they said no', domain: 'negotiation' },
    { predicted: 'they will be late', observed: 'they will be late', domain: 'logistics' }
  ]);
  assert.equal(measured.wrong, 2);
  assert.equal(measured.weakestDomains[0].domain, 'negotiation');
});

test('agents who can observe a decision will adapt to it', () => {
  // A plan evaluated against a static world is evaluated against one that
  // will not exist once it runs.
  const adaptive = strategicReality({
    decision: 'announce the price rise',
    otherAgents: [{ agent: 'competitors', likelyResponse: 'undercut' }],
    theyCanObserve: true
  });
  assert.equal(adaptive.status, 'ADAPTIVE_AGENTS_PRESENT');
  assert.match(adaptive.note, /will not exist once it runs/);
});

test('no supplied agents is not the same as none existing', () => {
  const quiet = strategicReality({ decision: 'x' });
  assert.match(quiet.note, /not the same as none existing/);
});

test('environmental influence is shown and never used to rule a preference inauthentic', () => {
  const shown = realityToSelfFirewall({
    preference: 'wants to live somewhere warm',
    environmentalSources: ['six months of travel advertising', 'a friend who moved']
  });
  assert.equal(shown.ruling, 'NONE');
  assert.match(shown.boundary, /STILL HIS TO ENDORSE OR REJECT/);
});
