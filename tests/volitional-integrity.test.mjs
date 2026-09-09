import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessVolitionalIntegrity,
  detectPreferenceFeedbackLoop,
  presentWillBoundary,
  verifyPresentEndorsement
} from '../src/volitional-integrity.mjs';

const provenance = {
  ok: true,
  status: 'PROVENANCE_TRACED',
  preference: 'move abroad',
  origins: ['REPEATED_REFLECTION'],
  currentlyEndorsed: true,
  businessEffectAuthority: 'NONE'
};
const pressured = { ...provenance, origins: ['SOCIAL_PRESSURE'] };
const evaluatedAt = '2026-09-09T09:00:00.000Z';
const fresh = {
  source: 'PRESENT_SELF_REPORT',
  explicitlyEndorsed: true,
  preference: 'move abroad',
  statedAt: '2026-09-09T08:30:00.000Z'
};

test('ordinary reversible recommendation does not manufacture an endorsement requirement', () => {
  const result = assessVolitionalIntegrity({ provenance, recommendationRef: 'option:1', evaluatedAt });
  assert.equal(result.status, 'VOLITIONAL_BOUNDARY_CLEAR_ON_DECLARED_EVIDENCE');
  assert.equal(result.recommendationMayProceedToChoicePresentation, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('consequential socially pressured preference requires fresh present endorsement', () => {
  const result = assessVolitionalIntegrity({ pressured: true, provenance: pressured, recommendationRef: 'option:1', highStakes: true, evaluatedAt });
  assert.equal(result.status, 'VOLITIONAL_REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('fresh-present-explicit-endorsement-required'));
  assert.equal(result.authenticityClaim, 'NONE');
});

test('fresh founder endorsement clears reflection without granting choice or effect authority', () => {
  const result = assessVolitionalIntegrity({ provenance: pressured, recommendationRef: 'option:1', highStakes: true, endorsement: fresh, evaluatedAt });
  assert.equal(result.recommendationMayProceedToChoicePresentation, true);
  assert.equal(result.freshPresentEndorsement, true);
  assert.equal(result.choiceAuthority, 'FOUNDER_ONLY');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('historical currentlyEndorsed flag cannot substitute for a fresh present report', () => {
  const result = assessVolitionalIntegrity({ provenance: pressured, recommendationRef: 'option:1', highStakes: true, evaluatedAt });
  assert.equal(result.recommendationMayProceedToChoicePresentation, false);
});

test('stale, future-dated, or mismatched endorsement is refused', () => {
  const stale = verifyPresentEndorsement({ provenance, endorsement: { ...fresh, statedAt: '2026-09-07T08:30:00.000Z' }, evaluatedAt });
  assert.ok(stale.reasonCodes.includes('stale-present-endorsement-refused'));
  const future = verifyPresentEndorsement({ provenance, endorsement: { ...fresh, statedAt: '2026-09-10T08:30:00.000Z' }, evaluatedAt });
  assert.ok(future.reasonCodes.includes('future-dated-endorsement-refused'));
  const mismatch = verifyPresentEndorsement({ provenance, endorsement: { ...fresh, preference: 'stay home' }, evaluatedAt });
  assert.ok(mismatch.reasonCodes.includes('endorsement-preference-mismatch'));
});

test('AI influence cannot self-authorize a consequential recommendation', () => {
  const result = assessVolitionalIntegrity({ provenance, recommendationRef: 'option:ai', highStakes: true, declaredInfluences: ['AI_SUGGESTION'], evaluatedAt });
  assert.ok(result.reasonCodes.includes('ai-influenced-preference-cannot-self-authorize-consequential-recommendation'));
  assert.equal(result.recommendationMayProceedToChoicePresentation, false);
});

test('AI feedback loop is warning evidence, never an authenticity ruling', () => {
  const result = detectPreferenceFeedbackLoop({
    provenance,
    declaredInfluences: ['AI_SUGGESTION'],
    recommendationRefs: ['rec:1'],
    behaviorEvidenceRefs: ['behavior:1']
  });
  assert.equal(result.status, 'PREFERENCE_FEEDBACK_LOOP_POSSIBLE');
  assert.equal(result.authenticityClaim, 'NONE');
  assert.equal(result.requiresFounderInterpretation, true);
});

test('present veto and deferral outrank model recommendation but cannot execute an effect', () => {
  const veto = presentWillBoundary({ presentChoice: 'DO_NOT_CHOOSE', modelRecommendation: 'do it' });
  assert.equal(veto.status, 'PRESENT_WILL_VETO');
  assert.equal(veto.modelMayOverride, false);
  assert.equal(veto.effectMayExecuteFromThisReceipt, false);
  const defer = presentWillBoundary({ presentChoice: 'DEFER', modelRecommendation: 'do it' });
  assert.equal(defer.status, 'PRESENT_WILL_DEFERS');
  assert.equal(defer.businessEffectAuthority, 'NONE');
});

test('invalid provenance cannot be laundered into a volitional clearance', () => {
  const result = assessVolitionalIntegrity({ provenance: { ok: true, preference: 'x' }, recommendationRef: 'r', highStakes: true, endorsement: fresh, evaluatedAt });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('canonical-preference-provenance-required'));
});
