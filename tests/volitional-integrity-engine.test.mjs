import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPreference, tracePreferenceLineage } from '../src/preference-provenance.mjs';
import {
  assessVolitionalIntegrity,
  detectPreferenceFeedbackLoop,
  presentWillVeto
} from '../src/volitional-integrity-engine.mjs';

test('AI-induced preference cannot self-authorize an irreversible recommendation', () => {
  const seed = recordPreference({
    preferenceId: 'p1', statement: 'try X', origin: 'AI_SUGGESTION', influencedBy: ['ai:r1']
  });
  const lineage = tracePreferenceLineage([seed]);
  const out = assessVolitionalIntegrity({
    preference: seed, lineage, recommendationRef: 'rec:irreversible-x',
    irreversible: true, aiGeneratedRecommendation: true
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'VOLITIONAL_REVIEW_REQUIRED');
  assert.ok(out.reasonCodes.includes('fresh-present-explicit-endorsement-required'));
  assert.ok(out.reasonCodes.includes('ai-induced-preference-cannot-self-authorize-consequential-recommendation'));
  assert.equal(out.recommendationMayProceedToChoicePresentation, false);
});

test('fresh present endorsement can clear the provenance gate without creating action authority', () => {
  const inferred = recordPreference({ preferenceId: 'p1', statement: 'X', origin: 'BEHAVIORAL_INFERENCE' });
  const lineage = tracePreferenceLineage([inferred]);
  const present = recordPreference({
    preferenceId: 'present', statement: 'I presently endorse X', origin: 'PRESENT_SELF_REPORT',
    presentExplicitEndorsement: true
  });
  const out = assessVolitionalIntegrity({
    preference: inferred, lineage, recommendationRef: 'rec:x', highStakes: true,
    presentEndorsement: present
  });
  assert.equal(out.status, 'VOLITIONAL_BOUNDARY_CLEAR_ON_DECLARED_EVIDENCE');
  assert.equal(out.recommendationMayProceedToChoicePresentation, true);
  assert.equal(out.highestRung, 'RECOMMENDATION');
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('influence is never equated with inauthenticity', () => {
  const p = recordPreference({ preferenceId: 'p1', statement: 'X', origin: 'SOCIAL_INFLUENCE' });
  const out = assessVolitionalIntegrity({ preference: p, recommendationRef: 'rec:x', highStakes: false });
  assert.equal(out.authenticityClaim, 'NONE');
  assert.match(out.truthBoundary, /INFLUENCE_DOES_NOT_PROVE_INAUTHENTICITY/);
});

test('personalization feedback loop is surfaced without claiming manipulation', () => {
  const p = recordPreference({
    preferenceId: 'p1', statement: 'X', origin: 'BEHAVIORAL_INFERENCE', influencedBy: ['ai:r1']
  });
  const out = detectPreferenceFeedbackLoop({
    preference: p,
    recommendationHistory: ['ai:r1'],
    behaviorEvidenceRefs: ['behavior:after-r1']
  });
  assert.equal(out.status, 'PREFERENCE_FEEDBACK_LOOP_POSSIBLE');
  assert.equal(out.requiresHumanInterpretation, true);
  assert.equal(out.authenticityClaim, 'NONE');
});

test('present explicit will vetoes model recommendation even when model predicts regret', () => {
  const out = presentWillVeto({ presentChoice: 'DO_NOT_CHOOSE', modelRecommendation: 'choose X because regret forecast is high' });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'PRESENT_WILL_VETO');
  assert.equal(out.modelMayOverride, false);
  assert.match(out.truthBoundary, /OUTRANKS_THE_MODEL/);
  assert.equal(out.businessEffectAuthority, 'NONE');
});
