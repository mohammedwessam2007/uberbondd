// The one idea this suite exists to pin down: apparent agreement is not
// independent evidence.
//
// The tests are built around a single comparison. The same ten forecasters,
// agreeing on the same outcome by the same margin, must reach a materially
// different conclusion depending only on whether their evidence traces back to
// one ancestor or to ten. If that difference ever collapses, the module has
// stopped doing the only thing it is for.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORECAST_ADVERSARIAL_ENSEMBLE_VERSION, EPISTEMIC_BIASES, MODEL_STANCES, ATTACK_TYPES,
  PARTIAL_INDEPENDENCE_CREDIT, CONVERGENCE_FLOOR, AGREEMENT_FLOOR,
  forecasterSubmission, effectiveIndependence, adversarialAttack,
  epistemicImmuneReview, modelEcology, composeEnsemble
} from '../src/forecast-adversarial-ensemble.mjs';

const submit = (id, ancestry, { yes = 0.8, stance = 'MAINSTREAM', disconfirming = ['checked the contrary case'] } = {}) =>
  forecasterSubmission({
    forecasterId: id,
    stance,
    distribution: { yes, no: Math.round((1 - yes) * 100) / 100 },
    evidenceAncestry: ancestry,
    updateTriggers: ['the underlying report is retracted'],
    disconfirmingEvidence: disconfirming
  });

/** Ten forecasters, one shared ancestor. One opinion repeated ten times. */
const clones = () => Array.from({ length: 10 }, (_, i) => submit(`f${i}`, ['the-one-report']));

/** Ten forecasters, ten unrelated ancestors. Ten opinions. */
const independents = () => Array.from({ length: 10 }, (_, i) => submit(`f${i}`, [`source-${i}`]));

const survivedAttack = adversarialAttack({
  critic: 'red-team', attackType: 'COUNTEREXAMPLE',
  finding: 'a comparable case that went the other way', forecastSurvived: true
});

describe('forecaster submissions', () => {
  test('accepts a submission that declares where its evidence came from', () => {
    const row = submit('f1', ['field-study-a']);
    assert.equal(row.status, 'SUBMISSION_ACCEPTED');
    assert.equal(row.modalOutcome, 'yes');
  });

  // An uncheckable submission silently becomes a free extra vote for whatever
  // it already believed.
  test('a submission with no declared evidence ancestry is refused', () => {
    const row = forecasterSubmission({
      forecasterId: 'f1', distribution: { yes: 0.6, no: 0.4 }, updateTriggers: ['x']
    });
    assert.equal(row.ok, false);
    assert.ok(row.reasonCodes.includes('evidence-ancestry-required'));
  });

  test('a distribution that does not sum to one is refused', () => {
    const row = forecasterSubmission({
      forecasterId: 'f1', distribution: { yes: 0.6, no: 0.6 },
      evidenceAncestry: ['a'], updateTriggers: ['x']
    });
    assert.equal(row.ok, false);
    assert.ok(row.reasonCodes.includes('distribution-probabilities-must-sum-to-one'));
  });

  test('a submission with no update triggers is refused', () => {
    const row = forecasterSubmission({
      forecasterId: 'f1', distribution: { yes: 0.5, no: 0.5 }, evidenceAncestry: ['a']
    });
    assert.equal(row.ok, false);
    assert.ok(row.reasonCodes.includes('update-triggers-required'));
  });

  // Recorded, not enforced: demanding it would only produce decorative entries.
  test('looking for no disconfirming evidence is flagged rather than refused', () => {
    const row = submit('f1', ['a'], { disconfirming: [] });
    assert.equal(row.ok, true);
    assert.equal(row.soughtDisconfirmation, false);
  });
});

describe('effective independence', () => {
  // LOAD-BEARING. Ten forecasters reading one report are one voice. Deleting
  // the clustering makes this the same as the independent case.
  test('ten forecasters sharing one ancestor count as one effective vote', () => {
    const result = effectiveIndependence(clones());
    assert.equal(result.rawCount, 10);
    assert.equal(result.effectiveIndependentCount, 1,
      'a shared ancestor must collapse to one vote regardless of headcount');
    assert.equal(result.correlated, true);
    assert.equal(result.clusters.length, 1);
  });

  test('ten unrelated ancestors count as ten', () => {
    const result = effectiveIndependence(independents());
    assert.equal(result.effectiveIndependentCount, 10);
    assert.equal(result.correlated, false);
    assert.equal(result.independenceRatio, 1);
  });

  // Partial independence stays partial: a member's own extra source does not
  // restore full independence to a cluster.
  test('private evidence inside a cluster earns partial credit, not a full vote', () => {
    const result = effectiveIndependence([
      submit('a', ['shared']),
      submit('b', ['shared', 'b-only'])
    ]);
    assert.equal(result.rawCount, 2);
    assert.equal(result.effectiveIndependentCount, 1 + PARTIAL_INDEPENDENCE_CREDIT);
    assert.ok(result.effectiveIndependentCount < 2);
  });

  test('transitively linked forecasters form one cluster', () => {
    const result = effectiveIndependence([
      submit('a', ['s1']), submit('b', ['s1', 's2']), submit('c', ['s2'])
    ]);
    assert.equal(result.clusters.length, 1, 'a links to c through b');
  });

  test('the raw count stays visible beside the effective one', () => {
    const result = effectiveIndependence(clones());
    assert.equal(result.rawCount, 10);
    assert.ok(result.effectiveIndependentCount < result.rawCount,
      'the gap must remain visible rather than being resolved toward the flattering number');
  });

  test('an empty ensemble is refused', () => {
    const result = effectiveIndependence([]);
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('at-least-one-accepted-submission-required'));
  });
});

