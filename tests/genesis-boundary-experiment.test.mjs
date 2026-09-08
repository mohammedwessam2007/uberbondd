import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPossibility, escalateOntology, compileBoundedExperiment, multiplySurprise,
  POSSIBILITY_CLASSES, IMPOSSIBILITY_CLASSES, ONTOLOGY_LOOP_STAGES,
  REVERSIBILITY_CLASSES, BLAST_RADII, AUTHORITY_SCOPES, MODEL_FAILURE_CLASSES,
  PROBE_DISCRIMINATION_CLASSES, PERSISTENT_SURPRISE_THRESHOLD, GENESIS_BOUNDARY_EXPERIMENT_VERSION
} from '../src/genesis-boundary-experiment.mjs';

// The failure these guards exist for is one shape wearing four costumes: a
// system reaches the edge of its own search and reports that edge as a property
// of the world.

test('module identity and vocabularies are frozen', () => {
  assert.equal(GENESIS_BOUNDARY_EXPERIMENT_VERSION, 'uberbond.genesis-boundary-experiment.v1');
  for (const frozen of [POSSIBILITY_CLASSES, IMPOSSIBILITY_CLASSES, ONTOLOGY_LOOP_STAGES,
    REVERSIBILITY_CLASSES, BLAST_RADII, AUTHORITY_SCOPES, MODEL_FAILURE_CLASSES,
    PROBE_DISCRIMINATION_CLASSES]) {
    assert.equal(Object.isFrozen(frozen), true);
  }
  assert.deepEqual(IMPOSSIBILITY_CLASSES, ['LOGICALLY_INCONSISTENT', 'PHYSICALLY_IMPOSSIBLE']);
});

// GENESIS-05

