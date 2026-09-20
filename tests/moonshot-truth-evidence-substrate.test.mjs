import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMoonshotEvidenceRecord,
  evaluateMoonshotEvidence,
  verifyMoonshotCoverageState
} from '../src/moonshot-truth-evidence-substrate.mjs';

const head='1234567890123456789012345678901234567890';

test('source evidence must bind the exact source commit',()=>{
  const r=evaluateMoonshotEvidence({
    claimId:'c',claim:'source behavior exists',currentSourceCommit:head,
    records:[{id:'e1',kind:'SOURCE_TEST',scope:'unit',observedAt:'2026-09-20T00:00:00Z',independentlyVerified:true,sourceCommit:'0000000000000000000000000000000000000000'}],
    requiredKinds:['SOURCE_TEST']
  });
  assert.equal(r.status,'EVIDENCE_REQUIREMENTS_UNMET');
  assert.equal(r.rejected[0].reason,'source-commit-mismatch');
});

test('internal research never masquerades as external reality',()=>{
  const r=evaluateMoonshotEvidence({
    claimId:'c',claim:'research result',currentSourceCommit:head,
    records:[
      {id:'src',kind:'SOURCE_TEST',scope:'software',observedAt:'2026-09-20T00:00:00Z',independentlyVerified:true,sourceCommit:head},
      {id:'research',kind:'RESEARCH_EVIDENCE',scope:'synthetic benchmark',observedAt:'2026-09-20T00:00:00Z',independentlyVerified:true,synthetic:true}
    ]
  });
  assert.equal(r.externalRealityObserved,false);
  assert.equal(r.evidenceClass,'INTERNAL_SOURCE_AND_RESEARCH');
  assert.equal(r.promotionAuthority,'NONE');
});

test('external observed evidence remains explicitly scoped',()=>{
  const rec=compileMoonshotEvidenceRecord({
    id:'physical',kind:'PHYSICAL_RUNTIME',scope:'one instrument run',observedAt:'2026-09-20T00:00:00Z',independentlyVerified:true
  });
  const r=evaluateMoonshotEvidence({claimId:'c',claim:'one runtime observation',records:[rec],requiredKinds:['PHYSICAL_RUNTIME']});
  assert.equal(r.status,'EVIDENCE_SET_BOUND');
  assert.equal(r.externalRealityObserved,true);
  assert.deepEqual(r.externalObservedRecordIds,['physical']);
});

test('coverage verifier refuses a verified-current row without evidence',()=>{
  const r=verifyMoonshotCoverageState({rows:[{
    canonicalId:'x',class:'CONCEPT',currentState:'VERIFIED_CURRENT',
    currentEvidence:{sourceModules:[],testModules:[],reachability:'PRODUCTION',matchScope:'WHOLE_NAME',matchStrength:'EXACT_SLUG'}
  }]});
  assert.equal(r.ok,false);
});