describe('adversarial attacks', () => {
  test('records a typed attack and the critic verdict', () => {
    assert.equal(survivedAttack.status, 'ATTACK_RECORDED');
    assert.equal(survivedAttack.forecastSurvived, true);
  });

  // A vague objection is recorded disagreement, which is not a falsification
  // attempt.
  test('an untyped objection is not an attack', () => {
    const result = adversarialAttack({ critic: 'someone', finding: 'I disagree' });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('valid-attack-type-required'));
    assert.deepEqual(result.attackTypes, ATTACK_TYPES);
  });
});

describe('epistemic immune review', () => {
  test('recognised biases are recorded and unrecognised ones separated', () => {
    const result = epistemicImmuneReview({
      conclusion: 'it will ship', flags: ['correlated-sources', 'bad-vibes']
    });
    assert.equal(result.status, 'BIAS_FLAGGED');
    assert.deepEqual(result.flags, ['correlated-sources']);
    assert.deepEqual(result.unrecognisedFlags, ['bad-vibes']);
  });

  // A bias review that clears a conclusion is doing the opposite of its job.
  test('an unflagged conclusion is not thereby sound', () => {
    const result = epistemicImmuneReview({ conclusion: 'it will ship', flags: [] });
    assert.equal(result.status, 'NO_BIAS_FLAGGED');
    assert.match(result.boundary, /NOT THEREBY SOUND/);
  });
});

describe('model ecology', () => {
  // LOAD-BEARING. Discarding outliers looks like noise reduction and is
  // sometimes the removal of the only forecaster that was right.
  test('a dissenting minority model is preserved and named, never dropped', () => {
    const rows = [
      submit('a', ['s1']), submit('b', ['s2']),
      submit('heterodox', ['s3'], { yes: 0.1, stance: 'HETERODOX' })
    ];
    const result = modelEcology(rows, 'yes');
    assert.equal(result.preserved.length, 3);
    assert.deepEqual(result.dropped, []);
    assert.ok(result.minority.some(row => row.forecasterId === 'heterodox'));
    assert.equal(result.minority.find(row => row.forecasterId === 'heterodox').dissenting, true);
  });

  test('every stance present is reported', () => {
    const rows = [submit('a', ['s1']), submit('alien', ['s2'], { stance: 'ALIEN_ASSUMPTION' })];
    const result = modelEcology(rows, 'yes');
    assert.ok(result.stancesPresent.includes('ALIEN_ASSUMPTION'));
    for (const stance of result.stancesPresent) assert.ok(MODEL_STANCES.includes(stance));
  });
});

