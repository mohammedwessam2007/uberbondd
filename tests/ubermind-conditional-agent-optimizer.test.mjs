import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateEventGatedUberMind55 as optimize,
 DEFAULT_CONDITIONAL_AGENTS as defaults} from '../src/ubermind-conditional-agent-optimizer.mjs';

test('W38 defaults count precise expected and worst-case scout/reviewer overhead',()=>{
 const z=optimize();
 assert.equal(z.ok,true);assert.equal(z.expectedAuxiliaryCostUsd,.0588);
 assert.equal(z.worstCaseAuxiliaryCostUsd,.2428);
 assert.equal(z.referenceAllOpusApiEquivalentUsd,8);
 assert.equal(z.mainModelCostAfterAssumedReuseUsd,1.464);
 assert.equal(z.expectedAllInApiEquivalentUsd,1.5228);
 assert.equal(z.worstCaseAllInApiEquivalentUsd,1.7068);
});
test('W38 60% reuse yields 80.965 pct expected cut without claiming accepted quality',()=>{
 const z=optimize();
 assert.equal(z.expectedApiEquivalentReductionPercent,80.965);
 assert.equal(z.qualityIndependentlyProven,false);
 assert.equal(z.observedFiveHourUsagePercent,null);
 assert.equal(z.triggerProbabilitiesMeasured,false);
});
test('W38 same model mix W37 at 60% reuse cost 1.7152 vs 1.5228 expected',()=>{
 const z=optimize({certifiedReuseShare:.6});
 assert.ok(z.expectedAllInApiEquivalentUsd<1.7152);
});
test('W38 no speculative Sonnet/Opus trigger saves 0.24 over all-trigger baseline',()=>{
 const agents=defaults.map(r=>({...r,triggerProbabilityAssumed:r.model==='haiku'?1:0}));
 const z=optimize({conditionalAgents:agents,certifiedReuseShare:0});
 assert.equal(z.expectedAuxiliaryCostUsd,.0028);
 assert.equal(z.worstCaseAuxiliaryCostUsd,.2428);
});
test('W38 all triggers probability 1 equals W37 explicit one-each full cost',()=>{
 const z=optimize({conditionalAgents:defaults.map(x=>({...x,triggerProbabilityAssumed:1}))});
 assert.equal(z.expectedAllInApiEquivalentUsd,z.worstCaseAllInApiEquivalentUsd);
});
test('W38 no agents on completed exact unit means 0 fresh inference proxy',()=>{
 const z=optimize({certifiedReuseShare:1,conditionalAgents:[]});
 assert.equal(z.expectedAllInApiEquivalentUsd,0);
});
test('W38 better task allocation 10 Opus 50 Sonnet 40 Haiku and 60% reuse',()=>{
 const z=optimize({opusShare:.1,sonnetShare:.5,haikuShare:.4});
 assert.equal(z.mainModelCostAfterAssumedReuseUsd,1.152);
 assert.equal(z.expectedAllInApiEquivalentUsd,1.2108);
 assert.equal(z.expectedApiEquivalentReductionPercent,84.865);
});
test('W38 better assignment does not imply actual Opus quality',()=>{
 const z=optimize({opusShare:.1,sonnetShare:.5,haikuShare:.4});
 assert.equal(z.qualityIndependentlyProven,false);
 assert.equal(z.observedWeeklyUsagePercent,null);
});
test('W38 90% API target requires source reuse but computes math honestly',()=>{
 const z=optimize();
 assert.equal(z.minimumCertifiedReuseFor90pctApiProxyCut,.797486339);
});
test('W38 no route gets free unaccounted coordinator work',()=>{
 const z=optimize({extraAlwaysOnApiEquivalentUsd:.5});
 assert.equal(z.expectedAuxiliaryCostUsd,.5588);
 assert.equal(z.expectedAllInApiEquivalentUsd,2.0228);
});
test('W38 Haiku above 100k triggers correct 5x tariff',()=>{
 const z=optimize({certifiedReuseShare:1,conditionalAgents:[{
  role:'long-haiku',model:'haiku',callsWhenTriggered:1,
  inputTokensPerCall:100001,outputTokensPerCall:2000,triggerProbabilityAssumed:1}]});
 assert.equal(z.expectedAllInApiEquivalentUsd,.0550005);
});
test('W38 invalid models, probabilities, sizes, and share fail closed',()=>{
 for(const x of [
  {conditionalAgents:[{...defaults[0],triggerProbabilityAssumed:1.1}]},
  {conditionalAgents:[{...defaults[0],model:'fable'}]},
  {conditionalAgents:[{...defaults[0],callsWhenTriggered:-1}]},
  {conditionalAgents:defaults,certifiedReuseShare:1.1},
  {opusShare:.3,sonnetShare:.5,haikuShare:.3}
 ])assert.equal(optimize(x).ok,false);
});
test('W38 fixed subscription cash remains 20 with zero additional provider inference',()=>{
 const z=optimize();assert.equal(z.fixedSubscriptionUsdPerMonth,20);
 assert.equal(z.subscriptionCashReductionPercent,0);
 assert.equal(z.providerCallsMade,0);
 assert.equal(z.additionalSpendAuthorizedUsd,0);
 assert.equal(z.externalEffectAuthority,'NONE');
});
