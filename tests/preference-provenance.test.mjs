import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordPreference,
  tracePreferenceLineage,
  presentPreferencePrecedence
} from '../src/preference-provenance.mjs';

test('behavioral repetition is recorded as inference, not present endorsement', () => {
  const p = recordPreference({
    preferenceId: 'p1', statement: 'often chooses X', origin: 'BEHAVIORAL_INFERENCE',
    evidenceRefs: ['behavior:1'], observedAt: '2026-09-07T10:00:00Z'
  });
  assert.equal(p.ok, true);
  assert.equal(p.presentExplicitEndorsement, false);
  assert.equal(p.authenticityClaim, 'NOT_INFERRED');
});

test('present endorsement cannot be smuggled onto a non-present origin', () => {
  const p = recordPreference({
    preferenceId: 'p1', statement: 'X', origin: 'AI_SUGGESTION',
    presentExplicitEndorsement: true, observedAt: '2026-09-07T10:00:00Z'
  });
  assert.equal(p.ok, false);
  assert.ok(p.reasonCodes.includes('present-explicit-endorsement-requires-present-self-report'));
});

test('lineage exposes AI ancestry without declaring the resulting preference inauthentic', () => {
  const a = recordPreference({
    preferenceId: 'a', statement: 'try X', origin: 'AI_SUGGESTION',
    influencedBy: ['ai:recommendation-1'], observedAt: '2026-09-07T10:00:00Z'
  });
  const b = recordPreference({
    preferenceId: 'b', statement: 'I seem to choose X', origin: 'BEHAVIORAL_INFERENCE',
    influencedBy: ['a'], evidenceRefs: ['behavior:x'], observedAt: '2026-09-07T11:00:00Z'
  });
  const lineage = tracePreferenceLineage([a, b]);
  assert.equal(lineage.ok, true);
  const row = lineage.preferences.find(item => item.preferenceId === 'b');
  assert.ok(row.ancestryOrigins.includes('AI_SUGGESTION'));
  assert.ok(row.ancestryOrigins.includes('BEHAVIORAL_INFERENCE'));
});

test('preference provenance cycles fail closed', () => {
  const a = recordPreference({ preferenceId: 'a', statement: 'A', origin: 'PAST_SELF_REPORT', influencedBy: ['b'] });
  const b = recordPreference({ preferenceId: 'b', statement: 'B', origin: 'PAST_SELF_REPORT', influencedBy: ['a'] });
  const out = tracePreferenceLineage([a, b]);
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('preference-provenance-cycle'));
});

test('fresh present explicit self-report outranks inference without deleting the inference', () => {
  const inferred = recordPreference({ preferenceId: 'old', statement: 'X', origin: 'BEHAVIORAL_INFERENCE' });
  const present = recordPreference({
    preferenceId: 'now', statement: 'I do not want X', origin: 'PRESENT_SELF_REPORT',
    presentExplicitEndorsement: true
  });
  const out = presentPreferencePrecedence([inferred, present]);
  assert.equal(out.ok, true);
  assert.equal(out.presentExplicitPreferences.length, 1);
  assert.equal(out.inferredPreferences.length, 1);
  assert.match(out.precedenceLaw, /PRESENT_EXPLICIT/);
  assert.equal(out.businessEffectAuthority, 'NONE');
});
