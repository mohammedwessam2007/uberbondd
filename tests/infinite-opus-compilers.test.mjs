import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash, semanticProgramHash, createSemanticClosureChecker } from '../src/semantic-closure-kernel.mjs';
import { compileInfiniteOpusMarket, selectCurrentPrice } from '../src/infinite-opus-market.mjs';
import { compileExactVerifier, solveFiniteSpecification, verifyFiniteSolution, executeCognitiveBytecode, executeTypedTaskCompiler } from '../src/infinite-opus-task-compilers.mjs';
import { factorFrontierResidualCut } from '../src/frontier-residual-cut.mjs';

const now = Date.parse('2026-09-29T21:00:00Z');
const catalog = () => ({ data: [{ id:'fixture/model', canonical_slug:'fixture-r1', pricing:{prompt:'0.000002',completion:'0.00001',input_cache_write:'0.0000025',overrides:[{min_prompt_tokens:272000,prompt:'0.000004',completion:'0.000015'}]}, context_length:1000000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text','image']} }] });
test('market refresh preserves revisions, tier prices, expiry and callability uncertainty', () => {
  const snapshot = compileInfiniteOpusMarket(catalog(), { verifiedAt:new Date(now).toISOString() });
  const row = selectCurrentPrice(snapshot,'fixture/model',now);
  assert.equal(row.inputUsdPerMillion,2); assert.equal(row.priceOverrides[0].outputUsdPerMillion,15);
  assert.equal(row.callableOnOwnerAccount,'UNKNOWN'); assert.equal(row.semanticAuthority,'NONE');
  assert.throws(() => selectCurrentPrice(snapshot,'fixture/model',now+86400000));
  assert.throws(() => selectCurrentPrice(snapshot,'fixture/model',now-1));
});
test('dynamic and missing prices cannot become paid routes; duplicate catalog identities rejected', () => {
  for (const pricing of [{prompt:'-1',completion:'-1'},{}]) {
    const body=catalog();body.data[0].pricing=pricing;
    assert.throws(() => selectCurrentPrice(compileInfiniteOpusMarket(body,{verifiedAt:new Date(now).toISOString()}),'fixture/model',now));
  }
  const body=catalog();body.data.push(body.data[0]);
  assert.throws(() => compileInfiniteOpusMarket(body,{verifiedAt:new Date(now).toISOString()}));
});
test('exact verifier never accepts added claims, altered numbers, dropped caveats or prose', () => {
  const verifier=compileExactVerifier({price:10,caveat:'Uncertain tax'});
  assert.equal(verifier.verify({caveat:'Uncertain tax',price:10}).ok,true);
  for(const candidate of [{price:11,caveat:'Uncertain tax'},{price:10},{price:10,caveat:'Uncertain tax',best:true},'same meaning']) assert.equal(verifier.verify(candidate).ok,false);
});
test('finite solver exhaustively settles a pinned typed specification and rejects ambiguous translations', () => {
  const spec={domain:[{x:0},{x:1},{x:2}],admissibleHashes:[semanticHash({x:2})]};
  const result=solveFiniteSpecification(spec);
  assert.deepEqual(result.result,{x:2}); assert.equal(verifyFiniteSolution(spec,result).ok,true);
  assert.equal(verifyFiniteSolution(spec,{...result,result:{x:1}}).ok,false);
  assert.equal(solveFiniteSpecification({...spec,admissibleHashes:[]}).status,'UNSAT_EXHAUSTIVE');
  for(const change of [{domain:[{x:0},{x:0}]},{admissibleHashes:[semanticHash({x:3})]},{objective:'CHEAP_MODEL_DECIDES'}]) assert.throws(() => solveFiniteSpecification({...spec,...change}));
});
test('bytecode preserves pinned program and exact composition; illegal or ambiguous operations fault', () => {
  const instructions=[{opcode:'SUM_INTEGER',registers:[0,1]},{opcode:'IDENTITY',registers:[2]}];
  const args={instructions,inputs:[10,20],programHash:semanticHash(instructions)};
  assert.equal(executeCognitiveBytecode(args).value,30);
  assert.throws(() => executeCognitiveBytecode({...args,programHash:semanticHash('other')}));
  assert.throws(() => executeCognitiveBytecode({...args,inputs:[10,'20']}));
  const illegal=[{opcode:'EXEC_TOOL',registers:[]}];
  assert.throws(() => executeCognitiveBytecode({...args,instructions:illegal,programHash:semanticHash(illegal)}));
});
test('typed task compilers execute real recurring substrates; unknown/schema drift faults', () => {
  const task={schemaVersion:'uberbond.exact-task.v1',sideEffectClass:'NONE',taskClass:'BUSINESS_EXACT_INTEGER_TOTAL',payload:{values:[1,2,3]}};
  assert.equal(executeTypedTaskCompiler(task).total,6);
  assert.throws(() => executeTypedTaskCompiler({...task,taskClass:'NEW_STRATEGY'}));
  assert.throws(() => executeTypedTaskCompiler({...task,schemaVersion:'v2'}));
  assert.throws(() => executeTypedTaskCompiler({...task,sideEffectClass:'SEND_EMAIL'}));
});
test('already-authorized fact substitution fails the independently pinned native proof program', () => {
  const h=semanticHash('fixture'), base={kind:'REALITY',status:'ACTIVE',scope:'fixture',qualityContractHash:h,sourceHashes:{s:h},invalidators:[],evidenceRef:'fixture://only',verifiedAt:'2026-09-29T20:00:00Z',expiresAt:'2026-09-30T00:00:00Z'};
  const records=[{...base,id:'price',value:10},{...base,id:'quantity',value:20}];
  const artifact={scope:'fixture',qualityContractHash:h,nodes:[{id:'n',kind:'REALITY',value:10,authorityId:'price',dependencies:[]}],claims:[{id:'price',nodeId:'n',value:10}]};
  const context={scope:'fixture',crownRevision:'fixture-r1',qualityContractHash:h,sourceHashes:{s:h},invalidators:{},requiredClaimIds:['price'],authorizedProgramHash:semanticProgramHash(artifact)};
  const check=createSemanticClosureChecker({authorityRecords:records});
  assert.equal(check({artifact,context,now}).ok,true);
  artifact.nodes[0].authorityId='quantity';artifact.nodes[0].value=20;artifact.claims[0].value=20;
  assert.equal(check({artifact,context,now}).ok,false);
});
test('residual-cut falsifiers reject hidden resolved cycles, missing nodes and duplicate roots', () => {
  for(const program of [
    {id:'p',roots:['a'],nodes:[{id:'a',resolved:true,dependencies:['a']}]},
    {id:'p',roots:['a'],nodes:[{id:'a',resolved:true,dependencies:['missing']}]},
    {id:'p',roots:['a','a'],nodes:[{id:'a',resolved:true}]}
  ]) assert.throws(() => factorFrontierResidualCut([program]));
});

test('typed lead capacity arithmetic remains preparation only and never grants outreach authority',()=>{
 const result=executeTypedTaskCompiler({schemaVersion:'uberbond.exact-task.v1',sideEffectClass:'NONE',taskClass:'LEAD_CAPACITY_ARITHMETIC',payload:{}});
 assert.equal(result.semanticAuthority,'PROPOSAL_ONLY');assert.equal(result.releaseAuthorized,false);
});


test('provider screening exact eliminations do not spend Crown authority',()=>{
 const payload={providerId:'p',observedAt:'2026-09-30T00:00:00Z',sourceStateHash:semanticHash('source'),
   facts:{monthlyMinimumUsd:80,smtp:true,imap:false,incomingReplies:true,byoDomain:true,usableApiOrSmtp:true,unsolicitedOutreachPolicy:'ALLOWED'},maxMonthlyUsd:65};
 const r=executeTypedTaskCompiler({schemaVersion:'uberbond.exact-task.v1',sideEffectClass:'NONE',taskClass:'PROVIDER_SCREENING',payload});
 assert.equal(r.status,'PROVIDER_EXACTLY_ELIMINATED');assert.equal(r.semanticAuthority,'E1_DETERMINISTIC_DERIVATION');
 assert.ok(r.eliminationReasons.includes('MONTHLY_MINIMUM_EXCEEDS_BOUND'));assert.ok(r.eliminationReasons.includes('MISSING_IMAP'));assert.equal(r.crownPacket,null);
});

test('provider screening survivors emit only the unresolved frontier residual',()=>{
 const payload={providerId:'p',observedAt:'2026-09-30T00:00:00Z',sourceStateHash:semanticHash('source'),
   facts:{monthlyMinimumUsd:30,smtp:true,imap:true,incomingReplies:true,byoDomain:true,usableApiOrSmtp:true,unsolicitedOutreachPolicy:'UNKNOWN'},maxMonthlyUsd:65};
 const r=executeTypedTaskCompiler({schemaVersion:'uberbond.exact-task.v1',sideEffectClass:'NONE',taskClass:'PROVIDER_SCREENING',payload});
 assert.equal(r.status,'PROVIDER_SCREENING_FRONTIER_RESIDUAL_READY');assert.equal(r.semanticAuthority,'NONE');assert.equal(r.sideEffectAuthority,'NONE');
 assert.deepEqual(r.unresolvedSemanticLeaves.map(x=>x.id),['cold-outreach-policy','actual-safe-daily-volume','ip-and-rdns-operational-quality','deliverability-reputation','support-reliability']);
 assert.equal(r.crownPacket.providerId,'p');
});

test('provider screening refuses untyped or unpinned evidence',()=>{
 const base={providerId:'p',observedAt:'2026-09-30T00:00:00Z',sourceStateHash:semanticHash('source'),
   facts:{monthlyMinimumUsd:30,smtp:true,imap:true,incomingReplies:true,byoDomain:true,usableApiOrSmtp:true,unsolicitedOutreachPolicy:'ALLOWED'}};
 for(const mutation of [{sourceStateHash:'loose'},{facts:{...base.facts,imap:'yes'}},{facts:{...base.facts,unsolicitedOutreachPolicy:'probably'}}]){
   const r=executeTypedTaskCompiler({schemaVersion:'uberbond.exact-task.v1',sideEffectClass:'NONE',taskClass:'PROVIDER_SCREENING',payload:{...base,...mutation}});
   assert.equal(r.ok,false);
 }
});