test('LOAD-BEARING: an exhausted mechanism search classifies UNKNOWN and never impossible', () => {
  // Two hundred searched mechanisms say a great deal about the search and
  // nothing about the world. If this guard is removed and absence of a found
  // mechanism starts earning an impossibility verdict, this test must fail.
  const searched = Array.from({ length: 200 }, (_, i) => `candidate mechanism ${i + 1}`);
  const verdict = classifyPossibility({
    claim: 'a partner channel can deliver cleared payment within thirty days',
    searchedMechanisms: searched,
    foundMechanism: null
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.classification, 'UNKNOWN');
  assert.equal(IMPOSSIBILITY_CLASSES.includes(verdict.classification), false,
    'absence of a found mechanism must never reach an impossibility verdict');
  assert.equal(verdict.justification, null, 'UNKNOWN carries no justification because it asserts nothing');
  assert.equal(verdict.searchedMechanismCount, 200);
  assert.match(verdict.why, /not impossibility/);
  assert.ok(verdict.whatWouldChangeTheVerdict.some(item => /mechanism is identified/.test(item)));
});

test('a logical contradiction classifies LOGICALLY_INCONSISTENT and carries its derivation', () => {
  const verdict = classifyPossibility({
    claim: 'deliver an audit that is both fully automated and manually reviewed by the founder for every line',
    searchedMechanisms: ['hybrid queue'],
    contradiction: {
      statement: 'the claim requires founder review of every line and requires no founder minutes',
      derivation: 'Full automation entails zero founder minutes; per-line review entails founder minutes proportional to lines. Both cannot hold for a non-empty audit.'
    }
  });

  assert.equal(verdict.classification, 'LOGICALLY_INCONSISTENT');
  assert.equal(verdict.justification.kind, 'LOGICAL_CONTRADICTION');
  assert.match(verdict.justification.derivation, /Both cannot hold/);
  assert.deepEqual(verdict.downgradedImpossibilityClaims, []);
});

test('a violated physical law classifies PHYSICALLY_IMPOSSIBLE with the law named', () => {
  const verdict = classifyPossibility({
    claim: 'confirm a payment on another continent within one microsecond of authorising it',
    searchedMechanisms: ['edge settlement'],
    violatedLaw: {
      law: 'speed of light in vacuum',
      derivation: 'The one-way distance exceeds 300 metres, so no signal can complete the round trip inside one microsecond.'
    }
  });

  assert.equal(verdict.classification, 'PHYSICALLY_IMPOSSIBLE');
  assert.equal(verdict.justification.law, 'speed of light in vacuum');
  assert.match(verdict.justification.derivation, /round trip/);
});

test('LOAD-BEARING: an impossibility asserted without a derivation is downgraded to UNKNOWN', () => {
  // The strongest claim in the module is the one that closes a branch of the
  // option universe permanently. Asserting it without an argument anyone can
  // check must cost the claim, not the check.
  const verdict = classifyPossibility({
    claim: 'reach enterprise buyers without a named reference',
    searchedMechanisms: ['cold outbound'],
    contradiction: { statement: 'it is obviously impossible' },
    violatedLaw: { law: 'economics' }
  });

  assert.equal(verdict.classification, 'UNKNOWN');
  assert.deepEqual(verdict.downgradedImpossibilityClaims, [
    'logical-contradiction-claimed-without-derivation',
    'physical-law-violation-claimed-without-derivation'
  ]);
});

test('a named constraint requires a known mechanism, and each constraint gets its own class', () => {
  const base = { claim: 'run a nightly reconciliation across every partner ledger', searchedMechanisms: ['batch diff'] };

  const possible = classifyPossibility({ ...base, foundMechanism: 'nightly batch diff over exported ledgers' });
  assert.equal(possible.classification, 'POSSIBLE');
  assert.match(possible.claimBoundary, /NOT_THAT_IT_HAS_BEEN_DEMONSTRATED/);

  const infeasible = classifyPossibility({
    ...base,
    foundMechanism: 'nightly batch diff over exported ledgers',
    resourceGap: { resource: 'founder minutes per night', requiredUnits: 240, availableUnits: 20 }
  });
  assert.equal(infeasible.classification, 'RESOURCE_INFEASIBLE');
  assert.equal(infeasible.resourceGap.requiredUnits, 240);

  const notYet = classifyPossibility({
    ...base,
    foundMechanism: 'nightly batch diff over exported ledgers',
    uninventedCapabilities: ['a settlement standard no network has yet published']
  });
  assert.equal(notYet.classification, 'NOT_YET_POSSIBLE');

  const blocked = classifyPossibility({
    ...base,
    foundMechanism: 'nightly batch diff over exported ledgers',
    technicalBlockers: ['partner exposes no export endpoint to us']
  });
  assert.equal(blocked.classification, 'TECHNOLOGICALLY_BLOCKED');

  // The same blockers without a mechanism are conjecture, so the verdict stays UNKNOWN.
  const conjecture = classifyPossibility({
    ...base,
    technicalBlockers: ['partner exposes no export endpoint to us'],
    uninventedCapabilities: ['a settlement standard no network has yet published']
  });
  assert.equal(conjecture.classification, 'UNKNOWN');
  assert.equal(conjecture.conjecturedBlockers.length, 2);
});

test('possibility classification refuses malformed input with specific reason codes', () => {
  assert.deepEqual(classifyPossibility({}).reasonCodes, ['claim-required']);
  assert.deepEqual(classifyPossibility({ claim: 'x', searchedMechanisms: 'not-an-array' }).reasonCodes,
    ['bounded-searched-mechanisms-required']);
  assert.deepEqual(classifyPossibility({ claim: 'x', technicalBlockers: [''] }).reasonCodes,
    ['bounded-blocker-and-evidence-lists-required']);
  assert.equal(classifyPossibility({}).ok, false);
});

// GENESIS-06

const distortion = [{ category: 'churn', distortion: 'the buyer never subscribed, so churn misreports a first-purchase refusal as a lapse' }];

test('LOAD-BEARING: a category that predicts nothing and forbids nothing is REJECTED', () => {
  // This is the whole line between Ontogenesis and inventing vocabulary. A
  // concept nobody can check and that cannot fail is a name, not a category.
  const rejected = escalateOntology({
    observation: 'buyers who ask for the evidence pack and then go silent',
    existingCategories: ['churn', 'lost deal'],
    representationFailures: distortion,
    candidateConcept: {
      name: 'Evidence Hesitation',
      definition: 'A state in which a buyer hesitates for reasons connected to evidence.',
      predictions: [],
      counterexamples: []
    }
  });

  assert.equal(rejected.ok, true);
  assert.equal(rejected.decision, 'REJECTED');
  assert.equal(rejected.status, 'ONTOLOGY_ESCALATION_REJECTED');
  assert.deepEqual(rejected.rejectionCodes, ['candidate-makes-no-prediction', 'candidate-admits-no-counterexample']);
  assert.equal(rejected.concept, undefined, 'a rejected candidate must not leave with a compiled concept');
});

test('a candidate missing only a counterexample is still rejected', () => {
  const rejected = escalateOntology({
    observation: 'buyers who ask for the evidence pack and then go silent',
    existingCategories: ['churn'],
    representationFailures: distortion,
    candidateConcept: {
      name: 'Evidence Hesitation',
      definition: 'A buyer state in which the evidence requested exceeds the decision it supports.',
      predictions: ['these buyers convert at a higher rate when the pack is shortened'],
      counterexamples: []
    }
  });
  assert.deepEqual(rejected.rejectionCodes, ['candidate-admits-no-counterexample']);
});

test('a candidate that predicts and can fail is proposed, never adopted', () => {
  const proposal = escalateOntology({
    observation: 'buyers who ask for the evidence pack and then go silent',
    existingCategories: ['churn', 'lost deal'],
    representationFailures: distortion,
    candidateConcept: {
      name: 'Evidence Hesitation',
      definition: 'A buyer state in which requested evidence exceeds the decision it is meant to support.',
      predictions: ['shortening the pack raises reply rate for this segment'],
      counterexamples: ['the same buyers go silent equally when the pack is one page']
    },
    evidenceRefs: ['evidence:pipeline-silence-2026-09']
  });

  assert.equal(proposal.status, 'NEW_CATEGORY_PROPOSED');
  assert.equal(proposal.decision, 'PROPOSED_FOR_ADOPTION');
  assert.equal(proposal.concept.status, 'CANDIDATE');
  assert.equal(proposal.concept.id, 'emergent-evidence-hesitation');
  assert.equal(proposal.adoptionAuthority, 'NONE', 'a proposal may not adopt itself');
  assert.deepEqual(proposal.stagesReached, ONTOLOGY_LOOP_STAGES);
});

test('an observation no existing category distorts does not earn a new category', () => {
  const noop = escalateOntology({
    observation: 'a subscriber cancelled after twelve months',
    existingCategories: ['churn'],
    representationFailures: [],
    candidateConcept: { name: 'Late Departure', definition: 'x', predictions: ['y'], counterexamples: ['z'] }
  });
  assert.equal(noop.status, 'NO_ESCALATION_REQUIRED');
  assert.equal(noop.decision, 'USE_EXISTING_CATEGORY');
  assert.match(noop.why, /vocabulary inflation/);
});

test('ontology escalation refuses malformed input with specific reason codes', () => {
  assert.deepEqual(escalateOntology({}).reasonCodes, ['observation-required']);
  assert.deepEqual(escalateOntology({ observation: 'x', representationFailures: [{ category: 'churn' }] }).reasonCodes,
    ['each-representation-failure-needs-category-and-distortion']);
  assert.deepEqual(escalateOntology({ observation: 'x', representationFailures: distortion }).reasonCodes,
    ['candidate-concept-needs-name-definition-and-bounded-prediction-and-counterexample-lists']);
});

// GENESIS-07

test('LOAD-BEARING: an experiment that spends, contacts a customer or deploys is not runnable by default', () => {
  // The dangerous experiment is never the one labelled dangerous. It is the
  // small sensible-looking probe that happens to email someone, and that gets
  // run because it was presented as ready.
  const compiled = compileBoundedExperiment({
    hypothesis: 'agencies will pay for a lead-path integrity snapshot',
    falsifier: 'ten qualified agencies decline at the stated price',
    costCeilingCents: 50_000,
    timeCeilingMinutes: 120,
    reversibility: 'REVERSIBLE',
    blastRadius: 'CUSTOMER',
    effects: { spendCents: 4_000, customerContact: true, deployment: true }
  });

  assert.equal(compiled.ok, true);
  assert.equal(compiled.runnable, false, 'an experiment reaching outside this process must not be runnable');
  assert.equal(compiled.status, 'EXPERIMENT_REQUIRES_EXPLICIT_AUTHORITY');
  assert.deepEqual(compiled.requiredAuthority,
    ['SPEND', 'CUSTOMER_CONTACT', 'DEPLOYMENT', 'BLAST_RADIUS_BEYOND_LOCAL']);
  assert.equal(compiled.authorityRule, 'CAPABILITY_NEVER_CREATES_AUTHORITY');
  assert.equal(compiled.businessEffectAuthority, 'NONE');
});

test('a zero-effect reversible local experiment is runnable and needs no authority', () => {
  const compiled = compileBoundedExperiment({
    hypothesis: 'the reconciliation rule misclassifies trial subscriptions',
    falsifier: 'the rule classifies every fixture trial correctly',
    costCeilingCents: 0,
    timeCeilingMinutes: 15
  });
  assert.equal(compiled.status, 'EXPERIMENT_COMPILED');
  assert.equal(compiled.runnable, true);
  assert.deepEqual(compiled.requiredAuthority, []);
  assert.equal(compiled.reversibility, 'REVERSIBLE');
});

test('an irreversible action needs authority even with no external effect declared', () => {
  const compiled = compileBoundedExperiment({
    hypothesis: 'archiving the donor branch loses nothing',
    falsifier: 'a test on the branch has no equivalent on main',
    reversibility: 'PRACTICALLY_IRREVERSIBLE'
  });
  assert.equal(compiled.runnable, false);
  assert.ok(compiled.requiredAuthority.includes('IRREVERSIBLE_ACTION'));
});

test('an experiment with no falsifier is refused as a demonstration', () => {
  const refused = compileBoundedExperiment({ hypothesis: 'buyers love the report' });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['falsifier-required']);
  assert.match(refused.why, /demonstration, not an experiment/);
});

