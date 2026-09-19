import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shadowRouteMechanism } from '../src/system-one-routing-shadow.mjs';
import { recordSemanticOutcome, summarizeSemanticCalibration } from '../src/semantic-shadow-ledger.mjs';

test('plan-only mechanism routing never calls provider or changes canonical route',async()=>{
  let calls=0;
  const result=await shadowRouteMechanism({
    task:{summary:'classify a bounded event'},
    canonicalRoute:{workerId:'frontier-a'},
    decisionAdapter:{evaluate:async()=>{calls++;return{ok:false}}},
    execute:false
  });
  assert.equal(result.ok,true);
  assert.equal(calls,0);
  assert.equal(result.routingAuthority,'NONE');
});

test('shadow mechanism routing records only digests and normalized registers',async()=>{
  const runtimeRoot=fs.mkdtempSync(path.join(os.tmpdir(),'semantic-ledger-'));
  const adapter={evaluate:async()=>({
    ok:true,
    provider:'typesafe-direct',
    requestedModel:'jev-latest',
    observedModel:'jev-test',
    requestDigest:'sha256:'+('a'.repeat(64)),
    latencyMs:50,
    usage:{inputTokens:100,outputTokens:0,costUsd:0.0000042,costCents:0.00042},
    pricingEvidence:{},
    answers:{
      deterministicSufficient:{type:'noul',probability:0.1,confidence:0.8},
      minimumMechanism:{type:'choice',choice:'systemOne',confidence:0.9,probabilities:{deterministic:0.05,systemOne:0.9,frontier:0.05}},
      cognitiveValue:{type:'score',score:1,confidence:0.85,probabilities:{'0':0.1,'1':0.7,'2':0.1,'3':0.05,'4':0.05}}
    },
    externalEffectLedger:{providerCalls:1,spendCents:0.00042}
  })};
  const result=await shadowRouteMechanism({
    task:{summary:'synthetic routing task'},
    taskClass:'ROUTING',
    canonicalRoute:{workerId:'frontier-a'},
    decisionAdapter:adapter,
    runtimeRoot,
    execute:true,
    providerCallAuthorized:true,
    spendCeilingUsd:0.001,
    dataClass:'INTERNAL_NON_SENSITIVE'
  });
  assert.equal(result.ok,true);
  assert.equal(result.shadowRecommendation,'systemOne');
  assert.equal(result.canonicalRouteChanged,false);
  assert.match(result.observationId,/^semobs_/);
  const log=fs.readFileSync(path.join(runtimeRoot,'artifacts','system-one','shadow-observations.jsonl'),'utf8');
  assert.equal(log.includes('synthetic routing task'),false);
  recordSemanticOutcome({runtimeRoot,observationId:result.observationId,correct:true,evidenceRefs:['receipt:test']});
  const summary=summarizeSemanticCalibration({runtimeRoot,taskClass:'ROUTING'});
  assert.equal(summary.count,1);
  assert.equal(summary.accuracy,1);
  fs.rmSync(runtimeRoot,{recursive:true,force:true});
});
