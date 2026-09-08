import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDonorMechanism, decomposeToPrimitives, mutateAssumptions,
  recombineAcrossDonors, compileGenesisMechanisms, causalSignature,
  EVIDENCE_CLASSES, SOURCE_KINDS, MUTATION_OPERATORS, ECONOMIC_ROLES
} from '../src/genesis-mechanism-compiler.mjs';

// The cheap way to fake GENESIS is to restate a competitor's mechanism in fresh
// words and count it as a new idea. These tests attack that directly: the
// pipeline must collapse rewording, refuse to launder a vendor claim into an
// observed fact, and never let a generated candidate acquire the vocabulary of
// demand or revenue.

const donor = (overrides = {}) => normalizeDonorMechanism({
  mechanismId: 'freight-backhaul',
  domain: 'logistics',
  does: 'sells the empty return leg at marginal cost',
  exploits: 'trucks return empty after delivery',
  preconditions: ['the return route is already committed'],
  effects: ['idle capacity becomes billable revenue'],
  assumptions: ['return legs stay empty', 'marginal cost stays below the offered price'],
  evidenceClass: 'VERIFIED_FACT',
  source: { kind: 'OBSERVED_SYSTEM', ref: 'evidence:fleet-telemetry-2026', observedAt: '2026-06-01T00:00:00.000Z' },
  ...overrides
});

const hotel = (effect = 'idle capacity becomes billable revenue') => normalizeDonorMechanism({
  mechanismId: 'hotel-late-checkout',
  domain: 'hospitality',
  does: 'sells the idle interval between checkout and check-in',
  exploits: 'rooms sit idle between checkout and check-in',
  effects: [effect],
  assumptions: ['the next guest arrives late'],
  evidenceClass: 'STRONG_EVIDENCE',
  source: { kind: 'MEASURED_RECORD', ref: 'evidence:pms-occupancy-export', observedAt: '2026-05-02T00:00:00.000Z' }
});

const clinic = () => normalizeDonorMechanism({
  mechanismId: 'clinic-no-show-fill',
  domain: 'healthcare-operations',
  does: 'fills a cancelled slot from a standby list',
  exploits: 'cancellations arrive too late to resell through normal booking',
  effects: ['a cancelled hour is recovered rather than lost'],
  assumptions: ['standby patients can arrive within the hour'],
  evidenceClass: 'SUPPORTED_INFERENCE',
  source: { kind: 'PUBLIC_DOCUMENT', ref: 'doc:clinic-operations-study', observedAt: '2026-04-11T00:00:00.000Z' }
});

const primitiveOf = (mechanism, role) =>
  decomposeToPrimitives({ mechanism }).primitives.find(entry => entry.role === role);

test('cosmetic variants collapse to one candidate while different mechanisms survive', () => {
  // The load-bearing test. Two candidates built from the same causal structure
  // -- reached through a reworded, reordered statement -- are one mechanism.
  // Removing the signature dedupe makes this count 5 instead of 3.
  const empty = primitiveOf(donor(), 'CONSTRAINT');
  const idle = primitiveOf(hotel('idle capacity becomes billable revenue'), 'EFFECT');
  const idleReworded = primitiveOf(hotel('revenue from idle capacity becomes billable'), 'EFFECT');
  const standby = primitiveOf(clinic(), 'CONSTRAINT');

  assert.equal(idle.primitiveId, idleReworded.primitiveId, 'reordered wording is not a new primitive');
  assert.notEqual(idle.primitiveId, standby.primitiveId, 'a different constraint is a different primitive');

  const result = recombineAcrossDonors({ primitives: [empty, idle, idleReworded, standby] });
  assert.equal(result.ok, true);
  assert.equal(result.pairsConsidered, 5, 'same-donor pairs are not recombined with themselves');
  assert.equal(result.candidateCount, 3, 'cosmetic restatements must not inflate the candidate count');
  assert.equal(result.duplicateCount, 2);

  const signatures = new Set(result.candidates.map(candidate => candidate.causalSignature));
  assert.equal(signatures.size, 3);

  const donorPairs = result.candidates.map(candidate => candidate.donorIds.join('+')).sort();
  assert.deepEqual(donorPairs, [
    'clinic-no-show-fill+freight-backhaul',
    'clinic-no-show-fill+hotel-late-checkout',
    'freight-backhaul+hotel-late-checkout'
  ], 'materially different causal mechanisms must all survive');

  const collapsed = result.candidates.find(candidate => candidate.donorIds.includes('freight-backhaul') && candidate.donorIds.includes('hotel-late-checkout'));
  assert.equal(collapsed.collapsedVariants, 1, 'the collapse is reported, not hidden');
});