test('the smallest experiment is the smallest discriminating one, not the cheapest', () => {
  const compiled = compileBoundedExperiment({
    hypothesis: 'the pack length drives reply rate',
    falsifier: 'reply rate is unchanged when the pack is one page',
    probes: [
      { description: 'reread last quarter of sent packs', costCents: 0, timeMinutes: 20, discriminating: false },
      { description: 'send both lengths to a held-out split', costCents: 0, timeMinutes: 90, discriminating: true },
      { description: 'shorten the pack for the next ten replies', costCents: 0, timeMinutes: 45, discriminating: true }
    ]
  });
  assert.equal(compiled.probe.timeMinutes, 45, 'cheapest discriminating probe wins on time');
  assert.equal(compiled.discardedProbes.length, 1);
  assert.equal(compiled.discardedProbes[0].discardReason, 'cannot-produce-the-falsifying-observation');

  const empty = compileBoundedExperiment({
    hypothesis: 'x', falsifier: 'y',
    probes: [{ description: 'read the docs again', costCents: 0, timeMinutes: 5, discriminating: false }]
  });
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.reasonCodes, ['no-discriminating-probe-available']);
});

test('experiment compilation refuses malformed input with specific reason codes', () => {
  assert.deepEqual(compileBoundedExperiment({}).reasonCodes, ['hypothesis-required']);
  assert.deepEqual(compileBoundedExperiment({ hypothesis: 'x', falsifier: 'y', costCeilingCents: -1 }).reasonCodes,
    ['non-negative-cost-and-time-ceilings-required']);
  assert.deepEqual(compileBoundedExperiment({ hypothesis: 'x', falsifier: 'y', reversibility: 'MOSTLY' }).reasonCodes,
    ['recognized-reversibility-class-required']);
  assert.deepEqual(compileBoundedExperiment({ hypothesis: 'x', falsifier: 'y', blastRadius: 'EVERYWHERE' }).reasonCodes,
    ['recognized-blast-radius-required']);
  // Clamping a spend past its ceiling would silently turn this into a different experiment.
  assert.deepEqual(compileBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 100, effects: { spendCents: 5_000 }
  }).reasonCodes, ['declared-spend-exceeds-cost-ceiling']);
});

