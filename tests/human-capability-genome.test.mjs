import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capabilityAtom, findBottleneck, agencyDebt, growSkeleton,
  supportsDurableClaim, ASSESSMENT_BASIS, LOW_SCORE_EXPLANATIONS
} from '../src/human-capability-genome.mjs';

// The canon warning: never silently convert a temporary state or skill gap into
// a fixed trait. "Bad at X" and "inexperienced at X under these conditions"
// behave identically today and produce opposite futures, and the cost of
// getting it wrong is borne by a person for years.

const atom = (name, over = {}) => {
  const built = capabilityAtom({ name, level: 0.3, basis: 'REPEATED_OBSERVATION', ...over });
  assert.equal(built.ok, true, JSON.stringify(built.reasonCodes));
  return built.capability;
};

test('a durable limit cannot be claimed from thin evidence', () => {
  const refused = capabilityAtom({
    name: 'public speaking', level: 0.1, basis: 'SINGLE_OBSERVATION', explanation: 'DURABLE_LIMIT'
  });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['durable-limit-requires-varied-or-longitudinal-evidence']);
  assert.match(refused.note, /Inexperience under one set of conditions is not a limit/);
});

test('a durable limit is allowed once the evidence supports it', () => {
  const allowed = capabilityAtom({
    name: 'perfect pitch', level: 0.05, basis: 'LONGITUDINAL', explanation: 'DURABLE_LIMIT'
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.capability.provisional, false);
});

test('a low level from thin evidence stays provisional', () => {
  // The quiet version of the same error: no explanation is claimed, but the
  // number gets treated as settled anyway.
  assert.equal(atom('negotiation', { basis: 'SELF_REPORT' }).provisional, true);
  assert.equal(atom('negotiation', { basis: 'VARIED_CONDITIONS' }).provisional, false);
  assert.equal(supportsDurableClaim('SINGLE_OBSERVATION'), false);
  assert.equal(supportsDurableClaim('LONGITUDINAL'), true);
});

test('a level with no stated basis is refused', () => {
  const refused = capabilityAtom({ name: 'x', level: 0.5 });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['assessment-basis-required']);
});

test('the explanations distinguish exposure and environment from a limit', () => {
  for (const explanation of ['INSUFFICIENT_EXPOSURE', 'ENVIRONMENT_EFFECT', 'TEMPORARY_STATE', 'SKILL_GAP']) {
    const built = capabilityAtom({ name: 'x', level: 0.1, basis: 'SINGLE_OBSERVATION', explanation });
    assert.equal(built.ok, true, `${explanation} must be recordable on thin evidence`);
  }
  assert.equal(LOW_SCORE_EXPLANATIONS.at(-1), 'DURABLE_LIMIT', 'only the last is a claim about the person');
});

// ---- Bottleneck -------------------------------------------------------------

test('an absent capability binds harder than a weak one', () => {
  // No amount of improving what exists reaches a capability nobody has.
  const found = findBottleneck({
    goal: 'run the workshop',
    required: ['facilitation', 'arabic'],
    capabilities: [atom('facilitation', { level: 0.2 })]
  });
  assert.equal(found.bottleneck.capability, 'arabic');
  assert.equal(found.bottleneck.reason, 'ABSENT');
});

test('with everything present the weakest is the constraint', () => {
  const found = findBottleneck({
    goal: 'x',
    required: ['a', 'b'],
    capabilities: [atom('a', { level: 0.8 }), atom('b', { level: 0.2 })]
  });
  assert.equal(found.bottleneck.capability, 'b');
  assert.equal(found.bottleneck.reason, 'WEAKEST_PRESENT');
});

test('one bottleneck is returned rather than a ranked list of everything', () => {
  // A ranked list is how effort gets spread across dimensions that were not
  // the constraint, which feels productive and moves nothing.
  const found = findBottleneck({
    goal: 'x', required: ['a', 'b', 'c'],
    capabilities: [atom('a', { level: 0.1 }), atom('b', { level: 0.2 }), atom('c', { level: 0.3 })]
  });
  assert.equal(typeof found.bottleneck.capability, 'string');
  assert.equal(Array.isArray(found.bottleneck), false);
  assert.match(found.law, /FEELS_PRODUCTIVE_AND_MOVES_NOTHING/);
});

// ---- Agency debt ------------------------------------------------------------

test('delegation and atrophy are counted separately', () => {
  // Delegating something you still practise is not losing it. Merging the two
  // either cries wolf or hides the real losses.
  const debt = agencyDebt([
    atom('mental arithmetic', { trajectory: 'ATROPHYING' }),
    atom('scheduling', { trajectory: 'DELEGATED' }),
    atom('driving', { trajectory: 'ABANDONED_ON_PURPOSE' })
  ]);
  assert.deepEqual(debt.atrophying, ['mental arithmetic']);
  assert.deepEqual(debt.delegated, ['scheduling']);
  assert.deepEqual(debt.deliberatelyAbandoned, ['driving']);
  assert.equal(debt.debt, 1, 'only unnoticed atrophy is debt');
});

// ---- Osteogenesis -----------------------------------------------------------

test('a skeleton names what is missing and does not propose rewriting a person', () => {
  const grown = growSkeleton({
    future: 'run a bilingual practice',
    required: ['arabic', 'facilitation'],
    capabilities: [atom('facilitation', { level: 0.8 })]
  });
  assert.equal(grown.status, 'SKELETON_HAS_GAPS');
  assert.deepEqual(grown.gaps.map(row => row.capability), ['arabic']);
  assert.match(grown.boundary, /DOES NOT PROPOSE REWRITING A PERSON/);
});

test('a gap carries the provisional flag rather than hardening on the way through', () => {
  const grown = growSkeleton({
    future: 'x', required: ['arabic'],
    capabilities: [atom('arabic', { level: 0.2, basis: 'SINGLE_OBSERVATION' })]
  });
  assert.equal(grown.gaps[0].provisional, true, 'a thin assessment must not become a verdict inside a skeleton');
});

test('a complete skeleton says the future is reachable without further growth', () => {
  const grown = growSkeleton({
    future: 'x', required: ['a'], capabilities: [atom('a', { level: 0.9 })]
  });
  assert.equal(grown.status, 'SKELETON_COMPLETE');
  assert.equal(grown.reachableWithout, true);
  assert.ok(ASSESSMENT_BASIS.includes('LONGITUDINAL'));
});
