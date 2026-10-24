import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOmega42AgentTree as compile,renderOmega42AgentTreeHtml as render} from '../src/ubermind-omega42-agent-tree-console.mjs';
const A='sha256:'+'a'.repeat(64),B='sha256:'+'b'.repeat(64),C='sha256:'+'c'.repeat(64),D='sha256:'+'d'.repeat(64);
const contract={taskDigest:A,sourceDigest:B,rubricDigest:C};
const head='f'.repeat(40);
const receipt={executionOrigin:'LOCAL_NODE_CHILD_PROCESS',checkoutCommit:head,total:36,pass:36,fail:0,testSourceDigest:D,receiptDigest:A,testFiles:['tests/thing.test.mjs']};

test('normal task stays single-lead, all model calls unobserved, no spend authorized',()=>{
 const p=compile({contract});assert.equal(p.ok,true);assert.equal(p.status,'ARCHITECTURE_ONLY__NO_LIVE_AGENT_PROOF');
 assert.equal(p.teamEligible,false);assert.equal(p.roles.find(x=>x.role==='LEAD').assignment,'SONNET / MEDIUM');
 assert.equal(p.paidModelCalls,0);assert.equal(p.qualityAccepted,false);assert.equal(p.actualSubscriptionUsage,'UNKNOWN');
 assert.equal(p.productionMerged,false);assert.equal(p.realTokenThroughputMeasured,false);
});
test('frontier reasoning does not auto-downgrade or spawn fake Opus advisor',()=>{
 const p=compile({contract:{...contract,novelty:'frontier'}});assert.equal(p.ok,true);
 assert.equal(p.roles.find(x=>x.role==='LEAD').assignment,'OPUS / HIGH');
 assert.equal(p.roles.filter(x=>x.role==='ubermind-opus-frontier-judge').length,0);
});
test('scout and falsifier remain optional and not invoked',()=>{
 const scout={leadContextTokensAvoided:30000,fullScoutInputTokens:10000,scoutOutputTokens:500,readOnly:true,needed:true};
 const p=compile({contract:{...contract,scout,nativeAcceptanceStatus:'failed'}});
 const optional=p.roles.filter(x=>x.role.includes('ubermind-'));
 assert.deepEqual(optional.map(x=>x.role),['ubermind-haiku-scout','ubermind-sonnet-falsifier']);
 assert.ok(optional.every(x=>x.status==='OPTIONAL_NOT_INVOKED'));
});
test('permission failures from W40 refuse with zero provider authority',()=>{
 const p=compile({contract:{...contract,operation:'side-effect'}});
 assert.equal(p.ok,false);assert.equal(p.externalEffectAuthority,'NONE');assert.equal(p.modelCalls,0);
});
test('a fake execution score or model cost in input cannot become observed truth',()=>{
 const p=compile({contract:{...contract,forgeRuntimeSuccess:true,forkCount:1734,priceUsd:0.14,tokenSpeed:340}});
 assert.equal(p.realAgentParallelismMeasured,false);assert.equal(p.realTokenThroughputMeasured,false);
 assert.equal(p.actualAgentInvocations,0);assert.equal(p.qualityAccepted,false);
});
test('missing checkout or unclean checkout cannot convert claimed tests to verified',()=>{
 for(const checkout of [null,{head,clean:false},{head:'a'.repeat(40),clean:true}]){
  const p=compile({contract,nativeTestEvidence:receipt,checkout});assert.equal(p.ok,true);
  assert.equal(p.status,'ARCHITECTURE_ONLY__NO_LIVE_AGENT_PROOF');
  assert.equal(p.nativeTestEvidence,null);
 }
});
test('a well-shaped external claim still never confers model execution/accepted quality',()=>{
 const p=compile({contract,nativeTestEvidence:receipt,checkout:{head,clean:true}});
 assert.equal(p.ok,true);assert.equal(p.status,'REPORTED_SELECTED_LOCAL_TESTS__MODEL_EXECUTION_UNOBSERVED');
 assert.equal(p.nativeTestEvidenceAuthenticated,false);
 assert.equal(p.qualityAccepted,false);assert.equal(p.productionMerged,false);
 assert.equal(p.nativeTestEvidence.pass,36);
});
test('rejected marker and out-of-bounds tests fail closed',()=>{
 for(const e of [{...receipt,executionOrigin:'REMOTE_CI'}, {...receipt,pass:37}, {...receipt,receiptDigest:'no'}, {...receipt,total:-1}, {...receipt,checkoutCommit:'dead'}, {...receipt,testFiles:[]},[]]){
  const p=compile({contract,nativeTestEvidence:e,checkout:{head,clean:true}});
  assert.equal(p.ok,false);assert.equal(p.status,'REFUSED');
 }
});
test('HTML is offline, escapes tampered stage data, and never includes third-party JS',()=>{
 const p=compile({contract});const h=render({...p,roles:[{role:'<img src=x onerror=alert(1)>',assignment:'<script>alert(2)</script>',status:'READY'}]});
 assert.ok(h.includes('&lt;script&gt;alert(2)&lt;/script&gt;'));
 assert.ok(!h.includes('<script>alert(2)</script>'));
 assert.match(h,/content="width=device-width,initial-scale=1"/);
 assert.ok(!h.includes('src="http'));
 assert.match(h,/proof|Evidence-first/i);
});
test('digest stable for same task; changed safety gate changes digest',()=>{
 const a=compile({contract});const b=compile({contract});const c=compile({contract:{...contract,novelty:'complex'}});
 assert.equal(a.reportDigest,b.reportDigest);assert.notEqual(a.reportDigest,c.reportDigest);
});
test('unrecognized contract and malformed checkout refuse',()=>{
 for(const args of [{},{contract:[]},{contract:{...contract,taskDigest:'bad'}}, {contract,checkout:{head:'bad',clean:true}}]){
  assert.equal(compile(args).ok,false);
 }
});
