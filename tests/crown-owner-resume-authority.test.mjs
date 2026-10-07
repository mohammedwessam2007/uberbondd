import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileCrownOwnerResumeAuthority,
  CROWN_OWNER_RESUME_CONFIRMATION
} from '../src/crown-owner-resume-authority.mjs';

test('owner resume authority requires an exact explicit USD 0.30 approval',()=>{
  const now=Date.parse('2026-10-07T00:10:00Z');
  const out=compileCrownOwnerResumeAuthority({approved:true,confirmation:CROWN_OWNER_RESUME_CONFIRMATION,maximumIncrementalUsd:0.30},{now});
  assert.equal(out.ok,true);
  assert.equal(out.authority.maxIncrementalMicrousd,300000);
  assert.equal(out.authority.maxRemainingPaidCalls,2);
  assert.equal(out.authority.maxTotalEvaluationMicrousd,450000);
  assert.equal(out.authority.monthlyCapMicrousd,20000000);
  assert.equal(out.authority.evidenceRef,'owner-approved-two-missing-crown-edges-r3');
  assert.equal(out.sideEffectAuthority,'NONE');
});

for(const [name,input] of [
  ['missing approval',{confirmation:CROWN_OWNER_RESUME_CONFIRMATION,maximumIncrementalUsd:.30}],
  ['wrong phrase',{approved:true,confirmation:'YES',maximumIncrementalUsd:.30}],
  ['larger cap',{approved:true,confirmation:CROWN_OWNER_RESUME_CONFIRMATION,maximumIncrementalUsd:.31}],
  ['smaller cap',{approved:true,confirmation:CROWN_OWNER_RESUME_CONFIRMATION,maximumIncrementalUsd:.29}]
])test('resume authority refuses '+name,()=>{
  assert.equal(compileCrownOwnerResumeAuthority(input).ok,false);
});
