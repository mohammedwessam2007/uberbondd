import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSalience, routeSalienceBatch } from '../src/sovereign-salience-router.mjs';

const base = { item: 'a relevant update', urgency: 0.5, importance: 0.7, confidence: 0.8, attentionCost: 0.4, delayReversibility: 0.7, founderBusy: false, directExperienceValue: 0, consequenceIfMissed: 0.3 };

test('founder right not to know dominates salience scoring', () => {
  const out = routeSalience({ ...base, urgency: 1, importance: 1, confidence: 1, consequenceIfMissed: 1, founderRule: 'RIGHT_NOT_TO_KNOW' });
  assert.equal(out.ok, true); assert.equal(out.mode, 'SAY_NOTHING'); assert.equal(out.mayPreparePrivately, false); assert.equal(out.externalEffectAuthority, 'NONE');
});

test('no-spoiler and direct-experience rules preserve mystery', () => {
  for (const founderRule of ['NO_SPOILERS', 'DIRECT_EXPERIENCE_FIRST']) {
    const out = routeSalience({ ...base, founderRule });
    assert.equal(out.mode, 'PRESERVE_MYSTERY');
  }
});

test('high-consequence closing window can earn an interrupt without creating action authority', () => {
  const out = routeSalience({ ...base, urgency: 0.95, importance: 0.9, confidence: 0.9, attentionCost: 0.2, delayReversibility: 0.1, consequenceIfMissed: 0.96 });
  assert.equal(out.mode, 'INTERRUPT_NOW');
  assert.match(out.authorityBoundary, /MAY_NOT_CHOOSE_OR_ACT/);
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('valuable information is prepared silently when interruption cost is high', () => {
  const out = routeSalience({ ...base, urgency: 0.55, importance: 0.95, confidence: 0.9, attentionCost: 0.8, delayReversibility: 0.6, consequenceIfMissed: 0.5, founderBusy: true });
  assert.equal(out.mode, 'PREPARE_SILENTLY');
});

test('high direct-experience value can preserve mystery heuristically', () => {
  const out = routeSalience({ ...base, urgency: 0.45, importance: 0.4, confidence: 0.8, attentionCost: 0.3, delayReversibility: 0.5, directExperienceValue: 0.95, consequenceIfMissed: 0.2 });
  assert.equal(out.mode, 'PRESERVE_MYSTERY');
  assert.match(out.authorityBoundary, /OVERRIDDEN_BY_PRESENT_FOUNDER_CHOICE/);
});

test('low urgency or reversible delay is deferred rather than interrupting', () => {
  const out = routeSalience({ ...base, urgency: 0.2, importance: 0.5, confidence: 0.8, attentionCost: 0.2, delayReversibility: 0.9, consequenceIfMissed: 0.1 });
  assert.equal(out.mode, 'DEFER');
});

test('batch caps prevent cognition scale from becoming interruption scale', () => {
  const urgent = n => ({ item: `urgent-${n}`, urgency: 0.98, importance: 0.95, confidence: 0.95, attentionCost: 0.1, delayReversibility: 0.05, founderBusy: false, directExperienceValue: 0, consequenceIfMissed: 0.98 });
  const out = routeSalienceBatch([urgent(1), urgent(2), urgent(3), urgent(4)], { maxInterrupts: 1, maxPrepared: 2 });
  assert.equal(out.ok, true);
  assert.equal(out.summary.INTERRUPT_NOW, 1);
  assert.equal(out.summary.PREPARE_SILENTLY, 2);
  assert.equal(out.summary.DEFER, 1);
  assert.match(out.law, /FOUNDER_ATTENTION_REMAINS_SCARCE/);
});

test('invalid scores fail closed', () => {
  const out = routeSalience({ ...base, urgency: 2 });
  assert.equal(out.ok, false);
  assert.equal(out.externalEffectAuthority, 'NONE');
});
