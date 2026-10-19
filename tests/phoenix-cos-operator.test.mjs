import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {runPhoenixCosCommand} from '../scripts/phoenix-cos-operator.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function zero(result){
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.externalEffectLedger.providerCalls,0);
  assert.equal(result.externalEffectLedger.messages,0);
  assert.equal(result.externalEffectLedger.deployments,0);
  assert.equal(result.externalEffectLedger.spendCents,0);
}
test('separates native probes, research, and unproven supplier registration',()=>{
  const a=runPhoenixCosCommand(['status']);assert.equal(a.ok,true);zero(a);
  assert.equal(a.native.active,15);assert.equal(a.registeredExternal.count,11);
  assert.equal(a.research.count,1560);
  assert.match(a.research.classification,/NOT_EXECUTABLE/);
  assert.match(a.registeredExternal.classification,/UNPROVEN/);
  const b=runPhoenixCosCommand(['catalog']);zero(b);assert.equal(b.count,15);
  assert.equal(b.capabilities.filter(c=>c.callableThroughCos).length,15);
  assert.ok(b.capabilities.every(c=>c.classification==='ACTIVE_NATIVE_ZERO_EFFECT'));
});
test('native routing is repeatable',()=>{
  const a=runPhoenixCosCommand(['route','minimax strategy']);
  const b=runPhoenixCosCommand(['route','minimax strategy']);
  assert.equal(a.ok,true);assert.equal(a.retrievalDigest,b.retrievalDigest);
  assert.ok(a.candidates.some(c=>c.atomId==='strategy.minimax-regret'));zero(a);
});
test('research preserves external authority NONE and exact source universe',()=>{
  const a=runPhoenixCosCommand(['research','reliability','2']);assert.equal(a.ok,true);
  assert.equal(a.research.universe,1560);assert.ok(a.research.matches.length<=2);
  assert.equal(a.research.promotion_authority,'NONE');zero(a);
});
test('execute three real local deterministic functions',()=>{
  const a=runPhoenixCosCommand(['invoke','strategy.minimax-regret',JSON.stringify({
    scenarios:[{id:'s'}],strategies:[{id:'best',outcomes:{s:5}},{id:'worst',outcomes:{s:1}}]})]);
  assert.equal(a.ok,true);assert.equal(a.result.winner.id,'best');zero(a);
  const b=runPhoenixCosCommand(['invoke','proof.compile',JSON.stringify({
    proofs:[{id:'p',kind:'measurement',evidenceRef:'receipt:p',parents:[],sourceClass:'OBSERVED',observed:true}]})]);
  assert.equal(b.ok,true);assert.match(b.result.dagDigest,/^sha256:[a-f0-9]{64}$/);zero(b);
  const c=runPhoenixCosCommand(['invoke','founder.exception-prioritize',JSON.stringify({
    exceptions:[{id:'i',action:'owner official sign-in',humanOnly:true,machineRemediationExhausted:true,
      requiredAuthority:'FOUNDER',evidenceRefs:['receipt:auth'],blockingValue:10,founderMinutes:2}]})]);
  assert.equal(c.ok,true);assert.equal(c.result.queue[0].id,'i');assert.ok(c.result.queue.length<=3);zero(c);
});
test('refuses shell commands, arbitrary code, wrong schemas, untrusted atoms and oversized payloads',()=>{
  const variants=[
    ['invoke','native:unknown','{}'],['invoke','strategy.minimax-regret','process.exit(0)'],
    ['invoke','proof.compile','[]'],['invoke','proof.compile','x'.repeat(12001)],
    ['shell','whoami'],['research','x','200'],['route','x'.repeat(201)],
    ['catalog','unexpected']];
  for(const a of variants){const r=runPhoenixCosCommand(a);assert.equal(r.ok,false);zero(r);}
});
test('works as a real CoS terminal CLI with explicit JSON proof',()=>{
  const out=execFileSync(process.execPath,['scripts/phoenix-cos-operator.mjs','invoke','strategy.minimax-regret',
    JSON.stringify({scenarios:[{id:'s'}],strategies:[{id:'only',outcomes:{s:3}}]})],{cwd:root,encoding:'utf8',timeout:30000});
  const r=JSON.parse(out);assert.equal(r.ok,true);assert.equal(r.result.winner.id,'only');zero(r);
  const denied=spawnSync(process.execPath,['scripts/phoenix-cos-operator.mjs','invoke','unsafe','{}'],{cwd:root,encoding:'utf8'});
  assert.notEqual(denied.status,0);
  assert.equal(JSON.parse(denied.stdout).status,'PHOENIX_COS_REFUSED');
});