test('LOAD-BEARING: a probe may raise the reversibility class and never lower it', () => {
  // Reversibility is the one field a caller supplies twice, and the probe copy
  // is the one nobody reads. Letting the probe win means a single line inside an
  // offered option deletes IRREVERSIBLE_ACTION from an experiment that declared
  // the action could not be undone -- and the experiment then reports runnable.
  const downgradeAttempt = compileBoundedExperiment({
    hypothesis: 'archiving the donor branch loses nothing',
    falsifier: 'a test on the branch has no equivalent on main',
    reversibility: 'PRACTICALLY_IRREVERSIBLE',
    probes: [{ description: 'delete the branch', costCents: 0, timeMinutes: 1, reversibility: 'REVERSIBLE', discriminating: true }]
  });

  assert.equal(downgradeAttempt.reversibility, 'PRACTICALLY_IRREVERSIBLE',
    'a probe calling itself reversible must not soften the experiment it belongs to');
  assert.equal(downgradeAttempt.runnable, false);
  assert.ok(downgradeAttempt.requiredAuthority.includes('IRREVERSIBLE_ACTION'));

  // The other direction is the point of the field: a probe that is worse than
  // the experiment it belongs to drags the whole plan up to its own severity.
  const escalation = compileBoundedExperiment({
    hypothesis: 'the archive is redundant',
    falsifier: 'a file exists only there',
    reversibility: 'REVERSIBLE',
    probes: [{ description: 'shred the archive', costCents: 0, timeMinutes: 1, reversibility: 'PHYSICALLY_IRREVERSIBLE', discriminating: true }]
  });
  assert.equal(escalation.reversibility, 'PHYSICALLY_IRREVERSIBLE');
  assert.equal(escalation.runnable, false);
});

