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
  const found = findBottleneck({
    goal: 'run the workshop',
    required: ['facilitation', 'arabic'],
    capabilities: [atom('facilitation', { level: 0.2 })]
  });
  assert.equal(found.bottleneck.capability, 'arabic');
  assert.equal(found.bottleneck.reason, 'ABSENT');
});

test('with everything present and no stronger causal evidence the weakest remains the fallback constraint', () => {
  const found = findBottleneck({
    goal: 'x',
    required: ['a', 'b'],
    capabilities: [atom('a', { level: 0.8 }), atom('b', { level: 0.2 })]
  });
  assert.equal(found.bottleneck.capability, 'b');
  assert.equal(found.bottleneck.reason, 'WEAKEST_PRESENT');
});

test('one resolved bottleneck is returned rather than a ranked list of everything', () => {
  const found = findBottleneck({
    goal: 'x', required: ['a', 'b', 'c'],
    capabilities: [atom('a', { level: 0.1 }), atom('b', { level: 0.2 }), atom('c', { level: 0.3 })]
  });
  assert.equal(typeof found.bottleneck.capability, 'string');
  assert.equal(Array.isArray(found.bottleneck), false);
  assert.match(found.law, /FEELS_PRODUCTIVE_AND_MOVES_NOTHING/);
});

test('goal-specific thresholds outrank raw weakest-score theater', () => {
  const found = findBottleneck({
    goal: 'ship the product',
    required: [
      { capability: 'coding', minimumLevel: 0.3 },
      { capability: 'sales', minimumLevel: 0.8 }
    ],
    capabilities: [
      atom('coding', { level: 0.4 }),
      atom('sales', { level: 0.6 })
    ]
  });
  assert.equal(found.status, 'BOTTLENECK_IDENTIFIED');
  assert.equal(found.bottleneck.capability, 'sales');
  assert.equal(found.bottleneck.reason, 'GOAL_THRESHOLD_DEFICIT');
  assert.equal(found.bottleneck.minimumLevel, 0.8);
  assert.ok(Math.abs(found.bottleneck.deficit - 0.2) < 1e-9);
});

test('a real substitute prevents a false absence verdict', () => {
  const found = findBottleneck({
    goal: 'run the workshop',
    required: [
      { capability: 'spanish', substitutes: ['arabic'] },
      'facilitation'
    ],
    capabilities: [
      atom('arabic', { level: 0.8 }),
      atom('facilitation', { level: 0.2 })
    ]
  });
  assert.equal(found.status, 'BOTTLENECK_IDENTIFIED');
  assert.equal(found.bottleneck.capability, 'facilitation');
  assert.equal(found.bottleneck.reason, 'WEAKEST_PRESENT');
  assert.deepEqual(found.substitutionsUsed, [
    { requirementId: 'required:0:spanish|arabic', requested: 'spanish', used: 'arabic' }
  ]);
  assert.equal(found.missing.includes('spanish'), false, 'a satisfied substitute route must not remain missing');
});

test('a hidden missing dependency binds before the strong top-level capability', () => {
  const shipping = atom('shipping', { level: 0.9, dependsOn: ['database'] });
  const found = findBottleneck({
    goal: 'serve customers reliably',
    required: ['shipping'],
    capabilities: [shipping]
  });
  assert.equal(found.status, 'BOTTLENECK_IDENTIFIED');
  assert.equal(found.bottleneck.capability, 'database');
  assert.equal(found.bottleneck.reason, 'DEPENDENCY_ABSENT');
  assert.equal(found.bottleneck.blockedCapability, 'shipping');
  assert.deepEqual(found.bottleneck.dependencyPath, ['shipping', 'database']);
});

test('joint prerequisites stay joint instead of pretending one arbitrary member is the whole bottleneck', () => {
  const found = findBottleneck({
    goal: 'practice independently',
    required: [{
      id: 'independent-practice',
      label: 'independent-practice',
      allOf: ['licensure', 'clinical judgment'],
      minimumLevel: 0.5
    }],
    capabilities: []
  });
  assert.equal(found.status, 'BOTTLENECK_IDENTIFIED');
  assert.equal(found.bottleneck.reason, 'JOINT_PREREQUISITE_SET');
  assert.equal(found.bottleneck.capability, 'independent-practice');
  assert.deepEqual(found.bottleneck.members.map(row => row.capability).sort(), ['clinical judgment', 'licensure']);
});

test('one missing member of a joint prerequisite is named without discarding the joint requirement', () => {
  const found = findBottleneck({
    goal: 'practice independently',
    required: [{
      label: 'independent-practice',
      allOf: ['licensure', 'clinical judgment'],
      minimumLevel: 0.5
    }],
    capabilities: [atom('clinical judgment', { level: 0.8 })]
  });
  assert.equal(found.bottleneck.capability, 'licensure');
  assert.equal(found.bottleneck.reason, 'JOINT_PREREQUISITE_MEMBER_ABSENT');
  assert.equal(found.bottleneck.jointRequirement, 'independent-practice');
});

test('equally evidenced independent missing requirements are underdetermined, not array-order destiny', () => {
  const forward = findBottleneck({ goal: 'x', required: ['a', 'b'], capabilities: [] });
  const reverse = findBottleneck({ goal: 'x', required: ['b', 'a'], capabilities: [] });
  for (const found of [forward, reverse]) {
    assert.equal(found.ok, true);
    assert.equal(found.status, 'BOTTLENECK_UNDERDETERMINED');
    assert.equal(found.bottleneck, null);
    assert.equal(found.competingConstraints.length, 2);
    assert.match(found.nextEvidenceRequired, /Array order is not evidence/);
  }
  assert.deepEqual(
    forward.competingConstraints.map(row => row.capability).sort(),
    reverse.competingConstraints.map(row => row.capability).sort()
  );
});

test('dependency cycles are surfaced as a causal defect rather than recursed forever', () => {
  const a = atom('a', { level: 0.9, dependsOn: ['b'] });
  const b = atom('b', { level: 0.9, dependsOn: ['a'] });
  const found = findBottleneck({ goal: 'x', required: ['a'], capabilities: [a, b] });
  assert.equal(found.status, 'BOTTLENECK_IDENTIFIED');
  assert.equal(found.bottleneck.reason, 'DEPENDENCY_CYCLE');
  assert.ok(found.bottleneck.dependencyPath.length >= 3);
});

test('malformed requirement contracts fail closed instead of being guessed into meaning', () => {
  const mixed = findBottleneck({
    goal: 'x',
    required: [{ capability: 'a', anyOf: ['b'] }],
    capabilities: [atom('a'), atom('b')]
  });
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.reasonCodes, ['required-capability-contract-invalid']);

  const invalidThreshold = findBottleneck({
    goal: 'x',
    required: [{ capability: 'a', minimumLevel: 2 }],
    capabilities: [atom('a')]
  });
  assert.equal(invalidThreshold.ok, false);
  assert.deepEqual(invalidThreshold.reasonCodes, ['required-capability-contract-invalid']);
});

test('a bottleneck remains a goal-relative causal claim, not a trait verdict', () => {
  const found = findBottleneck({
    goal: 'x',
    required: [{ capability: 'a', minimumLevel: 0.8 }],
    capabilities: [atom('a', { level: 0.4, basis: 'SINGLE_OBSERVATION' })]
  });
  assert.equal(found.bottleneck.capability, 'a');
  assert.match(found.truthBoundary, /GOAL-AND-EVIDENCE-RELATIVE/);
  assert.equal(found.businessEffectAuthority, 'NONE');
});

// ---- Agency debt ------------------------------------------------------------

test('delegation and atrophy are counted separately', () => {
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
