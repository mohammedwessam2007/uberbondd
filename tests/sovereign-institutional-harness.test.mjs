import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICLE_DISCIPLINES,
  SOVEREIGN_DISCIPLINES,
  HARNESS_PHASES,
  RUNTIME_LAYERS,
  validateRoleLattice,
  evaluatePhaseGates,
  compileRuntimeControlPlane,
  evaluateSelfImprovementPromotion,
  compileSovereignInstitutionalHarness
} from '../src/sovereign-institutional-harness.mjs';
import { compileProofDag } from '../src/content-addressed-proof-dag.mjs';

const roles = () => SOVEREIGN_DISCIPLINES.map((discipline, index) => {
  const review = ['CODE_REVIEWER','SECURITY_ENGINEER','PERFORMANCE_OBSERVABILITY_ENGINEER','RISK_OFFICER','ADVERSARIAL_FALSIFIER','AUTHORITY_GUARD','REALITY_RECONCILER'].includes(discipline);
  return {
    discipline,
    actorRef: 'model:gpt-astra',
    executionInstanceRef: review ? `review-${index}` : `build-${index}`,
    contextRef: `context:${discipline.toLowerCase()}`,
    contextIsolation: review,
    toolClasses: ['READ','TEST'],
    evidenceRefs: [`receipt:role:${discipline}`],
    canVeto: ['RISK_OFFICER','AUTHORITY_GUARD'].includes(discipline),
    canWidenAuthority: false,
    authority: 'NONE'
  };
});

const artifacts = () => {
  const rows = [];
  let sequence = 1;
  const add = (phase, type, extra={}) => rows.push({
    id: `artifact:${type}`,
    type,
    phase,
    evidenceRef: `receipt:${type}`,
    producerDiscipline: phase === 'REVIEW' ? 'CODE_REVIEWER' : 'CONDUCTOR',
    executionInstanceRef: `${phase.toLowerCase()}-${sequence}`,
    sequence: sequence++,
    ...extra
  });
  add('SPECIFICATION','mission-spec');
  add('SPECIFICATION','acceptance-criteria');
  add('SPECIFICATION','authority-envelope');
  add('SPECIFICATION','context-snapshot');
  add('ARCHITECTURE','architecture');
  add('ARCHITECTURE','interface-contracts');
  add('ARCHITECTURE','failure-model');
  add('PLAN','task-plan');
  add('PLAN','test-plan');
  add('PLAN','rollback-plan');
  add('BUILD','failing-test-receipt',{observed:true,metadata:{failureObserved:true}});
  add('BUILD','implementation-receipt');
  add('BUILD','passing-test-receipt',{observed:true,metadata:{passObserved:true}});
  add('REVIEW','spec-verdict',{verdict:'PASS'});
  add('REVIEW','quality-verdict',{verdict:'PASS'});
  add('REVIEW','security-verdict',{verdict:'PASS'});
  add('REVIEW','performance-verdict',{verdict:'PASS'});
  add('REVIEW','adversarial-verdict',{verdict:'PASS'});
  add('SHIP','ci-receipt',{observed:true});
  add('SHIP','risk-verdict',{verdict:'PASS'});
  add('SHIP','rollback-rehearsal',{observed:true,metadata:{rehearsed:true}});
  add('SHIP','release-manifest',{metadata:{immutable:true}});
  return rows;
};

const runtimeLayers = () => RUNTIME_LAYERS.map((layer, index) => ({
  layer,
  ownerRole: layer === 'RISK' ? 'RISK_OFFICER' : layer === 'MONITORING' ? 'PERFORMANCE_OBSERVABILITY_ENGINEER' : 'CONDUCTOR',
  executionInstanceRef: `runtime-${layer.toLowerCase()}-${index}`,
  evidenceRef: `receipt:runtime:${layer}`,
  inputContracts: [`in:${layer}`],
  outputContracts: [`out:${layer}`],
  killSwitch: layer === 'RISK',
  canWidenAuthority: false,
  requiresRiskLease: layer === 'EXECUTION',
  limitsRef: layer === 'RISK' ? 'limits:hard' : null,
  reconciliationRef: layer === 'MONITORING' ? 'reconcile:intended-vs-observed' : null
}));

