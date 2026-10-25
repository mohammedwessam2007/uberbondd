import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileOmegaMission,screen52,subscriptionPreflight,inventoryOmega,SCHEMA} from '../src/ubermind-all-omega-router.mjs';
const a='sha256:'+'a'.repeat(64),b='sha256:'+'b'.repeat(64),c='sha256:'+'c'.repeat(64);
const task=(id,kind='lookup',dependsOn=[],extra={})=>({id,kind,risk:'low',impact:'read',taskDigest:c,dependsOn,...extra});
const make=(tasks)=>({sourceDigest:a,rubricDigest:b,tasks});
test('0 calls and Opus Crown on an ordinary DAG',()=>{
 const r=compileOmegaMission(make([task('locate'),task('patch','code',['locate'],{impact:'local-write'}),task('accept','synthesis',['patch'],{risk:'critical'})]));
 assert.equal(r.ok,true);assert.equal(r.schema,SCHEMA);assert.equal(r.crown.model,'opus');
 assert.deepEqual(r.routes.map(x=>x.model),['haiku','sonnet','opus']);
 assert.equal(r.actualModelCalls,0);assert.equal(r.actualSubscriptionSavingPercent,null);
 assert.deepEqual(r.executionWaves.map(x=>x.batches[0]),[['locate'],['patch'],['accept']]);
});
test('exact reuse is only a reverify candidate',()=>{
 const r=compileOmegaMission(make([task('reuse','frontier',[],{reuse:{exactEligible:true,taskDigest:c,sourceDigest:a,rubricDigest:b}})]));
 assert.equal(r.routes[0].model,'none');assert.equal(r.routes[0].mustReverify,true);
 assert.equal(r.routes[0].status,'PROPOSED_NOT_EXECUTED');
});
test('stale digest disables exact reuse',()=>{
 const r=compileOmegaMission(make([task('reuse','frontier',[],{reuse:{exactEligible:true,taskDigest:c,sourceDigest:b,rubricDigest:b}})]));
 assert.equal(r.routes[0].model,'opus');assert.equal(r.routes[0].mustReverify,false);
});
test('failed acceptance forces fresh reasoning',()=>{
 const r=compileOmegaMission(make([task('reuse','frontier',[],{acceptanceFailed:true,reuse:{exactEligible:true,taskDigest:c,sourceDigest:a,rubricDigest:b}})]));
 assert.equal(r.routes[0].model,'opus');
});
test('critical lookup upgrades to Opus',()=>{
 const r=compileOmegaMission(make([task('x','lookup',[],{risk:'critical'})]));
 assert.equal(r.routes[0].model,'opus');
});
test('material research upgrades away from Haiku',()=>{
 const r=compileOmegaMission(make([task('x','research',[],{risk:'material'})]));
 assert.equal(r.routes[0].model,'sonnet');
});
test('bounded research uses Haiku',()=>{
 const r=compileOmegaMission(make([task('x','research')]));
 assert.equal(r.routes[0].agent,'ubermind-haiku-researcher');
});
test('frontier reasoning never downgraded',()=>{
 const r=compileOmegaMission(make([task('x','frontier')]));
 assert.equal(r.routes[0].agent,'crown-main-session');
});
test('native never calls model',()=>{
 const r=compileOmegaMission(make([task('x','native')]));
 assert.equal(r.routes[0].model,'none');
});
test('external effect blocked without explicit owner authority',()=>{
 assert.equal(compileOmegaMission(make([task('x','code',[],{impact:'external-effect'})])).ok,false);
});
test('explicit effect remains gated proposal not execution',()=>{
 const r=compileOmegaMission(make([task('x','code',[],{impact:'external-effect',ownerAuthorized:true})]));
 assert.equal(r.ok,true);assert.equal(r.routes[0].needsOwnerGate,true);
 assert.equal(r.modelInvocationAuthority,false);
});
test('reject cycles',()=>{
 const r=compileOmegaMission(make([task('a','lookup',['b']),task('b','code',['a'])]));
 assert.equal(r.reason,'CYCLIC_TASK_DAG');
});
test('reject bad, nonexistent and duplicate dependencies',()=>{
 for(const tasks of [[task('x','lookup',['unknown'])],[task('x','lookup',['x'])],
 [task('x','lookup',['a','a']),task('a')]]) assert.equal(compileOmegaMission(make(tasks)).ok,false);
});
test('reject untrusted/malformed hashes',()=>{
 for(const wrong of ['aaa','sha256:'+'G'.repeat(64),null]){
  assert.equal(compileOmegaMission({...make([task('x')]),sourceDigest:wrong}).ok,false);
 }
});
test('reject invalid mission and agent budget',()=>{
 assert.equal(compileOmegaMission(make([])).ok,false);
 assert.equal(compileOmegaMission(make([task('x')]),{maxParallel:0}).ok,false);
 assert.equal(compileOmegaMission(make([task('x')]),{maxParallel:9}).ok,false);
});
test('parallelism respects dependency levels',()=>{
 const r=compileOmegaMission(make([task('a'),task('b'),task('c'),task('d','code',['a','b'])]),{maxParallel:2});
 assert.deepEqual(r.executionWaves[0].batches,[['a','b'],['c']]);
 assert.deepEqual(r.executionWaves[1].batches,[['d']]);
});
test('no false lower billing claim from different models',()=>{
 const r=compileOmegaMission(make([task('x','lookup')]));
 assert.equal(r.paidApiCalls,0);assert.equal(r.qualityEvidence,'NOT_RUN');
});
test('missing /status confirmation blocks auth',()=>{
 const r=subscriptionPreflight({},{});assert.equal(r.allowed,false);
 assert.equal(r.status,'BLOCKED_USAGE_CREDITS_UNCONFIRMED');
});
test('confirmed owner subscription preflight is NOT real account verification',()=>{
 const r=subscriptionPreflight({}, {usageCreditsDisabled:true,subscriptionStatusConfirmed:true,providerIsClaudeSubscription:true});
 assert.equal(r.allowed,true);assert.equal(r.actualAccountAuthenticationIndependentlyVerified,false);
});
test('API key, token or provider overrides fail closed without printing values',()=>{
 for(const key of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK','GOOGLE_APPLICATION_CREDENTIALS','CLAUDE_CODE_SUBAGENT_MODEL']){
  const r=subscriptionPreflight({[key]:'SECRET_NEVER_PRINT'}, {usageCreditsDisabled:true,subscriptionStatusConfirmed:true,providerIsClaudeSubscription:true});
  assert.equal(r.allowed,false);assert.ok(r.presentVariableNames.includes(key));
  assert.ok(!JSON.stringify(r).includes('SECRET_NEVER_PRINT'));
 }
});
test('billing gate blocks route when provided and unresolved',()=>{
 const r=compileOmegaMission(make([task('x')]),{preflight:subscriptionPreflight({ANTHROPIC_API_KEY:'x'}, {})});
 assert.equal(r.ok,false);
});
test('omega catalog is path based, no made-up artifacts',()=>{
 const r=inventoryOmega(['docs/architecture/UBERMIND_OMEGA_V20_GRAPH.mmd','/etc/passwd','../secrets','docs/PHOENIX.md','src/jev-shadow-route.mjs']);
 assert.deepEqual(r,['docs/PHOENIX.md','docs/architecture/UBERMIND_OMEGA_V20_GRAPH.mmd','src/jev-shadow-route.mjs']);
});
test('52 cards screen with explicit receipt requirement',()=>{
 const cards=JSON.parse(readFileSync(new URL('../config/ubermind-v6-52-operation-registry.json',import.meta.url),'utf8'));
 const s=screen52(cards);assert.equal(s.ok,true);assert.equal(s.total,52);assert.equal(s.actualApplied,0);
 assert.equal(s.coverage[24].status,'R');
 const bad=screen52(cards,{machiavelli:{status:'A'}});assert.equal(bad.ok,false);
 const good=screen52(cards,{machiavelli:{status:'A',operationReceipt:'tested source mapping at commit'}});
 assert.equal(good.actualApplied,1);
});
test('52 registry refuses corrupt or truncated source',()=>{
 const data=JSON.parse(readFileSync(new URL('../config/ubermind-v6-52-operation-registry.json',import.meta.url),'utf8'));
 const x={...data,cards:data.cards.slice(0,51)};
 assert.equal(screen52(x).ok,false);
});