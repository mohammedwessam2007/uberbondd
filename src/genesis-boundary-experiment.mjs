// Where the search stops, and what it is allowed to conclude when it stops there.
//
// Four failures share one shape: a system reaches the edge of what it can
// currently do and reports that edge as a property of the world rather than a
// property of its own search. "We found no mechanism" becomes "impossible". An
// observation that fits no existing category becomes a new word that explains
// nothing. A hypothesis becomes an experiment that quietly needs a customer,
// a credential or a deployment. A prediction error becomes noise.
//
// Each of those turns an admission of ignorance into a claim, and a claim is
// exactly the thing that later gets acted on. So the rules here run the other
// way. Absence of a found mechanism is UNKNOWN and stays UNKNOWN however long
// the search ran; only a stated contradiction or a violated law earns an
// impossibility verdict, and it carries the derivation that earned it. A
// candidate concept that predicts nothing and forbids nothing is rejected,
// because that is the only line between inventing an ontology and inventing
// vocabulary. An experiment declares its blast radius before it is called
// runnable, and anything reaching outside this process needs authority it
// cannot grant itself. A surprise is classified against a named model or held
// open, never dropped.
//
// Composition note: the concept record for an accepted category proposal is
// compiled by genesis-ontology's compileConcept, so proposals here enter the
// same vocabulary as everything else rather than growing a second one.
import crypto from 'node:crypto';
import { compileConcept } from './genesis-ontology.mjs';

export const GENESIS_BOUNDARY_EXPERIMENT_VERSION = 'uberbond.genesis-boundary-experiment.v1';

/** The only verdicts a possibility question may return. UNKNOWN is the default. */
export const POSSIBILITY_CLASSES = Object.freeze([
  'POSSIBLE',
  'UNKNOWN',
  'NOT_YET_POSSIBLE',
  'RESOURCE_INFEASIBLE',
  'TECHNOLOGICALLY_BLOCKED',
  'LOGICALLY_INCONSISTENT',
  'PHYSICALLY_IMPOSSIBLE'
]);

/** The two verdicts that assert impossibility. Both require a derivation. */
export const IMPOSSIBILITY_CLASSES = Object.freeze(['LOGICALLY_INCONSISTENT', 'PHYSICALLY_IMPOSSIBLE']);

/** The canonical Ontogenesis loop. Adoption is the last stage, never the first. */
export const ONTOLOGY_LOOP_STAGES = Object.freeze([
  'OBSERVATION',
  'EXPLANATORY_FAILURE',
  'CANDIDATE_CONCEPT',
  'PREDICTION',
  'COUNTEREXAMPLE',
  'REFINEMENT',
  'ADOPTION_OR_REJECTION'
]);

/** How hard an action is to undo. Only REVERSIBLE runs without asking. */
export const REVERSIBILITY_CLASSES = Object.freeze([
  'REVERSIBLE',
  'COSTLY_TO_REVERSE',
  'PATH_DEPENDENT',
  'PRACTICALLY_IRREVERSIBLE',
  'PHYSICALLY_IRREVERSIBLE'
]);

/** How far the consequences of an experiment reach. */
export const BLAST_RADII = Object.freeze([
  'LOCAL_ONLY',
  'REPOSITORY',
  'PROVIDER',
  'CUSTOMER',
  'PUBLIC',
  'PRODUCTION'
]);

/** Authority scopes an experiment may need. None of them is self-granting. */
export const AUTHORITY_SCOPES = Object.freeze([
  'SPEND',
  'CUSTOMER_CONTACT',
  'PROVIDER_CALL',
  'DEPLOYMENT',
  'CREDENTIAL_CHANGE',
  'DNS_CHANGE',
  'PRODUCTION_MUTATION',
  'IRREVERSIBLE_ACTION',
  'BLAST_RADIUS_BEYOND_LOCAL'
]);

/** What a prediction error can mean. UNCLASSIFIED is an open file, not a dismissal. */
export const MODEL_FAILURE_CLASSES = Object.freeze([
  'WORLD_MODEL_WRONG',
  'SELF_MODEL_WRONG',
  'ONTOLOGY_INSUFFICIENT',
  'REGIME_CHANGE',
  'MISSING_VARIABLE',
  'MEASUREMENT_ERROR',
  'UNCLASSIFIED'
]);

