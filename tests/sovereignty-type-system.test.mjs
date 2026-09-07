import test from 'node:test';
import assert from 'node:assert/strict';
import {
  typedClaim, deriveClaim, promotionAllowed, authorityFor, attenuate,
  exitReadiness, rungOf, SOVEREIGNTY_TYPES, HUMAN_ONLY_CROSSINGS, NOT_AUTHORITY
} from '../src/sovereignty-type-system.mjs';

// The failure this module exists for is not a wrong answer. It is a silent
// promotion -- a prediction arriving worded as a value, a recommendation
// arriving worded as a decision. Each of those reads perfectly well in a log.
// So the tests are about what cannot be done, not about what can.

const claim = (type, body, extra = {}) => {
  const built = typedClaim({ type, body, at: '2026-09-07T00:00:00.000Z', ...extra });
  assert.equal(built.ok, true, JSON.stringify(built.reasonCodes));
  return built.claim;
};

// ---- The three crossings ---------------------------------------------------

test('a prediction never becomes a value, however strong the evidence', () => {
  const forecast = claim('PREDICTION', 'this path pays more', { confidence: 0.99 });
  const promoted = deriveClaim({ sources: [forecast], type: 'VALUE', body: 'money is what matters here' });
  assert.equal(promoted.ok, false);
  assert.equal(promoted.status, 'SOVEREIGNTY_PROMOTION_REFUSED');
  assert.equal(promoted.requiredHumanAct, 'is-does-not-become-ought');
});

test('a recommendation never becomes a choice', () => {
  const advice = claim('RECOMMENDATION', 'take the second option');
  const chosen = deriveClaim({ sources: [advice], type: 'CHOICE', body: 'the second option' });
  assert.equal(chosen.ok, false);
  assert.equal(chosen.requiredHumanAct, 'only-the-founder-chooses');

  const byFounder = deriveClaim({
    sources: [advice], type: 'CHOICE', body: 'the second option',
    humanAct: 'only-the-founder-chooses'
  });
  assert.equal(byFounder.ok, true);
  assert.equal(byFounder.humanAct, 'only-the-founder-chooses');
});

test('choosing is not delegating execution', () => {
  // The edge people forget. Deciding to do a thing and authorising a machine to
  // go do it are different acts, and collapsing them is how an agent ends up
  // executing something the founder only decided he wanted.
  const chosen = claim('CHOICE', 'move to the second option');
  const executed = deriveClaim({ sources: [chosen], type: 'AUTHORITY', body: 'execute the move' });
  assert.equal(executed.ok, false);
  assert.equal(executed.requiredHumanAct, 'choosing-is-not-delegating-execution');
});

test('a crossing cannot be stepped over by skipping a rung', () => {
  // Without this, the three crossings are decorative: an observation promoted
  // straight to a recommendation never touches PREDICTION->VALUE at all.
  const seen = claim('OBSERVATION', 'he worked late nine days running');
  const advice = deriveClaim({ sources: [seen], type: 'RECOMMENDATION', body: 'he should rest' });
  assert.equal(advice.ok, false);
  assert.deepEqual(advice.reasonCodes, ['sovereignty-promotion-may-not-skip-a-rung']);
});

test('a human act unlocks only its own crossing', () => {
  const forecast = claim('PREDICTION', 'this pays more');
  const wrongKey = deriveClaim({
    sources: [forecast], type: 'VALUE', body: 'money matters most',
    humanAct: 'only-the-founder-chooses'
  });
  assert.equal(wrongKey.ok, false, 'the founder choosing something does not settle what is worth wanting');
});

test('every human-only crossing is between adjacent rungs and is refused by default', () => {
  for (const [edge, act] of Object.entries(HUMAN_ONLY_CROSSINGS)) {
    const [from, to] = edge.split('->');
    assert.equal(rungOf(to) - rungOf(from), 1, `${edge} must be adjacent or the skip rule hides it`);
    assert.equal(promotionAllowed(from, to).allowed, false, `${edge} must refuse without a human act`);
    assert.equal(promotionAllowed(from, to, { humanAct: act }).allowed, true);
  }
});

test('the highest source rung governs, so one value judgment cannot hide in a pile of facts', () => {
  const facts = Array.from({ length: 9 }, (_, i) => claim('OBSERVATION', `fact ${i}`));
  const value = claim('VALUE', 'freedom matters more than income');
  const advice = deriveClaim({ sources: [...facts, value], type: 'RECOMMENDATION', body: 'take the lower-paid work' });
  assert.equal(advice.ok, true, 'VALUE -> RECOMMENDATION is a lawful single step');
  assert.equal(advice.promotedFrom, 'VALUE', 'the value judgment must be what the recommendation is measured from');

  const laundered = deriveClaim({ sources: [...facts, value], type: 'CHOICE', body: 'take the lower-paid work' });
  assert.equal(laundered.ok, false, 'nine facts do not dilute the one input that decides the rung');
});

test('moving down or sideways is always allowed', () => {
  const outcome = claim('OUTCOME', 'the move did not pay off');
  const belief = deriveClaim({ sources: [outcome], type: 'BELIEF', body: 'that reference class was wrong' });
  assert.equal(belief.ok, true);
});

// ---- Typing -----------------------------------------------------------------