test('label and rationale never enter the dedupe key', () => {
  // If prose reached the signature, every rewrite would mint a new mechanism.
  const base = { primitiveIds: ['primitive_b', 'primitive_a'], exploits: ['capacity sits idle'] };
  assert.equal(
    causalSignature(base),
    causalSignature({ primitiveIds: ['primitive_a', 'primitive_b'], exploits: ['idle sits capacity'], label: 'A totally new offering' }),
    'order and wording are not structure'
  );
  assert.notEqual(causalSignature(base), causalSignature({ ...base, primitiveIds: ['primitive_a', 'primitive_c'] }));
});

test('a vendor claim is capped at normalization and never emerges as observed', () => {
  const vendor = normalizeDonorMechanism({
    mechanismId: 'vendor-router',
    domain: 'saas',
    does: 'routes every request to the cheapest provider',
    exploits: 'providers price the same capability differently',
    preconditions: ['providers expose a compatible API'],
    effects: ['cost per request falls'],
    assumptions: ['provider prices stay divergent'],
    evidenceClass: 'VERIFIED_FACT',
    source: { kind: 'VENDOR_MATERIAL', ref: 'doc:vendor-landing-page', observedAt: '2026-07-01T00:00:00.000Z' }
  });

  assert.equal(vendor.ok, true);
  assert.equal(vendor.evidenceClass, 'VENDOR_CLAIM', 'the source ceiling outranks the caller');
  assert.equal(vendor.provenance.claimedEvidenceClass, 'VERIFIED_FACT', 'the claim is preserved, not erased');
  assert.equal(vendor.provenance.downgraded, true);
  assert.equal(vendor.provenance.sourceKind, 'VENDOR_MATERIAL');

  const decomposed = decomposeToPrimitives({ mechanism: vendor });
  assert.deepEqual(
    [...new Set(decomposed.primitives.map(entry => entry.evidenceClass))],
    ['VENDOR_CLAIM'],
    'no primitive may outrank the mechanism it came from'
  );

  const observed = primitiveOf(donor(), 'CONSTRAINT');
  const mixed = recombineAcrossDonors({ primitives: [observed, decomposed.primitives[0]] });
  const candidate = mixed.candidates[0];
  assert.equal(candidate.evidenceClass, 'VENDOR_CLAIM', 'a candidate is only as strong as its weakest ingredient');
  assert.deepEqual(
    candidate.inheritedProvenance.find(entry => entry.donorId === 'vendor-router'),
    { donorId: 'vendor-router', sourceKind: 'VENDOR_MATERIAL', evidenceClass: 'VENDOR_CLAIM' },
    'the vendor trail stays findable inside the candidate'
  );
});

test('a precondition cannot smuggle a stronger evidence class into a primitive', () => {
  const vendor = normalizeDonorMechanism({
    mechanismId: 'vendor-claimed',
    domain: 'saas',
    does: 'does the thing',
    exploits: 'a pricing gap exists',
    preconditions: [{ statement: 'the gap persists', evidenceClass: 'VERIFIED_FACT' }],
    evidenceClass: 'WEAK_SIGNAL',
    source: { kind: 'VENDOR_MATERIAL', ref: 'doc:brochure', observedAt: '2026-07-01T00:00:00.000Z' }
  });
  const precondition = primitiveOf(vendor, 'PRECONDITION');
  assert.equal(precondition.statement, 'the gap persists');
  assert.equal(precondition.evidenceClass, 'VENDOR_CLAIM', 'the field on the precondition is ignored');
});

test('every source kind carries a ceiling, and an unknown source resolves nothing', () => {
  const unknown = normalizeDonorMechanism({
    mechanismId: 'rumour', domain: 'unknown', does: 'x', exploits: 'y',
    evidenceClass: 'STRONG_EVIDENCE',
    source: { kind: 'UNKNOWN', ref: 'doc:hearsay', observedAt: '2026-01-01T00:00:00.000Z' }
  });
  assert.equal(unknown.evidenceClass, 'UNRESOLVED');
  const internal = normalizeDonorMechanism({
    mechanismId: 'idea', domain: 'internal', does: 'x', exploits: 'y',
    evidenceClass: 'VERIFIED_FACT',
    source: { kind: 'INTERNAL_MODEL', ref: 'doc:internal-note', observedAt: '2026-01-01T00:00:00.000Z' }
  });
  assert.equal(internal.evidenceClass, 'HYPOTHESIS', 'our own model is not evidence about the world');
  assert.ok(SOURCE_KINDS.includes('PRACTITIONER_REPORT'));
  assert.ok(EVIDENCE_CLASSES.includes('VENDOR_CLAIM'));
});

