// One compiler for turning mechanisms observed anywhere into new candidates.
//
// GENESIS asks for possibilities nobody requested, and the cheap way to fake
// that is to restate a competitor's model in fresh words. Restatement is what
// this organ is built to prevent, in four stages that each guard one failure.
//
// Normalization guards provenance. A mechanism arrives from somewhere -- an
// observed system, a public filing, a vendor's landing page -- and the moment
// those become one undifferentiated pile of "mechanisms", a marketing claim is
// indistinguishable from a measured fact and every later stage inherits the
// confusion. So the source kind imposes a ceiling the caller cannot argue past:
// vendor material yields a vendor claim no matter what evidence class the
// caller asserts, and the downgrade stays visible rather than silent.
//
// Decomposition guards reuse. A mechanism copied whole is a clone; the same
// mechanism broken into the constraint it exploits, what it requires and what
// it produces can be recombined into something its donor never contained.
//
// Assumption mutation guards novelty. Genuinely new candidates come from
// negating, relaxing or inverting the load-bearing assumptions -- the parts
// that, if false, break the mechanism. Mutating an observed mechanism does not
// produce an observed mechanism, so every variant drops to HYPOTHESIS.
//
// Recombination guards against combinatorial theater. Pairing primitives is
// easy and produces mostly the same idea reworded, so candidates are keyed on
// a causal signature computed from structure alone. Labels and rationale never
// enter the key, which is why two candidates differing only in wording or
// order collapse to one while materially different causal mechanisms survive.
//
// Nothing here is demand, validation, or revenue. Everything it emits is a
// hypothesis waiting for evidence it cannot generate about itself.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { MECHANISM_ATOM_TYPES } from './mechanism-lab.mjs';

export const GENESIS_MECHANISM_COMPILER_VERSION = 'uberbond.genesis-mechanism-compiler.v1';

/**
 * Evidence ladder, strongest first. It mirrors the ladder mechanism-lab uses so
 * records stay comparable across the two organs, and adds VENDOR_CLAIM because
 * "a vendor said so" is the exact class this compiler must never lose track of.
 */
export const EVIDENCE_CLASSES = Object.freeze([
  'VERIFIED_FACT', 'STRONG_EVIDENCE', 'SUPPORTED_INFERENCE',
  'WEAK_SIGNAL', 'VENDOR_CLAIM', 'HYPOTHESIS', 'UNRESOLVED'
]);

const EVIDENCE_RANK = Object.freeze({
  VERIFIED_FACT: 6, STRONG_EVIDENCE: 5, SUPPORTED_INFERENCE: 4,
  WEAK_SIGNAL: 3, VENDOR_CLAIM: 2, HYPOTHESIS: 1, UNRESOLVED: 0
});

export const SOURCE_KINDS = Object.freeze([
  'OBSERVED_SYSTEM', 'MEASURED_RECORD', 'PUBLIC_DOCUMENT',
  'PRACTITIONER_REPORT', 'VENDOR_MATERIAL', 'INTERNAL_MODEL', 'UNKNOWN'
]);

/**
 * The strongest evidence class each kind of source can support, whatever the
 * caller claims. This is the one rule that makes provenance survive: without a
 * ceiling, any pipeline that touches a mechanism can relabel it upward and the
 * relabelling is unrecoverable a stage later.
 */
const SOURCE_EVIDENCE_CEILING = Object.freeze({
  OBSERVED_SYSTEM: 'VERIFIED_FACT',
  MEASURED_RECORD: 'VERIFIED_FACT',
  PUBLIC_DOCUMENT: 'SUPPORTED_INFERENCE',
  PRACTITIONER_REPORT: 'WEAK_SIGNAL',
  VENDOR_MATERIAL: 'VENDOR_CLAIM',
  INTERNAL_MODEL: 'HYPOTHESIS',
  UNKNOWN: 'UNRESOLVED'
});

export const MUTATION_OPERATORS = Object.freeze(['NEGATE', 'RELAX', 'INVERT']);

export const PRIMITIVE_ROLES = Object.freeze(['CONSTRAINT', 'PRECONDITION', 'ACTION', 'EFFECT']);

