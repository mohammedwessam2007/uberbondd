import test from 'node:test';
import assert from 'node:assert/strict';
import {
  observation, expectation, mine, conceptPressure,
  OBSERVATION_VERDICTS, DISCOVERY_ROUTES
} from '../src/unknown-unknown-mining.mjs';

// The search is run by the thing with the blind spot. Attaching questions to
// observations you already flagged finds known unknowns; the unknown unknown is
// the one nothing in the current vocabulary made expressible.

const o = (statement, source, verdict = 'RESISTS_EXPLANATION', domain = 'sleep') =>
  observation({ statement, source, verdict, domain }).observation;

test('an observation with no source is refused', () => {
  const anonymous = observation({ statement: 'odd result', verdict: 'RESISTS_EXPLANATION' });
  assert.equal(anonymous.ok, false);
  assert.deepEqual(anonymous.reasonCodes, ['observation-source-required']);
  assert.match(anonymous.note, /counted twice is indistinguishable/);
});

test('observations an existing model explains are excluded, not surfaced', () => {
  const mined = mine({
    observations: [
      o('explained thing', 'tracker', 'EXPLAINED_BY_EXISTING_MODEL'),
      o('already asking about this', 'journal', 'KNOWN_UNKNOWN')
    ]
  });
  assert.deepEqual(mined.questions, []);
  assert.equal(mined.excludedAsAlreadyKnown.length, 2);
});

test('repeated surprise from one source is a fact about that source', () => {
  // Five anomalies from one instrument is the classic reading of a broken
  // instrument, not a hidden mechanism.
  const mined = mine({
    observations: Array.from({ length: 5 }, (_, i) => o(`anomaly ${i}`, 'one-tracker'))
  });
  assert.deepEqual(mined.questions, []);
  assert.equal(mined.singleSourceOnly.length, 1);
  assert.equal(mined.singleSourceOnly[0].independentSources, 1);
  assert.equal(mined.singleSourceOnly[0].question, 'IS_THIS_SOURCE_MISREPORTING');
  assert.match(mined.crossSourceLaw, /A_FACT_ABOUT_THAT_SOURCE/);
});

test('resistant observations from independent sources become a question', () => {
  const mined = mine({
    observations: [o('a', 'tracker'), o('b', 'journal'), o('c', 'clinician')]
  });
  assert.equal(mined.questions.length, 1);
  assert.equal(mined.questions[0].independentSources, 3);
  assert.equal(mined.questions[0].route, 'CROSS_SOURCE_STRUCTURE');
  assert.match(mined.questions[0].question, /THE_SAME_PHENOMENON/);
});

test('an expectation declared with no reason cannot create negative space', () => {
  const retrofitted = expectation({ expected: 'a thing', declaredAt: '2026-01-01' });
  assert.equal(retrofitted.ok, false);
  assert.deepEqual(retrofitted.reasonCodes, ['reason-for-expecting-required']);
  assert.match(retrofitted.note, /wearing the word "expected"/);
});

test('an expectation with no time cannot be shown to predate the gap', () => {
  const undated = expectation({ expected: 'a thing', because: 'the model says so' });
  assert.equal(undated.ok, false);
  assert.deepEqual(undated.reasonCodes, ['declared-at-required']);
});

test('a declared expectation with nothing observed is negative space', () => {
  const declared = expectation({
    expected: 'a market for this exists', declaredAt: '2026-01-01', because: 'every adjacent market has one'
  }).expectation;
  const mined = mine({ observations: [], expectations: [declared] });
  assert.equal(mined.questions.length, 1);
  assert.equal(mined.questions[0].route, 'DECLARED_ABSENCE');
  assert.equal(mined.questions[0].because, 'every adjacent market has one');
});