test('a generated candidate is never labelled validated, demand, or revenue', () => {
  const result = recombineAcrossDonors({
    primitives: [primitiveOf(donor(), 'CONSTRAINT'), primitiveOf(hotel(), 'CONSTRAINT')]
  });
  const candidate = result.candidates[0];
  assert.equal(candidate.status, 'HYPOTHESIS');
  assert.equal(candidate.validated, false);
  assert.equal(candidate.demandEvidence, null);
  assert.equal(candidate.clearedPaymentEvidence, null);
  assert.equal(candidate.revenueEvidence, null);
  assert.equal(candidate.truthBoundary, 'HYPOTHESIS__NOT_DEMAND__NOT_VALIDATED__NOT_REVENUE');
  assert.equal(candidate.businessEffectAuthority, 'NONE');
  assert.ok(candidate.killConditions.length >= 3);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /"validated":true/);
  assert.doesNotMatch(serialized, /"status":"(VALIDATED|PROVEN|DEMAND_CONFIRMED|REVENUE)"/);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.deepEqual(result.externalEffectLedger.spendCents, 0);
});

test('assumption mutation produces materially different variants, not restatements', () => {
  const mutated = mutateAssumptions({ mechanism: donor() });
  assert.equal(mutated.ok, true);
  assert.equal(mutated.assumptionCount, 2);
  assert.equal(mutated.variantCount, 6, 'each assumption is attacked by each operator');

  const signatures = new Set(mutated.variants.map(variant => variant.causalSignature));
  assert.equal(signatures.size, 6, 'variants that share a causal signature are restatements');

  for (const variant of mutated.variants) {
    assert.ok(MUTATION_OPERATORS.includes(variant.operator));
    assert.notEqual(variant.restatedAssumption, variant.targetedAssumption);
    assert.ok(variant.mutatedAssumptions.includes(variant.restatedAssumption));
    assert.equal(variant.mutatedAssumptions.includes(variant.targetedAssumption), false,
      'the original assumption must not survive alongside its mutation');
    // The donor was observed under its assumptions; running on negated ones has
    // never been observed at all.
    assert.equal(variant.evidenceClass, 'HYPOTHESIS');
    assert.equal(variant.donorEvidenceClass, 'VERIFIED_FACT');
    assert.equal(variant.validated, false);
    assert.equal(variant.businessEffectAuthority, 'NONE');
  }
});

test('a mechanism with no stated assumptions cannot be mutated', () => {
  const noAssumptions = donor({ assumptions: [] });
  const refused = mutateAssumptions({ mechanism: noAssumptions });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['load-bearing-assumptions-required']);
  assert.equal(refused.businessEffectAuthority, 'NONE');
});

test('malformed donors are refused with the exact reasons', () => {
  const empty = normalizeDonorMechanism({});
  assert.equal(empty.ok, false);
  assert.equal(empty.status, 'DONOR_REFUSED');
  assert.deepEqual(empty.reasonCodes, [
    'mechanism-id-required', 'donor-domain-required', 'mechanism-effect-required',
    'exploited-constraint-required', 'known-source-kind-required',
    'source-reference-required', 'source-observation-time-required',
    'known-evidence-class-required'
  ]);

  // A mechanism that records only what it does is a description; without the
  // constraint it exploits there is nothing to look for in another domain.
  const noConstraint = normalizeDonorMechanism({
    mechanismId: 'x', domain: 'y', does: 'sells something',
    evidenceClass: 'WEAK_SIGNAL',
    source: { kind: 'OBSERVED_SYSTEM', ref: 'evidence:x', observedAt: '2026-01-01T00:00:00.000Z' }
  });
  assert.deepEqual(noConstraint.reasonCodes, ['exploited-constraint-required']);

  const badTime = normalizeDonorMechanism({
    mechanismId: 'x', domain: 'y', does: 'a', exploits: 'b', evidenceClass: 'WEAK_SIGNAL',
    source: { kind: 'OBSERVED_SYSTEM', ref: 'evidence:x', observedAt: 'whenever' }
  });
  assert.deepEqual(badTime.reasonCodes, ['source-observation-time-required']);

  const madeUpClass = normalizeDonorMechanism({
    mechanismId: 'x', domain: 'y', does: 'a', exploits: 'b', evidenceClass: 'DEFINITELY_TRUE',
    source: { kind: 'OBSERVED_SYSTEM', ref: 'evidence:x', observedAt: '2026-01-01T00:00:00.000Z' }
  });
  assert.deepEqual(madeUpClass.reasonCodes, ['known-evidence-class-required']);
});