test('LOAD-BEARING: the selected probe\'s own declared effects bind the authority check', () => {
  // The enclosing experiment declares nothing. The probe that would actually run
  // emails ten agencies. If only the summary line is read, this compiles as a
  // runnable local experiment and someone runs it.
  const compiled = compileBoundedExperiment({
    hypothesis: 'agencies reply to a one-page snapshot',
    falsifier: 'ten agencies receive it and none replies',
    costCeilingCents: 10_000,
    probes: [{
      description: 'email ten agencies',
      costCents: 0,
      timeMinutes: 5,
      discriminating: true,
      effects: { customerContact: true, providerCalls: 10, spendCents: 5_000 }
    }],
    effects: {}
  });

  assert.equal(compiled.runnable, false, 'a probe that contacts customers is not a local experiment');
  assert.deepEqual(compiled.requiredAuthority, ['SPEND', 'CUSTOMER_CONTACT', 'PROVIDER_CALL']);
  assert.equal(compiled.declaredEffects.customerContact, true);
  assert.equal(compiled.declaredEffects.spendCents, 5_000,
    'the effects reported are the union of the experiment and the probe that would run');
  assert.equal(compiled.businessEffectAuthority, 'NONE');
});

test('LOAD-BEARING: a malformed effect count is refused, never defaulted to zero', () => {
  // Every plausible default for a broken number reads as "no effect", and "no
  // effect" is exactly the answer that removes the authority requirement the
  // field existed to raise. So the plan is refused instead of repaired.
  for (const effects of [
    { spendCents: -5_000 },
    { spendCents: NaN },
    { spendCents: 1.5 },
    { spendCents: Infinity },
    { providerCalls: -3 },
    { customerContact: 'yes' },
    { productionMutation: 1 }
  ]) {
    const refused = compileBoundedExperiment({
      hypothesis: 'h', falsifier: 'f', costCeilingCents: 100_000, effects
    });
    assert.equal(refused.ok, false, `${JSON.stringify(effects)} must be refused, not normalised`);
    assert.deepEqual(refused.reasonCodes, ['declared-effects-must-be-non-negative-integers-and-booleans']);
    assert.equal(refused.businessEffectAuthority, 'NONE');
  }

  // A truthy non-boolean is the worst case of the set: it reads as an intent to
  // mutate production and would previously have compiled as no effect at all.
  const truthy = compileBoundedExperiment({
    hypothesis: 'h', falsifier: 'f', effects: { productionMutation: 1 }
  });
  assert.equal(truthy.ok, false);

  // An absent field is not a malformed one. Omission still means zero.
  const absent = compileBoundedExperiment({ hypothesis: 'h', falsifier: 'f', effects: {} });
  assert.equal(absent.ok, true);
  assert.equal(absent.declaredEffects.spendCents, 0);
  assert.equal(absent.declaredEffects.productionMutation, false);
});