/**
 * The argument slots a typed causal relation can bind.
 *
 * Canonicalization below reduces a statement to a sorted bag of content words,
 * which is what lets "sells the empty return leg at marginal cost" and "at
 * marginal cost, sells the empty return leg" collapse into one mechanism. The
 * same reduction destroys direction: "the platform funds the supplier" and "the
 * supplier funds the platform" produce an identical bag, and the second is not
 * a rewording of the first -- it is a different mechanism with the money moving
 * the other way. Roles exist so the binding of entity to slot survives the
 * reduction that the bag deliberately performs.
 */
export const CAUSAL_ARGUMENT_ROLES = Object.freeze([
  'AGENT', 'PATIENT', 'INSTRUMENT', 'BENEFICIARY', 'SOURCE', 'TARGET'
]);

/** Multiplicity is part of the claim: one buyer paying many suppliers is not
 *  many buyers paying one supplier. Today those two survive canonicalization
 *  only because English happens to pluralize the nouns, which is an accident of
 *  wording rather than a property of the identity. */
export const CAUSAL_QUANTITIES = Object.freeze(['ONE', 'MANY', 'UNSPECIFIED']);

/**
 * What a given identity actually rests on.
 *
 * TYPED_RELATION means the caller supplied structure and two records that
 * differ in direction, role binding, multiplicity or order are held apart on
 * that structure. LEXICAL_BAG_UNVERIFIED means identity rests on the sorted
 * word bag alone -- still useful for collapsing rewording, but not evidence
 * that two records are the same mechanism. A sorted-word hash is not a causal
 * model and this label is what stops it being read as one.
 */
export const IDENTITY_BASES = Object.freeze(['TYPED_RELATION', 'LEXICAL_BAG_UNVERIFIED']);

/** Reused from mechanism-lab so a primitive that is a business atom is tagged
 *  in that organ's vocabulary instead of a private parallel one. */
export const ECONOMIC_ROLES = MECHANISM_ATOM_TYPES;

const TRUTH_BOUNDARY = 'HYPOTHESIS__NOT_DEMAND__NOT_VALIDATED__NOT_REVENUE';

// Words carrying no causal content. Dropping them lets "verify payment before
// delivery" and "before delivery, verify the payment" reach the same key, which
// is the whole point of canonicalization: reordering is not a new mechanism.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'in', 'on', 'at', 'by', 'for', 'with', 'and', 'or', 'as', 'it', 'its', 'that',
  'which', 'this', 'these', 'those', 'then', 'than', 'from', 'into', 'we', 'they'
]);

const text = (value, max = 800) => {
  const out = String(value ?? '').trim();
  return out ? out.slice(0, max) : null;
};

const list = (values, max = 40, reasons = []) => {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const value of values) {
    const statement = text(typeof value === 'object' && value !== null ? value.statement ?? value.value : value, 400);
    // A malformed relation is collected rather than dropped, so the donor that
    // carries it is refused instead of quietly falling back to bag identity.
    const { relation, reasons: relationReasons } = normalizeCausalRelation(
      typeof value === 'object' && value !== null ? value.relation : null
    );
    if (relationReasons.length) { reasons.push(...relationReasons); continue; }
    if (statement && !out.some(entry => entry.statement === statement)) {
      out.push({
        statement,
        economicRole: ECONOMIC_ROLES.includes(String(value?.economicRole || '').toUpperCase())
          ? String(value.economicRole).toUpperCase()
          : null,
        relation
      });
    }
    if (out.length >= max) break;
  }
  return out;
};

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Wording and clause order stripped away, leaving the content words that carry
 *  the causal claim. Two statements that differ only in phrasing arrive here
 *  identical, so they cannot enter the pipeline twice under different names. */
const canonical = value => [...new Set(
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(token => token && !STOPWORDS.has(token))
)].sort().join(' ');

/**
 * A statement's causal structure, when the caller supplies it.
 *
 * This is deliberately not a parser. Nothing here reads "the platform funds the
 * supplier" and works out who pays whom; a caller that knows the structure
 * declares it, and a caller that does not gets bag identity plus an honest
 * label saying so. Guessing the structure would be worse than not having it,
 * because a wrong binding is indistinguishable from a right one downstream.
 *
 * Malformed structure is refused rather than dropped. A relation that silently
 * failed to normalize would hand back bag identity while the caller believed
 * direction was being preserved, which is the one failure mode this function
 * exists to prevent.
 */