const candidates = () => [
  {id:'deterministic',executorClass:'DETERMINISTIC_CODE',capabilities:['analyze','verify'],evidenceRefs:['receipt:deterministic'],verified:true,authority:'NONE',latencyMs:5,costUsd:0,founderMinutes:0},
  {id:'agent',executorClass:'AGENT',capabilities:['analyze','verify'],evidenceRefs:['receipt:agent'],verified:true,authority:'NONE',latencyMs:50,costUsd:0.01,founderMinutes:0}
];

test('preserves the article ten disciplines and adds sovereign falsification, risk, authority, and reality roles',()=>{
  assert.equal(ARTICLE_DISCIPLINES.length,10);
  assert.equal(SOVEREIGN_DISCIPLINES.length,14);
  assert.ok(SOVEREIGN_DISCIPLINES.includes('RISK_OFFICER'));
  assert.ok(SOVEREIGN_DISCIPLINES.includes('ADVERSARIAL_FALSIFIER'));
  assert.ok(SOVEREIGN_DISCIPLINES.includes('AUTHORITY_GUARD'));
  assert.ok(SOVEREIGN_DISCIPLINES.includes('REALITY_RECONCILER'));
});

test('the same underlying model may fill roles only with isolated independent review instances',()=>{
  const out=validateRoleLattice({roles:roles()});
  assert.equal(out.ok,true);
  assert.equal(out.sameModelAllowed,true);
  assert.equal(out.roleCount,14);
});

test('review instance reuse with a build role is blocked even when the actor model is identical',()=>{
  const bad=roles();
  const buildInstance=bad.find(r=>r.discipline==='BACKEND_ARCHITECT').executionInstanceRef;
  bad.find(r=>r.discipline==='CODE_REVIEWER').executionInstanceRef=buildInstance;
  const out=validateRoleLattice({roles:bad});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('review-instance-must-be-independent:CODE_REVIEWER'));
});

test('all six phases pass only when the proof-carrying gate artifacts are present in order',()=>{
  const out=evaluatePhaseGates({artifacts:artifacts()});
  assert.equal(out.ok,true);
  assert.equal(out.gates.length,6);
  assert.deepEqual(out.gates.map(g=>g.phase),HARNESS_PHASES);
});

test('one-shot implementation is rejected when specification, architecture, plan, review, and ship evidence are absent',()=>{
  const oneShot=[{id:'impl',type:'implementation-receipt',phase:'BUILD',evidenceRef:'receipt:impl',sequence:1}];
  const out=evaluatePhaseGates({artifacts:oneShot});
  assert.equal(out.ok,false);
  assert.equal(out.firstBlocked,'SPECIFICATION');
  assert.ok(out.reasonCodes.includes('missing:SPECIFICATION:mission-spec'));
});

test('TDD chronology is structural rather than a prose promise',()=>{
  const bad=artifacts();
  bad.find(a=>a.type==='failing-test-receipt').sequence=50;
  const out=evaluatePhaseGates({artifacts:bad});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('tdd-failing-test-must-precede-implementation'));
});

test('synthetic ancestry cannot masquerade as observed gate evidence',()=>{
  const dag=compileProofDag({proofs:[
    {id:'synthetic-root',kind:'SIMULATION',evidenceRef:'sim:1',synthetic:true,sourceClass:'SYNTHETIC',observed:false},
    {id:'claimed-observed',kind:'TEST',evidenceRef:'test:1',parents:['synthetic-root'],sourceClass:'OBSERVED',observed:true}
  ]});
  assert.equal(dag.ok,true);
  const rows=artifacts();
  const target=rows.find(a=>a.type==='passing-test-receipt');
  target.proofId='claimed-observed';
  const out=evaluatePhaseGates({artifacts:rows,proofDag:dag});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('observed-artifact-proof-refused:passing-test-receipt'));
});

test('consequential ship readiness never invents authority',()=>{
  const blocked=evaluatePhaseGates({artifacts:artifacts(),consequentialShip:true});
  assert.equal(blocked.ok,false);
  assert.ok(blocked.reasonCodes.includes('explicit-authority-lease-required-for-consequential-ship'));
  const ready=evaluatePhaseGates({artifacts:artifacts(),consequentialShip:true,authorityLeaseRef:'lease:founder:123'});
  assert.equal(ready.ok,true);
  assert.equal(ready.externalEffectAuthority,'NONE');
});

