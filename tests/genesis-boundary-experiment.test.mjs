import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPossibility, escalateOntology, compileBoundedExperiment, multiplySurprise,
  POSSIBILITY_CLASSES, IMPOSSIBILITY_CLASSES, ONTOLOGY_LOOP_STAGES,
  REVERSIBILITY_CLASSES, BLAST_RADII, AUTHORITY_SCOPES, MODEL_FAILURE_CLASSES,
  PERSISTENT_SURPRISE_THRESHOLD, GENESIS_BOUNDARY_EXPERIMENT_VERSION
} from '../src/genesis-boundary-experiment.mjs';

// The failure these guards exist for is one shape wearing four costumes: a
// system reaches the edge of its own search and reports that edge as a property
// of the world.

test('module identity and vocabularies are frozen', () => {
  assert.equal(GENESIS_BOUNDARY_EXPERIMENT_VERSION, 'uberbond.genesis-boundary-experiment.v1');
  for (const frozen of [POSSIBILITY_CLASSES, IMPOSSIBILITY_CLASSES, ONTOLOGY_LOOP_STAGES,
    REVERSIBILITY_CLASSES, BLAST_RADII, AUTHORITY_SCOPES, MODEL_FAILURE_CLASSES]) {
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
