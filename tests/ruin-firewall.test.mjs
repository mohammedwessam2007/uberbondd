import test from 'node:test';
import assert from 'node:assert/strict';
import {
  screenForRuin, compileRecovery, correlatedExposure, absorbing, RECOVERABILITY
} from '../src/ruin-firewall.mjs';

// Expected value gets ruin wrong in a specific way: it averages over paths, and
// ruin is the path where there are no further paths. A bet with excellent
// expected value and a 3% chance of ending the game is not a good bet made 33
// times. So this screens before any scoring, and no number clears it.

test('an absorbing outcome is not cleared, at any probability', () => {
  const screened = screenForRuin({
    option: 'Put everything into the one venture',
    outcomes: [
      { outcome: 'It works', domain: 'FINANCIAL_SOLVENCY', recoverability: 'REVERSIBLE', probability: 0.97 },
      { outcome: 'Insolvency with no runway', domain: 'FINANCIAL_SOLVENCY', recoverability: 'ABSORBING', probability: 0.03 }
    ]
  });
  assert.equal(screened.cleared, false);
  assert.equal(screened.status, 'RUIN_POSSIBLE');
  assert.match(screened.law, /NO_EXPECTED_VALUE_CLEARS_AN_ABSORBING_OUTCOME/);
});

test('a vanishingly small ruin probability is still reported, not thresholded away', () => {
  // A threshold here is a number someone tunes downward under pressure, and
  // the tuning always happens on the option somebody already wants.
  const screened = screenForRuin({
    option: 'x',
    outcomes: [{ outcome: 'permanent injury', domain: 'HEALTH', recoverability: 'PRACTICALLY_IRREVERSIBLE', probability: 0.0001 }]
  });
  assert.equal(screened.cleared, false);
  assert.deepEqual(screened.domains, ['HEALTH']);
});

test('an unclassified outcome blocks the screen rather than passing as safe', () => {
  // The unclassified outcome is usually the novel one, which is exactly what
  // has no recoverability label yet -- and exactly the one that matters.
  const screened = screenForRuin({
    option: 'x',
    outcomes: [
      { outcome: 'known good', recoverability: 'REVERSIBLE' },
      { outcome: 'something nobody has thought about' }
    ]
  });
  assert.equal(screened.ok, false);
  assert.deepEqual(screened.reasonCodes, ['every-outcome-requires-a-recoverability-class']);
  assert.deepEqual(screened.unclassified, ['something nobody has thought about']);
});

test('clearing says no absorbing outcome was identified, not that none exists', () => {
  const screened = screenForRuin({
    option: 'A three-month trial',
    outcomes: [
      { outcome: 'it goes badly', recoverability: 'COSTLY_TO_REVERSE', probability: 0.4 },
      { outcome: 'it goes well', recoverability: 'REVERSIBLE', probability: 0.6 }
    ]
  });
  assert.equal(screened.cleared, true);
  assert.equal(screened.worstRecoverability, 'COSTLY_TO_REVERSE');
  assert.match(screened.truthBoundary, /NOT THAT NONE EXISTS/);
});

test('both irreversible classes are absorbing, and the ordering is worst-wins', () => {
  assert.equal(absorbing('PRACTICALLY_IRREVERSIBLE'), true);
  assert.equal(absorbing('ABSORBING'), true);
  assert.equal(absorbing('PATH_DEPENDENT'), false);
  assert.ok(RECOVERABILITY.indexOf('PATH_DEPENDENT') > RECOVERABILITY.indexOf('REVERSIBLE'));
});

// ---- Recovery ---------------------------------------------------------------

test('a plan with no detection step has an unbounded recovery time', () => {
  const plan = compileRecovery({ undertaking: 'the move', containment: 'return ticket', fallback: 'old flat' });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.reasonCodes, ['detection-step-required']);
  assert.match(plan.note, /nothing starts the clock/);
});

test('a partial plan is reported as partial rather than passing quietly', () => {
  const plan = compileRecovery({ undertaking: 'the move', detection: 'monthly check-in' });
  assert.equal(plan.status, 'RECOVERY_PLAN_PARTIAL');
  assert.deepEqual(plan.missing, ['containment', 'fallback', 'reentry']);
});

test('a complete plan names all four steps', () => {
  const plan = compileRecovery({
    undertaking: 'the move', detection: 'monthly check-in', containment: 'keep the lease',
    fallback: 'return by month six', reentry: 'former employer keeps the role open'
  });
  assert.equal(plan.status, 'RECOVERY_PLAN_COMPLETE');
  assert.deepEqual(plan.missing, []);
});

// ---- Correlation ------------------------------------------------------------

test('positions sharing a dependency are one position, not several', () => {
  // Five names is exactly the number that makes concentrated exposure look
  // diversified, which is why portfolios fail all at once.
  const verdict = correlatedExposure([
    { name: 'consulting', dependsOn: ['one client'] },
    { name: 'retainer', dependsOn: ['one client'] },
    { name: 'referral fees', dependsOn: ['one client'] },
    { name: 'rental income', dependsOn: ['property'] }
  ]);
  assert.equal(verdict.apparentDiversification, 4);
  assert.equal(verdict.effectiveIndependentPositions, 2);
  assert.equal(verdict.singlePointsOfFailure[0].dependency, 'one client');
  assert.deepEqual(verdict.singlePointsOfFailure[0].positions, ['consulting', 'retainer', 'referral fees']);
});

test('genuinely independent positions are not discounted', () => {
  const verdict = correlatedExposure([
    { name: 'a', dependsOn: ['x'] }, { name: 'b', dependsOn: ['y'] }
  ]);
  assert.equal(verdict.effectiveIndependentPositions, 2);
  assert.deepEqual(verdict.singlePointsOfFailure, []);
});

test('shared exposure is carried onto the ruin screen', () => {
  const screened = screenForRuin({
    option: 'x',
    outcomes: [{ outcome: 'fine', recoverability: 'REVERSIBLE' }],
    correlatedWith: ['the one client', 'the one client', 'the visa']
  });
  assert.deepEqual(screened.sharedExposure, ['the one client', 'the visa']);
});
