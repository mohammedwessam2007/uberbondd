import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCausalEvidence,
  compileNOf1Experiment,
  nOf1Evidence
} from '../src/causal-intervention-ladder.mjs';

test('many correlations never vote themselves into an intervention claim', () => {
  const out = assessCausalEvidence([
    { rung: 'CORRELATION', evidenceRef: 'obs:a', lineage: 'dataset:1' },
    { rung: 'CORRELATION', evidenceRef: 'obs:b', lineage: 'dataset:2' },
    { rung: 'MECHANISTIC_PLAUSIBILITY', evidenceRef: 'mechanism:c', lineage: 'model:1' }
  ]);
  assert.equal(out.ok, true);
  assert.equal(out.causalClaimCeiling, 'MECHANISM_PLAUSIBLE__CAUSALITY_UNPROVEN');
  assert.match(out.truthBoundary, /WEAKER_RUNGS_NEVER_COMBINE/);
});

test('replication label is rejected without two independent controlled lineages', () => {
  const out = assessCausalEvidence([
    { rung: 'CONTROLLED_INTERVENTION', evidenceRef: 'trial:a', lineage: 'trial-family:1' },
    { rung: 'REPLICATION', evidenceRef: 'claim:replicated', lineage: 'trial-family:1' }
  ]);
  assert.equal(out.ok, true);
  assert.equal(out.validReplication, false);
  assert.ok(out.rejectedClaims.includes('replication-label-without-two-independent-controlled-lineages'));
  assert.equal(out.causalClaimCeiling, 'INTERVENTION_EFFECT_OBSERVED');
});

test('two independent controlled intervention lineages can support replication', () => {
  const out = assessCausalEvidence([
    { rung: 'CONTROLLED_INTERVENTION', evidenceRef: 'trial:a', lineage: 'trial-family:1' },
    { rung: 'CONTROLLED_INTERVENTION', evidenceRef: 'trial:b', lineage: 'trial-family:2' },
    { rung: 'REPLICATION', evidenceRef: 'claim:replicated', lineage: 'synthesis:1' }
  ]);
  assert.equal(out.ok, true);
  assert.equal(out.validReplication, true);
  assert.equal(out.causalClaimCeiling, 'REPLICATED_INTERVENTION_EFFECT');
});

test('N-of-1 protocol requires reversibility, measurement and stop conditions', () => {
  const out = compileNOf1Experiment({
    question: 'Does a scheduling change improve focused work?',
    intervention: 'change one low-risk scheduling variable',
    outcome: 'predeclared focus measure',
    personRef: 'founder',
    reversible: false,
    baselineWindow: 7,
    interventionWindow: 7
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('reversible-intervention-required'));
  assert.ok(out.reasonCodes.includes('measurement-method-required'));
  assert.ok(out.reasonCodes.includes('stop-conditions-required'));
});

test('high-stakes N-of-1 protocol remains professional-review-only and causes no action', () => {
  const out = compileNOf1Experiment({
    question: 'Caller supplied high-stakes question',
    intervention: 'caller supplied intervention',
    outcome: 'caller supplied outcome measure',
    personRef: 'founder',
    reversible: true,
    riskClass: 'MEDICAL',
    baselineWindow: 7,
    interventionWindow: 7,
    measurementMethod: 'caller supplied measurement protocol',
    stopConditions: ['stop condition supplied by caller']
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'N_OF_1_PROFESSIONAL_REVIEW_REQUIRED');
  assert.equal(out.professionalReviewRequired, true);
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.causalClaimCeilingBeforeObservation, 'NO_CAUSAL_CLAIM__PROTOCOL_ONLY');
});

test('a single personal episode remains one intervention observation, not personal replication', () => {
  const out = nOf1Evidence({
    personRef: 'founder',
    interventionRef: 'schedule-change',
    episodes: [
      { controlled: true, evidenceRef: 'episode:e1', episodeRef: 'e1', outcomeRef: 'outcome:e1' }
    ]
  });
  assert.equal(out.ok, true);
  assert.equal(out.validPersonalReplication, false);
  assert.equal(out.causalClaimCeiling, 'INTERVENTION_EFFECT_OBSERVED');
});

test('two completed controlled personal episodes can reach personal replication', () => {
  const out = nOf1Evidence({
    personRef: 'founder',
    interventionRef: 'schedule-change',
    episodes: [
      { controlled: true, evidenceRef: 'episode:e1', episodeRef: 'e1', outcomeRef: 'outcome:e1' },
      { controlled: true, evidenceRef: 'episode:e2', episodeRef: 'e2', outcomeRef: 'outcome:e2' }
    ]
  });
  assert.equal(out.ok, true);
  assert.equal(out.validPersonalReplication, true);
  assert.equal(out.causalClaimCeiling, 'PERSONAL_REPLICATED_INTERVENTION_EFFECT');
  assert.equal(out.businessEffectAuthority, 'NONE');
});
