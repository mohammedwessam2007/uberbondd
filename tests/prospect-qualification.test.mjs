import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCORE_COMPONENTS,
  normalizeModelAdvisory,
  scoreProspect,
  decideProspectQualification
} from '../src/prospect-qualification.mjs';
import { compilePersonCandidate, buildProspectEvidenceBundle, compileEnrichmentObservation } from '../src/prospect-intelligence.mjs';

const T0 = '2026-08-01T00:00:00.000Z';
const NOW = new Date('2026-08-15T00:00:00.000Z');

function bundle({ routes = [{ route: 'buyer@example.com', evidenceClass: 'FIRST_PARTY_PUBLIC' }], observations } = {}) {
  const person = compilePersonCandidate({
    personId: 'person_1', name: 'Alex Doe', companyId: 'company_1',
    sourceType: 'COMPANY_WEBSITE', evidenceClass: 'FIRST_PARTY_PUBLIC', discoveredAt: T0, confidence: 0.9
  });
  return buildProspectEvidenceBundle({
    person,
    observations: observations ?? [
      compileEnrichmentObservation({ subjectId: 'person_1', field: 'role', value: 'COO', provider: 'their-site', sourceType: 'COMPANY_WEBSITE', evidenceClass: 'FIRST_PARTY_PUBLIC', observedAt: T0, confidence: 0.9 })
    ],
    contactRoutes: routes,
    now: NOW
  });
}

const STRONG = Object.fromEntries(SCORE_COMPONENTS.map(name => [name, 0.9]));

test('a model may not return a decision, and trying is recorded', () => {
  const advisory = normalizeModelAdvisory({
    provider: 'openai', model: 'some-model',
    components: { icpFit: 0.9, outcome: 'ELIGIBLE_FOR_EXPERIMENT', distributionEligible: true, sendNow: true }
  });
  assert.equal(advisory.ok, true);
  assert.deepEqual(Object.keys(advisory.components), ['icpFit']);
  assert.deepEqual(advisory.rejectedKeys.sort(), ['distributionEligible', 'outcome', 'sendNow']);
  assert.equal(advisory.authority, 'ADVISORY_ONLY');
  assert.equal(advisory.grantsOutboundAuthority, false);
});

test('a model opinion is capped at third-party-unverified strength however confident it claims to be', () => {
  const advisory = normalizeModelAdvisory({ provider: 'p', model: 'm', components: { icpFit: 1 }, confidence: 1 });
  assert.equal(advisory.evidenceClass, 'THIRD_PARTY_UNVERIFIED');
  assert.ok(advisory.confidence <= 0.45);
});

test('a model cannot manufacture fit that no evidence supports', () => {
  const enthusiastic = normalizeModelAdvisory({
    provider: 'p', model: 'm',
    components: Object.fromEntries(SCORE_COMPONENTS.map(name => [name, 1]))
  });
  const scored = scoreProspect({ bundle: bundle(), deterministicComponents: {}, advisory: enthusiastic });
  assert.equal(scored.ok, true);
  // Every component is model-only, so each is admitted at its capped weight.
  for (const name of SCORE_COMPONENTS) {
    assert.equal(scored.provenance[name], 'MODEL_ADVISORY_ONLY');
    assert.ok(scored.components[name] <= 0.35, `${name} must not exceed the advisory cap`);
  }
  assert.ok(scored.score <= 0.35);
});

test('a model can temper a deterministic score but not inflate it past its weight', () => {
  const advisory = normalizeModelAdvisory({ provider: 'p', model: 'm', components: { icpFit: 1 } });
  const scored = scoreProspect({ bundle: bundle(), deterministicComponents: { icpFit: 0.5 }, advisory });
  assert.equal(scored.provenance.icpFit, 'BLENDED');
  assert.ok(scored.components.icpFit <= 0.5 + 0.35);
  const downward = scoreProspect({
    bundle: bundle(),
    deterministicComponents: { icpFit: 0.9 },
    advisory: normalizeModelAdvisory({ provider: 'p', model: 'm', components: { icpFit: 0 } })
  });
  assert.ok(downward.components.icpFit < 0.9);
});

