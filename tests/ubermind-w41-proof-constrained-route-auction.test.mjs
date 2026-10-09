import test from 'node:test';
import assert from 'node:assert/strict';
import {auctionUberMindW41 as run} from '../src/ubermind-w41-proof-constrained-route-auction.mjs';
const A='sha256:'+'a'.repeat(64),B='sha256:'+'b'.repeat(64),C='sha256:'+'c'.repeat(64),D='sha256:'+'d'.repeat(64);
const unit=(id,cls='routine',input=100000,output=20000,routes=[])=>({
 id,classification:cls,taskDigest:A,sourceDigest:B,rubricDigest:C,
 baselineInputTokens:input,baselineOutputTokens:output,routes
});
const receipt=(changes={})=>({taskDigest:A,sourceDigest:B,rubricDigest:C,
 independentAccepted:true,comparableBaseline:true,
 evidencePointer:'review:independent:batch-a',baselineScore:.95,
 candidateScore:.95,...changes});
const call=(model,inputTokens=100000,outputTokens=20000,changes={})=>({
 model,effort:model==='haiku'?'low':'medium',
 inputTokens,outputTokens,count:1,...changes
});
const offer=(id,kind,calls,changes={})=>({
 id,kind,calls,receipt:receipt(),fullTraceDeclared:true,
 reverifyInLiveCheckout:true,...changes
});
const scenario=()=>{
 const units=[unit('exact','routine',600000,120000,[offer('reuse','exact',[])]),
  unit('frontier','frontier',60000,12000,[]),
  unit('build','scoped',100000,20000,[offer('sonnet','model',[call('sonnet')])])];
 for(let i=0;i<4;i++)units.push(unit('source'+i,'routine',60000,12000,
  [offer('haiku','model',[call('haiku',60000,12000)])]));
 return {units,overheadCalls:[call('sonnet',15000,3000)]};
};
test('W41 exact 7-unit full cost 0.988, 87.65% cut from $8 official API reference',()=>{
 const r=run(scenario());
 assert.equal(r.ok,true);assert.equal(r.units,7);
 assert.equal(r.baselineGeometry.inputTokens,1000000);
 assert.equal(r.baselineGeometry.outputTokens,200000);
 assert.equal(r.allOpusApiEquivalentUsd,8);
 assert.equal(r.modelAndNativeSelectedApiEquivalentUsd,.928);
 assert.equal(r.fullOverheadApiEquivalentUsd,.06);
 assert.equal(r.allInApiEquivalentUsd,.988);
 assert.equal(r.modeledApiEquivalentReductionPercent,87.65);
 assert.equal(r.selectedQualityReceiptsAuthenticated,false);
});
test('W41 frontier reasoning stays full Opus reference',()=>{
 const r=run({units:[unit('hard','frontier',60000,12000,[
   offer('fake-haiku','model',[call('haiku',60000,12000)])])]});
 assert.equal(r.decisions[0].model,'opus');
 assert.equal(r.decisions[0].selectedRoute,'OPUS_REFERENCE');
});
test('W41 absent quality receipt defaults to full Opus rather than degrade',()=>{
 const r=run({units:[unit('a','scoped',100000,20000,[
  offer('cheap','model',[call('sonnet')],{receipt:null})])]});
 assert.equal(r.decisions[0].selectedRoute,'OPUS_REFERENCE');
 assert.equal(r.modeledApiEquivalentReductionPercent,0);
});
test('W41 changed source hash invalidates reuse candidate',()=>{
 const r=run({units:[unit('a','routine',100000,20000,[
  offer('reuse','exact',[],{receipt:receipt({sourceDigest:D})})])]});
 assert.equal(r.decisions[0].selectedRoute,'OPUS_REFERENCE');
});
test('W41 changed rubric or task invalidates reuse candidate',()=>{
 for(const field of ['rubricDigest','taskDigest']){
  const r=run({units:[unit('a','routine',100000,20000,[
    offer('reuse','exact',[],{receipt:receipt({[field]:D})})])]});
  assert.equal(r.decisions[0].selectedRoute,'OPUS_REFERENCE');
 }
});
test('W41 equal-quality condition rejects worse score or no independent acceptance',()=>{
 for(const changes of [{candidateScore:.94},{independentAccepted:false},
  {comparableBaseline:false},{evidencePointer:''}]){
  const r=run({units:[unit('a','routine',100000,20000,[
   offer('cheap','model',[call('haiku',100000,20000)],{receipt:receipt(changes)})])]});
  assert.equal(r.decisions[0].model,'opus',JSON.stringify(changes));
 }
});
test('W41 live reverify required for all native exact candidates',()=>{
 const r=run({units:[unit('a','routine',100000,20000,[
  offer('stale','exact',[],{reverifyInLiveCheckout:false})])]});
 assert.equal(r.decisions[0].model,'opus');
});
test('W41 counts repeated agent calls, not just lead',()=>{
 const r=run({units:[unit('a','scoped',100000,20000,[
  offer('sonnet-plus-peer','model',[
   call('sonnet',100000,20000),
   call('sonnet',50000,10000,{count:3})])])]});
 assert.equal(r.decisions[0].model,'opus'); // full route costs $1.0 > $0.8 Opus
});
test('W41 Haiku per-prompt >100k is five times cost; do not undercharge',()=>{
 const r=run({units:[unit('a','routine',200000,40000,[
  offer('long-haiku','model',[call('haiku',200000,40000)])])]});
 assert.equal(r.decisions[0].selectedApiUsd,.2); // 200k*0.5 + 40k*2.5
});
test('W41 full trace declared is mandatory',()=>{
 const r=run({units:[unit('a','routine',100000,20000,[
  offer('cheap','model',[call('haiku',100000,20000)],
   {fullTraceDeclared:false})])]});
 assert.equal(r.decisions[0].model,'opus');
});
test('W41 accepts low-cost native but never authenticates caller score or declares completed task',()=>{
 const r=run({units:[unit('a','routine',100000,20000,[offer('reuse','exact',[])])]});
 assert.equal(r.decisions[0].model,'native');
 assert.equal(r.independentQualityActuallyVerified,false);
 assert.equal(r.observedClaudeProFiveHourPercent,null);
 assert.equal(r.productionAuthority,'NONE');
});
test('W41 higher verifier overhead can erase all savings',()=>{
 const r=run({units:[unit('a','routine',100000,20000,[])],
 overheadCalls:[call('opus',100000,20000)]});
 assert.equal(r.allInApiEquivalentUsd,1.6);
 assert.equal(r.modeledApiEquivalentReductionPercent,-100);
});
test('W41 fully qualified but expensive candidate cannot defeat cheaper Opus',()=>{
 const r=run({units:[unit('a','routine',100000,20000,[
 offer('costly','model',[call('opus',100000,20000,{count:2})])])]});
 assert.equal(r.decisions[0].selectedRoute,'OPUS_REFERENCE');
});
test('W41 malformed unit, model, counts and duplicate IDs are rejected',()=>{
 const good=unit('ok');
 for(const args of [
  {units:[]},{units:[good,good]},
  {units:[unit('a','routine',0,20000,[])]},
  {units:[unit('a','routine',100000,20000,[offer('x','model',
   [call('haiku',100000,20000,{count:-1})])])]},
  {units:[unit('a','routine',100000,20000,[offer('x','model',[])])]}
 ])assert.equal(run(args).ok,false);
});
test('W41 do not fabricate Pro allowance, paid calls, or quality proof',()=>{
 for(const r of [run(scenario()),run({units:[unit('a')]} )]){
  assert.equal(r.fixedClaudeProMonthlyCashUsd,20);
  assert.equal(r.subscriptionPriceReductionPercent,0);
  assert.equal(r.paidProviderCalls,0);
  assert.equal(r.newApiSpendAuthorizedUsd,0);
  assert.equal(r.selectedQualityReceiptsAuthenticated,false);
  assert.equal(r.observedClaudeProWeeklyPercent,null);
 }
});