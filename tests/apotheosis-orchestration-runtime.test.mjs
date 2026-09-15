import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileApotheosisWorkerPacket,
  evaluateWorkerPacketOutcome,
  selectApotheosisContextPolicy,
  allocateScarceReasoning,
  evaluateDownroutingPromotion,
  compileApotheosisContinuityHandoff,
  classifyApotheosisContinuityEvidence,
  compareApotheosisOrchestrationArms,
  admitApotheosisOrchestrationPolicy
} from '../src/apotheosis-orchestration-runtime.mjs';

const SHA40='a'.repeat(40), SHA256='b'.repeat(64);
const receipt=(extra={})=>({ok:true,observed:true,evidenceRef:'receipt:e1',verifierRef:'verifier:independent',independentVerifier:true,...extra});
const outcome=(taskId,q,cost,latency=100)=>receipt({taskId,quality:q,costUsd:cost,latencyMs:latency,attemptCount:1});

function validPacket(){
 return compileApotheosisWorkerPacket({packetId:'p44-a',parentMissionId:'apotheosis',objective:'Implement bounded worker packet',currentTruth:'Current main verified',sourceCommit:SHA40,taskBinding:{ok:true,status:'CONTEXT_TASK_BINDING_VERIFIED',sourceCommit:SHA40,bindingId:SHA256},sourcePointers:['src/a.mjs'],fileOwnership:['src/a.mjs'],inputRefs:['receipt:truth'],outputContract:'Return code and receipts',interfaceContract:'No external effects',invariants:['authority stays NONE'],forbiddenChanges:['constitution'],acceptanceCriteria:['focused tests pass'],hostileTests:['reject wrong source'],returnFields:['changedFiles'],escalationTriggers:['unknown failure'],rollbackRequirement:'revert exact candidate',workerClass:'M2'});
}

test('P44 compiles a source-bound downstream packet and rejects frontier worker/self approval',()=>{
 const p=validPacket(); assert.equal(p.ok,true); assert.equal(p.packet.workerClass,'M2');
 const bad=compileApotheosisWorkerPacket({packetId:'x',parentMissionId:'m',objective:'x',currentTruth:'x',sourceCommit:SHA40,taskBinding:{ok:true,status:'CONTEXT_TASK_BINDING_VERIFIED',sourceCommit:SHA40},sourcePointers:['x'],fileOwnership:['x'],outputContract:'x',interfaceContract:'x',invariants:['x'],acceptanceCriteria:['x'],hostileTests:['x'],returnFields:['x'],rollbackRequirement:'x',workerClass:'A5'}); assert.equal(bad.ok,false); assert.ok(bad.reasonCodes.includes('downstream-worker-tier-required'));
 const accepted=evaluateWorkerPacketOutcome({packet:p.packet,outcome:receipt({packetDigest:p.packet.packetDigest,changedFiles:['src/a.mjs'],testRefs:['test:1']})}); assert.equal(accepted.ok,true);
 const self=evaluateWorkerPacketOutcome({packet:p.packet,outcome:receipt({packetDigest:p.packet.packetDigest,changedFiles:['src/a.mjs'],testRefs:['test:1'],selfApproved:true})}); assert.equal(self.ok,false);
});

test('P45 selects noninferior lower-context arm instead of largest prompt',()=>{
 const arms=[receipt({id:'minimal',quality:.91,tokens:1200,latencyMs:20,retrievalMissRate:.02,privacyScope:.1,contextDigest:SHA256}),receipt({id:'large',quality:.92,tokens:12000,latencyMs:200,retrievalMissRate:.01,privacyScope:.8,contextDigest:'c'.repeat(64)})];
 const r=selectApotheosisContextPolicy({arms,minimumQuality:.8,maxQualityRegression:.02}); assert.equal(r.ok,true); assert.equal(r.selected.id,'minimal');
 const incomplete=selectApotheosisContextPolicy({arms:[arms[0],{...arms[1],observed:false}]}); assert.equal(incomplete.ok,false);
});

test('P43 preserves frontier reserve when evidence-backed cheaper cognition is sufficient',()=>{
 const r=allocateScarceReasoning({task:{id:'t',taskClass:'coding',stakes:.5,uncertainty:.4,failureCost:.4},candidates:[{id:'m3',tier:'M3',quality:.91,reliability:.95,totalCostUsd:.2,latencyMs:1000,availableBudgetUsd:10,callable:true,permitted:true,evidenceBacked:true},{id:'astra',tier:'A5',quality:.96,reliability:.97,totalCostUsd:2,latencyMs:1500,availableBudgetUsd:10,callable:true,permitted:true,evidenceBacked:true}]}); assert.equal(r.ok,true); assert.equal(r.selected.id,'m3'); assert.equal(r.frontierReserved,true);
 const unknown=allocateScarceReasoning({task:{id:'t',taskClass:'coding',stakes:.5,uncertainty:.4,failureCost:.4},candidates:[{id:'astra',tier:'A5',quality:.96,reliability:.97,totalCostUsd:null,latencyMs:1,availableBudgetUsd:10,callable:true,permitted:true,evidenceBacked:true}]}); assert.equal(unknown.ok,false);
});