/** Capability implied by each kind of model failure. A surprise should cost something. */
export const CAPABILITY_BY_FAILURE = Object.freeze({
  WORLD_MODEL_WRONG: 'causal-remodel-and-evidence-refresh',
  SELF_MODEL_WRONG: 'self-model-recalibration-against-observed-behaviour',
  ONTOLOGY_INSUFFICIENT: 'ontology-escalation-new-category-proposal',
  REGIME_CHANGE: 'regime-detection-and-forecast-invalidation',
  MISSING_VARIABLE: 'variable-discovery-and-instrumentation',
  MEASUREMENT_ERROR: 'measurement-verification',
  UNCLASSIFIED: 'open-investigation-until-a-named-model-is-implicated'
});

/**
 * How many repetitions turn a surprise into a structural signal.
 *
 * Below this a measurement explanation is admissible. At or above it, the same
 * error keeps arriving from a source that should have been corrected by now,
 * and calling that noise is how a broken model survives its own evidence.
 */
export const PERSISTENT_SURPRISE_THRESHOLD = 3;

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const list = (value, max = 512, itemMax = 1200) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  for (const raw of value) {
    const item = text(raw, itemMax);
    if (!item) return null;
    out.push(item);
  }
  return out;
};

const count = (value, max = 1e9) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : null;
};

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);

const slug = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * A derivation attached to an impossibility claim, or null if it has none.
 *
 * The shape is deliberately strict. An impossibility verdict is the one output
 * here that closes a search permanently, so the thing that authorises it has to
 * be a statement someone can check and disagree with, not a confident adjective.
 */
function derivationOf(candidate, subjectKey) {
  if (!candidate || typeof candidate !== 'object') return null;
  const subject = text(candidate[subjectKey], 1200);
  const derivation = text(candidate.derivation, 4000);
  if (!subject || !derivation) return null;
  return { [subjectKey]: subject, derivation };
}

/**
 * GENESIS-05. Separates "impossible" from "no mechanism found yet".
 *
 * The two are conflated constantly and the cost is asymmetric: a wrong UNKNOWN
 * costs another search, while a wrong impossibility verdict closes a branch of
 * the option universe and nothing reopens it, because nobody re-searches what
 * has already been settled.
 *
 * So the defaults sit on the safe side. Every verdict other than UNKNOWN and
 * the two impossibilities requires an identified mechanism -- you cannot call
 * something resource-infeasible when you do not yet know what it would take.
 * The impossibilities require a derivation, and an impossibility asserted
 * without one is downgraded to UNKNOWN with the downgrade recorded rather than
 * quietly accepted.
 */