export function normalizeCausalRelation(input) {
  if (input === null || input === undefined) return { relation: null, reasons: [] };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { relation: null, reasons: ['causal-relation-object-required'] };
  }

  const reasons = [];
  const predicate = canonical(text(input.predicate, 160));
  if (!predicate) reasons.push('causal-relation-predicate-required');

  const rawArguments = Array.isArray(input.arguments) ? input.arguments : [];
  const bound = [];
  for (const entry of rawArguments.slice(0, 12)) {
    const role = String(entry?.role ?? '').toUpperCase();
    const entity = canonical(text(entry?.entity, 160));
    const quantity = String(entry?.quantity ?? 'UNSPECIFIED').toUpperCase();
    if (!CAUSAL_ARGUMENT_ROLES.includes(role)) { reasons.push('known-causal-argument-role-required'); continue; }
    if (!entity) { reasons.push('causal-argument-entity-required'); continue; }
    if (!CAUSAL_QUANTITIES.includes(quantity)) { reasons.push('known-causal-quantity-required'); continue; }
    // Two entities in the same slot is not a richer relation, it is an
    // ambiguous one, and ambiguity here reintroduces exactly the collapse.
    if (bound.some(existing => existing.role === role)) { reasons.push('duplicate-causal-argument-role'); continue; }
    bound.push({ role, entity, quantity });
  }

  const rawSequence = Array.isArray(input.sequence) ? input.sequence : [];
  const sequence = rawSequence.slice(0, 12).map(step => canonical(text(step, 160))).filter(Boolean);
  if (rawSequence.length && sequence.length !== Math.min(rawSequence.length, 12)) {
    reasons.push('causal-sequence-step-required');
  }

  // A predicate alone binds nothing, so it cannot distinguish anything either.
  if (!bound.length && !sequence.length) reasons.push('causal-arguments-or-sequence-required');

  if (reasons.length) return { relation: null, reasons: [...new Set(reasons)] };
  return {
    relation: Object.freeze({
      predicate,
      arguments: Object.freeze(bound),
      sequence: Object.freeze(sequence)
    }),
    reasons: []
  };
}

/**
 * The order-sensitive half of identity.
 *
 * Arguments are sorted by ROLE, never by entity: listing the same bindings in a
 * different order is a presentation difference and must collapse, while moving
 * an entity from AGENT to PATIENT is a different mechanism and must not. The
 * sequence is not sorted at all, because with an ordered claim the order is the
 * claim -- verifying before delivery and verifying after it are the two things
 * a bag of the same four words cannot tell apart.
 */
export function relationSignature(relation) {
  if (!relation) return null;
  return hash({
    predicate: relation.predicate,
    arguments: [...relation.arguments]
      .sort((left, right) => (left.role < right.role ? -1 : left.role > right.role ? 1 : 0))
      .map(entry => `${entry.role}:${entry.quantity}:${entry.entity}`),
    sequence: [...relation.sequence]
  });
}

const fail = (status, reasonCodes) => ({
  ok: false,
  version: GENESIS_MECHANISM_COMPILER_VERSION,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE'
});

const ok = (status, fields) => ({
  ok: true,
  version: GENESIS_MECHANISM_COMPILER_VERSION,
  status,
  ...fields,
  externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
  businessEffectAuthority: 'NONE'
});

/** The weaker of two classes. Evidence only ever travels downward through this
 *  compiler; there is no path that raises it. */
const weakest = (...classes) => classes
  .filter(entry => EVIDENCE_CLASSES.includes(entry))
  .reduce((low, entry) => (EVIDENCE_RANK[entry] < EVIDENCE_RANK[low] ? entry : low), 'VERIFIED_FACT');

/**
 * The key candidates are deduped on.
 *
 * It is built only from structure -- which primitives, from which donors, and
 * which constraints they exploit -- and never from labels or rationale. That
 * asymmetry is deliberate: prose is where cosmetic variation lives, so keeping
 * prose out of the key is what makes a reworded restatement collapse into the
 * candidate it restates instead of inflating the candidate count.
 */
