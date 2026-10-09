import test from 'node:test';
import assert from 'node:assert/strict';
import {compileUberMindTaskRoute as route}
 from '../src/ubermind-w40-evidence-first-task-compiler.mjs';

const A='sha256:'+'a'.repeat(64),B='sha256:'+'b'.repeat(64),C='sha256:'+'c'.repeat(64);
const contract={taskDigest:A,sourceDigest:B,rubricDigest:C};
const proof={...contract,exactEligible:true};
const scope={leadContextTokensAvoided:25000,fullScoutInputTokens:12000,
 scoutOutputTokens:1500,readOnly:true,needed:true};

test('W40 ordinary tasks start one capable Sonnet without unnecessary agents',()=>{
 const r=route(contract);
 assert.equal(r.ok,true);assert.equal(r.main.model,'sonnet');
 assert.equal(r.main.effort,'medium');assert.equal(r.delegates.length,0);
 assert.equal(r.teamEligible,false);
 assert.equal(r.actualProUsagePercent,null);
});
test('W40 already matched exact certificate does NOT claim success and requires real reverify',()=>{
 const r=route({...contract,sourceReplay:proof});
 assert.equal(r.exactNativeReplayCandidate,true);
 assert.equal(r.main.model,'none');
 assert.equal(r.requiredAction,'REVERIFY_BEFORE_ANY_REPLAY');
 assert.equal(r.taskCompleted,false);
 assert.equal(r.proofAuthenticityVerified,false);
 assert.ok(r.gates.includes('RUN_EXISTING_SOURCE_VERIFIER_AGAINST_LIVE_CHECKOUT'));
 assert.equal(r.delegates.length,0);
});
test('W40 one source digest mismatch invalidates replay; no silent stale proof',()=>{
 const r=route({...contract,sourceReplay:{...proof,sourceDigest:A}});
 assert.equal(r.exactNativeReplayCandidate,false);
 assert.equal(r.main.model,'sonnet');
});
test('W40 rubric mismatch invalidates source reuse even with matching task sha',()=>{
 const r=route({...contract,sourceReplay:{...proof,rubricDigest:B}});
 assert.equal(r.exactNativeReplayCandidate,false);
});
test('W40 frontier tasks go straight to Opus, not two lead models',()=>{
 const r=route({...contract,novelty:'frontier'});
 assert.equal(r.main.model,'opus');assert.equal(r.main.effort,'high');
 assert.equal(r.requiredAction,'DIRECT_OPUS_PRIMARY_NO_PRELIMINARY_SONNET');
 assert.equal(r.delegates.length,0);
});
test('W40 critical task retains Opus even if novelty routine',()=>{
 const r=route({...contract,risk:'critical'});
 assert.equal(r.main.model,'opus');
 assert.ok(r.gates.includes('REQUIRE_STRONG_INDEPENDENT_ACCEPTANCE_AND_OWNER_EFFECT_GATE'));
});
test('W40 missing frontier model holds quality instead of downgrading',()=>{
 const r=route({...contract,novelty:'frontier',opusAvailable:false});
 assert.equal(r.ok,false);assert.equal(r.status,'W40_QUALITY_HOLD_NO_OPUS');
 assert.equal(r.requiredModel,'opus');
});
test('W40 medium-complex task uses Sonnet high, not automatic Opus',()=>{
 const r=route({...contract,novelty:'complex'});
 assert.equal(r.main.model,'sonnet');
 assert.equal(r.main.effort,'high');
});
test('W40 Haiku only on positive context-volume margin and read-only scope',()=>{
 const yes=route({...contract,scout:scope});
 assert.deepEqual(yes.delegates.map(x=>x.name),['ubermind-haiku-scout']);
 assert.equal(yes.delegates[0].effort,'low');
 assert.equal(yes.delegates[0].maxTurns,6);
 for(const scout of [
  {...scope,leadContextTokensAvoided:1000},
  {...scope,readOnly:false},
  {...scope,needed:false},
  {...scope,leadContextTokensAvoided:13500}
 ])assert.equal(route({...contract,scout}).delegates.length,0);
});
test('W40 no Haiku scout for a side-effect mission',()=>{
 const r=route({...contract,operation:'side-effect',
  authorization:'EXPLICIT_OWNER',scout:scope});
 assert.equal(r.ok,true);assert.equal(r.delegates.length,0);
 assert.equal(r.productionEffectAuthorized,false);
});
test('W40 side effects without owner authority are blocked before model',()=>{
 const r=route({...contract,operation:'side-effect'});
 assert.equal(r.ok,false);assert.equal(r.status,'W40_OWNER_AUTHORITY_HOLD');
 assert.equal(r.providerCalls,0);
});
test('W40 material or failed quality risk summons bounded read-only falsifier',()=>{
 const r=route({...contract,risk:'material',nativeAcceptanceStatus:'inconclusive'});
 assert.equal(r.main.model,'sonnet');assert.equal(r.main.effort,'high');
 assert.equal(r.delegates[0].name,'ubermind-sonnet-falsifier');
 assert.equal(r.delegates[0].maxTurns,6);
 assert.equal(r.delegates[0].effort,'high');
 const f=route({...contract,knownAcceptanceFailure:true});
 assert.equal(f.delegates[0].name,'ubermind-sonnet-falsifier');
});
test('W40 risk by itself does not force an unnecessary falsifier before tests',()=>{
 const r=route({...contract,risk:'material',nativeAcceptanceStatus:'not-run'});
 assert.equal(r.delegates.length,0);
 assert.ok(r.gates.includes('RECOMPILE_AFTER_NATIVE_TESTS_BEFORE_OPTIONAL_FALSIFIER'));
});
test('W40 passed native checks suppresses optional falsifier unless independent failure remains',()=>{
 const r=route({...contract,risk:'material',nativeAcceptanceStatus:'passed'});
 assert.equal(r.delegates.length,0);
 const exception=route({...contract,risk:'material',nativeAcceptanceStatus:'passed',
  knownAcceptanceFailure:true});
 assert.equal(exception.delegates[0].name,'ubermind-sonnet-falsifier');
});
test('W40 native failed tests trigger falsifier even on otherwise routine task',()=>{
 const r=route({...contract,nativeAcceptanceStatus:'failed'});
 assert.equal(r.delegates[0].name,'ubermind-sonnet-falsifier');
});
test('W40 no duplicate extra Opus judge on Opus primary mission',()=>{
 const r=route({...contract,unresolvedFrontierContradiction:true});
 assert.equal(r.main.model,'opus');
 assert.equal(r.delegates.filter(x=>x.model==='opus').length,0);
});
test('W40 no parallel agents merely because tasks can be split',()=>{
 const r=route({...contract,independentSubtasks:4,disjointWorktrees:true});
 assert.equal(r.teamEligible,false);assert.equal(r.teamMaximumInitialPeers,0);
});
test('W40 2-peer team needs ownership separation AND matched economics-quality receipts',()=>{
 const options={...contract,independentSubtasks:3,disjointWorktrees:true,
  matchedTeamEvidence:true};
 const r=route(options);
 assert.equal(r.teamEligible,true);
 assert.equal(r.teamMaximumInitialPeers,2);
 assert.ok(r.gates.includes('OPTIONAL_TEAM_UP_TO_TWO_INITIAL_PEERS_ONLY_IF_RECEIPTED_NET_BENEFIT'));
 assert.equal(route({...options,risk:'critical'}).teamEligible,false);
 assert.equal(route({...options,disjointWorktrees:false}).teamEligible,false);
 assert.equal(route({...options,matchedTeamEvidence:false}).teamEligible,false);
});
test('W40 invalid hashes, risk, scout cost and bogus certificate reject',()=>{
 for(const arg of [
  {...contract,sourceDigest:'deadbeef'},
  {...contract,risk:'unbounded'},
  {...contract,independentSubtasks:-1},
  {...contract,sourceReplay:{exactEligible:true}},
  {...contract,scout:{...scope,scoutOutputTokens:-1}},
  {...contract,authorization:'silent'},
  {...contract,nativeAcceptanceStatus:'passed-unverified'}
 ])assert.equal(route(arg).ok,false);
});
test('W40 no claimed quality, quota metrics, paid access, or deployment effects',()=>{
 for(const arg of [contract,{...contract,novelty:'frontier'},
   {...contract,sourceReplay:proof}]){
  const r=route(arg);assert.equal(r.ok,true);
  assert.equal(r.qualityProven,false);assert.equal(r.actualProUsagePercent,null);
  assert.equal(r.providerCalls,0);assert.equal(r.paidApiUsdAuthorized,0);
  assert.equal(r.productionEffectAuthorized,false);
 }
});