export function classifyPossibility({
  claim = null,
  searchedMechanisms = [],
  foundMechanism = null,
  contradiction = null,
  violatedLaw = null,
  uninventedCapabilities = [],
  technicalBlockers = [],
  resourceGap = null,
  evidenceRefs = []
} = {}) {
  const body = text(claim, 4000);
  if (!body) return fail('POSSIBILITY_CLASSIFICATION_INVALID', ['claim-required']);

  const searched = list(searchedMechanisms, 4096, 2000);
  if (!searched) return fail('POSSIBILITY_CLASSIFICATION_INVALID', ['bounded-searched-mechanisms-required']);

  const uninvented = list(uninventedCapabilities, 512, 1200);
  const blockers = list(technicalBlockers, 512, 1200);
  const evidence = list(evidenceRefs, 512, 2000);
  if (!uninvented || !blockers || !evidence) {
    return fail('POSSIBILITY_CLASSIFICATION_INVALID', ['bounded-blocker-and-evidence-lists-required']);
  }

  const mechanism = text(foundMechanism, 4000);
  const logical = derivationOf(contradiction, 'statement');
  const physical = derivationOf(violatedLaw, 'law');

  // An impossibility was asserted but arrived without the derivation that would
  // let anyone check it. Refusing it silently would hide the strongest claim in
  // the system behind an absent argument, so the refusal is part of the output.
  const downgrades = [];
  if (contradiction && !logical) downgrades.push('logical-contradiction-claimed-without-derivation');
  if (violatedLaw && !physical) downgrades.push('physical-law-violation-claimed-without-derivation');

  const base = {
    ok: true,
    claim: body,
    mechanism,
    searchedMechanismCount: searched.length,
    downgradedImpossibilityClaims: downgrades,
    evidenceRefs: evidence,
    businessEffectAuthority: 'NONE'
  };

  if (logical) {
    return {
      ...base,
      status: 'POSSIBILITY_CLASSIFIED',
      classification: 'LOGICALLY_INCONSISTENT',
      justification: { kind: 'LOGICAL_CONTRADICTION', ...logical },
      whatWouldChangeTheVerdict: ['the stated contradiction is shown not to follow from the claim'],
      why: 'The claim requires two things that cannot both hold. This is a property of the claim, not of the search.'
    };
  }

  if (physical) {
    return {
      ...base,
      status: 'POSSIBILITY_CLASSIFIED',
      classification: 'PHYSICALLY_IMPOSSIBLE',
      justification: { kind: 'VIOLATED_PHYSICAL_LAW', ...physical },
      whatWouldChangeTheVerdict: ['the cited law is shown not to apply, or is itself superseded by better-supported physics'],
      why: 'A named law rules the claim out. The derivation, not the confidence, is what makes this stronger than UNKNOWN.'
    };
  }

  // The load-bearing branch. However many mechanisms were searched, having
  // found none says something about the search and nothing about the world.
  if (!mechanism) {
    return {
      ...base,
      status: 'POSSIBILITY_CLASSIFIED',
      classification: 'UNKNOWN',
      justification: null,
      conjecturedBlockers: [...uninvented, ...blockers],
      whatWouldChangeTheVerdict: [
        'a mechanism is identified, which moves this to POSSIBLE or to a named constraint',
        'a contradiction or violated law is derived, which is the only route to an impossibility verdict'
      ],
      why: `No mechanism found after ${searched.length} searched. Absence of a found mechanism is ignorance about the search, not impossibility in the world.`
    };
  }

  // From here a mechanism exists, so a constraint can be named rather than guessed.
  const gapResource = resourceGap && typeof resourceGap === 'object' ? text(resourceGap.resource, 400) : null;
  const required = resourceGap && typeof resourceGap === 'object' ? Number(resourceGap.requiredUnits) : null;
  const available = resourceGap && typeof resourceGap === 'object' ? Number(resourceGap.availableUnits) : null;
  const hasGap = Boolean(gapResource) && Number.isFinite(required) && Number.isFinite(available) && required > available;

  if (hasGap) {
    return {
      ...base,
      status: 'POSSIBILITY_CLASSIFIED',
      classification: 'RESOURCE_INFEASIBLE',
      justification: null,
      resourceGap: { resource: gapResource, requiredUnits: required, availableUnits: available },
      whatWouldChangeTheVerdict: [
        `available ${gapResource} reaches ${required}`,
        'a cheaper mechanism is found for the same claim'
      ],
      why: 'A mechanism exists and the shortfall is quantified. Short of a resource is not impossible.'
    };
  }

  if (uninvented.length) {
    return {
      ...base,
      status: 'POSSIBILITY_CLASSIFIED',
      classification: 'NOT_YET_POSSIBLE',
      justification: null,
      uninventedCapabilities: uninvented,
      whatWouldChangeTheVerdict: uninvented.map(item => `${item} is invented and becomes lawfully available`),
      why: 'The mechanism depends on a capability that does not exist anywhere yet. That is a date, not a verdict.'
    };
  }

  if (blockers.length) {
    return {
      ...base,
      status: 'POSSIBILITY_CLASSIFIED',
      classification: 'TECHNOLOGICALLY_BLOCKED',
      justification: null,
      technicalBlockers: blockers,
      whatWouldChangeTheVerdict: blockers.map(item => `${item} is removed, replaced, or lawfully routed around`),
      why: 'The capability exists in the world but is unreachable from here. The block is in our stack, not in reality.'
    };
  }

  return {
    ...base,
    status: 'POSSIBILITY_CLASSIFIED',
    classification: 'POSSIBLE',
    justification: null,
    whatWouldChangeTheVerdict: ['the mechanism fails when actually attempted'],
    why: 'A mechanism is identified and no constraint was named. Possible means a path exists, not that it has been walked.',
    claimBoundary: 'POSSIBLE_MEANS_A_MECHANISM_EXISTS_NOT_THAT_IT_HAS_BEEN_DEMONSTRATED'
  };
}