export function causalSignature({
  primitiveIds = [], exploits = [], mutatedAssumptions = [], relationSignatures = []
} = {}) {
  const base = {
    primitiveIds: [...new Set(primitiveIds.map(id => String(id)))].sort(),
    exploits: [...new Set(exploits.map(canonical).filter(Boolean))].sort(),
    mutatedAssumptions: [...new Set(mutatedAssumptions.map(canonical).filter(Boolean))].sort()
  };
  // The `exploits` line above canonicalizes, so a constraint stated in the
  // reverse direction lands on the same key. The relation signatures carry the
  // direction that line drops. Sorting them is safe because each signature
  // already has the ordering baked inside it; what is being deduped here is the
  // set of structures present, not their order of arrival.
  const relations = [...new Set(relationSignatures.filter(Boolean).map(String))].sort();
  // Omitted entirely when absent, so every identity computed before typed
  // relations existed keeps the exact key it had.
  return hash(relations.length ? { ...base, relationSignatures: relations } : base);
}

/**
 * GENESIS-01. A mechanism seen anywhere, in typed canonical form.
 *
 * `exploits` is required and separate from `does` because a mechanism that only
 * records what it does is a description; the constraint it exploits is the part
 * that can be looked for in another domain. A record without it cannot be
 * recombined into anything, only copied.
 */
export function normalizeDonorMechanism(input = {}) {
  const mechanismId = text(input?.mechanismId, 160);
  const domain = text(input?.domain, 160);
  const does = text(input?.does, 800);
  const exploits = text(input?.exploits, 800);
  const source = input?.source && typeof input.source === 'object' ? input.source : {};
  const sourceKind = SOURCE_KINDS.includes(String(source.kind || '').toUpperCase())
    ? String(source.kind).toUpperCase() : null;
  const sourceRef = text(source.ref, 400);
  const observedAtRaw = source.observedAt instanceof Date ? source.observedAt : new Date(source.observedAt ?? NaN);
  const observedAt = Number.isNaN(observedAtRaw.getTime()) ? null : observedAtRaw.toISOString();
  const claimed = EVIDENCE_CLASSES.includes(String(input?.evidenceClass || '').toUpperCase())
    ? String(input.evidenceClass).toUpperCase() : null;

  // Typed structure for the two identity-bearing statements. `does` is what the
  // mechanism performs and `exploits` is the constraint it runs on; those are
  // the two strings every later stage keys on, so those are the two that need
  // structure available to them.
  const doesRelation = normalizeCausalRelation(input?.relation);
  const exploitsRelation = normalizeCausalRelation(input?.exploitsRelation);
  const relationReasons = [...doesRelation.reasons, ...exploitsRelation.reasons];
  const preconditions = list(input?.preconditions, 40, relationReasons);
  const effects = list(input?.effects, 40, relationReasons);

  const reasons = [...relationReasons];
  if (!mechanismId) reasons.push('mechanism-id-required');
  if (!domain) reasons.push('donor-domain-required');
  if (!does) reasons.push('mechanism-effect-required');
  if (!exploits) reasons.push('exploited-constraint-required');
  if (!sourceKind) reasons.push('known-source-kind-required');
  if (!sourceRef) reasons.push('source-reference-required');
  if (!observedAt) reasons.push('source-observation-time-required');
  if (!claimed) reasons.push('known-evidence-class-required');
  if (reasons.length) return fail('DONOR_REFUSED', reasons);

  const ceiling = SOURCE_EVIDENCE_CEILING[sourceKind];
  const evidenceClass = weakest(claimed, ceiling);

  return ok('DONOR_NORMALIZED', {
    mechanismId,
    domain,
    does,
    exploits,
    relation: doesRelation.relation,
    exploitsRelation: exploitsRelation.relation,
    // Identity for this donor rests on structure only when both key statements
    // carry it. One typed half still leaves the other collapsing on words.
    identityBasis: doesRelation.relation && exploitsRelation.relation
      ? 'TYPED_RELATION' : 'LEXICAL_BAG_UNVERIFIED',
    preconditions,
    effects,
    assumptions: list(input?.assumptions).map(entry => entry.statement),
    evidenceClass,
    provenance: Object.freeze({
      sourceKind,
      sourceRef,
      observedAt,
      claimedEvidenceClass: claimed,
      // A downgrade the caller did not ask for is the interesting event, so it
      // is recorded rather than applied quietly.
      downgraded: evidenceClass !== claimed,
      ceiling
    })
  });
}