test('an unmeasured component scores zero and says so', () => {
  const scored = scoreProspect({ bundle: bundle(), deterministicComponents: { icpFit: 0.9 } });
  assert.equal(scored.provenance.painEvidence, 'UNMEASURED');
  assert.equal(scored.components.painEvidence, 0);
  assert.ok(scored.unmeasuredComponents.includes('painEvidence'));
});

test('a high score built on unknowns cannot present as a confident one', () => {
  const thin = scoreProspect({ bundle: bundle(), deterministicComponents: { icpFit: 1 } });
  const full = scoreProspect({ bundle: bundle(), deterministicComponents: STRONG });
  assert.ok(thin.evidenceConfidence < full.evidenceConfidence);
});

// --- the decision -----------------------------------------------------------

test('only deterministic policy grants eligibility', () => {
  const b = bundle();
  const scored = scoreProspect({ bundle: b, deterministicComponents: STRONG });
  const decision = decideProspectQualification({
    scored, bundle: b,
    routeEligibility: { eligible: true, state: 'VALID' }
  });
  assert.equal(decision.outcome, 'ELIGIBLE_FOR_EXPERIMENT');
  assert.equal(decision.grantedBy, 'DETERMINISTIC_POLICY');
  assert.equal(decision.advisoryAuthority, 'NONE');
  assert.equal(decision.distributionEligible, true);
});

test('suppression quarantines regardless of a perfect score', () => {
  const b = bundle();
  const scored = scoreProspect({ bundle: b, deterministicComponents: STRONG });
  const decision = decideProspectQualification({
    scored, bundle: b,
    routeEligibility: { eligible: false, state: 'SUPPRESSED' }
  });
  assert.equal(decision.outcome, 'QUARANTINE');
  assert.deepEqual(decision.reasonCodes, ['suppression-dominates-all-other-evidence']);
  assert.equal(decision.distributionEligible, false);
});

test('an unresolved evidence conflict quarantines rather than guessing', () => {
  const conflicted = bundle({
    observations: [
      compileEnrichmentObservation({ subjectId: 'person_1', field: 'role', value: 'COO', provider: 'p1', sourceType: 'COMPANY_WEBSITE', evidenceClass: 'FIRST_PARTY_PUBLIC', observedAt: T0, confidence: 0.9 }),
      compileEnrichmentObservation({ subjectId: 'person_1', field: 'role', value: 'Intern', provider: 'p2', sourceType: 'COMPANY_WEBSITE', evidenceClass: 'FIRST_PARTY_PUBLIC', observedAt: T0, confidence: 0.9 })
    ]
  });
  const scored = scoreProspect({ bundle: conflicted, deterministicComponents: STRONG });
  const decision = decideProspectQualification({ scored, bundle: conflicted, routeEligibility: { eligible: true, state: 'VALID' } });
  assert.equal(decision.outcome, 'QUARANTINE');
  assert.ok(decision.reasonCodes.includes('unresolved-evidence-conflict'));
});

test('a prospect with only a constructed route is never distribution eligible', () => {
  const guessed = bundle({ routes: [{ route: 'first.last@example.com', evidenceClass: 'INFERRED_PATTERN' }] });
  const scored = scoreProspect({ bundle: guessed, deterministicComponents: STRONG });
  const decision = decideProspectQualification({ scored, bundle: guessed, routeEligibility: { eligible: true, state: 'VALID' } });
  assert.equal(decision.distributionEligible, false);
  assert.ok(decision.reasonCodes.includes('no-route-with-sendable-provenance'));
});

test('an unmeasured required component means research, not rejection', () => {
  const b = bundle();
  const scored = scoreProspect({ bundle: b, deterministicComponents: { icpFit: 0.9, buyerRoleFit: 0.9 } });
  const decision = decideProspectQualification({ scored, bundle: b, routeEligibility: { eligible: true, state: 'VALID' } });
  assert.equal(decision.outcome, 'NEEDS_RESEARCH');
  assert.ok(decision.reasonCodes.includes('required-component-not-deterministically-measured'));
});

