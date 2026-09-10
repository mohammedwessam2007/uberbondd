import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSalience, routeSalienceBatch } from '../src/sovereign-salience-router.mjs';

const base = { item: 'relevant update', urgency: 0.5, importance: 0.7, confidence: 0.8, attentionCost: 0.4, delayReversibility: 0.7, founderBusy: false, directExperienceValue: 0, consequenceIfMissed: 0.3 };

test('explicit non-surfacing dominates every score', () => {
  const out = routeSalience({ ...base, urgency: 1, importance: 1, confidence: 1, consequenceIfMissed: 1, founderRule: 'RIGHT_NOT_TO_KNOW' });
  assert.equal(out.mode, 'SAY_NOTHING');
  assert.equal(out.mayPreparePrivately, false);
  assert.equal(out.externalEffectAuthority, 'NONE');
});

test('no-spoiler and direct-experience rules preserve mystery', () => {
  for (const founderRule of ['NO_SPOILERS', 'DIRECT_EXPERIENCE_FIRST']) assert.equal(routeSalience({ ...base, founderRule }).mode, 'PRESERVE_MYSTERY');
});

test('high-consequence closing window can earn only an attention interrupt', () => {
  const out = routeSalience({ ...base, urgency: 0.95, importance: 0.9, confidence: 0.9, attentionCost: 0.2, delayReversibility: 0.1, consequenceIfMissed: 0.96 });
  assert.equal(out.mode, 'INTERRUPT_NOW');
  assert.match(out.authorityBoundary, /CANNOT_CHOOSE_OR_ACT/);
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('emergency-only rule refuses ordinary interruption', () => {
  const out = routeSalience({ ...base, urgency: 0.8, importance: 1, confidence: 1, consequenceIfMissed: 0.8, founderRule: 'EMERGENCY_ONLY' });
  assert.equal(out.mode, 'SAY_NOTHING');
});

test('valuable information can be prepared silently when interruption cost is high', () => {
  const out = routeSalience({ ...base, urgency: 0.55, importance: 0.95, confidence: 0.9, attentionCost: 0.8, delayReversibility: 0.6, consequenceIfMissed: 0.5, founderBusy: true });
  assert.equal(out.mode, 'PREPARE_SILENTLY');
  assert.match(out.authorityBoundary, /PRIVATE_DATA_BOUNDARIES/);
});

test('high direct-experience value can preserve mystery heuristically', () => {
  const out = routeSalience({ ...base, urgency: 0.45, importance: 0.4, confidence: 0.8, attentionCost: 0.3, delayReversibility: 0.5, directExperienceValue: 0.95, consequenceIfMissed: 0.2 });
  assert.equal(out.mode, 'PRESERVE_MYSTERY');
});

test('batch caps prevent cognition scale becoming interruption scale', () => {
  const urgent = n => ({ item: `urgent-${n}`, urgency: 0.98, importance: 0.95, confidence: 0.95, attentionCost: 0.1, delayReversibility: 0.05, founderBusy: false, directExperienceValue: 0, consequenceIfMissed: 0.98 });
  const out = routeSalienceBatch([urgent(1), urgent(2), urgent(3), urgent(4)], { maxInterrupts: 1, maxPrepared: 2 });
  assert.deepEqual(out.summary, { INTERRUPT_NOW: 1, PREPARE_SILENTLY: 2, DEFER: 1, PRESERVE_MYSTERY: 0, SAY_NOTHING: 0 });
  assert.equal(out.externalEffectAuthority, 'NONE');
});

test('invalid scores and invalid caps fail closed', () => {
  assert.equal(routeSalience({ ...base, urgency: 2 }).ok, false);
  assert.equal(routeSalienceBatch([base], { maxInterrupts: 11 }).ok, false);
});