/**
 * GENESIS-06. Escalates to a new category only when an old one distorts.
 *
 * Two failures bracket this. Refusing to escalate forces reality through
 * categories that no longer fit, and every downstream conclusion inherits the
 * distortion. Escalating freely produces vocabulary: a name that feels like an
 * explanation, forbids nothing, and can never be wrong.
 *
 * The gate against the second is the loop itself. A candidate concept has to
 * make at least one prediction and admit at least one counterexample. A concept
 * that predicts nothing cannot be checked, and one that admits no counterexample
 * cannot fail -- which is not strength, it is the absence of content. Both are
 * rejected here, and rejection is a normal result of the loop rather than an
 * error in the input.
 */
export function escalateOntology({
  observation = null,
  existingCategories = [],
  representationFailures = [],
  candidateConcept = null,
  evidenceRefs = []
} = {}) {
  const body = text(observation, 4000);
  if (!body) return fail('ONTOLOGY_ESCALATION_INVALID', ['observation-required']);

  const categories = list(existingCategories, 1024, 400);
  if (!categories) return fail('ONTOLOGY_ESCALATION_INVALID', ['bounded-existing-categories-required']);

  if (!Array.isArray(representationFailures) || representationFailures.length > 512) {
    return fail('ONTOLOGY_ESCALATION_INVALID', ['bounded-representation-failures-required']);
  }
  const failures = [];
  for (const raw of representationFailures) {
    const category = text(raw?.category, 400);
    const distortion = text(raw?.distortion, 2000);
    if (!category || !distortion) {
      return fail('ONTOLOGY_ESCALATION_INVALID', ['each-representation-failure-needs-category-and-distortion']);
    }
    failures.push({ category, distortion });
  }

  const evidence = list(evidenceRefs, 256, 2000);
  if (!evidence) return fail('ONTOLOGY_ESCALATION_INVALID', ['bounded-evidence-refs-required']);

  // Nothing distorts, so the existing vocabulary is doing its job. Minting a
  // category here would be growth of the ontology without gain in resolution.
  if (!failures.length) {
    return {
      ok: true,
      status: 'NO_ESCALATION_REQUIRED',
      decision: 'USE_EXISTING_CATEGORY',
      observation: body,
      existingCategories: categories,
      stagesReached: ONTOLOGY_LOOP_STAGES.slice(0, 2),
      why: 'No existing category was shown to distort this observation. A new category without an explanatory failure is vocabulary inflation.',
      businessEffectAuthority: 'NONE'
    };
  }

  const name = text(candidateConcept?.name, 300);
  const definition = text(candidateConcept?.definition, 2000);
  const predictions = list(candidateConcept?.predictions ?? [], 128, 1600);
  const counterexamples = list(candidateConcept?.counterexamples ?? [], 128, 1600);

  if (!name || !definition || !predictions || !counterexamples) {
    return fail('ONTOLOGY_ESCALATION_INVALID', ['candidate-concept-needs-name-definition-and-bounded-prediction-and-counterexample-lists']);
  }

  const rejectionCodes = [];
  if (!predictions.length) rejectionCodes.push('candidate-makes-no-prediction');
  if (!counterexamples.length) rejectionCodes.push('candidate-admits-no-counterexample');

  if (rejectionCodes.length) {
    return {
      ok: true,
      status: 'ONTOLOGY_ESCALATION_REJECTED',
      decision: 'REJECTED',
      rejectionCodes,
      observation: body,
      candidateName: name,
      explanatoryFailures: failures,
      stagesReached: ONTOLOGY_LOOP_STAGES.slice(0, 5),
      why: 'A concept that predicts nothing cannot be checked and one that admits no counterexample cannot fail. That is what separates creating an ontology from naming a feeling.',
      businessEffectAuthority: 'NONE'
    };
  }

  const conceptId = `emergent-${slug(name) || digest(name)}`;
  const compiled = compileConcept({
    id: conceptId,
    name,
    definition,
    evidenceRefs: evidence.length ? evidence : [`synthetic:ontogenesis-${digest(body)}`],
    status: 'CANDIDATE'
  });
  if (!compiled.ok) {
    return fail('ONTOLOGY_ESCALATION_INVALID', ['candidate-concept-failed-canonical-compilation']);
  }

  return {
    ok: true,
    status: 'NEW_CATEGORY_PROPOSED',
    decision: 'PROPOSED_FOR_ADOPTION',
    observation: body,
    explanatoryFailures: failures,
    concept: compiled.concept,
    predictions,
    counterexamples,
    stagesReached: [...ONTOLOGY_LOOP_STAGES],
    refinementTriggers: [
      'a prediction fails and the concept survives only by being weakened',
      'a stated counterexample is observed',
      'an existing category is shown to cover the observation after all'
    ],
    // A proposal is where this stops. Adoption is earned by surviving the search
    // for its own counterexamples, and that search happens outside this call.
    adoptionAuthority: 'NONE',
    adoptionRule: 'ADOPTION_REQUIRES_THE_PREDICTIONS_TO_SURVIVE_A_REAL_COUNTEREXAMPLE_SEARCH',
    claimBoundary: 'PROPOSED_CATEGORY_IS_CANDIDATE_VOCABULARY_NOT_A_DISCOVERED_FEATURE_OF_REALITY',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Which authority scopes a declared effect set actually requires.
 *
 * Read from what the experiment says it will do, never from what it says it is
 * for. An experiment described as "a small test" that contacts a customer needs
 * customer-contact authority, and the description does not get a vote.
 */
function authorityFor(effects, reversibility, blastRadius) {
  const scopes = [];
  if (Number(effects.spendCents) > 0) scopes.push('SPEND');
  if (effects.customerContact) scopes.push('CUSTOMER_CONTACT');
  if (Number(effects.providerCalls) > 0) scopes.push('PROVIDER_CALL');
  if (effects.deployment) scopes.push('DEPLOYMENT');
  if (effects.credentialChange) scopes.push('CREDENTIAL_CHANGE');
  if (effects.dnsChange) scopes.push('DNS_CHANGE');
  if (effects.productionMutation) scopes.push('PRODUCTION_MUTATION');
  if (reversibility !== 'REVERSIBLE') scopes.push('IRREVERSIBLE_ACTION');
  if (blastRadius !== 'LOCAL_ONLY' && blastRadius !== 'REPOSITORY') scopes.push('BLAST_RADIUS_BEYOND_LOCAL');
  return [...new Set(scopes)];
}

/**
 * GENESIS-07. Compiles a hypothesis into the smallest reversible experiment
 * that could falsify it.
 *
 * Two things are load-bearing. The first is the falsifier: an activity with no
 * result that could count against the hypothesis is a demonstration, and
 * demonstrations confirm whatever they were built to confirm. Without one there
 * is nothing to compile.
 *
 * The second is that runnable is computed from declared effects rather than
 * asserted. The dangerous experiment is not the one labelled dangerous; it is
 * the small, sensible-looking probe that happens to email a customer or touch
 * production, and that gets run because it was presented as ready. Anything
 * reaching outside this process comes back as requiring authority and is not
 * runnable, however cheap it is. Capability never creates authority.
 */
export function compileBoundedExperiment({
  hypothesis = null,
  falsifier = null,
  probes = null,
  costCeilingCents = 0,
  timeCeilingMinutes = 0,
  reversibility = 'REVERSIBLE',
  blastRadius = 'LOCAL_ONLY',
  effects = {}
} = {}) {
  const claim = text(hypothesis, 4000);
  if (!claim) return fail('EXPERIMENT_COMPILATION_INVALID', ['hypothesis-required']);

  const falsifyingObservation = text(falsifier, 4000);
  if (!falsifyingObservation) {
    return fail('EXPERIMENT_COMPILATION_INVALID', ['falsifier-required'], {
      why: 'An activity with no result that could count against the hypothesis is a demonstration, not an experiment.'
    });
  }

  const costCeiling = count(costCeilingCents, 1e12);
  const timeCeiling = count(timeCeilingMinutes, 1e9);
  if (costCeiling === null || timeCeiling === null) {
    return fail('EXPERIMENT_COMPILATION_INVALID', ['non-negative-cost-and-time-ceilings-required']);
  }

  if (!REVERSIBILITY_CLASSES.includes(reversibility)) {
    return fail('EXPERIMENT_COMPILATION_INVALID', ['recognized-reversibility-class-required']);
  }
  if (!BLAST_RADII.includes(blastRadius)) {
    return fail('EXPERIMENT_COMPILATION_INVALID', ['recognized-blast-radius-required']);
  }

  // Smallest is chosen among offered probes, but only among those that could
  // actually produce the falsifying observation. A cheaper probe that cannot
  // discriminate is not a smaller experiment, it is a different and emptier one.
  let selectedProbe = null;
  let discardedProbes = [];
  if (probes !== null && probes !== undefined) {
    if (!Array.isArray(probes) || probes.length > 256) {
      return fail('EXPERIMENT_COMPILATION_INVALID', ['bounded-probe-array-required']);
    }
    const normalized = [];
    for (const raw of probes) {
      const description = text(raw?.description, 2000);
      const probeCost = count(raw?.costCents, 1e12);
      const probeTime = count(raw?.timeMinutes, 1e9);
      if (!description || probeCost === null || probeTime === null) {
        return fail('EXPERIMENT_COMPILATION_INVALID', ['each-probe-needs-description-and-non-negative-cost-and-time']);
      }
      normalized.push({
        description,
        costCents: probeCost,
        timeMinutes: probeTime,
        reversibility: REVERSIBILITY_CLASSES.includes(raw?.reversibility) ? raw.reversibility : reversibility,
        discriminating: raw?.discriminating === true
      });
    }
    const usable = normalized.filter(probe => probe.discriminating);
    discardedProbes = normalized
      .filter(probe => !probe.discriminating)
      .map(probe => ({ description: probe.description, discardReason: 'cannot-produce-the-falsifying-observation' }));
    if (!usable.length) {
      return fail('EXPERIMENT_COMPILATION_INVALID', ['no-discriminating-probe-available'], {
        discardedProbes,
        why: 'Every offered probe could run to completion without ever contradicting the hypothesis.'
      });
    }
    usable.sort((a, b) => (
      (a.reversibility === 'REVERSIBLE' ? 0 : 1) - (b.reversibility === 'REVERSIBLE' ? 0 : 1)
      || a.costCents - b.costCents
      || a.timeMinutes - b.timeMinutes
    ));
    selectedProbe = usable[0];
  }

  const declared = {
    spendCents: count(effects?.spendCents, 1e12) ?? 0,
    providerCalls: count(effects?.providerCalls, 1e9) ?? 0,
    customerContact: effects?.customerContact === true,
    deployment: effects?.deployment === true,
    credentialChange: effects?.credentialChange === true,
    dnsChange: effects?.dnsChange === true,
    productionMutation: effects?.productionMutation === true
  };

  // A spend larger than the ceiling it declared is not a bounded experiment. It
  // is refused rather than clamped, because clamping would silently change the
  // experiment into a different one that no longer tests the same thing.
  if (declared.spendCents > costCeiling) {
    return fail('EXPERIMENT_COMPILATION_INVALID', ['declared-spend-exceeds-cost-ceiling'], {
      declaredSpendCents: declared.spendCents,
      costCeilingCents: costCeiling
    });
  }

  const effectiveReversibility = selectedProbe ? selectedProbe.reversibility : reversibility;
  const requiredAuthority = authorityFor(declared, effectiveReversibility, blastRadius);
  const runnable = requiredAuthority.length === 0;

  return {
    ok: true,
    status: runnable ? 'EXPERIMENT_COMPILED' : 'EXPERIMENT_REQUIRES_EXPLICIT_AUTHORITY',
    experimentId: `exp_${digest({ claim, falsifyingObservation, selectedProbe })}`,
    hypothesis: claim,
    falsifier: falsifyingObservation,
    probe: selectedProbe,
    discardedProbes,
    costCeilingCents: costCeiling,
    timeCeilingMinutes: timeCeiling,
    reversibility: effectiveReversibility,
    blastRadius,
    declaredEffects: declared,
    requiredAuthority,
    // The single field a caller is expected to branch on, and the reason the
    // authority scopes are computed rather than trusted.
    runnable,
    why: runnable
      ? 'No declared effect leaves this process and the action is reversible, so it can run without asking.'
      : `Reaches outside this process (${requiredAuthority.join(', ')}). Not runnable until that authority is granted separately.`,
    authorityRule: 'CAPABILITY_NEVER_CREATES_AUTHORITY',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * GENESIS-08. Turns a prediction error into consequences instead of a shrug.
 *
 * A surprise is the cheapest evidence a model ever gets: reality has just done
 * the work of pointing at the place where the model is wrong. Swallowing it as
 * noise is the one response that spends that evidence and buys nothing.
 *
 * So every surprise leaves with a named implicated model, or with an explicitly
 * open file -- never with nothing. And when the same error keeps arriving, a
 * measurement explanation stops being admissible: something that was going to be
 * corrected by better measurement would have been corrected by now, and the
 * repetition is the signal that the model or the ontology is the problem.
 */
export function multiplySurprise({
  prediction = null,
  observed = null,
  recurrenceCount = 1,
  candidateExplanations = [],
  affectedDomains = []
} = {}) {
  const predicted = text(prediction, 4000);
  const actual = text(observed, 4000);
  if (!predicted || !actual) {
    return fail('SURPRISE_MULTIPLICATION_INVALID', ['prediction-and-observed-required']);
  }

  const recurrence = count(recurrenceCount, 1e9);
  if (recurrence === null || recurrence < 1) {
    return fail('SURPRISE_MULTIPLICATION_INVALID', ['recurrence-count-must-be-a-positive-integer']);
  }

  const domains = list(affectedDomains, 512, 800);
  if (!domains) return fail('SURPRISE_MULTIPLICATION_INVALID', ['bounded-affected-domains-required']);

  if (!Array.isArray(candidateExplanations) || candidateExplanations.length > 128) {
    return fail('SURPRISE_MULTIPLICATION_INVALID', ['bounded-candidate-explanations-required']);
  }
  const ranked = [];
  for (const raw of candidateExplanations) {
    if (!MODEL_FAILURE_CLASSES.includes(raw?.modelClass)) {
      return fail('SURPRISE_MULTIPLICATION_INVALID', ['each-explanation-needs-a-recognized-model-class']);
    }
    const rationale = text(raw?.rationale, 2000);
    const support = Number(raw?.support);
    if (!rationale || !Number.isFinite(support) || support < 0 || support > 100) {
      return fail('SURPRISE_MULTIPLICATION_INVALID', ['each-explanation-needs-rationale-and-bounded-support']);
    }
    ranked.push({ modelClass: raw.modelClass, rationale, support });
  }
  ranked.sort((a, b) => b.support - a.support);

  const persistent = recurrence >= PERSISTENT_SURPRISE_THRESHOLD;
  const noiseRefused = [];
  let ordered = ranked;

  // The same error, repeatedly, from a source that measurement was supposed to
  // fix. Demoting the measurement explanation is what stops a structural fault
  // from being filed as noise for the rest of the system's life.
  if (persistent) {
    const measurement = ranked.filter(row => row.modelClass === 'MEASUREMENT_ERROR');
    if (measurement.length) {
      noiseRefused.push('persistent-surprise-not-explained-as-measurement-noise');
      ordered = [...ranked.filter(row => row.modelClass !== 'MEASUREMENT_ERROR'), ...measurement];
    }
  }

  const classification = ordered.length ? ordered[0].modelClass : 'UNCLASSIFIED';
  const escalation = persistent ? 'ONTOLOGY_ESCALATION_REQUIRED' : 'NONE';

  const propagation = [
    { target: 'forecasts-built-on-the-implicated-model', action: 'REVALIDATE_OR_INVALIDATE' },
    { target: 'decisions-derived-from-those-forecasts', action: 'REOPEN_IF_STILL_REVERSIBLE' },
    ...domains.map(domain => ({ target: domain, action: 'CHECK_FOR_THE_SAME_ERROR' }))
  ];
  if (persistent) {
    propagation.push({ target: 'ontology-covering-this-observation', action: 'ESCALATE_TO_NEW_CATEGORY_PROPOSAL' });
  }

  return {
    ok: true,
    status: classification === 'UNCLASSIFIED' ? 'SURPRISE_OPEN_UNCLASSIFIED' : 'SURPRISE_CLASSIFIED',
    prediction: predicted,
    observed: actual,
    recurrenceCount: recurrence,
    persistent,
    classification,
    alternativeClassifications: ordered.slice(1),
    refusedExplanations: noiseRefused,
    capabilityRequirement: CAPABILITY_BY_FAILURE[classification],
    propagation,
    escalation,
    // An unexplained surprise stays on the books. The failure mode this blocks
    // is the quiet one: a prediction error that leaves no trace and so never
    // costs the model that produced it anything.
    swallowed: false,
    openQuestion: classification === 'UNCLASSIFIED'
      ? 'Which model produced this prediction, and what would have had to be true for it to be right?'
      : null,
    why: persistent
      ? `Seen ${recurrence} times. A repeated error is a structural signal, not noise.`
      : 'A single prediction error, classified against a named model rather than discarded.',
    businessEffectAuthority: 'NONE'
  };
}
