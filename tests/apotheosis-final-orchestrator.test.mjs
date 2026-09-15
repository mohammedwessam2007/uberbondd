import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sealApotheosisPopulation,
  verifyFreshIndependentApotheosisEvidence,
  selectApotheosisContextArmAssured,
  compileApotheosisFinalDispatch,
  evaluateApotheosisDownrouteAssured,
  compareApotheosisArmsAssured,
  admitApotheosisPolicyAssured,
  classifyApotheosisContinuityAssured,
  verifyApotheosisGate4RelayReceipt,
  compileApotheosisImplementationStatus
} from '../src/apotheosis-final-orchestrator.mjs';

const SOURCE='a'.repeat(40);
const SHA='b'.repeat(64);
const NOW=Date.parse('2026-09-15T02:00:00Z');
const fresh=(extra={})=>({ok:true,observed:true,independentVerifier:true,evidenceRef:'e:1',verifierRef:'v:1',observedAt:'2026-09-15T01:59:00Z',sourceCommit:SOURCE,...extra});
const taskIds=['t1','t2','t3'];
const seal=sealApotheosisPopulation({sourceCommit:SOURCE,protocolVersion:'p1',taskIds}).populationSeal;
const out=(taskId, routeId='r1', quality=.9, cost=.5, extra={})=>fresh({taskId,routeId,taskClass:'coding',policyVersion:'p1',quality,costUsd:cost,latencyMs:100,attemptCount:1,...extra});

test('fresh evidence rejects stale, future and source-mismatched receipts',()=>{
 assert.equal(verifyFreshIndependentApotheosisEvidence(fresh(),{sourceCommit:SOURCE,now:NOW}).ok,true);
 assert.equal(verifyFreshIndependentApotheosisEvidence({...fresh(),observedAt:'2026-08-01T00:00:00Z'},{sourceCommit:SOURCE,now:NOW}).ok,false);
 assert.equal(verifyFreshIndependentApotheosisEvidence({...fresh(),observedAt:'2026-09-16T00:00:00Z'},{sourceCommit:SOURCE,now:NOW}).ok,false);
 assert.equal(verifyFreshIndependentApotheosisEvidence({...fresh(),sourceCommit:'c'.repeat(40)},{sourceCommit:SOURCE,now:NOW}).ok,false);
});

test('population seal binds source, version and exact unique task population',()=>{
 assert.equal(seal.taskIds.join(','),'t1,t2,t3');
 assert.equal(sealApotheosisPopulation({sourceCommit:SOURCE,protocolVersion:'p1',taskIds:['t1','t1','t2']}).ok,false);
});

test('context assurance refuses stale arms and selects through native selector',async()=>{
 const arms=[fresh({id:'small',quality:.91,tokens:10,latencyMs:10,retrievalMissRate:.01,privacyScope:.1,contextDigest:SHA}),fresh({id:'big',quality:.92,tokens:100,latencyMs:20,retrievalMissRate:0,privacyScope:.3,contextDigest:'c'.repeat(64)})];
 const r=await selectApotheosisContextArmAssured({sourceCommit:SOURCE,arms,now:NOW,dependencies:{selectApotheosisContextPolicy:({arms})=>({ok:true,selected:arms[0],alternatives:[arms[1]]})}});
 assert.equal(r.ok,true); assert.equal(r.selected.id,'small');
 const stale=await selectApotheosisContextArmAssured({sourceCommit:SOURCE,arms:[{...arms[0],observedAt:'2026-01-01T00:00:00Z'},arms[1]],now:NOW,dependencies:{selectApotheosisContextPolicy:()=>({ok:true})}});
 assert.equal(stale.ok,false);
});