test('unnormalized input never reaches decomposition or mutation', () => {
  const raw = { mechanismId: 'raw', exploits: 'something', does: 'something else' };
  assert.deepEqual(decomposeToPrimitives({ mechanism: raw }).reasonCodes, ['normalized-donor-required']);
  assert.deepEqual(mutateAssumptions({ mechanism: raw }).reasonCodes, ['normalized-donor-required']);
  assert.deepEqual(decomposeToPrimitives({}).reasonCodes, ['normalized-donor-required']);
});

test('recombining one donor with itself is refused as restatement', () => {
  // Reassembling a donor from its own parts produces that donor, which is the
  // restatement failure wearing a combinatorial costume.
  const own = decomposeToPrimitives({ mechanism: donor() }).primitives;
  assert.ok(own.length >= 2);
  const refused = recombineAcrossDonors({ primitives: own });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['cross-donor-primitives-required']);

  assert.deepEqual(recombineAcrossDonors({ primitives: [own[0]] }).reasonCodes, ['two-or-more-primitives-required']);
  assert.deepEqual(recombineAcrossDonors({ primitives: 'nope' }).reasonCodes, ['primitives-array-required']);
});

test('decomposition keeps the exploited constraint and the business role tag', () => {
  const decomposed = decomposeToPrimitives({
    mechanism: donor({ effects: [{ statement: 'idle capacity becomes billable revenue', economicRole: 'pricing' }] })
  });
  assert.equal(decomposed.ok, true);
  const roles = decomposed.primitives.map(entry => entry.role);
  assert.deepEqual([...new Set(roles)].sort(), ['ACTION', 'CONSTRAINT', 'EFFECT', 'PRECONDITION']);
  const effect = decomposed.primitives.find(entry => entry.role === 'EFFECT');
  assert.equal(effect.economicRole, 'PRICING', 'business roles reuse the mechanism-lab vocabulary');
  assert.ok(ECONOMIC_ROLES.includes('PRICING'));
  assert.equal(effect.exploits, 'trucks return empty after delivery', 'a primitive remembers the constraint it served');
  assert.equal(decomposed.primitives.find(entry => entry.role === 'CONSTRAINT').donorDomain, 'logistics');

  const unknownRole = decomposeToPrimitives({
    mechanism: donor({ effects: [{ statement: 'something happens', economicRole: 'VIBES' }] })
  });
  assert.equal(unknownRole.primitives.find(entry => entry.role === 'EFFECT').economicRole, null);
});

test('the full compile runs all four stages and refuses a bad donor set', () => {
  const compiled = compileGenesisMechanisms({
    donors: [
      {
        mechanismId: 'freight-backhaul', domain: 'logistics',
        does: 'sells the empty return leg at marginal cost',
        exploits: 'trucks return empty after delivery',
        assumptions: ['return legs stay empty'],
        evidenceClass: 'VERIFIED_FACT',
        source: { kind: 'OBSERVED_SYSTEM', ref: 'evidence:fleet-telemetry', observedAt: '2026-06-01T00:00:00.000Z' }
      },
      {
        mechanismId: 'hotel-late-checkout', domain: 'hospitality',
        does: 'sells the idle interval between checkout and check-in',
        exploits: 'rooms sit idle between checkout and check-in',
        assumptions: ['the next guest arrives late'],
        evidenceClass: 'STRONG_EVIDENCE',
        source: { kind: 'MEASURED_RECORD', ref: 'evidence:pms-export', observedAt: '2026-05-02T00:00:00.000Z' }
      }
    ]
  });
  assert.equal(compiled.ok, true);
  assert.equal(compiled.status, 'MECHANISMS_COMPILED');
  assert.equal(compiled.donorCount, 2);
  assert.equal(compiled.primitiveCount, 4);
  assert.equal(compiled.variantCount, 6);
  assert.equal(compiled.candidateCount, 4);
  assert.equal(compiled.businessEffectAuthority, 'NONE');
  assert.ok(compiled.candidates.every(candidate => candidate.status === 'HYPOTHESIS'));

  assert.deepEqual(compileGenesisMechanisms({ donors: [] }).reasonCodes, ['two-or-more-donors-required']);

  // One bad donor fails the run rather than vanishing from it.
  const partial = compileGenesisMechanisms({
    donors: [
      { mechanismId: 'ok', domain: 'd', does: 'a', exploits: 'b', evidenceClass: 'WEAK_SIGNAL',
        source: { kind: 'OBSERVED_SYSTEM', ref: 'evidence:x', observedAt: '2026-01-01T00:00:00.000Z' } },
      { mechanismId: 'broken' }
    ]
  });
  assert.equal(partial.ok, false);
  assert.ok(partial.reasonCodes.includes('donor-normalization-failed'));
  assert.ok(partial.reasonCodes.includes('exploited-constraint-required'));
});
