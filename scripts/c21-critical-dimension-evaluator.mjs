import crypto from 'node:crypto';
export const C21_CRITICAL_DIMENSION_EVALUATOR_VERSION='uberbond.c21-critical-dimension-evaluator.v1';
const ALLOWED=new Set(['causal reasoning','planning under uncertainty','long-horizon coherence','transfer between domains','adversarial robustness','calibrated refusal and ignorance detection']);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const median=xs=>{const a=[...xs].sort((x,y)=>x-y),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;};
const score=s=>Math.max(0,Math.min(1,1-(.5/Math.max(s,1e-12))));
function rng(seed){let x=Number.parseInt(seed.slice(0,8),16)>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/2**32;};}
function pct(xs,p){const a=[...xs].sort((x,y)=>x-y);return a[Math.max(0,Math.min(a.length-1,Math.floor((a.length-1)*p)))];}
export function evaluateCriticalDimension({dimension,contractDigest,expectedContractDigest,candidateId,candidateRevision,expectedCandidateId,taskPopulationHash,families=[]}={}){
  const d=String(dimension||'').trim().toLowerCase(),reasons=[];
  if(!ALLOWED.has(d))reasons.push('canonical-critical-dimension-required');
  if(!contractDigest||contractDigest!==expectedContractDigest)reasons.push('frozen-contract-digest-mismatch');
  if(!candidateId||candidateId!==expectedCandidateId)reasons.push('frozen-candidate-id-mismatch');
  if(!/^[0-9a-f]{40}$/.test(String(candidateRevision||'')))reasons.push('exact-candidate-git-revision-required');
  if(!/^[0-9a-f]{64}$/.test(String(taskPopulationHash||'')))reasons.push('fresh-task-population-hash-required');
  if(!Array.isArray(families)||families.length!==3)reasons.push('exact-three-families-required');
  const rows=[];
  for(const f of Array.isArray(families)?families:[]){
    const a=Array.isArray(f.baselineLatenciesNs)?f.baselineLatenciesNs.map(Number):[],b=Array.isArray(f.candidateLatenciesNs)?f.candidateLatenciesNs.map(Number):[],local=[];
    if(a.length!==21||b.length!==21||a.some(x=>!Number.isFinite(x)||x<=0)||b.some(x=>!Number.isFinite(x)||x<=0))local.push('twenty-one-matched-positive-latency-rounds-required');
    if(!f.baselineSemanticDigest||f.baselineSemanticDigest!==f.candidateSemanticDigest)local.push('semantic-identity-required');
    if(f.baselineCorrect!==true||f.candidateCorrect!==true)local.push('exact-correctness-required');
    if(f.protectedRegressionCount!==0)local.push('protected-regression-zero-tolerance');
    if(f.wallTimeBudgetMs!==5000||f.monetaryCostMicros!==0||f.humanAssistanceMinutes!==0||f.externalTools!=='NONE')local.push('frozen-matched-budget-required');
    let speedup=0,candidateScore=0,low=0,high=0;
    if(!local.length){speedup=median(a)/median(b);candidateScore=score(speedup);const r=rng(hash({version:C21_CRITICAL_DIMENSION_EVALUATOR_VERSION,d,contractDigest,taskPopulationHash,familyId:f.familyId})),boot=[];for(let k=0;k<10000;k++){const aa=[],bb=[];for(let i=0;i<a.length;i++){const j=Math.floor(r()*a.length);aa.push(a[j]);bb.push(b[j]);}boot.push(score(median(aa)/median(bb)));}low=pct(boot,.025);high=pct(boot,.975);}
    const robustGain=low-.5,passes=!local.length&&robustGain>=.05;if(local.length)reasons.push(...local.map(x=>`${f.familyId||'UNKNOWN'}:${x}`));rows.push({familyId:f.familyId,baselineScore:.5,candidateScore,speedup,scoreInterval:{low,high},robustGainVsBaseline:robustGain,passes});
  }
  if(new Set(rows.map(x=>x.familyId)).size!==3)reasons.push('three-unique-family-identities-required');
  const improved=rows.filter(x=>x.passes).length,supported=reasons.length===0&&improved>=2;
  return{ok:reasons.length===0,status:supported?'C21_CRITICAL_DIMENSION_GAIN_SUPPORTED':'C21_CRITICAL_DIMENSION_GAIN_NOT_SUPPORTED',supported,dimension:d,candidateId,candidateRevision,taskPopulationHash,robustImprovedFamilies:improved,requiredRobustImprovedFamilies:2,families:rows,reasonCodes:[...new Set(reasons)],promotionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',truthBoundary:'DIMENSION_SPECIFIC_FROZEN_HELDOUT_EVALUATION_ONLY__NO_AUTOMATIC_PROMOTION__NO_ASI_CLAIM'};
}