test('runtime plane makes risk and monitoring independent stop-the-line layers',()=>{
  const out=compileRuntimeControlPlane({layers:runtimeLayers()});
  assert.equal(out.ok,true);
  assert.equal(out.layers.length,6);
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('risk cannot widen authority and execution cannot bypass a risk lease',()=>{
  const bad=runtimeLayers();
  bad.find(x=>x.layer==='RISK').canWidenAuthority=true;
  bad.find(x=>x.layer==='EXECUTION').requiresRiskLease=false;
  const out=compileRuntimeControlPlane({layers:bad});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('risk-layer-may-not-widen-authority'));
  assert.ok(out.reasonCodes.includes('execution-must-require-risk-lease'));
});

test('self-improvement promotion requires holdout evidence, hostile tests, rollback, and independent approval',()=>{
  const out=evaluateSelfImprovementPromotion({
    candidate:{id:'candidate-v2',executionInstanceRef:'builder-1',authorityExpansion:false},
    baseline:{id:'current-v1'},
    benchmark:{holdout:true,leakageChecked:true,metrics:[
      {id:'quality',baseline:0.80,candidate:0.86,direction:'HIGHER',maxRegression:0,critical:true},
      {id:'latency',baseline:100,candidate:95,direction:'LOWER',maxRegression:5,critical:true}
    ]},
    hostileTests:{executed:12,passed:12},
    sandbox:{observed:true,evidenceRef:'sandbox:receipt'},
    rollback:{rehearsed:true,evidenceRef:'rollback:receipt'},
    approvals:['CODE_REVIEWER','ADVERSARIAL_FALSIFIER','RISK_OFFICER','AUTHORITY_GUARD'].map((discipline,i)=>({discipline,verdict:'PASS',executionInstanceRef:`review-${i}`,evidenceRef:`approval:${discipline}`}))
  });
  assert.equal(out.ok,true);
  assert.equal(out.status,'PROMOTION_ELIGIBLE_PROPOSAL_ONLY');
  assert.equal(out.productionMutationPerformed,false);
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('a candidate cannot self-promote or trade quality for a critical regression',()=>{
  const out=evaluateSelfImprovementPromotion({
    candidate:{id:'candidate-v2',executionInstanceRef:'builder-1',selfApproved:true,authorityExpansion:true},
    baseline:{id:'current-v1'},
    benchmark:{holdout:true,leakageChecked:true,metrics:[{id:'reliability',baseline:0.99,candidate:0.90,direction:'HIGHER',critical:true}]},
    hostileTests:{executed:1,passed:1},
    sandbox:{observed:true,evidenceRef:'sandbox:receipt'},
    rollback:{rehearsed:true,evidenceRef:'rollback:receipt'},
    approvals:['CODE_REVIEWER','ADVERSARIAL_FALSIFIER','RISK_OFFICER','AUTHORITY_GUARD'].map((discipline,i)=>({discipline,verdict:'PASS',executionInstanceRef:`review-${i}`,evidenceRef:`approval:${discipline}`}))
  });
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('candidate-may-not-self-approve'));
  assert.ok(out.reasonCodes.includes('performance-may-not-expand-authority'));
  assert.ok(out.reasonCodes.includes('critical-regression:reliability'));
});

test('full harness composes context truth, roles, proof DAG, minimum sufficient executor, six phases, and runtime plane',()=>{
  const out=compileSovereignInstitutionalHarness({
    mission:{id:'mission-1',objective:'Build and verify a bounded capability',taskClass:'analyze',requiredCapabilities:['analyze','verify'],contextSnapshotRef:'brainstate:current',contextDigest:'sha256:abc',maxLatencyMs:1000,maxCostUsd:1,maxFounderMinutes:1},
    roles:roles(),
    artifacts:artifacts(),
    proofs:[],
    executorCandidates:candidates(),
    runtimeLayers:runtimeLayers()
  });
  assert.equal(out.ok,true);
  assert.equal(out.institutionCell.executor.id,'deterministic');
  assert.equal(out.doctrine.harnessOverOneShotPrompt,true);
  assert.equal(out.doctrine.realityOutranksSimulation,true);
  assert.equal(out.externalEffectAuthority,'NONE');
  assert.match(out.harnessDigest,/^sha256:/);
});