test('final dispatch recomputes task binding, uses global budget, and binds selected context',async()=>{
 const bound={fake:'projection'};
 const candidate=fresh({id:'m2',tier:'M2',taskClass:'coding',quality:.9,reliability:.95,totalCostUsd:.2,latencyMs:100,availableBudgetUsd:999,callable:true,permitted:true});
 const arms=[fresh({id:'small',quality:.91,tokens:10,latencyMs:10,retrievalMissRate:.01,privacyScope:.1,contextDigest:SHA}),fresh({id:'big',quality:.92,tokens:100,latencyMs:20,retrievalMissRate:0,privacyScope:.3,contextDigest:'c'.repeat(64)})];
 let seen;
 const r=await compileApotheosisFinalDispatch({sourceCommit:SOURCE,boundProjection:bound,task:{id:'t',taskClass:'coding',objective:'do x',stakes:.2,uncertainty:.2,failureCost:.2,availableBudgetUsd:1},candidateEvidence:[candidate],workers:[{workerId:'m2'}],packetContract:{objective:'do x',inputRefs:[]},contextArms:arms,now:NOW,dependencies:{verifyTaskBoundContextProjection:()=>({ok:true,status:'CONTEXT_TASK_BINDING_VERIFIED',bindingId:SHA,sourceCommit:SOURCE}),selectApotheosisContextPolicy:({arms})=>({ok:true,selected:arms[0],alternatives:[arms[1]]}),compileApotheosisNativeDispatch:input=>{seen=input;return{ok:true,status:'APOTHEOSIS_NATIVE_DISPATCH_READY',allocation:{selected:{id:'m2',tier:'M2'}},packet:{packetDigest:SHA}};}}});
 assert.equal(r.ok,true); assert.equal(seen.candidateEvidence[0].availableBudgetUsd,1); assert.equal(seen.candidateEvidence[0].evidenceBacked,true); assert.ok(seen.packetContract.inputRefs.includes(`context:${SHA}`));
});

test('downroute assurance refuses stale/version drift and accepts exact fresh paired population',async()=>{
 const baseline={routeId:'r1',tier:'A5',taskClass:'coding',preregistered:true,sourceCommit:SOURCE,policyVersion:'p1',outcomes:taskIds.map(id=>out(id,'r1',.95,1))};
 const challenger={routeId:'r2',tier:'M3',taskClass:'coding',preregistered:true,sourceCommit:SOURCE,policyVersion:'p1',outcomes:taskIds.map(id=>out(id,'r2',.94,.2))};
 const r=await evaluateApotheosisDownrouteAssured({sourceCommit:SOURCE,policyVersion:'p1',populationSeal:seal,baseline,challenger,now:NOW,dependencies:{evaluateDownroutingPromotion:()=>({ok:true,promotionEligible:true,qualityDelta:-.01,costSavingFraction:.8})}});
 assert.equal(r.ok,true); assert.equal(r.promotionEligible,true);
 const drift=await evaluateApotheosisDownrouteAssured({sourceCommit:SOURCE,policyVersion:'p1',populationSeal:seal,baseline,challenger:{...challenger,policyVersion:'p2'},now:NOW,dependencies:{evaluateDownroutingPromotion:()=>({ok:true})}});
 assert.equal(drift.ok,false);
});

test('P48 assured comparison cryptographically seals the preregistered population',async()=>{
 const protocol={preregistered:true,protocolId:'proto',protocolVersion:'p1',sourceCommit:SOURCE,populationSeal:seal};
 const arms=[{id:'base',completeAttemptAccounting:true,frontierTokens:9,coordinationCostUsd:0,outcomes:taskIds.map(id=>out(id,null,.9,1,{routeId:undefined}))},{id:'candidate',completeAttemptAccounting:true,frontierTokens:1,coordinationCostUsd:.1,outcomes:taskIds.map(id=>out(id,null,.95,.2,{routeId:undefined}))}];
 const r=await compareApotheosisArmsAssured({sourceCommit:SOURCE,protocol,arms,now:NOW,dependencies:{compareApotheosisOrchestrationArms:()=>({ok:true,status:'APOTHEOSIS_ORCHESTRATION_COMPARISON_READY',scored:[{id:'candidate'}],champion:{id:'candidate'}})}});
 assert.equal(r.ok,true); assert.match(r.comparisonDigest,/^[a-f0-9]{64}$/);
 const bad={...protocol,populationSeal:{...seal,populationDigest:'d'.repeat(64)}};
 assert.equal((await compareApotheosisArmsAssured({sourceCommit:SOURCE,protocol:bad,arms,now:NOW,dependencies:{compareApotheosisOrchestrationArms:()=>({ok:true})}})).ok,false);
});