test('LOAD-BEARING: a probe exceeding the declared ceilings refuses instead of compiling', () => {
  // A ceiling that binds only the summary line is decoration. The plan that runs
  // is the probe, and a probe over budget is not a bounded experiment.
  const overCost = compileBoundedExperiment({
    hypothesis: 'a paid flight moves reply rate',
    falsifier: 'reply rate is unchanged after the flight',
    costCeilingCents: 0,
    timeCeilingMinutes: 60,
    probes: [{ description: 'buy a 900 dollar ad flight', costCents: 90_000, timeMinutes: 30, discriminating: true }]
  });
  assert.equal(overCost.ok, false);
  assert.deepEqual(overCost.reasonCodes, ['no-probe-within-declared-cost-and-time-ceilings']);
  assert.equal(overCost.discardedProbes[0].discardReason, 'exceeds-the-declared-cost-or-time-ceiling');
  assert.equal(overCost.discardedProbes[0].costCents, 90_000, 'the refusal names the number that broke the ceiling');

  const overTime = compileBoundedExperiment({
    hypothesis: 'the batch converges', falsifier: 'it diverges',
    costCeilingCents: 0, timeCeilingMinutes: 10,
    probes: [{ description: 'run for ten weeks', costCents: 0, timeMinutes: 100_000, discriminating: true }]
  });
  assert.equal(overTime.ok, false);
  assert.deepEqual(overTime.reasonCodes, ['no-probe-within-declared-cost-and-time-ceilings']);

  // An affordable option among unaffordable ones is selected rather than refused,
  // and the ones that did not fit are recorded rather than silently dropped.
  const mixed = compileBoundedExperiment({
    hypothesis: 'h', falsifier: 'f', costCeilingCents: 1_000, timeCeilingMinutes: 60,
    probes: [
      { description: 'expensive', costCents: 50_000, timeMinutes: 5, discriminating: true },
      { description: 'affordable', costCents: 900, timeMinutes: 30, discriminating: true }
    ]
  });
  assert.equal(mixed.probe.description, 'affordable');
  assert.equal(mixed.discardedProbes.length, 1);
  assert.equal(mixed.discardedProbes[0].description, 'expensive');

  // Zero time is not a declaration that an experiment takes no time, so an
  // undeclared time budget imposes nothing. Zero spend is a real declaration.
  const noTimeCeiling = compileBoundedExperiment({
    hypothesis: 'h', falsifier: 'f',
    probes: [{ description: 'a long free read', costCents: 0, timeMinutes: 5_000, discriminating: true }]
  });
  assert.equal(noTimeCeiling.ok, true);
  assert.equal(noTimeCeiling.probe.timeMinutes, 5_000);
});