test('an expectation that was in fact observed is not an absence', () => {
  const declared = expectation({
    expected: 'a market for this exists', declaredAt: '2026-01-01', because: 'adjacency'
  }).expectation;
  const mined = mine({
    observations: [o('a market for this exists', 'registry', 'EXPLAINED_BY_EXISTING_MODEL', 'market')],
    expectations: [declared]
  });
  assert.equal(mined.questions.length, 0);
});

test('a domain no source can observe is a limit of the search, not a finding', () => {
  const mined = mine({
    observations: [o('a', 'tracker'), o('b', 'journal')],
    observedDomains: ['sleep', 'relationships', 'finances'],
    sourceCoverage: { tracker: ['sleep'], journal: ['sleep'] }
  });
  assert.deepEqual(mined.blindSpots, ['finances', 'relationships']);
  assert.match(mined.blindSpotLaw, /A_LIMIT_OF_THE_SEARCH__NOT_A_FINDING_ABOUT_THE_WORLD/);
});

test('full domain coverage is still not called adequate coverage', () => {
  const mined = mine({
    observations: [o('a', 'tracker')],
    observedDomains: ['sleep'],
    sourceCoverage: { tracker: ['sleep'] }
  });
  assert.deepEqual(mined.blindSpots, []);
  assert.match(mined.blindSpotLaw, /NOT_THE_SAME_AS_ADEQUATE_COVERAGE/);
});

test('the output is questions and says so', () => {
  const mined = mine({ observations: [o('a', 'x'), o('b', 'y')] });
  assert.match(mined.outputBoundary, /NOT_FINDINGS__NOT_EVIDENCE_OF_A_MECHANISM/);
  assert.equal(mined.businessEffectAuthority, 'NONE');
});

test('a phenomenon that fits a category is not evidence the ontology is wrong', () => {
  const fits = conceptPressure({ phenomenon: 'x', existingCategories: ['habit', 'preference'], fitsAny: true });
  assert.equal(fits.status, 'NO_CONCEPT_PRESSURE');
  assert.match(fits.law, /NOT_EVIDENCE_THE_ONTOLOGY_IS_WRONG/);
});

test('an unstated fitsAny defaults to fitting, not to pressure', () => {
  // Absence of an answer must not read as "nothing fits".
  const unstated = conceptPressure({ phenomenon: 'x', existingCategories: ['habit'] });
  assert.equal(unstated.status, 'NO_CONCEPT_PRESSURE');
});

test('claiming the ontology fails requires saying what forcing the fit loses', () => {
  const unargued = conceptPressure({ phenomenon: 'x', existingCategories: ['habit'], fitsAny: false });
  assert.equal(unargued.ok, false);
  assert.deepEqual(unargued.reasonCodes, ['distortion-required']);
  assert.match(unargued.note, /"new category" is a preference/);
});

test('concept pressure hands off to Ontogenesis rather than changing the ontology', () => {
  const pressed = conceptPressure({
    phenomenon: 'the recurring pull toward unrelated fields',
    existingCategories: ['habit', 'preference', 'skill'],
    fitsAny: false,
    distortionIfForced: 'calling it a preference loses that it precedes any exposure'
  });
  assert.equal(pressed.status, 'CONCEPT_PRESSURE_DETECTED');
  assert.equal(pressed.handoff, 'ONTOGENESIS_CANDIDATE__NOT_AN_ONTOLOGY_CHANGE');
  assert.match(pressed.question, /WHAT_WOULD_FALSIFY_IT/);
});

test('categories tried must be named before a no-fit claim counts', () => {
  const bare = conceptPressure({ phenomenon: 'x', fitsAny: false, distortionIfForced: 'lots' });
  assert.equal(bare.ok, false);
  assert.deepEqual(bare.reasonCodes, ['existing-categories-required']);
});

test('vocabularies are closed and frozen', () => {
  assert.equal(Object.isFrozen(OBSERVATION_VERDICTS), true);
  assert.equal(Object.isFrozen(DISCOVERY_ROUTES), true);
  assert.ok(DISCOVERY_ROUTES.includes('DECLARED_ABSENCE'));
});
