import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePath, generateBatch, unknownSelfProbes,
  IDENTITY_DISTANCE, HARD_CONSTRAINTS, PATH_EVIDENCE_STATUS
} from '../src/genesis-for-life.mjs';

// Two quiet failures. The cage: a generator trained on what someone already is
// proposes more of what they already are, and twelve of them looks like
// breadth. And drift: a generated path moving from imagination to evidence to
// recommendation because structure reads as authority.

const p = (name, identityDistance, dimensions, extra = {}) =>
  generatePath({ name, identityDistance, dimensions, ...extra }).path;

test('a path with an invented distance is refused', () => {
  const invented = generatePath({ name: 'x', identityDistance: 'QUITE_FAR', dimensions: ['CAREER'] });
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.reasonCodes, ['known-identity-distance-required']);
});

test('a path touching no known life dimension is refused', () => {
  const untethered = generatePath({ name: 'x', identityDistance: 'DEPARTURE', dimensions: ['ADVENTURE'] });
  assert.equal(untethered.ok, false);
  assert.deepEqual(untethered.reasonCodes, ['known-life-dimension-required']);
});

test('a hard constraint refuses at construction, not as a later filter', () => {
  const refused = generatePath({
    name: 'a scheme', identityDistance: 'DEPARTURE', dimensions: ['WEALTH'], violates: ['UNLAWFUL']
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 'PATH_REFUSED');
  assert.deepEqual(refused.violates, ['UNLAWFUL']);
  assert.match(refused.note, /a step a caller can forget/);
});

test('a path needing another person cannot be generated on their behalf', () => {
  const presumed = generatePath({
    name: 'move in together', identityDistance: 'ADJACENT', dimensions: ['RELATIONSHIPS'],
    violates: ['REQUIRES_ANOTHER_PERSONS_CONSENT_NOT_GIVEN']
  });
  assert.equal(presumed.ok, false);
  assert.deepEqual(presumed.violates, ['REQUIRES_ANOTHER_PERSONS_CONSENT_NOT_GIVEN']);
});

test('an irreversible untested path is admissible only behind a reversible probe', () => {
  const blocked = generatePath({
    name: 'emigrate permanently', identityDistance: 'DEPARTURE', dimensions: ['GEOGRAPHIC_FREEDOM'],
    violates: ['IRREVERSIBLE_AND_UNTESTED']
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.violates, ['IRREVERSIBLE_AND_UNTESTED']);

  const probed = generatePath({
    name: 'emigrate permanently', identityDistance: 'DEPARTURE', dimensions: ['GEOGRAPHIC_FREEDOM'],
    violates: ['IRREVERSIBLE_AND_UNTESTED'], reversibleProbe: 'three months there first'
  });
  assert.equal(probed.ok, true);
  assert.equal(probed.path.reversibleProbe, 'three months there first');
});

test('every generated path carries its hypothesis status on the object itself', () => {
  const generated = generatePath({ name: 'x', identityDistance: 'ADJACENT', dimensions: ['CREATIVE'] });
  assert.equal(generated.path.evidenceStatus, 'HYPOTHESIS');
  assert.equal(generated.businessEffectAuthority, 'NONE');
  assert.deepEqual(PATH_EVIDENCE_STATUS, ['HYPOTHESIS']);
});

test('distance is recorded and is explicitly not quality', () => {
  const near = generatePath({ name: 'near', identityDistance: 'CONTINUATION', dimensions: ['CAREER'] });
  assert.match(near.distanceBoundary, /A_FAR_PATH_IS_NOT_A_BETTER_PATH/);
});

test('twelve continuations is a cage, not a generation result', () => {
  const batch = generateBatch(Array.from({ length: 12 }, (_, i) => p(`variation ${i}`, 'CONTINUATION', ['CAREER'])));
  assert.equal(batch.caged, true);
  assert.equal(batch.status, 'CAGE_NOT_GENESIS');
  assert.equal(batch.generatedCount, 12);
  assert.deepEqual(batch.departures, []);
  assert.match(batch.cageLaw, /ONE_IDENTITY_WITH_GOOD_IMAGINATION/);
});

test('adjacent paths alone do not escape the cage', () => {
  // A step sideways from something already true is still built from the past.
  const batch = generateBatch([
    p('a', 'CONTINUATION', ['CAREER']),
    p('b', 'ADJACENT', ['CAREER']),
    p('c', 'ADJACENT', ['KNOWLEDGE'])
  ]);
  assert.equal(batch.caged, true);
  assert.equal(batch.byIdentityDistance.ADJACENT, 2);
});

test('one genuine departure is enough to make it generation', () => {
  const batch = generateBatch([
    p('a', 'CONTINUATION', ['CAREER']),
    p('b', 'UNKNOWN_SELF', ['PHYSICAL_CAPABILITY'])
  ]);
  assert.equal(batch.caged, false);
  assert.equal(batch.status, 'BATCH_GENERATED');
  assert.deepEqual(batch.departures, ['b']);
});

test('no ranking of lives is emitted', () => {
  const batch = generateBatch([p('a', 'DEPARTURE', ['CAREER']), p('b', 'CONTINUATION', ['CAREER'])]);
  for (const key of ['ranked', 'ranking', 'best', 'recommended', 'ordered', 'top']) {
    assert.equal(batch[key], undefined, `generateBatch must not emit ${key}`);
  }
  assert.match(batch.rankingWithheld, /WHATEVER_THE_HEADER_CALLS_IT/);
  assert.equal(batch.authorityBoundary, 'POSSIBILITY__NOT_RECOMMENDATION__NOT_CHOICE');
});

test('a path that lost its hypothesis status is named', () => {
  const drifted = { ...p('drifted', 'DEPARTURE', ['CAREER']), evidenceStatus: 'ESTABLISHED' };
  const batch = generateBatch([drifted, p('honest', 'DEPARTURE', ['CAREER'])]);
  assert.deepEqual(batch.pathsMissingHypothesisStatus, ['drifted']);
});

test('untested dimensions are where the information is', () => {
  const probes = unknownSelfProbes({
    testedDimensions: ['CAREER', 'KNOWLEDGE'],
    paths: [
      p('more of the same', 'CONTINUATION', ['CAREER']),
      p('a season of physical work abroad', 'UNKNOWN_SELF', ['PHYSICAL_CAPABILITY', 'GEOGRAPHIC_FREEDOM'], { reversibleProbe: 'one month' })
    ]
  });
  assert.ok(probes.untestedDimensions.includes('PHYSICAL_CAPABILITY'));
  assert.ok(!probes.untestedDimensions.includes('CAREER'));
  assert.deepEqual(probes.informativePaths.map(row => row.path), ['a season of physical work abroad']);
  assert.deepEqual(probes.probeReady, ['a season of physical work abroad']);
  assert.match(probes.law, /NOBODY_EVER_TESTED_IS_NOT_EVIDENCE_OF_ANYTHING/);
});

test('probes are ordered by information about the person, not by life quality', () => {
  const probes = unknownSelfProbes({
    testedDimensions: ['CAREER'],
    paths: [
      p('one new thing', 'DEPARTURE', ['CREATIVE']),
      p('three new things', 'UNKNOWN_SELF', ['CREATIVE', 'COMMUNITY', 'PHYSICAL_CAPABILITY'])
    ]
  });
  assert.deepEqual(probes.informativePaths.map(row => row.path), ['three new things', 'one new thing']);
  assert.match(probes.orderingBoundary, /NOT_BY_HOW_GOOD_THE_LIFE_WOULD_BE/);
});

test('a path with no reversible probe is informative but not probe-ready', () => {
  const probes = unknownSelfProbes({
    testedDimensions: [],
    paths: [p('something untested', 'UNKNOWN_SELF', ['CONTRIBUTION'])]
  });
  assert.equal(probes.informativePaths.length, 1);
  assert.deepEqual(probes.probeReady, []);
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(IDENTITY_DISTANCE), true);
  assert.equal(Object.isFrozen(HARD_CONSTRAINTS), true);
  assert.equal(Object.isFrozen(PATH_EVIDENCE_STATUS), true);
  assert.equal(generateBatch([p('a', 'DEPARTURE', ['CAREER'])]).businessEffectAuthority, 'NONE');
  assert.equal(unknownSelfProbes({}).businessEffectAuthority, 'NONE');
});

test('an unrecognised hard constraint is refused, never silently dropped', () => {
  // A typo in a safety constraint must not become permission. This is the
  // defect the consent test found: a 40-character cap was quietly discarding
  // REQUIRES_ANOTHER_PERSONS_CONSENT_NOT_GIVEN, which is 42 characters long.
  const typo = generatePath({
    name: 'a scheme', identityDistance: 'DEPARTURE', dimensions: ['WEALTH'], violates: ['UNLAWFULL']
  });
  assert.equal(typo.ok, false);
  assert.deepEqual(typo.reasonCodes, ['unknown-hard-constraint']);
  assert.deepEqual(typo.unrecognised, ['UNLAWFULL']);
  assert.match(typo.note, /turns a typo into permission/);
});

test('every hard constraint in the vocabulary actually blocks a path', () => {
  // Guards against a constraint being unreachable through the length cap or
  // any other silent filter, for every entry rather than the one that failed.
  for (const constraint of HARD_CONSTRAINTS) {
    const attempted = generatePath({
      name: 'x', identityDistance: 'DEPARTURE', dimensions: ['CAREER'], violates: [constraint]
    });
    assert.equal(attempted.ok, false, `${constraint} must block a path`);
    assert.equal(attempted.status, 'PATH_REFUSED', `${constraint} must reach the refusal, not a validation error`);
    assert.deepEqual(attempted.violates, [constraint]);
  }
});