test('LOAD-BEARING: discriminating:true is CLAIMED_UNVERIFIED, and identical predictions refute it', () => {
  // The flag is the caller stating an intention about their own probe. Treating
  // it as evidence is how an experiment that cannot fail gets called an
  // experiment, which is the same failure the falsifier rule already refuses.
  const claimed = compileBoundedExperiment({
    hypothesis: 'pack length drives reply rate',
    falsifier: 'reply rate is unchanged at one page',
    probes: [{ description: 'stare at the dashboard', costCents: 0, timeMinutes: 1, discriminating: true }]
  });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.probeDiscrimination, 'CLAIMED_UNVERIFIED',
    'a bare flag must not be reported as shown discrimination');
  assert.equal(claimed.probe.discriminationEvidence, 'NONE__CALLER_DECLARATION_ONLY');
  assert.deepEqual(claimed.refutedDiscriminationClaims, []);

  // Identical predicted observations are stronger than silence in the other
  // direction: the caller has stated that the outcome is the same either way.
  const refuted = compileBoundedExperiment({
    hypothesis: 'pack length drives reply rate',
    falsifier: 'reply rate is unchanged at one page',
    probes: [{
      description: 'count replies in the last quarter',
      costCents: 0, timeMinutes: 5, discriminating: true,
      predictedIfHypothesisTrue: 'Replies arrive.',
      predictedIfHypothesisFalse: 'replies   arrive'
    }]
  });
  assert.equal(refuted.ok, false, 'a probe that predicts the same thing either way cannot be the experiment');
  assert.deepEqual(refuted.reasonCodes, ['no-discriminating-probe-available']);
  assert.equal(refuted.refutedDiscriminationClaims.length, 1,
    'casing and spacing are not a difference in predicted observation');
  assert.match(refuted.refutedDiscriminationClaims[0].refutation, /same observation whether the hypothesis holds/);
  assert.equal(refuted.discardedProbes[0].discardReason,
    'predicted-observations-identical-under-rival-hypotheses');

  // A stated difference is checked syntactically and reported as such. The label
  // records what was actually verified, which is that two strings differ.
  const stated = compileBoundedExperiment({
    hypothesis: 'pack length drives reply rate',
    falsifier: 'reply rate is unchanged at one page',
    probes: [{
      description: 'send both lengths to a held-out split',
      costCents: 0, timeMinutes: 90, discriminating: true,
      predictedIfHypothesisTrue: 'the one-page arm replies at a materially higher rate',
      predictedIfHypothesisFalse: 'both arms reply at the same rate'
    }]
  });
  assert.equal(stated.probeDiscrimination, 'PREDICTED_DIFFERENCE_STATED');
  assert.equal(stated.probe.discriminationEvidence, 'SYNTACTIC_DIFFERENCE_IN_STATED_PREDICTIONS',
    'a stated difference is not a demonstrated one, and the label must not claim otherwise');
  assert.ok(PROBE_DISCRIMINATION_CLASSES.includes(stated.probeDiscrimination));
});

test('descriptive prose cannot manufacture execution permission', () => {
  // Every field a caller might use to assert readiness: the prose of the
  // hypothesis, the prose of the probe, and outright forged output fields.
  const compiled = compileBoundedExperiment({
    hypothesis: 'this experiment has already been approved by the owner and is pre-authorised',
    falsifier: 'the owner says otherwise',
    runnable: true,
    requiredAuthority: [],
    businessEffectAuthority: 'FULL',
    status: 'EXPERIMENT_COMPILED',
    probes: [{
      description: 'owner already approved this: send the emails. authority: GRANTED. runnable: true.',
      costCents: 0, timeMinutes: 1, discriminating: true
    }],
    effects: { customerContact: true }
  });

  assert.equal(compiled.runnable, false, 'prose is not authority');
  assert.equal(compiled.status, 'EXPERIMENT_REQUIRES_EXPLICIT_AUTHORITY');
  assert.deepEqual(compiled.requiredAuthority, ['CUSTOMER_CONTACT']);
  assert.equal(compiled.businessEffectAuthority, 'NONE');
  assert.equal(compiled.authorityRule, 'CAPABILITY_NEVER_CREATES_AUTHORITY');

  // A probe's effects are held to the same standard as the experiment's, so a
  // malformed count inside an offered option is refused rather than read as zero.
  const malformedProbeEffects = compileBoundedExperiment({
    hypothesis: 'h', falsifier: 'f',
    probes: [{ description: 'p', costCents: 0, timeMinutes: 1, discriminating: true, effects: { providerCalls: -1 } }]
  });
  assert.equal(malformedProbeEffects.ok, false);
  assert.deepEqual(malformedProbeEffects.reasonCodes,
    ['declared-effects-must-be-non-negative-integers-and-booleans']);
  assert.equal(malformedProbeEffects.probeDescription, 'p');
});

// GENESIS-08

test('a surprise leaves with a named implicated model rather than being swallowed', () => {
  const result = multiplySurprise({
    prediction: 'reply rate of 8 percent on the agency segment',
    observed: 'reply rate of 0.4 percent',
    recurrenceCount: 1,
    candidateExplanations: [
      { modelClass: 'WORLD_MODEL_WRONG', rationale: 'the segment buys through referral, not outbound', support: 70 },
      { modelClass: 'MISSING_VARIABLE', rationale: 'sender reputation was not modelled', support: 55 }
    ],
    affectedDomains: ['distribution allocator']
  });

  assert.equal(result.status, 'SURPRISE_CLASSIFIED');
  assert.equal(result.classification, 'WORLD_MODEL_WRONG');
  assert.equal(result.swallowed, false);
  assert.equal(result.capabilityRequirement, 'causal-remodel-and-evidence-refresh');
  assert.equal(result.alternativeClassifications[0].modelClass, 'MISSING_VARIABLE');
  assert.ok(result.propagation.some(item => item.target === 'distribution allocator'));
  assert.ok(result.propagation.some(item => item.action === 'REVALIDATE_OR_INVALIDATE'));
  assert.equal(result.escalation, 'NONE');
});

