import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { semanticHash as h, canonical, checkCrownClosure, executeBoundedCircuit, verifyBoundedCertificate, invalidatedDescendants, exactObligationKey } from '../src/crown-closure.mjs';
import { InfiniteOpusStore } from '../src/infinite-opus-store.mjs';
import { createInfiniteOpusRuntime, compileCrownPacket } from '../src/infinite-opus-runtime.mjs';
import { compileCognitiveIR, findCommonSemanticSubexpressions } from '../src/frontier-intelligence-vm.mjs';
import { factorFrontierResidualCut } from '../src/frontier-residual-cut.mjs';
import { createGovernedOpenRouterExecutor } from '../src/infinite-opus-provider.mjs';

const now = '2026-09-29T20:00:00.000Z';
function fixture() {
  const common = { taskClass: 'PROVIDER_FACT', inputHash: h({ provider:'test' }), crownRevision: 'synthetic-crown-v1', qualityContract: { claims:'exact', caveats:'mandatory' }, evidenceRef: 'fixture-only://independent-admission', dependencies: { source:h('source-v1') }, expiresAt:'2026-09-30T20:00:00.000Z', invalidators:['revoked'] };
  const price = { ...common, id:'price', kind:'REALITY_FACT', value:120 };
  const caveat = { ...common, id:'caveat', kind:'CROWN_ATOM', value:'Tax unknown' };
  const proof = { nodes:[{id:'p',op:'LOAD_AUTHORIZED',authorityId:'price'},{id:'c',op:'LOAD_AUTHORIZED',authorityId:'caveat'}], roots:{price:'p',caveat:'c'} };
  const contract = { ...common, id:'contract', kind:'OUTPUT_CONTRACT', claimIds:['price','caveat'], proofNodesHash:h(proof.nodes), roots:proof.roots };
  const authorities = {price,caveat};
  const trustPins = Object.fromEntries([price,caveat,contract].map(a=>[a.id,h(a)]));
  const context = { ...common, now, invalidators:{revoked:false} };
  const artifact = { price:120, caveat:'Tax unknown' };
  return { artifact,proof,contract,context,authorities,trustPins };
}
test('exact closure refuses unauthorized surface claims, number edits, missing caveats and forged leaves',()=>{
  const f = fixture(); assert.equal(checkCrownClosure(f).ok,true);
  for (const artifact of [{...f.artifact,extra:'Best provider'}, {...f.artifact,price:121}, {price:120}]) assert.equal(checkCrownClosure({...f,artifact}).ok,false);
  f.authorities.price.value=99; f.artifact.price=99;
  assert.equal(checkCrownClosure(f).ok,false);
});
test('drift, expiry, missing invalidator, historical evidence and Crown succession fail closed',()=>{
  for (const change of [c=>c.dependencies.source=h('v2'),c=>c.crownRevision='new-crown',c=>c.now='2027-01-01',c=>delete c.invalidators.revoked,c=>c.invalidators.revoked=true,c=>c.inputHash=h('another-task')]) {
    const f=fixture(); change(f.context); assert.equal(checkCrownClosure(f).ok,false);
  }
});
test('proof program pin prevents substituting another already-authorized fact or unresolved/cyclic derivation',()=>{
  const f=fixture(); f.proof.nodes[0].authorityId='caveat'; f.artifact.price='Tax unknown';
  assert.equal(checkCrownClosure(f).ok,false);
  for (const nodes of [[{id:'p',op:'IDENTITY',dependencies:['p']}], [{id:'p',op:'IDENTITY',dependencies:['missing']}], [{id:'p',op:'LLM_CONFIDENCE',confidence:1}]]) {
    const g=fixture(); g.proof={nodes,roots:{price:'p',caveat:'p'}}; g.contract.proofNodesHash=h(nodes);g.contract.roots=g.proof.roots;g.trustPins.contract=h(g.contract);
    assert.equal(checkCrownClosure(g).ok,false);
  }
});
test('finite policy enumerates every state and independently recomputes Jev certificates',()=>{
  const f=fixture(), circuit={...f.contract,id:'circuit',kind:'EXHAUSTIVE_POLICY',domain:{novel:[false,true],drift:[false,true]},rows:[]};
  for(const novel of [false,true])for(const drift of [false,true])circuit.rows.push({input:{novel,drift},output:novel||drift?'CROWN':'EXACT'});
  const trustPins={circuit:h(circuit)}, args={circuit,input:{novel:false,drift:false},context:f.context,trustPins};
  const result=executeBoundedCircuit(args);assert.equal(result.decision,'EXACT');assert.equal(verifyBoundedCertificate({...args,...result}).ok,true);
  assert.equal(verifyBoundedCertificate({...args,...result,decision:'CROWN'}).ok,false);
  assert.equal(executeBoundedCircuit({...args,input:{novel:false,drift:false,extra:true}}).ok,false);
  assert.equal(executeBoundedCircuit({...args,input:{novel:'false',drift:false}}).ok,false);
  circuit.rows.pop();trustPins.circuit=h(circuit);assert.equal(executeBoundedCircuit(args).ok,false);
});
function cacheRequest() { return {model:'synthetic',route:'fixture',requestBody:{prompt:'same'},toolSchema:[],systemInstructions:'rules',generationParameters:{temperature:0,seed:null},semanticStateHash:h('state'),dependencyHash:h('deps'),qualityContract:{exact:true},crownRevision:'v1',freshnessClass:'BOUNDED',tenantScope:'test'}; }
test('response cache keys every request field; TTL, LIVE class, rollback clock, and tampering miss',()=>{
  const store=new InfiniteOpusStore();const req=cacheRequest();store.cachePut(req,{answer:1},1000,1000);assert.equal(store.cacheGet(req,1500).status,'HIT');
  for(const k of Object.keys(req))assert.equal(store.cacheGet({...req,[k]:k==='freshnessClass'?'LIVE':{changed:true}},1500).status,'MISS');
  assert.equal(store.cacheGet(req,2000).status,'MISS');assert.equal(store.cacheGet(req,900).status,'MISS');
  store.db.prepare("UPDATE cache SET body=?").run('{"answer":2}');assert.equal(store.cacheGet(req,1500).status,'MISS');store.close();
});
const reservation=(callId,role='WORKER',ceilingMicros=1)=>({callId,day:'2026-09-29',role,ceilingMicros,model:role==='CROWN'?'crown':'worker',provider:'fixture',taskId:callId,qualityClass:'Q_FRONTIER',now,priceExpiresAt:'2026-09-30T00:00:00Z'});
const policy={month:'2026-09',authorizationRef:'fixture-only://authorized',crownRoutes:['fixture:crown']};
test('monthly governor protects escrow, preserves microcharges, allows Crown spend and blocks retries/role spoofing',()=>{
  const s=new InfiniteOpusStore();s.configureMonth(policy);
  assert.equal(s.reserve(reservation('worker','WORKER',15_000_000)).ok,true);
  assert.equal(s.reserve(reservation('escape','WORKER')).ok,false);
  assert.equal(s.reserve({...reservation('spoof','CROWN'),model:'worker'}).ok,false);
  assert.equal(s.reserve(reservation('crown','CROWN',10)).ok,true);
  assert.equal(s.reconcile({callId:'crown',actualMicros:1,receiptRef:'r1'}).ok,true);
  assert.equal(s.summary('2026-09','2026-09-29').monthSpendMicros,1);
  assert.equal(s.reserve(reservation('crown','CROWN')).ok,false);
  assert.equal(s.reconcile({callId:'crown',actualMicros:1,receiptRef:'r1'}).status,'ALREADY_SETTLED');
  assert.equal(s.reconcile({callId:'crown',actualMicros:2,receiptRef:'r2'}).ok,false);s.close();
});
test('governor survives process restart and cross-connection contention; uncertain charges cannot disappear',()=>{
  const dir=mkdtempSync(join(tmpdir(),'infinite-opus-'));const path=join(dir,'state.sqlite');
  try {let a=new InfiniteOpusStore(path);a.configureMonth(policy);a.reserve(reservation('same'));a.close();
    a=new InfiniteOpusStore(path);const b=new InfiniteOpusStore(path);assert.equal(b.reserve(reservation('same')).ok,false);
    a.reconcile({callId:'same',receiptRef:'uncertain'});assert.equal(b.reserve(reservation('other')).ok,false);
    assert.equal(b.summary('2026-09','2026-09-29').pendingReconciliation,1);
    a.reconcile({callId:'same',actualMicros:0,receiptRef:'confirmed-zero'});assert.equal(b.reserve(reservation('other')).ok,true);a.close();b.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('overrun is fully recorded and trips BLACK; no paid authority or stale prices never dispatch',()=>{
  const s=new InfiniteOpusStore();s.configureMonth(policy);s.reserve(reservation('bad'));
  assert.equal(s.reconcile({callId:'bad',actualMicros:2,receiptRef:'charged'}).status,'PROVIDER_OVERRUN_STOP');
  assert.equal(s.summary('2026-09','2026-09-29').state,'BLACK');assert.equal(s.reserve(reservation('next')).ok,false);s.close();
  const t=new InfiniteOpusStore();t.configureMonth({month:'2026-09'});assert.equal(t.reserve(reservation('no-auth')).ok,false);t.close();
  const u=new InfiniteOpusStore();u.configureMonth(policy);assert.equal(u.reserve({...reservation('stale'),priceExpiresAt:now}).ok,false);u.close();
});
test('exact demand multicast does not merge changed dependencies, quality, Crown or input; unknown stakes escalate',()=>{
  const s=new InfiniteOpusStore(), task={taskClass:'PROVIDER_FACT',crownRevision:'v1',inputHash:h('input'),dependencies:{a:h('a')},qualityContract:{exact:true},contractHash:h('contract'),applicability:{domain:'bounded'},invalidators:{revoked:false},freshnessClass:'BOUNDED'};
  const consumer=id=>({consumerId:id,deadline:'2026-09-30',stakes:'KNOWN_LOW'});
  assert.equal(s.demand(task,consumer('a')).consumerCount,1);assert.equal(s.demand(task,consumer('b')).consumerCount,2);
  for(const key of ['dependencies','qualityContract','crownRevision','inputHash'])assert.notEqual(exactObligationKey({...task,[key]:key==='inputHash'?h('new'):key==='crownRevision'?'v2':{different:true}}),exactObligationKey(task));
  assert.equal(s.demand(task,{...consumer('c'),stakes:'UNKNOWN'}).mandatoryReview,true);
  assert.equal(s.demand({...task,inputHash:h('different')},consumer('a')).ok,false);s.close();
});
test('immutable capital cannot rewrite history; invalidation recomputes only dependency descendants',()=>{
  const s=new InfiniteOpusStore();const asset={id:'failure',kind:'NEGATIVE_KNOWLEDGE',reason:'confidence is not proof'};assert.equal(s.putCapital(asset).ok,true);assert.equal(s.putCapital({...asset,reason:'new truth'}).ok,false);s.close();
  assert.deepEqual(invalidatedDescendants([{id:'s',dependencies:[]},{id:'a',dependencies:['s']},{id:'b',dependencies:['a']},{id:'other',dependencies:[]}],['s']),{affectedIds:['a','b','s'],recomputeFraction:0.75});
});
test('exact runtime rechecks cached proofs and queues poison/unknown; idle tick buys no inference',()=>{
  const f=fixture(),s=new InfiniteOpusStore(),runtime=createInfiniteOpusRuntime({store:s,authorities:f.authorities,trustPins:f.trustPins,contracts:{[h(f.contract)]:f.contract},clock:()=>Date.parse(now)});
  assert.equal(runtime.tick(null).status,'SLEEP');
  const task={taskClass:f.context.taskClass,crownRevision:f.context.crownRevision,inputHash:f.context.inputHash,dependencies:f.context.dependencies,qualityContract:f.context.qualityContract,contractHash:h(f.contract),applicability:{domain:'one-provider'},invalidators:f.context.invalidators,freshnessClass:'BOUNDED'};
  const event={type:'STRUCTURED_ARTIFACT',task,context:f.context,consumer:{consumerId:'first',deadline:'2026-09-30',stakes:'KNOWN_LOW'},artifact:f.artifact,proof:f.proof,cacheTtlMs:1000};
  event.cacheRequest={...cacheRequest(),semanticStateHash:exactObligationKey(task),dependencyHash:h(f.context.dependencies),qualityContract:f.context.qualityContract,crownRevision:f.context.crownRevision};
  assert.equal(runtime.tick(event).ok,true);assert.equal(runtime.tick({...event,consumer:{...event.consumer,consumerId:'second'}}).cacheStatus,'HIT');
  s.cachePut(event.cacheRequest,{artifact:{...f.artifact,price:999},proof:f.proof},Date.parse(now),1000);
  assert.equal(runtime.tick(event).status,'CROWN_PAGE_FAULT');assert.equal(runtime.tick(event).providerCalls,0);s.close();
});
test('sticky Crown packet isolates immutable prefix; changing delta preserves locality but model changes do not',()=>{
  const args={immutablePrefix:{quality:'zero-regression',tools:[]},mutableDelta:{task:1},model:'crown',route:'one'};
  const a=compileCrownPacket(args);assert.equal(a.sessionId,compileCrownPacket({...args,mutableDelta:{task:2}}).sessionId);
  assert.notEqual(a.sessionId,compileCrownPacket({...args,model:'other'}).sessionId);
});
test('semantic CSE never aliases a different operation, dependency or side effect',()=>{
  const base={semanticIdentity:'same words',operation:'LOAD',requiredQualityType:'Q_EXACT',sourceStateDigest:h('s')};
  for(const variation of [{operation:'DELETE'},{sideEffectClass:'CUSTOMER_MESSAGE'},{metadata:{different:true}}]){
    const program=compileCognitiveIR({programId:'p',taskClass:'test',nodes:[{...base,nodeId:'a'},{...base,...variation,nodeId:'b'}]}).program;
    assert.equal(findCommonSemanticSubexpressions({program}).eliminatedCandidateCount,0);
  }
});
test('canonical hashing preserves array order and refuses sparse or non-JSON input',()=>{
  assert.equal(h({b:2,a:1}),h({a:1,b:2}));assert.notEqual(h([1,2]),h([2,1]));
  for(const value of [undefined,NaN,-0,new Date(),new Array(2)])assert.throws(()=>canonical(value));
});
test('residual-cut prototype coalesces exact missing leaves across distinct programs while preserving separate roots',()=>{
  const obligation={taskClass:'FACT',crownRevision:'v1',inputHash:h('leaf'),dependencies:{s:h('s')},qualityContract:{exact:true},contractHash:h('c'),applicability:{domain:'one'},invalidators:{revoked:false},freshnessClass:'BOUNDED'};
  const program=(id,ob=obligation)=>({id,roots:['artifact'],nodes:[{id:'fact',resolved:false,obligation:ob},{id:'artifact',resolved:false,dependencies:['fact']}]});
  const result=factorFrontierResidualCut(Array.from({length:1000},(_,i)=>program('program-'+i)));
  assert.equal(result.uniqueResidualObligations,1);assert.equal(result.totalRootObligations,1000);assert.equal(result.adjudicationsPerformed,0);
  assert.equal(factorFrontierResidualCut([program('a'),program('b',{...obligation,dependencies:{s:h('changed')}})]).uniqueResidualObligations,2);
  assert.throws(()=>factorFrontierResidualCut([{id:'bad',roots:['a'],nodes:[{id:'a',resolved:false,dependencies:['a']}]}]));
});
test('governed provider performs no dispatch without authority and retains uncertain billing; observed microcost settles',async()=>{
  const s=new InfiniteOpusStore();s.configureMonth({...policy,crownRoutes:['openrouter:synthetic']});
  const price={model:'synthetic',provider:'openrouter',sourceRef:'fixture://prices',verifiedAt:'2026-09-29T10:00:00Z',expiresAt:'2026-09-30T10:00:00Z',inputUsdPerMillion:0.1,outputUsdPerMillion:0.2};
  let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify({id:'fixture-call',model:'synthetic',usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20,cost:0.000003},choices:[{message:{content:'{"status":"OK"}'}}]})};};
  const args={store:s,enabled:true,role:'CROWN',pricingRecord:price,apiKey:'synthetic-test-only-key',fetchImpl};
  const task={taskId:'t',objective:'test',consequenceClass:'LOCAL_PREPARATION'};
  assert.equal((await createGovernedOpenRouterExecutor({...args,enabled:false})({task,callId:'off',maxTokens:20,now})).providerCalls,0);assert.equal(calls,0);
  const out=await createGovernedOpenRouterExecutor(args)({task,callId:'one',maxTokens:20,now});assert.equal(out.ok,true);assert.equal(s.summary('2026-09',now.slice(0,10)).monthSpendMicros,4);
  assert.equal((await createGovernedOpenRouterExecutor(args)({task,callId:'duplicate-new-id',maxTokens:20,now})).providerCalls,0);
  const uncertain=await createGovernedOpenRouterExecutor({...args,fetchImpl:async()=>{throw new Error('network-down');}})({task:{...task,taskId:'t2'},callId:'two',maxTokens:20,now});assert.equal(uncertain.costAccounting,'UNCERTAIN_HOLD_RESERVATION');
  assert.equal((await createGovernedOpenRouterExecutor(args)({task:{...task,taskId:'t3'},callId:'three',maxTokens:20,now})).providerCalls,0);assert.equal(calls,1);s.close();
});
