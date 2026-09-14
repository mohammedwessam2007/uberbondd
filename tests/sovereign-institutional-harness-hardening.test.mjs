import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProofDag } from '../src/content-addressed-proof-dag.mjs';
import {
  validateCriticalEvidenceBinding,
  validateReviewIndependence,
  validatePhaseProofContinuity,
  validateRuntimeContractChain,
  validateAuthorityLease,
  reconcileObservedEffect,
  hardeningChecks
} from '../src/sovereign-institutional-harness-hardening.mjs';

const proof=(id,parents=[])=>({id,kind:'gate',evidenceRef:`receipt:${id}`,parents,synthetic:false,sourceClass:'OBSERVED',observed:true});
const cleanDag=()=>compileProofDag({proofs:[
  proof('spec'),proof('architecture',['spec']),proof('plan',['architecture']),proof('fail',['plan']),proof('pass',['fail']),proof('review',['pass']),proof('ci',['review']),proof('risk',['ci']),proof('rollback',['risk'])
]});
const criticalArtifacts=()=>[
  {id:'a1',type:'failing-test-receipt',phase:'BUILD',proofId:'fail',observed:true,sequence:1},
  {id:'a2',type:'passing-test-receipt',phase:'BUILD',proofId:'pass',observed:true,sequence:2},
  {id:'a3',type:'ci-receipt',phase:'SHIP',proofId:'ci',observed:true,sequence:3},
  {id:'a4',type:'risk-verdict',phase:'SHIP',proofId:'risk',observed:true,sequence:4},
  {id:'a5',type:'rollback-rehearsal',phase:'SHIP',proofId:'rollback',observed:true,sequence:5}
];

const reviewRoles=()=>[
  {discipline:'BACKEND_ARCHITECT',executionInstanceRef:'build-1'},
  {discipline:'TEST_ENGINEER',executionInstanceRef:'build-2'},
  ...['CODE_REVIEWER','SECURITY_ENGINEER','PERFORMANCE_OBSERVABILITY_ENGINEER','RISK_OFFICER','ADVERSARIAL_FALSIFIER','AUTHORITY_GUARD','REALITY_RECONCILER'].map((discipline,i)=>({discipline,executionInstanceRef:`review-${i}`,contextIsolation:true}))
];

const runtimeLayers=()=>[
  {layer:'DATA',inputContracts:['source.v1'],outputContracts:['data.v1']},
  {layer:'SIGNAL',inputContracts:['data.v1'],outputContracts:['signal.v1']},
  {layer:'DECISION',inputContracts:['signal.v1'],outputContracts:['decision.v1']},
  {layer:'RISK',inputContracts:['decision.v1'],outputContracts:['risk.v1']},
  {layer:'EXECUTION',inputContracts:['risk.v1'],outputContracts:['effect.v1']},
  {layer:'MONITORING',inputContracts:['effect.v1'],outputContracts:['reconciliation.v1']}
];

test('critical gate evidence must be observed and proof bound',()=>{
  const out=validateCriticalEvidenceBinding({artifacts:criticalArtifacts(),proofDag:cleanDag()});
  assert.equal(out.ok,true);
});

test('critical gate evidence refuses missing proof identity',()=>{
  const artifacts=criticalArtifacts();delete artifacts[2].proofId;
  const out=validateCriticalEvidenceBinding({artifacts,proofDag:cleanDag()});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('critical-artifact-proof-id-required:ci-receipt'));
});

test('critical gate evidence refuses synthetic ancestry masquerading as observation',()=>{
  const dag=compileProofDag({proofs:[{id:'synthetic-root',kind:'fixture',evidenceRef:'fixture:x',parents:[],synthetic:true,sourceClass:'SYNTHETIC',observed:false},...['fail','pass','ci','risk','rollback'].map((id,i)=>({id,kind:'gate',evidenceRef:`receipt:${id}`,parents:i===0?['synthetic-root']:[['fail','pass','ci','risk'][i-1]],synthetic:false,sourceClass:'OBSERVED',observed:true}))]});
  const out=validateCriticalEvidenceBinding({artifacts:criticalArtifacts(),proofDag:dag});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.some(x=>x.startsWith('critical-artifact-proof-refused:')));
});

test('review gates require pairwise distinct isolated instances',()=>{
  const out=validateReviewIndependence({roles:reviewRoles()});
  assert.equal(out.ok,true);
  const bad=reviewRoles();bad[bad.length-1].executionInstanceRef='review-0';
  const refused=validateReviewIndependence({roles:bad});
  assert.equal(refused.ok,false);
  assert.ok(refused.reasonCodes.some(x=>x.startsWith('review-instances-must-be-pairwise-distinct:')));
});

test('review instance cannot reuse a build instance',()=>{
  const roles=reviewRoles();roles[2].executionInstanceRef='build-1';
  const out=validateReviewIndependence({roles});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.some(x=>x.startsWith('review-instance-contaminated-by-build:')));
});