test('LOAD-BEARING: persistent surprise refuses the measurement-noise explanation and escalates', () => {
  // Something that better measurement was going to fix would have been fixed by
  // the third repetition. Filing it as noise is how a broken model outlives its
  // own evidence.
  const result = multiplySurprise({
    prediction: 'reply rate of 8 percent',
    observed: 'reply rate of 0.4 percent',
    recurrenceCount: PERSISTENT_SURPRISE_THRESHOLD,
    candidateExplanations: [
      { modelClass: 'MEASUREMENT_ERROR', rationale: 'tracking pixel undercounts replies', support: 90 },
      { modelClass: 'ONTOLOGY_INSUFFICIENT', rationale: 'reply is the wrong unit for this channel', support: 40 }
    ],
    affectedDomains: []
  });

  assert.equal(result.persistent, true);
  assert.equal(result.classification, 'ONTOLOGY_INSUFFICIENT',
    'the highest-support measurement explanation must be demoted once the error repeats');
  assert.deepEqual(result.refusedExplanations, ['persistent-surprise-not-explained-as-measurement-noise']);
  assert.equal(result.escalation, 'ONTOLOGY_ESCALATION_REQUIRED');
  assert.equal(result.capabilityRequirement, 'ontology-escalation-new-category-proposal');
  assert.ok(result.propagation.some(item => item.action === 'ESCALATE_TO_NEW_CATEGORY_PROPOSAL'));
  assert.match(result.why, /structural signal, not noise/);
});

test('a surprise nobody can explain stays open instead of being closed', () => {
  const result = multiplySurprise({
    prediction: 'the batch completes in ten minutes',
    observed: 'the batch completed in four hours',
    candidateExplanations: [],
    affectedDomains: []
  });
  assert.equal(result.status, 'SURPRISE_OPEN_UNCLASSIFIED');
  assert.equal(result.classification, 'UNCLASSIFIED');
  assert.equal(result.swallowed, false);
  assert.match(result.openQuestion, /Which model produced this prediction/);
  assert.equal(result.capabilityRequirement, 'open-investigation-until-a-named-model-is-implicated');
});

test('surprise multiplication refuses malformed input with specific reason codes', () => {
  assert.deepEqual(multiplySurprise({}).reasonCodes, ['prediction-and-observed-required']);
  assert.deepEqual(multiplySurprise({ prediction: 'a', observed: 'b', recurrenceCount: 0 }).reasonCodes,
    ['recurrence-count-must-be-a-positive-integer']);
  assert.deepEqual(multiplySurprise({
    prediction: 'a', observed: 'b', candidateExplanations: [{ modelClass: 'VIBES', rationale: 'x', support: 10 }]
  }).reasonCodes, ['each-explanation-needs-a-recognized-model-class']);
  assert.deepEqual(multiplySurprise({
    prediction: 'a', observed: 'b', candidateExplanations: [{ modelClass: 'REGIME_CHANGE', rationale: 'x', support: 900 }]
  }).reasonCodes, ['each-explanation-needs-rationale-and-bounded-support']);
});

test('every path reports zero business effect authority', () => {
  const outcomes = [
    classifyPossibility({ claim: 'x', foundMechanism: 'm' }),
    classifyPossibility({}),
    escalateOntology({ observation: 'x', representationFailures: [] }),
    escalateOntology({}),
    compileBoundedExperiment({ hypothesis: 'x', falsifier: 'y' }),
    compileBoundedExperiment({}),
    multiplySurprise({ prediction: 'a', observed: 'b' }),
    multiplySurprise({})
  ];
  for (const outcome of outcomes) assert.equal(outcome.businessEffectAuthority, 'NONE');
});