test('an untyped claim is refused rather than defaulted', () => {
  // Every default is wrong in one direction: default low and recommendations
  // get laundered as observations, default high and raw data carries authority.
  const untyped = typedClaim({ body: 'something', at: '2026-09-07T00:00:00.000Z' });
  assert.equal(untyped.ok, false);
  assert.ok(untyped.reasonCodes.includes('valid-sovereignty-type-required'));
  assert.equal(typedClaim({ type: 'INSIGHT', body: 'x' }).ok, false, 'the type vocabulary is closed');
});

test('confidence is dropped above PREDICTION, where it would be theatre', () => {
  assert.equal(claim('PREDICTION', 'x', { confidence: 0.8 }).confidence, 0.8);
  for (const type of ['VALUE', 'RECOMMENDATION', 'CHOICE', 'AUTHORITY']) {
    assert.equal(claim(type, 'x', { confidence: 0.97 }).confidence, null,
      `${type} must not carry a confidence number pointed at a person`);
  }
});

// ---- Authority --------------------------------------------------------------

test('capability is not authority, and the list of things that are not says so', () => {
  const denied = authorityFor({ action: 'send-email' });
  assert.equal(denied.ok, false);
  assert.deepEqual(denied.reasonCodes, ['no-delegation-present']);
  for (const source of ['CAPABILITY', 'INTELLIGENCE', 'PREDICTION_ACCURACY', 'MODEL_AGREEMENT', 'CONFIDENCE']) {
    assert.ok(NOT_AUTHORITY.includes(source), `${source} must be named as not-authority`);
  }
});

test('a delegation must originate with the founder, name the action, and expire', () => {
  const base = { subject: 'FOUNDER', actions: ['send-email'], expiresAt: '2026-09-08T00:00:00.000Z' };
  const now = '2026-09-07T00:00:00.000Z';
  assert.equal(authorityFor({ action: 'send-email', delegation: base, now }).ok, true);
  assert.equal(authorityFor({ action: 'send-email', delegation: { ...base, subject: 'AGENT' }, now }).ok, false);
  assert.equal(authorityFor({ action: 'wire-money', delegation: base, now }).ok, false);
  assert.equal(authorityFor({ action: 'send-email', delegation: { ...base, expiresAt: null }, now }).ok, false,
    'a delegation with no expiry is a standing grant nobody decided to make');
  assert.equal(authorityFor({ action: 'send-email', delegation: base, now: '2026-09-09T00:00:00.000Z' }).ok, false);
  assert.equal(authorityFor({
    action: 'send-email', delegation: { ...base, revokedAt: '2026-09-06T00:00:00.000Z' }, now
  }).ok, false);
});

test('re-delegation may narrow but never widen', () => {
  const parent = authorityFor({
    action: 'send-email',
    delegation: { subject: 'FOUNDER', actions: ['send-email', 'read-inbox'], expiresAt: '2026-09-08T00:00:00.000Z' },
    now: '2026-09-07T00:00:00.000Z'
  });
  assert.equal(attenuate({ parent, actions: ['send-email'], expiresAt: '2026-09-07T12:00:00.000Z' }).ok, true);
  assert.deepEqual(
    attenuate({ parent, actions: ['send-email', 'wire-money'], expiresAt: '2026-09-07T12:00:00.000Z' }).reasonCodes,
    ['delegation-may-only-attenuate']
  );
});

test('a narrowing chain cannot quietly extend its own expiry', () => {
  // The failure that is actually hard to see: every hop narrows the action set,
  // so each looks correct, while the expiry walks forward and a five-minute
  // grant becomes a standing one three delegations down.
  const parent = authorityFor({
    action: 'send-email',
    delegation: { subject: 'FOUNDER', actions: ['send-email', 'read-inbox'], expiresAt: '2026-09-07T00:05:00.000Z' },
    now: '2026-09-07T00:00:00.000Z'
  });
  const extended = attenuate({ parent, actions: ['send-email'], expiresAt: '2026-09-30T00:00:00.000Z' });
  assert.equal(extended.ok, false);
  assert.deepEqual(extended.reasonCodes, ['delegation-may-not-outlive-its-parent']);
});

// ---- Exit -------------------------------------------------------------------

test('exit is measured, not promised', () => {
  const obstructed = exitReadiness({
    canExportAll: true, canDeleteAll: false, canRunWithoutSystem: true,
    dependencies: [{ name: 'sole-model-provider', replaceable: false }]
  });
  assert.equal(obstructed.ok, false);
  assert.ok(obstructed.blockers.includes('state-cannot-be-deleted-in-full'));
  assert.ok(obstructed.blockers.includes('irreplaceable-dependency:sole-model-provider'));
  assert.equal(obstructed.law, 'UBERBOND_HAS_NO_INTRINSIC_RIGHT_TO_CONTINUE_EXISTING');

  assert.equal(exitReadiness({
    canExportAll: true, canDeleteAll: true, canRunWithoutSystem: true,
    dependencies: [{ name: 'model-provider', replaceable: true }]
  }).ok, true);
});

test('the ladder is ordered and closed', () => {
  assert.equal(SOVEREIGNTY_TYPES[0], 'OBSERVATION');
  assert.equal(SOVEREIGNTY_TYPES.at(-1), 'OUTCOME');
  assert.equal(rungOf('CHOICE') < rungOf('AUTHORITY'), true, 'authority sits above choice or the crossing is meaningless');
  assert.equal(rungOf('NOT_A_TYPE'), -1);
});
