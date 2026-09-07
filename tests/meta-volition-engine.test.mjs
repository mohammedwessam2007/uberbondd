import test from 'node:test';
import assert from 'node:assert/strict';
import { compileMetaVolition, compareMetaVolition } from '../src/meta-volition-engine.mjs';

test('wanting something while wanting not to want it remains a visible conflict', () => {
  const out = compileMetaVolition({
    object: 'synthetic desire',
    firstOrder: 'WANT',
    secondOrder: 'ENDORSE_NOT_WANTING',
    at: '2026-09-07T10:00:00Z'
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'META_VOLITION_CONFLICT_VISIBLE');
  assert.equal(out.conflict, true);
  assert.equal(out.presentChoice, 'UNDECIDED');
  assert.equal(out.highestRung, 'VALUE');
});

test('second-order endorsement still does not authorize action', () => {
  const out = compileMetaVolition({
    object: 'synthetic desire', firstOrder: 'WANT', secondOrder: 'ENDORSE_WANTING'
  });
  assert.equal(out.status, 'META_VOLITION_ALIGNED');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.match(out.truthBoundary, /NEITHER_AUTHORIZES_ACTION/);
});

test('present choice is recorded separately rather than inferred from alignment', () => {
  const noChoice = compileMetaVolition({ object: 'X', firstOrder: 'WANT', secondOrder: 'ENDORSE_WANTING' });
  const chose = compileMetaVolition({ object: 'X', firstOrder: 'WANT', secondOrder: 'ENDORSE_WANTING', presentChoice: 'CHOOSE' });
  assert.equal(noChoice.presentChoice, 'UNDECIDED');
  assert.equal(noChoice.highestRung, 'VALUE');
  assert.equal(chose.presentChoice, 'CHOOSE');
  assert.equal(chose.highestRung, 'CHOICE');
  assert.equal(chose.businessEffectAuthority, 'NONE');
});

test('changing meta-volition is evolution, not a pathology judgment', () => {
  const before = compileMetaVolition({ object: 'X', firstOrder: 'WANT', secondOrder: 'ENDORSE_WANTING', at: '2026-09-01T00:00:00Z' });
  const after = compileMetaVolition({ object: 'X', firstOrder: 'DO_NOT_WANT', secondOrder: 'ENDORSE_NOT_WANTING', at: '2026-09-07T00:00:00Z' });
  const diff = compareMetaVolition({ before, after });
  assert.equal(diff.ok, true);
  assert.equal(diff.status, 'META_VOLITION_EVOLVED');
  assert.equal(diff.normativeJudgmentAboutChange, 'NONE');
});