/**
 * GENESIS-02. A normalized mechanism broken into recombinable parts.
 *
 * Each primitive inherits the donor's evidence class and cannot be handed a
 * stronger one through its own fields. Without that, a caller could smuggle a
 * VERIFIED_FACT label onto a precondition of a vendor claim and the resulting
 * primitive would outrank the mechanism it came from.
 */
export function decomposeToPrimitives({ mechanism } = {}) {
  if (!mechanism || mechanism.ok !== true || mechanism.status !== 'DONOR_NORMALIZED') {
    return fail('DECOMPOSITION_REFUSED', ['normalized-donor-required']);
  }

  const build = (role, statement, economicRole = null, relation = null) => {
    const signature = relationSignature(relation);
    return {
      // The relation is mixed into the key only when one was supplied, so a
      // primitive built without structure keeps the exact id it had before
      // typed relations existed and nothing downstream is renumbered.
      primitiveId: `primitive_${hash(signature
        ? { role, canonical: canonical(statement), relation: signature }
        : { role, canonical: canonical(statement) }).slice(0, 24)}`,
      role,
      statement,
      canonicalStatement: canonical(statement),
      relation,
      relationSignature: signature,
      identityBasis: signature ? 'TYPED_RELATION' : 'LEXICAL_BAG_UNVERIFIED',
      economicRole,
      donorId: mechanism.mechanismId,
      donorDomain: mechanism.domain,
      exploits: mechanism.exploits,
      evidenceClass: mechanism.evidenceClass,
      provenance: mechanism.provenance,
      businessEffectAuthority: 'NONE'
    };
  };

  const primitives = [
    build('CONSTRAINT', mechanism.exploits, null, mechanism.exploitsRelation ?? null),
    build('ACTION', mechanism.does, null, mechanism.relation ?? null),
    ...mechanism.preconditions.map(entry => build('PRECONDITION', entry.statement, entry.economicRole, entry.relation ?? null)),
    ...mechanism.effects.map(entry => build('EFFECT', entry.statement, entry.economicRole, entry.relation ?? null))
  ];

  const unique = [];
  for (const primitive of primitives) {
    if (!unique.some(entry => entry.primitiveId === primitive.primitiveId)) unique.push(primitive);
  }

  return ok('PRIMITIVES_DECOMPOSED', {
    donorId: mechanism.mechanismId,
    evidenceClass: mechanism.evidenceClass,
    primitiveCount: unique.length,
    primitives: unique
  });
}

/**
 * GENESIS-03. Variants from attacking the assumptions instead of the wording.
 *
 * A mechanism's assumptions are the statements that, if false, break it. Each
 * operator produces a different world: NEGATE asks what if it is simply untrue,
 * RELAX asks what if it holds only partly, INVERT asks what if the opposite is
 * the binding condition. Each variant therefore carries a different assumption
 * set, which is what makes the causal signatures differ -- a variant that only
 * reworded the assumption would collapse into its parent.
 *
 * Every variant drops to HYPOTHESIS regardless of the donor's class. The donor
 * was observed under its assumptions; a mechanism running on negated ones has
 * never been observed at all, and inheriting the parent's evidence would be the
 * exact laundering this compiler exists to prevent.
 */
