import {calculateUberMind55AllInMesh} from './ubermind-55-agent-mesh-total-cost.mjs';

export const UBERMIND_EVENT_MESH_SCHEMA='uberbond.ubermind-w38.event-gated-55-mesh.v1';
const num=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const round=x=>Number(x.toFixed(9));
const reject=reason=>({ok:false,status:'EVENT_GATED_MESH_INPUT_REJECTED',reason,
  observedFiveHourUsagePercent:null,qualityIndependentlyProven:false,
  providerCallsMade:0,additionalSpendAuthorizedUsd:0,externalEffectAuthority:'NONE'});
const tariff={
 opus:{input:4,output:20},
 sonnet:{input:2,output:10},
 haikuShort:{input:.1,output:.5},
 haikuLong:{input:.5,output:2.5}
};
const perCall=row=>{
 const kind=row.model==='haiku'?(row.inputTokensPerCall>100000?'haikuLong':'haikuShort'):row.model;
 const t=tariff[kind];
 return (row.inputTokensPerCall*t.input+row.outputTokensPerCall*t.output)/1000000;
};
const DEFAULT_CONDITIONAL_AGENTS=Object.freeze([
 Object.freeze({role:'haiku-scoped-evidence',model:'haiku',callsWhenTriggered:1,
  inputTokensPerCall:18000,outputTokensPerCall:2000,triggerProbabilityAssumed:1}),
 Object.freeze({role:'sonnet-adversarial-review',model:'sonnet',callsWhenTriggered:1,
  inputTokensPerCall:30000,outputTokensPerCall:4000,triggerProbabilityAssumed:.35}),
 Object.freeze({role:'opus-frontier-review',model:'opus',callsWhenTriggered:1,
  inputTokensPerCall:20000,outputTokensPerCall:3000,triggerProbabilityAssumed:.15})
]);
export {DEFAULT_CONDITIONAL_AGENTS};

/**
 * Lower cost only by event-triggering optional specialists instead of an
 * always-on swarm. The probability of each trigger is USER-ASSUMED, not
 * calibrated or evidence that lower-cost work maintains Opus quality.
 * Costs include all declared auxiliary tokens. Other coordinator/recursion
 * costs MUST be included in extraAlwaysOnApiEquivalentUsd.
 *
 * Also returns worst-case when every optional agent is triggered. Zero calls.
 */
export function calculateEventGatedUberMind55({
 inputTokens=1000000,outputTokens=200000,
 certifiedReuseShare=.6,
 opusShare=.2,sonnetShare=.5,haikuShare=.3,
 conditionalAgents=DEFAULT_CONDITIONAL_AGENTS,
 extraAlwaysOnApiEquivalentUsd=0
}={}){
 if(!Array.isArray(conditionalAgents)||conditionalAgents.length>32||
    !num(extraAlwaysOnApiEquivalentUsd,0,100000))
   return reject('bounded-agent-set-and-extra-overhead-required');
 const all=[],rows=[];
 for(const a of conditionalAgents){
  if(!a||!['opus','sonnet','haiku'].includes(a.model)||
     typeof a.role!=='string'||!/^[a-z0-9_.:-]{1,90}$/i.test(a.role)||
     !int(a.callsWhenTriggered,0,100)||
     !int(a.inputTokensPerCall,1,10000000)||
     !int(a.outputTokensPerCall,1,10000000)||
     !num(a.triggerProbabilityAssumed,0,1))
    return reject('invalid-agent-bounds-probability-or-token-geometry');
  const costPerCall=perCall(a);
  const full=costPerCall*a.callsWhenTriggered;
  rows.push({role:a.role,model:a.model,
    triggerProbabilityAssumed:a.triggerProbabilityAssumed,
    fullInvocationCostUsd:round(full),
    expectedApiEquivalentUsd:round(full*a.triggerProbabilityAssumed)});
  all.push({role:a.role,model:a.model,calls:a.callsWhenTriggered,
    inputTokensPerCall:a.inputTokensPerCall,outputTokensPerCall:a.outputTokensPerCall});
 }
 const worst=calculateUberMind55AllInMesh({
  inputTokens,outputTokens,certifiedReuseShare,
  opusShare,sonnetShare,haikuShare,auxiliaryCalls:all,
  fixedExtraApiEquivalentUsd:extraAlwaysOnApiEquivalentUsd
 });
 if(!worst.ok)return reject('invalid-model-mix-token-share-or-total-call-count');
 const base=worst.residualMainModelApiEquivalentUsd;
 const expectedOverhead=extraAlwaysOnApiEquivalentUsd+
   rows.reduce((s,row)=>s+row.expectedApiEquivalentUsd,0);
 const expected=base+expectedOverhead;
 const reference=worst.baselineAllOpusApiEquivalentUsd;
 const breakEven90=reference*.1-expectedOverhead;
 const pricePerUnreused=calculateUberMind55AllInMesh({
  inputTokens,outputTokens,certifiedReuseShare:0,
  opusShare,sonnetShare,haikuShare,auxiliaryCalls:[],
  fixedExtraApiEquivalentUsd:0
 }).residualMainModelApiEquivalentUsd;
 const minimumReuseFor90=breakEven90<0?null:
   Math.max(0,1-breakEven90/pricePerUnreused);
 return {
  ok:true,status:'MODELED_EXPECTATION_NOT_ACCOUNT_USAGE_OR_PROVEN_QUALITY',
  referenceAllOpusApiEquivalentUsd:reference,
  mainModelCostAfterAssumedReuseUsd:round(base),
  expectedAuxiliaryCostUsd:round(expectedOverhead),
  worstCaseAuxiliaryCostUsd:round(worst.auxiliaryAgentAndExtraVerificationApiEquivalentUsd),
  expectedAllInApiEquivalentUsd:round(expected),
  worstCaseAllInApiEquivalentUsd:round(worst.combinedApiEquivalentUsd),
  expectedApiEquivalentReductionPercent:round((1-expected/reference)*100),
  worstCaseApiEquivalentReductionPercent:round((1-worst.combinedApiEquivalentUsd/reference)*100),
  minimumCertifiedReuseFor90pctApiProxyCut:
    minimumReuseFor90===null||minimumReuseFor90>1?null:round(minimumReuseFor90),
  optionalAgentAssumptions:rows,
  observedFiveHourUsagePercent:null,observedWeeklyUsagePercent:null,
  qualityIndependentlyProven:false,triggerProbabilitiesMeasured:false,
  fixedSubscriptionUsdPerMonth:20,subscriptionCashReductionPercent:0,
  providerCallsMade:0,additionalSpendAuthorizedUsd:0,externalEffectAuthority:'NONE',
  warning:'Estimated trigger probabilities and source-reuse are hypotheses; quality is unverified. API equivalent has no known conversion to Claude Pro allowance. The same task must receive independently accepted output before calling this a savings success.'
 };
}
