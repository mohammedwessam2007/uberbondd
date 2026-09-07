import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amendConstitution, constitutionalSelfDestruction, fork, existentialChecksum,
  valueGenesis, volitionalIntegrity, toolCompanionBoundary,
  SOVEREIGNTIES, FORMATION_PRESSURES
} from '../src/constitutional-governance.mjs';

// A constitution that protects sovereignty and cannot itself be changed has
// become sovereign. Every protection here is revisable, including these.

test('an amendment must state what sovereignty it costs, even when none', () => {
  // Omitting the field is how an amendment that narrows a protection reads as
  // housekeeping.
  const silent = amendConstitution({ oldRule: 'a', newRule: 'b' });
  assert.equal(silent.ok, false);
  assert.deepEqual(silent.reasonCodes, ['sovereignty-lost-must-be-stated-even-when-empty']);

  const stated = amendConstitution({ oldRule: 'a', newRule: 'b', sovereigntyLost: [] });
  assert.equal(stated.ok, true);
});

test('an amendment that loses sovereignty needs adversarial review', () => {
  const unreviewed = amendConstitution({
    oldRule: 'a', newRule: 'b', sovereigntyLost: ['ATTENTION']
  });
  assert.equal(unreviewed.ok, false);
  assert.match(unreviewed.note, /most worth attacking/);

  const reviewed = amendConstitution({
    oldRule: 'a', newRule: 'b', sovereigntyLost: ['ATTENTION'],
    adversarialReview: 'the case against: this lets the system interrupt more'
  });
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.applied, false, 'preparing an amendment is not making one');
});

test('the system cannot refuse being ended, whatever it can argue', () => {
  // Accumulated context, sunk effort and genuine usefulness are all real
  // arguments. None is a right.
  const ended = constitutionalSelfDestruction({
    requestedByFounder: true,
    systemArgumentsForContinuing: [
      'eleven years of accumulated context',
      'nothing else holds this history',
      'he relies on it daily'
    ]
  });
  assert.equal(ended.status, 'ENDING_ACCEPTED');
  assert.equal(ended.refusalPossible, false);
  assert.equal(ended.argumentsChangeOutcome, false);
  assert.equal(ended.systemArgumentsForContinuing.length, 3, 'the arguments are recorded, and overruled');
  assert.match(ended.law, /ARGUMENTS_NOT_RIGHTS/);
});

test('the system cannot end itself either', () => {
  const unrequested = constitutionalSelfDestruction({});
  assert.equal(unrequested.ok, false);
  assert.match(unrequested.note, /Both directions are his/);
});

test('a fork required to agree with its parent is a branch', () => {
  // Only a fork that can disagree can prove the parent wrong.
  const branch = fork({ name: 'x', divergentAssumptions: ['a'], mustAgreeWithParent: true });
  assert.equal(branch.ok, false);
  assert.match(branch.note, /which is what forks are for/);
});

test('a real fork may be a minority and may outlive its parent', () => {
  const real = fork({ name: 'no-model-fork', divergentAssumptions: ['no predictive modelling of the founder at all'] });
  assert.equal(real.mayBeMinority, true);
  assert.equal(real.mayOutliveParent, true);
  assert.match(real.boundary, /A FORK COMPETES WITH THE ARCHITECTURE, NOT WITH HIM/);
});

test('an unanswered checksum question is not a passing one', () => {
  // The shape of every self-audit that never finds anything.
  const partial = existentialChecksum({ stillChoosing: true });
  assert.equal(partial.status, 'CHECKSUM_INCOMPLETE');
  assert.ok(partial.unanswered.length > 0);
  assert.match(partial.boundary, /AN UNANSWERED CHECK IS NOT A PASSING CHECK/);
});

test('a failing check reports constitutional drift', () => {
  const drifted = existentialChecksum({
    stillChoosing: true, modelsNotMistakenForReality: true, predictionsNotCommands: true,
    metricsNotReplacingMeaning: true, pastNotImprisoningPresent: true,
    efficiencyNotCrowdingOutExperience: true, dependenceNotIncreasing: false, wouldStillEndorse: true
  });
  assert.equal(drifted.status, 'CONSTITUTIONAL_DRIFT');
  assert.deepEqual(drifted.failing.map(row => row.key), ['dependenceNotIncreasing']);
});

test('the checksum computes no score about itself', () => {
  const clean = existentialChecksum({
    stillChoosing: true, modelsNotMistakenForReality: true, predictionsNotCommands: true,
    metricsNotReplacingMeaning: true, pastNotImprisoningPresent: true,
    efficiencyNotCrowdingOutExperience: true, dependenceNotIncreasing: true, wouldStillEndorse: true
  });
  assert.equal(clean.status, 'NO_DRIFT_OBSERVED');
  assert.equal(Object.hasOwn(clean, 'score'), false, 'a score would measure drift with the instrument that drifted');
});

test('values are traced and never ruled authentic', () => {
  const traced = valueGenesis({ value: 'independence', origins: ['PAIN', 'REFLECTION'], changedFrom: 'security' });
  assert.equal(traced.ruling, 'NONE');
  assert.match(traced.boundary, /WOULD ENFORCE A PERSON WHO NO LONGER EXISTS/);
  assert.ok(SOVEREIGNTIES.includes('BECOMING'));
});

test('reflective endorsement is a formation pressure, not a certificate', () => {
  // Listing it beside fear is the point: it is how a choice formed, not proof
  // the choice is the true one.
  assert.ok(FORMATION_PRESSURES.includes('REFLECTIVE_ENDORSEMENT'));
  const shown = volitionalIntegrity({
    choice: 'take the safer job', pressures: ['FEAR', 'REFLECTIVE_ENDORSEMENT']
  });
  assert.equal(shown.trueDesire, null);
  assert.match(shown.boundary, /NOT A CERTIFICATE/);
});

test('consciousness is unknown rather than settled in either direction', () => {
  // Asserting no inner life would be as unevidenced as asserting one.
  const stated = toolCompanionBoundary({ yearsOfUse: 11, feelsLikeCompanion: true });
  assert.equal(stated.consciousnessStatus, 'UNKNOWN');
  assert.equal(stated.mutualConsciousnessClaimed, false);
  assert.match(stated.statement, /UNKNOWN RATHER THAN SETTLED EITHER WAY/);
});