export function mutateAssumptions({ mechanism, maxVariants = 60 } = {}) {
  if (!mechanism || mechanism.ok !== true || mechanism.status !== 'DONOR_NORMALIZED') {
    return fail('MUTATION_REFUSED', ['normalized-donor-required']);
  }
  const assumptions = Array.isArray(mechanism.assumptions) ? mechanism.assumptions.filter(Boolean) : [];
  if (!assumptions.length) return fail('MUTATION_REFUSED', ['load-bearing-assumptions-required']);

  const limit = Number.isInteger(maxVariants) && maxVariants > 0 ? Math.min(maxVariants, 200) : 60;
  const variants = [];

  for (const assumption of assumptions) {
    for (const operator of MUTATION_OPERATORS) {
      if (variants.length >= limit) break;
      const restated = `${operator}: ${assumption}`;
      const mutatedAssumptions = assumptions.map(entry => (entry === assumption ? restated : entry));
      const exploitsSignature = relationSignature(mechanism.exploitsRelation ?? null);
      const signature = causalSignature({
        primitiveIds: [`primitive_${hash(exploitsSignature
          ? { role: 'CONSTRAINT', canonical: canonical(mechanism.exploits), relation: exploitsSignature }
          : { role: 'CONSTRAINT', canonical: canonical(mechanism.exploits) }).slice(0, 24)}`],
        exploits: [mechanism.exploits],
        mutatedAssumptions,
        relationSignatures: [exploitsSignature]
      });
      variants.push({
        variantId: `variant_${signature.slice(0, 24)}`,
        operator,
        targetedAssumption: assumption,
        restatedAssumption: restated,
        mutatedAssumptions,
        causalSignature: signature,
        donorId: mechanism.mechanismId,
        exploits: mechanism.exploits,
        // The donor's class does not survive the mutation, on purpose.
        donorEvidenceClass: mechanism.evidenceClass,
        evidenceClass: 'HYPOTHESIS',
        status: 'HYPOTHESIS',
        validated: false,
        truthBoundary: TRUTH_BOUNDARY,
        businessEffectAuthority: 'NONE'
      });
    }
  }

  return ok('ASSUMPTIONS_MUTATED', {
    donorId: mechanism.mechanismId,
    assumptionCount: assumptions.length,
    variantCount: variants.length,
    variants
  });
}

/**
 * GENESIS-04. Primitives from different donors, recombined and deduped.
 *
 * Cross-donor is required rather than preferred. Recombining one donor's own
 * primitives reassembles that donor, which is the restatement failure wearing a
 * combinatorial costume, so a single-donor input is refused outright.
 *
 * Candidates collapse on causal signature. Two candidates built from the same
 * primitives -- supplied in any order, described in any words -- are one
 * candidate, and the collapse is reported rather than hidden so the count of
 * genuinely distinct mechanisms stays honest.
 */
