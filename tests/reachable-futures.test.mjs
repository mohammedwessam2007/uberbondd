import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectFuture, futureAncestors, reachableGeometry, timeTelescope,
  councilOfFutureSelves, HORIZONS, COUNCIL_SEATS
} from '../src/reachable-futures.mjs';

// The failure here is not bad forecasting, it is a simulated Mohamed acquiring
// a vote. Generate enough futures, notice eight of ten regret a choice, and the
// counting starts to feel like evidence -- but the eight came from the same
// assumptions, so what was measured is the generator.

const future = (name, lineage, extra = {}) => projectFuture({ name, lineage, desirable: true, ...extra }).future;

test('a future with no stated assumption lineage is refused', () => {
  const orphan = projectFuture({ name: 'The good one', desirable: true });
  assert.equal(orphan.ok, false);
  assert.deepEqual(orphan.reasonCodes, ['assumption-lineage-required']);
  assert.match(orphan.note, /counting futures measures the generator/);
});

test('a requirement appearing only inside one lineage is not an ancestor', () => {
  // Ten futures from one assumption set all needing X says the assumption set
  // needs X. That is a fact about the story, not about the life.
  const compiled = futureAncestors([
    future('a', 'assume-remote-work', { requires: ['visa'] }),
    future('b', 'assume-remote-work', { requires: ['visa'] }),
    future('c', 'assume-remote-work', { requires: ['visa'] }),
    future('d', 'assume-local-career', { requires: ['savings'] })
  ]);
  assert.deepEqual(compiled.ancestors, []);
  assert.equal(compiled.singleLineageOnly.find(row => row.requirement === 'visa').appearsIn.length, 3);
  assert.match(compiled.law, /FACT_ABOUT_THAT_SET/);
});

test('a requirement crossing independent lineages is an ancestor', () => {
  const compiled = futureAncestors([
    future('a', 'assume-remote-work', { requires: ['savings', 'visa'] }),
    future('b', 'assume-local-career', { requires: ['savings'] }),
    future('c', 'assume-study-route', { requires: ['savings'] })
  ]);
  assert.deepEqual(compiled.ancestors.map(row => row.requirement), ['savings']);
  assert.equal(compiled.ancestors[0].independentLineages, 3);
});

test('only desirable futures contribute ancestors', () => {
  const compiled = futureAncestors([
    projectFuture({ name: 'bad', lineage: 'x', requires: ['debt'], desirable: false }).future,
    projectFuture({ name: 'bad2', lineage: 'y', requires: ['debt'], desirable: false }).future
  ]);
  assert.deepEqual(compiled.ancestors, []);
  assert.equal(compiled.desirableFutures, 0);
});

// ---- Reachable geometry -----------------------------------------------------

test('closing branches by commitment is not scored as loss', () => {
  // A module that scored closure as loss would recommend against every
  // commitment a life is made of.
  const geometry = reachableGeometry({
    before: ['stay single', 'move anywhere', 'change careers'],
    after: ['change careers'],
    commitment: true
  });
  assert.equal(geometry.closed.length, 2);
  assert.match(geometry.interpretation, /That is what commitment is/);
  assert.equal(Object.hasOwn(geometry, 'score'), false);
});

test('branches closing with no stated commitment is flagged for a look', () => {
  const geometry = reachableGeometry({ before: ['a', 'b'], after: ['a'] });
  assert.match(geometry.interpretation, /without a stated commitment/);
});

// ---- Time telescope ---------------------------------------------------------

test('uncertainty may not narrow as the horizon lengthens', () => {
  // A decade-out projection stated more tightly than a week-out one is false
  // precision exactly where it is least checkable.
  const narrowed = timeTelescope({
    action: 'take the job',
    projections: [
      { horizon: 'MONTHS', consequence: 'more income', rangeWidth: 0.4 },
      { horizon: 'DECADES', consequence: 'career shape', rangeWidth: 0.1 }
    ]
  });
  assert.equal(narrowed.ok, false);
  assert.deepEqual(narrowed.reasonCodes, ['uncertainty-must-not-narrow-with-distance']);
});

test('widening with distance is accepted', () => {
  const widened = timeTelescope({
    action: 'take the job',
    projections: [
      { horizon: 'MONTHS', consequence: 'more income', rangeWidth: 0.2 },
      { horizon: 'FIVE_YEARS', consequence: 'seniority', rangeWidth: 0.5 },
      { horizon: 'DECADES', consequence: 'career shape', rangeWidth: 0.9 }
    ]
  });
  assert.equal(widened.ok, true);
  assert.equal(widened.horizonsCovered.length, 3);
  assert.match(widened.truthBoundary, /NOT A PREDICTION OF WHAT WILL HAPPEN/);
  assert.equal(HORIZONS.indexOf('DECADES') > HORIZONS.indexOf('MONTHS'), true);
});

// ---- Council ----------------------------------------------------------------

test('the council surfaces disagreement and computes no majority', () => {
  const council = councilOfFutureSelves({
    decision: 'take the job',
    views: [
      { seat: 'NEAR_TERM', view: 'the money helps now', favours: 'take it' },
      { seat: 'PROFESSIONAL', view: 'it compounds', favours: 'take it' },
      { seat: 'FREEDOM_SEEKING', view: 'it locks in a city', favours: 'decline' }
    ]
  });
  assert.equal(council.disagreement, true);
  assert.equal(Object.hasOwn(council, 'majority'), false);
  assert.equal(Object.hasOwn(council, 'winner'), false);
  assert.doesNotMatch(JSON.stringify(council), /"(majority|winner|verdict)"/);
  assert.match(council.authority, /NO SIMULATED FUTURE SELF OVERRIDES THE PRESENT ONE/);
});

test('positions record who holds them rather than how many', () => {
  const council = councilOfFutureSelves({
    decision: 'x',
    views: [
      { seat: 'NEAR_TERM', view: 'a', favours: 'take it' },
      { seat: 'MIDLIFE', view: 'b', favours: 'take it' },
      { seat: 'OLDER', view: 'c', favours: 'decline' }
    ]
  });
  const takeIt = council.positions.find(row => row.position === 'take it');
  assert.deepEqual(takeIt.heldBy, ['NEAR_TERM', 'MIDLIFE']);
  assert.equal(Object.hasOwn(takeIt, 'count'), false, 'a count is a tally, and a tally is a vote');
  assert.ok(COUNCIL_SEATS.includes('OLDER'));
});