test('a measured but weak prospect is rejected, not sent for more research', () => {
  const b = bundle();
  const weak = Object.fromEntries(SCORE_COMPONENTS.map(name => [name, 0.1]));
  const scored = scoreProspect({ bundle: b, deterministicComponents: weak });
  const decision = decideProspectQualification({
    scored, bundle: b, routeEligibility: { eligible: true, state: 'VALID' },
    minimumEvidenceConfidence: 0
  });
  assert.equal(decision.outcome, 'REJECT');
  assert.ok(decision.reasonCodes.includes('score-below-threshold'));
});

test('an ineligible contact route blocks eligibility even with a strong score', () => {
  const b = bundle();
  const scored = scoreProspect({ bundle: b, deterministicComponents: STRONG });
  const decision = decideProspectQualification({ scored, bundle: b, routeEligibility: { eligible: false, state: 'CATCH_ALL' } });
  assert.notEqual(decision.outcome, 'ELIGIBLE_FOR_EXPERIMENT');
  assert.ok(decision.reasonCodes.includes('contact-route-not-send-eligible'));
});

test('scoring refuses to run on anything but a compiled evidence bundle', () => {
  assert.deepEqual(scoreProspect({ bundle: null }).reasonCodes, ['compiled-prospect-evidence-bundle-required']);
  assert.deepEqual(scoreProspect({ bundle: { personId: 'x', contactRoutes: [] } }).reasonCodes, ['compiled-prospect-evidence-bundle-required']);
  assert.deepEqual(decideProspectQualification({ scored: null, bundle: null }).reasonCodes, ['compiled-prospect-score-required']);
});

// `{ ok: true }` is two characters, and it used to be the entire admission
// requirement. Routing everything through an evidence bundle only means
// anything if a bare object cannot pass as one.
test('a hand-written object cannot pass as an evidence bundle', () => {
  const forged = {
    ok: true,
    personId: 'person_1',
    contactRoutes: [{ route: 'buyer@example.com', sendableEvidenceClass: true }],
    conflicts: [],
    weakestConfidence: 1,
    fields: {}
  };
  assert.equal(scoreProspect({ bundle: forged, deterministicComponents: STRONG }).ok, false);
  // Nor with a plausible-looking policy version attached to a bundle that was
  // never compiled -- the shape check is on the compiler's own contract.
  const withVersion = { ...forged, policyVersion: 'prospect-intelligence-9.9.9' };
  assert.equal(scoreProspect({ bundle: withVersion, deterministicComponents: STRONG }).ok, false);
});

test('a score cannot be paired with a different prospect than it was computed for', () => {
  const a = bundle();
  const scored = scoreProspect({ bundle: a, deterministicComponents: STRONG });
  const b = { ...a, personId: 'person_someone_else' };
  const decision = decideProspectQualification({ scored, bundle: b, routeEligibility: { eligible: true, state: 'VALID' } });
  assert.equal(decision.ok, false);
  assert.deepEqual(decision.reasonCodes, ['score-and-bundle-identity-mismatch']);
});

test('a hand-written score cannot drive a decision', () => {
  const b = bundle();
  const forgedScore = { ok: true, personId: b.personId, score: 1, evidenceConfidence: 1, provenance: {}, components: {} };
  const decision = decideProspectQualification({ scored: forgedScore, bundle: b, routeEligibility: { eligible: true, state: 'VALID' } });
  assert.equal(decision.ok, false);
  assert.deepEqual(decision.reasonCodes, ['compiled-prospect-score-required']);
});

test('nothing in the qualification path carries an external effect', () => {
  const b = bundle();
  const advisory = normalizeModelAdvisory({ provider: 'p', model: 'm', components: { icpFit: 1 } });
  const scored = scoreProspect({ bundle: b, deterministicComponents: STRONG, advisory });
  const decision = decideProspectQualification({ scored, bundle: b, routeEligibility: { eligible: true, state: 'VALID' } });
  for (const result of [advisory, scored, decision]) {
    for (const value of Object.values(result.externalEffectLedger)) assert.equal(value, 0);
  }
});