test('P46 downroutes only on matched complete outcomes with noninferior quality and real savings',()=>{
 const base={routeId:'astra',tier:'A5',taskClass:'coding',preregistered:true,outcomes:[outcome('a',.95,1),outcome('b',.94,1),outcome('c',.96,1)]};
 const cheap={routeId:'m3',tier:'M3',taskClass:'coding',preregistered:true,outcomes:[outcome('a',.94,.2),outcome('b',.93,.2),outcome('c',.95,.2)]};
 const r=evaluateDownroutingPromotion({baseline:base,challenger:cheap,qualityTolerance:.02,minimumCostSavingFraction:.5}); assert.equal(r.ok,true); assert.equal(r.promotionEligible,true);
 const wrong=evaluateDownroutingPromotion({baseline:base,challenger:{...cheap,outcomes:[...cheap.outcomes.slice(0,2),outcome('z',.95,.2)]}}); assert.equal(wrong.ok,false);
});

test('P47 separates saved handoff, resumed fleet, and observed unattended operation',()=>{
 const h=compileApotheosisContinuityHandoff({sourceCommit:SHA40,graphDigest:SHA256,stateDigest:'c'.repeat(64),missionGraphRef:'mission:g',packets:['p44'],workerRouting:['M2'],fileOwnership:['src/a'],testRequirements:['node --test'],integrationOrder:['p44'],knownFailures:[],unresolvedQuestions:[],rollbackRequirements:['revert'],nextWakeTrigger:'worker blocked'}); assert.equal(h.ok,true);
 const saved=classifyApotheosisContinuityEvidence({handoff:h.handoff,currentSourceCommit:SHA40}); assert.equal(saved.evidenceLevel,'HANDOFF_SAVED');
 const worker=receipt({handoffDigest:h.handoff.handoffDigest,frontierModelUsed:false});
 const resumed=classifyApotheosisContinuityEvidence({handoff:h.handoff,currentSourceCommit:SHA40,workerReceipt:worker}); assert.equal(resumed.evidenceLevel,'FLEET_RESUMED');
 const end=Date.now()-1000,start=end-60000;
 const unattended=receipt({handoffDigest:h.handoff.handoffDigest,startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString()});
 const observed=classifyApotheosisContinuityEvidence({handoff:h.handoff,currentSourceCommit:SHA40,workerReceipt:worker,unattendedReceipt:unattended,now:Date.now()}); assert.equal(observed.evidenceLevel,'UNATTENDED_OBSERVED');
 const drift=classifyApotheosisContinuityEvidence({handoff:h.handoff,currentSourceCommit:'d'.repeat(40)}); assert.equal(drift.ok,false);
});

test('P48 compares matched preregistered arms with full coordination and attempt costs',()=>{
 const protocol={preregistered:true,protocolId:'proto-1',populationDigest:SHA256};
 const direct={id:'raw-astra',completeAttemptAccounting:true,frontierTokens:10000,coordinationCostUsd:0,outcomes:[outcome('a',.95,2),outcome('b',.95,2),outcome('c',.95,2)]};
 const fleet={id:'fleet',completeAttemptAccounting:true,frontierTokens:1000,coordinationCostUsd:.3,outcomes:[outcome('a',.96,.3),outcome('b',.95,.3),outcome('c',.97,.3)]};
 const r=compareApotheosisOrchestrationArms({protocol,arms:[direct,fleet]}); assert.equal(r.ok,true); assert.equal(r.champion.id,'fleet'); assert.equal(r.asiInferenceAuthority,'NONE');
 const mismatch=compareApotheosisOrchestrationArms({protocol,arms:[direct,{...fleet,outcomes:[outcome('x',.9,.1),outcome('y',.9,.1),outcome('z',.9,.1)]}]}); assert.equal(mismatch.ok,false);
});

test('P49 requires exact causal admission, observed rollback and independent approval',()=>{
 const comparison={ok:true,status:'APOTHEOSIS_ORCHESTRATION_COMPARISON_READY',protocolId:'p',champion:{id:'candidate'}};
 const r=admitApotheosisOrchestrationPolicy({baselinePolicyId:'base',candidatePolicyId:'candidate',comparison,causalAdmission:{ok:true,baselineId:'base',candidateId:'candidate',independent:true,evidenceRef:'causal:1'},rollbackReceipt:receipt({rehearsed:true}),independentApproval:receipt({candidateId:'candidate',builderRef:'builder',verifierRef:'reviewer'})}); assert.equal(r.ok,true); assert.equal(r.status,'APOTHEOSIS_POLICY_PROMOTION_ELIGIBLE_PROPOSAL_ONLY'); assert.equal(r.proposal.productionMutationPerformed,false);
 const self=admitApotheosisOrchestrationPolicy({baselinePolicyId:'base',candidatePolicyId:'candidate',comparison,causalAdmission:{ok:true,baselineId:'base',candidateId:'candidate',independent:true},rollbackReceipt:receipt({rehearsed:true}),independentApproval:receipt({candidateId:'candidate',builderRef:'same',verifierRef:'same'})}); assert.equal(self.ok,false);
});