test('P49 assured promotion binds exact comparison, causal holdout, rollback and independent approval',async()=>{
 const rawComparison={ok:true,status:'APOTHEOSIS_ORCHESTRATION_COMPARISON_READY',scored:[{id:'candidate'}],champion:{id:'candidate'}};
 const comparison=await compareApotheosisArmsAssured({sourceCommit:SOURCE,protocol:{preregistered:true,protocolId:'proto',protocolVersion:'p1',sourceCommit:SOURCE,populationSeal:seal},arms:[{id:'base',completeAttemptAccounting:true,frontierTokens:9,coordinationCostUsd:0,outcomes:taskIds.map(id=>out(id,null,.9,1,{routeId:undefined}))},{id:'candidate',completeAttemptAccounting:true,frontierTokens:1,coordinationCostUsd:.1,outcomes:taskIds.map(id=>out(id,null,.95,.2,{routeId:undefined}))}],now:NOW,dependencies:{compareApotheosisOrchestrationArms:()=>rawComparison}});
 assert.equal(comparison.ok,true);
 const causal=fresh({comparisonDigest:comparison.comparisonDigest,candidateId:'candidate',baselineId:'base',causalEffectObserved:true,holdoutPassed:true,leakageCheckPassed:true});
 const rollback=fresh({comparisonDigest:comparison.comparisonDigest,candidateId:'candidate',rehearsed:true});
 const approval=fresh({comparisonDigest:comparison.comparisonDigest,candidateId:'candidate',builderRef:'builder',verifierRef:'reviewer'});
 const r=await admitApotheosisPolicyAssured({sourceCommit:SOURCE,baselinePolicyId:'base',candidatePolicyId:'candidate',comparison,causalAdmission:causal,rollbackReceipt:rollback,independentApproval:approval,now:NOW,dependencies:{admitApotheosisOrchestrationPolicy:()=>({ok:true,status:'APOTHEOSIS_POLICY_PROMOTION_ELIGIBLE_PROPOSAL_ONLY'})}});
 assert.equal(r.ok,true); assert.equal(r.assuredProposal.productionMutationPerformed,false);
 const self={...approval,verifierRef:'builder'};
 assert.equal((await admitApotheosisPolicyAssured({sourceCommit:SOURCE,baselinePolicyId:'base',candidatePolicyId:'candidate',comparison,causalAdmission:causal,rollbackReceipt:rollback,independentApproval:self,now:NOW,dependencies:{admitApotheosisOrchestrationPolicy:()=>({ok:true})}})).ok,false);
});

test('continuity assurance cannot turn a generic observed receipt into FLEET_RESUMED',async()=>{
 const continuation={ok:true,status:'APOTHEOSIS_NATIVE_CONTINUATION_READY',handoff:{sourceCommit:SOURCE,handoffDigest:SHA}};
 const weak=fresh({handoffDigest:SHA,frontierModelUsed:false});
 const bad=await classifyApotheosisContinuityAssured({nativeContinuation:continuation,currentSourceCommit:SOURCE,workerReceipt:weak,now:NOW,dependencies:{reconcileApotheosisWorkerResume:()=>({ok:true,evidenceLevel:'FLEET_RESUMED'})}});
 assert.equal(bad.ok,false);
 const strong=fresh({handoffDigest:SHA,frontierModelUsed:false,consumedHandoff:true,resumedWork:true,outcomeAccepted:true});
 const good=await classifyApotheosisContinuityAssured({nativeContinuation:continuation,currentSourceCommit:SOURCE,workerReceipt:strong,now:NOW,dependencies:{reconcileApotheosisWorkerResume:()=>({ok:true,evidenceLevel:'FLEET_RESUMED',handoffDigest:SHA,runtimeVersion:'v'})}});
 assert.equal(good.ok,true); assert.equal(good.evidenceLevel,'FLEET_RESUMED');
});

test('gate4 verifier requires full exact source and an actually passed deterministic suite',async()=>{
 const receipt={taskId:'gate4',workerId:'w',status:'COMPLETED',sourceCommit:SOURCE,commands:['npm run test:deterministic'],tests:[{command:'npm run test:deterministic',result:'PASS'}],artifacts:[],findings:[],limitations:[],confidence:'HIGH',externalEffects:{},cost:{},duration:1,submittedAt:'x',result:{decision:'PROCEED'}};
 const good=await verifyApotheosisGate4RelayReceipt({receipt,expectedSourceCommit:SOURCE,expectedTaskId:'gate4',dependencies:{validateRelayReceipt:()=>[]}});
 assert.equal(good.ok,true);
 const short=await verifyApotheosisGate4RelayReceipt({receipt:{...receipt,sourceCommit:SOURCE.slice(0,7)},expectedSourceCommit:SOURCE,expectedTaskId:'gate4',dependencies:{validateRelayReceipt:()=>[]}});
 assert.equal(short.ok,false);
});

test('status keeps source implementation separate from observed runtime evidence',()=>{
 const s=compileApotheosisImplementationStatus({sourceCommit:SOURCE});
 assert.equal(s.sourceImplementationPercent,100); assert.equal(s.endToEndEvidencePercent,75); assert.equal(s.gates.exactSourceRuntimeEvidence,false);
});