test('phase proof continuity requires ancestry across adjacent phases',()=>{
  const dag=compileProofDag({proofs:[proof('spec'),proof('architecture',['spec']),proof('plan',['architecture']),proof('build',['plan']),proof('review',['build']),proof('ship',['review'])]});
  const artifacts=['SPECIFICATION','ARCHITECTURE','PLAN','BUILD','REVIEW','SHIP'].map((phase,i)=>({id:`a${i}`,type:`phase-${i}`,phase,proofId:['spec','architecture','plan','build','review','ship'][i]}));
  assert.equal(validatePhaseProofContinuity({artifacts,proofDag:dag}).ok,true);
});

test('phase proof continuity rejects disconnected later proof',()=>{
  const dag=compileProofDag({proofs:[proof('spec'),proof('architecture',['spec']),proof('plan-island')]});
  const artifacts=[{id:'a',type:'spec',phase:'SPECIFICATION',proofId:'spec'},{id:'b',type:'arch',phase:'ARCHITECTURE',proofId:'architecture'},{id:'c',type:'plan',phase:'PLAN',proofId:'plan-island'}];
  const out=validatePhaseProofContinuity({artifacts,proofDag:dag});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('phase-proof-must-descend-from-prior-phase:PLAN:plan'));
});

test('runtime layer contracts form an explicit end to end chain',()=>{
  assert.equal(validateRuntimeContractChain({runtimeLayers:runtimeLayers()}).ok,true);
  const bad=runtimeLayers();bad[4].inputContracts=['wrong.v1'];
  const out=validateRuntimeContractChain({runtimeLayers:bad});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('runtime-contract-disconnected:RISK->EXECUTION'));
});

test('authority lease is mission scoped action scoped expiring and attenuation only',()=>{
  const lease={leaseId:'lease-1',subject:'founder',missionId:'m1',actions:['DEPLOY_CANARY'],issuedAt:'2026-09-14T10:00:00Z',expiresAt:'2026-09-14T11:00:00Z',attenuationOnly:true,evidenceRef:'receipt:lease'};
  assert.equal(validateAuthorityLease({lease,missionId:'m1',now:'2026-09-14T10:30:00Z',requiredAction:'DEPLOY_CANARY'}).ok,true);
  assert.equal(validateAuthorityLease({lease,missionId:'m2',now:'2026-09-14T10:30:00Z',requiredAction:'DEPLOY_CANARY'}).ok,false);
  assert.equal(validateAuthorityLease({lease,missionId:'m1',now:'2026-09-14T12:00:00Z',requiredAction:'DEPLOY_CANARY'}).ok,false);
});

test('authority lease cannot silently widen action scope',()=>{
  const lease={leaseId:'lease-1',subject:'founder',missionId:'m1',actions:['READ'],issuedAt:'2026-09-14T10:00:00Z',expiresAt:'2026-09-14T11:00:00Z',attenuationOnly:true,evidenceRef:'receipt:lease'};
  const out=validateAuthorityLease({lease,missionId:'m1',now:'2026-09-14T10:30:00Z',requiredAction:'DEPLOY_CANARY'});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('required-action-not-in-lease'));
});

test('reality reconciliation treats observed mismatch as stop and rollback condition',()=>{
  const out=reconcileObservedEffect({intent:{effectDigest:'sha256:intended'},observation:{effectDigest:'sha256:different',observed:true,evidenceRef:'receipt:effect'},killSwitchAvailable:true,rollbackAvailable:true});
  assert.equal(out.ok,true);assert.equal(out.status,'REALITY_DISCREPANCY_CONTAINED');assert.equal(out.action,'STOP_RECONCILE_ROLLBACK');
});

test('reality mismatch is refused when containment paths are absent',()=>{
  const out=reconcileObservedEffect({intent:{effectDigest:'a'},observation:{effectDigest:'b',observed:true,evidenceRef:'receipt:effect'}});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('discrepancy-requires-kill-switch'));assert.ok(out.reasonCodes.includes('discrepancy-requires-rollback-path'));
});

test('combined hardening gate remains zero authority',()=>{
  const out=hardeningChecks({roles:reviewRoles(),artifacts:criticalArtifacts(),proofDag:cleanDag(),runtimeLayers:runtimeLayers(),lease:{leaseId:'l',subject:'founder',missionId:'m',actions:['CANARY'],issuedAt:'2026-09-14T10:00:00Z',expiresAt:'2026-09-14T11:00:00Z',attenuationOnly:true,evidenceRef:'receipt:l'},missionId:'m',now:'2026-09-14T10:30:00Z',requiredAction:'CANARY'});
  assert.equal(out.ok,true);assert.equal(out.externalEffectAuthority,'NONE');assert.equal(out.businessEffectAuthority,'NONE');
});