test('all 15 first-party native atoms execute via the same guarded gateway',()=>{
  const sample={
    'proof.compile':{proofs:[{id:'a',kind:'measurement',evidenceRef:'receipt:a',parents:[],observed:true,sourceClass:'OBSERVED',verifierRef:'test'}]},
    'proof.route-missing':{requirements:[{id:'source',description:'source proof',proofClass:'SOURCE_INTERNAL',satisfied:true,evidenceRefs:['receipt:source']}]},
    'founder.exception-prioritize':{exceptions:[]},
    'institution.compile-cell':{task:{taskClass:'doctor',requiredCapabilities:['check']},candidates:[{id:'code',executorClass:'DETERMINISTIC_CODE',capabilities:['check'],evidenceRefs:['receipt:code'],verified:true,authority:'NONE',latencyMs:1,costUsd:0,founderMinutes:0}]},
    'strategy.minimax-regret':{scenarios:[{id:'base',status:'ESTIMATED'}],strategies:[{id:'hold',outcomes:{base:0},cost:0,reversible:true}]},
    'authority.revoke-subtree':{grants:[{id:'root',actions:['READ'],expiresAt:'2099-01-01T00:00:00Z'},{id:'child',parentId:'root',actions:['READ'],expiresAt:'2098-01-01T00:00:00Z'}],revokeId:'child',revokedAt:'2026-09-13T00:00:00Z',reason:'test'},
    'world.simulate-counterfactual':{initialState:{population:10,output:5},rules:[{target:'output',source:'population',coefficient:0.1}],steps:2},
    'theory.form-evidence-bound':{observations:[{id:'o1',summary:'output increased',evidenceRefs:['receipt:o1']}],candidateMechanisms:[{id:'m1',statement:'capacity raises output',predicts:['o1']}]},
    'causal.assess-witness':{cause:'x',effect:'y',temporalOrder:true,alternativeExplanations:[],intervention:{design:'RANDOMIZED',controlGroup:true,preRegistered:true},evidenceRefs:['receipt:trial']},
    'evaluator.coevolve':{hypotheses:[{id:'a',features:{value:1},targetRank:0},{id:'b',features:{value:0},targetRank:1}],evaluators:[{id:'e1',weights:{value:1}}],rounds:2},
    'architecture.generate-rivals':{baseline:{router:'current'},changedPrimitives:[{id:'new-router'}],assumptions:[{id:'a1',statement:'current router stays optimal'}]},
    'policy.evolve-generations':{seedPolicies:[{id:'p1',weights:{value:1}}],benchmarkCases:[{winnerId:'a',candidates:[{id:'a',features:{value:1}},{id:'b',features:{value:0}}]}],generations:2},
    'ontology.invent-language':{concepts:[{id:'buyer'},{id:'value'}],relations:[{from:'buyer',relation:'SEEKS',to:'value'}],namespace:'ub'},
    'economy.compile-dsl':{entities:[{id:'buyer',kind:'ACTOR'},{id:'money',kind:'RESOURCE'}],flows:[{from:'buyer',to:'buyer',resource:'money',rate:1}],objectives:[{metric:'surplus',direction:'MAXIMIZE',weight:1}]},
    'company.compile-genome':{company:{id:'c',buyer:'buyer',problem:'problem',mechanism:'mechanism',value:'value',distribution:'distribution',revenue:'revenue',delivery:'delivery',capabilities:['x'],dependencies:[]}}
  };
  const catalog=runPhoenixCosCommand(['catalog']);
  const ids=catalog.capabilities.map(c=>c.atomId);
  assert.deepEqual([...ids].sort(),Object.keys(sample).sort());
  for(const atomId of ids){
    const result=runPhoenixCosCommand(['invoke',atomId,JSON.stringify(sample[atomId])]);
    assert.equal(result.ok,true,atomId+' '+JSON.stringify(result).slice(0,500));
    assert.equal(result.atomId,atomId);
    zero(result);
  }
});
