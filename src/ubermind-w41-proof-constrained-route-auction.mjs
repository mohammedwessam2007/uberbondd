/**
 * W41 - Minimal-cost quality-admissible route auction, research sandbox.
 * Extends W36 official Claude 5.5 rates; no LLM/API calls or source writes.
 * Every quality receipt is CALLER-ATTESTED, never cryptographically verified here.
 * Does not assert Claude Pro token quotas or achieved matching quality.
 */
import {UBERMIND_55_OFFICIAL_TARIFF_USD_PER_MTOK as RATE}
 from './ubermind-55-family-subscription-price-proxy.mjs';
export const W41_SCHEMA='uberbond.ubermind.w41.proof-constrained-route-auction.v1';
const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const nat=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const sha=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);
const round=n=>Number(n.toFixed(9));
const fail=reason=>({ok:false,status:'ROUTE_AUCTION_REFUSED',reason,
 observedClaudeProFiveHourPercent:null,independentQualityActuallyVerified:false,
 paidProviderCalls:0,newApiSpendAuthorizedUsd:0,productionAuthority:'NONE'});
const models=['opus','sonnet','haiku'];
const efforts=['low','medium','high','xhigh','max'];
function callCost(c){
 if(!c||!models.includes(c.model)||!nat(c.inputTokens,1,100000000)||
 !nat(c.outputTokens,1,10000000)||!nat(c.count,1,10000)||
 !efforts.includes(c.effort))return null;
 const t=c.model==='haiku'?
  (c.inputTokens>100000?RATE.haikuLong:RATE.haikuShort):RATE[c.model];
 return (t.input*c.inputTokens+t.output*c.outputTokens)*c.count/1000000;
}
function validReceipt(e,u){
 return !!e&&typeof e==='object'&&!Array.isArray(e)&&
 e.taskDigest===u.taskDigest&&e.sourceDigest===u.sourceDigest&&
 e.rubricDigest===u.rubricDigest&&
 e.independentAccepted===true&&e.comparableBaseline===true&&
 typeof e.evidencePointer==='string'&&e.evidencePointer.length>=8&&
 e.evidencePointer.length<=256&&
 num(e.candidateScore,0,1)&&num(e.baselineScore,0,1)&&
 e.candidateScore>=e.baselineScore;
}
/**
 * units: each original Opus reference input/output chunk + offered full routes.
 * Each route's declared calls MUST include its lead, scout, verifier and retries.
 * Missing/invalid source-matching quality evidence excludes candidate.
 * An explicit frontier model route cannot be silently downgraded to Sonnet/Haiku.
 * All output remains USER-ATTESTED and must be checked in real Claude Code.
 */
export function auctionUberMindW41({
 units,overheadCalls=[],fixedOverheadApiEquivalentUsd=0
}={}){
 if(!Array.isArray(units)||!units.length||units.length>64||
 !Array.isArray(overheadCalls)||overheadCalls.length>64||
 !num(fixedOverheadApiEquivalentUsd,0,10000))
  return fail('bounded-units-and-overhead-required');
 let baseline=0,chosen=0,offered=0,admitted=0,auxCost=fixedOverheadApiEquivalentUsd;
 let baselineInput=0,baselineOutput=0;
 const seen=new Set(),decisions=[];
 for(const c of overheadCalls){
  const p=callCost(c);if(p===null)return fail('invalid-overhead-call');
  auxCost+=p;
 }
 for(const u of units){
  if(!u||typeof u.id!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(u.id)||
  seen.has(u.id)||!sha(u.taskDigest)||!sha(u.sourceDigest)||!sha(u.rubricDigest)||
  !['routine','scoped','frontier'].includes(u.classification)||
  !nat(u.baselineInputTokens,1,100000000)||
  !nat(u.baselineOutputTokens,1,10000000)||
  !Array.isArray(u.routes)||u.routes.length>12)return fail('invalid-unit-contract');
  seen.add(u.id);
  baselineInput+=u.baselineInputTokens;baselineOutput+=u.baselineOutputTokens;
  const backstop=(RATE.opus.input*u.baselineInputTokens+
    RATE.opus.output*u.baselineOutputTokens)/1000000;
  baseline+=backstop;let best={route:'OPUS_REFERENCE',model:'opus',cost:backstop};
  for(const alt of u.routes){
   offered++;
   if(!alt||typeof alt.id!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(alt.id)||
   !['exact','model'].includes(alt.kind)||
   !Array.isArray(alt.calls)||alt.calls.length>24||
   (alt.kind==='exact'&&alt.calls.length!==0)||
   (alt.kind==='model'&&alt.calls.length===0))
    return fail('invalid-route-shape');
   let cost=0;
   for(const c of alt.calls){const p=callCost(c);if(p===null)return fail('invalid-agent-call');cost+=p;}
   if(!validReceipt(alt.receipt,u)||alt.fullTraceDeclared!==true)continue;
   if(alt.kind==='exact'&&alt.reverifyInLiveCheckout!==true)continue;
   if(u.classification==='frontier'&&alt.kind==='model'&&
     alt.calls.some(c=>c.model!=='opus'))continue;
   admitted++;
   if(cost<best.cost-1e-12){
     best={route:alt.id,model:alt.kind==='exact'?'native':
      [...new Set(alt.calls.map(c=>c.model))].join('+'),cost};
   }
  }
  chosen+=best.cost;
  decisions.push({unit:u.id,classification:u.classification,
   selectedRoute:best.route,model:best.model,
   referenceAllOpusApiUsd:round(backstop),selectedApiUsd:round(best.cost),
   traceAndQualityEvidenceStatus:best.route==='OPUS_REFERENCE'?
    'UNQUALIFIED_ALTERNATIVES_REJECTED_OR_MORE_EXPENSIVE':
    'CALLER_ATTESTED_NOT_AUTHENTICATED'});
 }
 const total=chosen+auxCost;
 return {ok:true,status:'HYPOTHETICAL_EVIDENCE_CONSTRAINED_PRICE_AUCTION',
  units:units.length,offeredAlternatives:offered,callerAdmissibleAlternatives:admitted,
  baselineGeometry:{inputTokens:baselineInput,outputTokens:baselineOutput},
  allOpusApiEquivalentUsd:round(baseline),
  modelAndNativeSelectedApiEquivalentUsd:round(chosen),
  fullOverheadApiEquivalentUsd:round(auxCost),
  allInApiEquivalentUsd:round(total),
  modeledApiEquivalentReductionPercent:round(100*(1-total/baseline)),
  decisions,
  optimizationPolicy:'LOWEST_ALL_IN_API_COST_AMONG_MATCHED_SOURCE_RUBRIC_QUALITY_ATTESTATIONS',
  selectedQualityReceiptsAuthenticated:false,
  independentQualityActuallyVerified:false,
  observedClaudeProFiveHourPercent:null,observedClaudeProWeeklyPercent:null,
  fixedClaudeProMonthlyCashUsd:20,subscriptionPriceReductionPercent:0,
  paidProviderCalls:0,newApiSpendAuthorizedUsd:0,productionAuthority:'NONE',
  warning:'Caller evidence is not independently authenticated; model rates are an API price proxy only. This is not a successful task, a real Claude Pro usage measurement, or an automatic permission to run selected model routes.'
 };
}