export function recombineAcrossDonors({ primitives = [], maxCandidates = 50 } = {}) {
  if (!Array.isArray(primitives)) return fail('RECOMBINATION_REFUSED', ['primitives-array-required']);
  const valid = primitives.filter(entry => entry?.primitiveId && entry?.donorId && EVIDENCE_CLASSES.includes(entry.evidenceClass));
  if (valid.length < 2) return fail('RECOMBINATION_REFUSED', ['two-or-more-primitives-required']);
  if (new Set(valid.map(entry => entry.donorId)).size < 2) {
    return fail('RECOMBINATION_REFUSED', ['cross-donor-primitives-required']);
  }

  const limit = Number.isInteger(maxCandidates) && maxCandidates > 0 ? Math.min(maxCandidates, 200) : 50;
  const bySignature = new Map();
  let pairsConsidered = 0;

  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const left = valid[i];
      const right = valid[j];
      if (left.donorId === right.donorId) continue;
      if (bySignature.size >= limit) break;
      pairsConsidered += 1;

      const pair = [left, right];
      const signature = causalSignature({
        primitiveIds: pair.map(entry => entry.primitiveId),
        exploits: pair.map(entry => entry.exploits),
        relationSignatures: pair.map(entry => entry.relationSignature)
      });

      const existing = bySignature.get(signature);
      if (existing) {
        // Same causal structure reached a second way. It is one mechanism --
        // but only when structure is what matched. Where both primitives rest
        // on the word bag alone, the collapse is a guess that two records say
        // the same thing, and it is counted separately so a caller can see how
        // much of the dedupe is actually justified.
        existing.collapsedVariants += 1;
        if (existing.identityBasis !== 'TYPED_RELATION') existing.unverifiedCollapses += 1;
        continue;
      }

      bySignature.set(signature, {
        candidateId: `candidate_${signature.slice(0, 24)}`,
        causalSignature: signature,
        primitiveIds: pair.map(entry => entry.primitiveId).sort(),
        donorIds: [...new Set(pair.map(entry => entry.donorId))].sort(),
        donorDomains: [...new Set(pair.map(entry => entry.donorDomain).filter(Boolean))].sort(),
        exploits: [...new Set(pair.map(entry => entry.exploits).filter(Boolean))],
        // A candidate is only as trustworthy as its weakest ingredient, and the
        // per-donor trail stays attached so a vendor claim inside it stays
        // findable rather than being averaged away.
        evidenceClass: weakest(...pair.map(entry => entry.evidenceClass)),
        inheritedProvenance: pair.map(entry => ({
          donorId: entry.donorId,
          sourceKind: entry.provenance?.sourceKind ?? 'UNKNOWN',
          evidenceClass: entry.evidenceClass
        })),
        status: 'HYPOTHESIS',
        validated: false,
        demandEvidence: null,
        clearedPaymentEvidence: null,
        revenueEvidence: null,
        truthBoundary: TRUTH_BOUNDARY,
        killConditions: [
          'no buyer or user evidence after bounded search',
          'exploited constraint does not exist in the target domain',
          'mechanism is unlawful, non-consensual, or platform-prohibited'
        ],
        collapsedVariants: 0,
        unverifiedCollapses: 0,
        identityBasis: pair.every(entry => entry.identityBasis === 'TYPED_RELATION')
          ? 'TYPED_RELATION' : 'LEXICAL_BAG_UNVERIFIED',
        businessEffectAuthority: 'NONE'
      });
    }
  }

  const candidates = [...bySignature.values()];
  return ok(candidates.length ? 'CANDIDATES_RECOMBINED' : 'NO_CROSS_DONOR_PAIRS', {
    pairsConsidered,
    candidateCount: candidates.length,
    duplicateCount: candidates.reduce((sum, candidate) => sum + candidate.collapsedVariants, 0),
    // How much of duplicateCount is a sorted-word guess rather than a matched
    // structure. Reported rather than folded in, because a dedupe count that
    // hides its own basis is how a lexical hash gets read as a causal model.
    unverifiedCollapseCount: candidates.reduce((sum, candidate) => sum + candidate.unverifiedCollapses, 0),
    candidates,
    truthBoundary: TRUTH_BOUNDARY
  });
}

/**
 * All four stages over a donor set.
 *
 * Donors are refused individually rather than dropped, because a mechanism that
 * silently failed to normalize would leave the run looking successful while
 * quietly missing the evidence trail it was supposed to carry.
 */
export function compileGenesisMechanisms({ donors = [], maxCandidates = 50 } = {}) {
  if (!Array.isArray(donors) || donors.length < 2) {
    return fail('COMPILATION_REFUSED', ['two-or-more-donors-required']);
  }

  const normalized = [];
  const refused = [];
  for (const donor of donors) {
    const result = normalizeDonorMechanism(donor);
    if (result.ok) normalized.push(result);
    else refused.push({ mechanismId: text(donor?.mechanismId, 160), reasonCodes: result.reasonCodes });
  }
  if (refused.length) return fail('COMPILATION_REFUSED', ['donor-normalization-failed', ...refused.flatMap(entry => entry.reasonCodes)]);

  const decompositions = normalized.map(mechanism => decomposeToPrimitives({ mechanism }));
  const primitives = decompositions.flatMap(entry => (entry.ok ? entry.primitives : []));
  const mutations = normalized.map(mechanism => mutateAssumptions({ mechanism })).filter(entry => entry.ok);
  const recombination = recombineAcrossDonors({ primitives, maxCandidates });

  return ok('MECHANISMS_COMPILED', {
    donorCount: normalized.length,
    primitiveCount: primitives.length,
    variantCount: mutations.reduce((sum, entry) => sum + entry.variantCount, 0),
    candidateCount: recombination.ok ? recombination.candidateCount : 0,
    normalized,
    primitives,
    variants: mutations.flatMap(entry => entry.variants),
    candidates: recombination.ok ? recombination.candidates : [],
    truthBoundary: TRUTH_BOUNDARY
  });
}