describe('the ensemble', () => {
  // THE CENTRAL COMPARISON. Identical agreement, identical headcount; only the
  // ancestry differs. If these two ever agree, the module has stopped working.
  test('correlated agreement and independent convergence are not the same finding', () => {
    const correlated = composeEnsemble({ question: 'will it ship?', submissions: clones(), attacks: [survivedAttack] });
    const independent = composeEnsemble({ question: 'will it ship?', submissions: independents(), attacks: [survivedAttack] });

    assert.equal(correlated.rawAgreementRate, independent.rawAgreementRate,
      'the raw agreement is deliberately identical, so only independence can explain the difference');

    assert.equal(correlated.consensusClass, 'CORRELATED_AGREEMENT');
    assert.equal(independent.consensusClass, 'INDEPENDENT_CONVERGENCE');

    assert.equal(correlated.effectiveIndependentCount, 1);
    assert.equal(independent.effectiveIndependentCount, 10);

    assert.ok(correlated.evidentialAgreement < independent.evidentialAgreement,
      'agreement among copies must not count as agreement among witnesses');
  });

  // Only the discounted agreement reaches the strength profile.
  test('correlated agreement cannot raise the strength score the way independence does', () => {
    const correlated = composeEnsemble({ question: 'q', submissions: clones(), attacks: [survivedAttack] });
    const independent = composeEnsemble({ question: 'q', submissions: independents(), attacks: [survivedAttack] });
    assert.ok(correlated.strength.dimensions.model_agreement < independent.strength.dimensions.model_agreement);
    assert.ok(correlated.strength.dimensions.source_independence < independent.strength.dimensions.source_independence);
  });

  test('a single cluster with many members is flagged as consensus masquerading as evidence', () => {
    const result = composeEnsemble({ question: 'q', submissions: clones(), attacks: [survivedAttack] });
    assert.ok(result.immuneReview.flags.includes('consensus-masquerading-as-independent-evidence'));
    assert.ok(result.immuneReview.flags.includes('correlated-sources'));
    assert.ok(result.immuneReview.flags.includes('model-collusion'));
  });

  // LOAD-BEARING. A forecast that survived no attack must not inherit
  // confidence from consensus it was never asked to defend.
  test('an ensemble with no attacks recorded is labelled adversarially untested', () => {
    const result = composeEnsemble({ question: 'q', submissions: independents(), attacks: [] });
    assert.equal(result.status, 'ENSEMBLE_ADVERSARIALLY_UNTESTED');
    assert.equal(result.adversarialStatus, 'UNTESTED');
    assert.ok(result.immuneReview.flags.includes('motivated-reasoning'));
  });

  test('an attack that landed is reported rather than absorbed', () => {
    const landed = adversarialAttack({
      critic: 'red-team', attackType: 'OMITTED_MECHANISM',
      finding: 'the supply constraint was never modelled', forecastSurvived: false
    });
    const result = composeEnsemble({ question: 'q', submissions: independents(), attacks: [landed] });
    assert.notEqual(result.adversarialStatus, 'UNTESTED');
    assert.equal(result.status, 'ENSEMBLE_COMPOSED');
  });

  test('genuine disagreement is a finding, not a defect to be averaged away', () => {
    const split = [
      submit('a', ['s1'], { yes: 0.9 }), submit('b', ['s2'], { yes: 0.9 }),
      submit('c', ['s3'], { yes: 0.1 }), submit('d', ['s4'], { yes: 0.1 })
    ];
    const result = composeEnsemble({ question: 'q', submissions: split, attacks: [survivedAttack] });
    assert.equal(result.consensusClass, 'GENUINE_DISAGREEMENT');
    assert.ok(result.rawAgreementRate < AGREEMENT_FLOOR);
    assert.equal(result.ecology.preserved.length, 4, 'the dissenters survive into the output');
  });

  test('two independent votes is weak convergence, below the floor for the strong claim', () => {
    const result = composeEnsemble({
      question: 'q', submissions: [submit('a', ['s1']), submit('b', ['s2'])], attacks: [survivedAttack]
    });
    assert.equal(result.effectiveIndependentCount, 2);
    assert.ok(result.effectiveIndependentCount < CONVERGENCE_FLOOR);
    assert.equal(result.consensusClass, 'WEAK_CONVERGENCE');
  });

  test('rejected submissions are counted, not silently discarded', () => {
    const bad = forecasterSubmission({ forecasterId: 'nope' });
    const result = composeEnsemble({
      question: 'q', submissions: [...independents(), bad], attacks: [survivedAttack]
    });
    assert.equal(result.rejectedSubmissions, 1);
    assert.equal(result.rawForecasterCount, 10);
  });

  test('an ensemble with no accepted submissions is refused', () => {
    const result = composeEnsemble({ question: 'q', submissions: [forecasterSubmission({})] });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('at-least-one-accepted-submission-required'));
  });

  test('the ensemble states its own boundary and claims no authority', () => {
    const result = composeEnsemble({ question: 'q', submissions: independents(), attacks: [survivedAttack] });
    assert.equal(result.businessEffectAuthority, 'NONE');
    assert.match(result.boundary, /APPARENT AGREEMENT IS NOT INDEPENDENT EVIDENCE/);
    assert.equal(FORECAST_ADVERSARIAL_ENSEMBLE_VERSION, 'uberbond.forecast-adversarial-ensemble.v1');
    assert.ok(EPISTEMIC_BIASES.includes('consensus-masquerading-as-independent-evidence'));
  });

  test('every refusal path carries no authority', () => {
    for (const result of [
      forecasterSubmission({}), effectiveIndependence([]), adversarialAttack({}),
      epistemicImmuneReview({}), modelEcology([]), composeEnsemble({})
    ]) {
      assert.equal(result.ok, false);
      assert.equal(result.businessEffectAuthority, 'NONE');
      assert.ok(Array.isArray(result.reasonCodes) && result.reasonCodes.length > 0);
    }
  });
});
