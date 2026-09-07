import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findReinforcingLoops, windowOfLife, scarcityPhysics, mortalHorizon,
  preserveMystery, serendipitySurface, exploreExploit, meaningArchaeology,
  SCARCE_RESOURCES, WINDOW_CAUSES
} from '../src/life-autopoiesis.mjs';

// The ordinary framing is balance -- domains competing for a fixed pool of
// hours. That loses the thing that actually compounds, which is the loops
// between them. The second half is the constraint the first runs inside: a
// system that optimizes a life can consume the life it was optimizing.

test('reinforcing loops are reported as the specific chain, not as a score', () => {
  const found = findReinforcingLoops([
    { from: 'health', to: 'energy' },
    { from: 'energy', to: 'learning' },
    { from: 'learning', to: 'capability' },
    { from: 'capability', to: 'health' },
    { from: 'capability', to: 'income' }
  ]);
  assert.equal(found.status, 'REINFORCING_LOOPS_FOUND');
  assert.equal(found.loops.length, 1);
  assert.deepEqual([...found.loops[0]].sort(), ['capability', 'energy', 'health', 'learning']);
  assert.equal(Object.hasOwn(found, 'score'), false, 'a number saying a life is 0.7 autopoietic is unactionable');
});

test('one cycle is reported once, not once per entry point', () => {
  const found = findReinforcingLoops([
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }
  ]);
  assert.equal(found.loops.length, 1);
});

test('a chain with no cycle produces no loop', () => {
  const found = findReinforcingLoops([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
  assert.equal(found.status, 'NO_LOOPS_FOUND');
});

// ---- Scarcity ---------------------------------------------------------------

test('a recurring opportunity is important, not scarce', () => {
  // The expensive error is treating something that comes round again as a
  // closing window, which spends a window that was not closing.
  const recurring = windowOfLife({ opportunity: 'the annual conference', cause: 'RECURRING' });
  assert.equal(recurring.status, 'NOT_A_CLOSING_WINDOW');
  assert.equal(recurring.urgencyIsRealScarcity, false);
  assert.match(recurring.note, /it is not scarce/);
});

test('an age-bound window genuinely closes', () => {
  const closing = windowOfLife({ opportunity: 'a year abroad before the children are at school', cause: 'FAMILY_CIRCUMSTANCE' });
  assert.equal(closing.status, 'WINDOW_CLOSES');
  assert.equal(closing.urgencyIsRealScarcity, true);
  assert.ok(WINDOW_CAUSES.includes('AGE'));
});

test('time and youth are irreplaceable whatever the caller says', () => {
  // Pricing them in the same currency as money makes the trade look
  // acceptable every time.
  for (const resource of ['TIME', 'YOUTH', 'OPPORTUNITY_WINDOWS']) {
    const spent = scarcityPhysics({ resource, spentOn: 'x', replaceable: true });
    assert.equal(spent.status, 'SPENT_IRREPLACEABLY', `${resource} must not be marked replaceable`);
    assert.match(spent.law, /DOES NOT COME BACK/);
  }
  assert.equal(scarcityPhysics({ resource: 'MONEY', spentOn: 'x' }).status, 'SPENT_RECOVERABLY');
  assert.ok(SCARCE_RESOURCES.includes('RARE_RELATIONSHIPS'));
});

test('a recoverable resource is not thereby free', () => {
  assert.match(scarcityPhysics({ resource: 'MONEY', spentOn: 'x' }).law, /NOT THE SAME AS IT BEING FREE/);
});

test('preparation consuming the life is surfaced as a question, not a verdict', () => {
  // The failure a lifetime optimizer is most likely to cause and least likely
  // to notice, because every individual deferral is defensible.
  const consuming = mortalHorizon({
    yearsSpentPreparing: 12, yearsLived: 20,
    deferredExperiences: ['the sabbatical', 'learning to sail']
  });
  assert.equal(consuming.status, 'PREPARATION_IS_CONSUMING_THE_LIFE');
  assert.match(consuming.boundary, /NO RATIO DECIDES HOW SOMEONE SHOULD SPEND THEIR YEARS/);
  assert.match(consuming.question, /has it become the life/);
});

test('a modest preparation ratio is recorded without alarm', () => {
  const fine = mortalHorizon({ yearsSpentPreparing: 3, yearsLived: 30 });
  assert.equal(fine.status, 'HORIZON_RECORDED');
  assert.equal(fine.preparationRatio, 0.1);
});

// ---- Mystery and serendipity ------------------------------------------------

test('sometimes the correct output is to leave it alone', () => {
  const leave = preserveMystery({
    subject: 'sunday afternoons with friends',
    furtherOptimizationWouldRemove: ['spontaneity', 'the possibility of nothing happening']
  });
  assert.equal(leave.status, 'LEAVE_THIS_ALONE');
  assert.match(leave.note, /knows when to stop/);
});

test('finding no cost to optimization is not the same as there being none', () => {
  const unknown = preserveMystery({ subject: 'x' });
  assert.match(unknown.note, /not the same as there being none/);
});

test('twenty contexts in one field is one context twenty times', () => {
  const narrow = serendipitySurface({
    contexts: Array.from({ length: 20 }, (_, i) => ({ context: `event ${i}`, field: 'software' }))
  });
  assert.equal(narrow.status, 'HOMOGENEOUS_SURFACE');
  assert.equal(narrow.distinctFields, 1);
  assert.match(narrow.note, /edges are where accidents happen/);
});

test('serendipity creates conditions and refuses to predict the discovery', () => {
  const wide = serendipitySurface({
    contexts: [{ context: 'a', field: 'medicine' }, { context: 'b', field: 'theatre' }]
  });
  assert.equal(wide.status, 'HETEROGENEOUS_SURFACE');
  assert.match(wide.boundary, /CHOOSING IT IN ADVANCE/);
  assert.equal(Object.hasOwn(wide, 'expectedValue'), false);
});

test('explore/exploit is per domain, never one dial for a life', () => {
  const modes = exploreExploit([
    { domain: 'career', mode: 'EXPLOITING', yearsInMode: 9 },
    { domain: 'creative', mode: 'EXPLORING', yearsInMode: 2 }
  ]);
  assert.deepEqual(modes.stuck.map(row => row.domain), ['career']);
  assert.match(modes.boundary, /THE SCALAR THIS CANON FORBIDS/);
});

test('meaning is surfaced from his evidence, including what grew', () => {
  // The most interesting group is the one nobody looks for: it did not feel
  // like much at the time and it lasted.
  const surfaced = meaningArchaeology([
    { experience: 'the promotion', matteredAtTime: 0.9, mattersNow: 0.2, yearsSince: 8 },
    { experience: 'a conversation on a train', matteredAtTime: 0.2, mattersNow: 0.8, yearsSince: 8 },
    { experience: 'the move', matteredAtTime: 0.7, mattersNow: 0.7, yearsSince: 5 }
  ]);
  assert.deepEqual(surfaced.faded, ['the promotion']);
  assert.deepEqual(surfaced.grewInMeaning, ['a conversation on a train']);
  assert.ok(surfaced.durable.includes('the move'));
  assert.match(surfaced.boundary, /NO VIEW ON WHAT SHOULD HAVE MATTERED/);
});
