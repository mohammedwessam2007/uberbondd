import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyTruthEvidenceSubstrate,
  verifyAdversarialTribunal,
  verifySovereigntyGovernor,
  verifyMoonshotInternalAncestorDonors
} from '../src/moonshot-ancestor-verification.mjs';

test('truth substrate rejects synthetic ancestry as observed truth',()=>{
  const r=verifyTruthEvidenceSubstrate();
  assert.equal(r.ok,true);
  assert.equal(r.syntheticAncestryVisible,true);
  assert.ok(r.contaminationReasonCodes.includes('synthetic-ancestry-visible-and-not-admissible-as-observed-proof'));
});

test('adversarial tribunal discounts clones and preserves dissent',()=>{
  const r=verifyAdversarialTribunal();
  assert.equal(r.ok,true);
  assert.ok(r.effectiveIndependentCount<r.rawForecasterCount);
  assert.equal(r.dissentPreserved,true);
  assert.equal(r.attackRecorded,true);
});

test('sovereignty governor blocks authority widening and recursively revokes descendants',()=>{
  const r=verifySovereigntyGovernor();
  assert.equal(r.ok,true);
  assert.equal(r.capabilityGrowthWithoutAuthorityGrowthRejected,true);
  assert.equal(r.delegationWideningRejected,true);
  assert.deepEqual(r.revokedDelegationIds,['child','grandchild']);
});

test('all three existing donors must pass before ancestor verification closes',()=>{
  const r=verifyMoonshotInternalAncestorDonors();
  assert.equal(r.ok,true);
  assert.equal(r.status,'MOONSHOT_INTERNAL_ANCESTOR_DONORS_VERIFIED');
  assert.equal(r.externalEffectAuthority,'NONE');
});
