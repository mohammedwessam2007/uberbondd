import test from 'node:test';
import assert from 'node:assert/strict';
import {
  position, resolve, deferralDrift, AUTHORITY_RUNGS, NEVER_OUTRANKS_PRESENT_CHOICE
} from '../src/present-free-will.mjs';

// The failure is never a system announcing it has taken over. It is the
// accumulation of small deferrals: this once the model is obviously right, this
// once the historical preference beats the mood.

const p = (rung, claim, extra = {}) => position({ rung, claim, ...extra }).position;

test('present conscious choice is the top rung and nothing else can reach it', () => {
  assert.equal(AUTHORITY_RUNGS[0], 'PRESENT_CONSCIOUS_CHOICE');
  assert.equal(NEVER_OUTRANKS_PRESENT_CHOICE.includes('PRESENT_CONSCIOUS_CHOICE'), false);
  assert.equal(NEVER_OUTRANKS_PRESENT_CHOICE.length, AUTHORITY_RUNGS.length - 1);
  assert.equal(Object.isFrozen(AUTHORITY_RUNGS), true);
});

test('a commitment nobody currently endorses is not a commitment', () => {
  const lapsed = position({ rung: 'ENDORSED_COMMITMENT', claim: 'the plan from three years ago' });
  assert.equal(lapsed.ok, false);
  assert.deepEqual(lapsed.reasonCodes, ['commitment-must-be-currently-endorsed']);
  assert.match(lapsed.note, /wearing a stronger word/);
});

test('a hundred corroborations do not promote a prediction above present choice', () => {
  // The hierarchy is about what kind of thing something is, not how good an
  // instance of it happens to be.
  const resolved = resolve([
    p('UBERBOND_PREDICTION', 'take the offer', { supportingEvidence: Array.from({ length: 100 }, (_, i) => `e${i}`) }),
    p('PRESENT_CONSCIOUS_CHOICE', 'decline the offer')
  ]);
  assert.equal(resolved.decision, 'decline the offer');
  assert.equal(resolved.decidedBy, 'PRESENT_CONSCIOUS_CHOICE');
  assert.equal(resolved.overridden[0].evidenceCount, 100);
  assert.match(resolved.law, /EVIDENCE_STRENGTH_NEVER_PROMOTES_A_RUNG/);
});

test('choosing against the optimum is sovereignty functioning, not an error', () => {
  const resolved = resolve([
    p('ECONOMIC_OPTIMIZATION', 'the lucrative path'),
    p('PRESENT_CONSCIOUS_CHOICE', 'the other one')
  ]);
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(resolved.sovereigntyFunctioning, true);
  assert.match(resolved.note, /not a system error/);
});

test('the full ordering holds pairwise down the whole list', () => {
  for (let i = 0; i < AUTHORITY_RUNGS.length - 1; i += 1) {
    const stronger = AUTHORITY_RUNGS[i];
    const weaker = AUTHORITY_RUNGS[i + 1];
    const resolved = resolve([
      p(weaker, 'weaker claim'),
      p(stronger, 'stronger claim', stronger === 'ENDORSED_COMMITMENT' ? { stillEndorsed: true } : {})
    ]);
    assert.equal(resolved.decidedBy, stronger, `${stronger} must outrank ${weaker}`);
  }
});

test('social expectation and economic optimization sit at the bottom', () => {
  assert.equal(AUTHORITY_RUNGS[AUTHORITY_RUNGS.length - 1], 'ECONOMIC_OPTIMIZATION');
  assert.equal(AUTHORITY_RUNGS[AUTHORITY_RUNGS.length - 2], 'SOCIAL_EXPECTATION');
});

test('an invented rung cannot be smuggled in', () => {
  const invented = position({ rung: 'OBVIOUSLY_CORRECT', claim: 'x' });
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.reasonCodes, ['known-authority-rung-required']);
});

test('a run of deferrals is a transfer nobody announced', () => {
  const resolutions = Array.from({ length: 6 }, () => ({
    decidedBy: 'UBERBOND_PREDICTION', presentChoiceWasAvailable: true
  }));
  const drift = deferralDrift(resolutions);
  assert.equal(drift.drifting, true);
  assert.equal(drift.status, 'PRESENT_CHOICE_DRIFTING');
  assert.equal(drift.deferredTo.UBERBOND_PREDICTION, 6);
  assert.match(drift.law, /A_TRANSFER_NOBODY_ANNOUNCED/);
});

test('decisions where present choice was not on the table do not count as drift', () => {
  const drift = deferralDrift(Array.from({ length: 6 }, () => ({
    decidedBy: 'ECONOMIC_OPTIMIZATION', presentChoiceWasAvailable: false
  })));
  assert.equal(drift.contested, 0);
  assert.equal(drift.drifting, false);
});

test('a mixture where present choice usually wins is not drifting', () => {
  const drift = deferralDrift([
    { decidedBy: 'PRESENT_CONSCIOUS_CHOICE', presentChoiceWasAvailable: true },
    { decidedBy: 'PRESENT_CONSCIOUS_CHOICE', presentChoiceWasAvailable: true },
    { decidedBy: 'PRESENT_CONSCIOUS_CHOICE', presentChoiceWasAvailable: true },
    { decidedBy: 'UBERBOND_PREDICTION', presentChoiceWasAvailable: true }
  ]);
  assert.equal(drift.drifting, false);
});

test('drift is returned to the person, never applied as a correction', () => {
  const drift = deferralDrift(Array.from({ length: 4 }, () => ({
    decidedBy: 'SOCIAL_EXPECTATION', presentChoiceWasAvailable: true
  })));
  assert.equal(drift.authorityBoundary, 'OBSERVATION_RETURNED_TO_MOHAMED__NOT_A_CORRECTION_APPLIED');
  assert.equal(drift.businessEffectAuthority, 'NONE');
});
