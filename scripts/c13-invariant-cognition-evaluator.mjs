import crypto from 'node:crypto';
export const C13_INVARIANT_EVALUATOR_VERSION='uberbond.c13-invariant-cognition-evaluator.v1';
const clamp=v=>Math.max(0,Math.min(1,v));
const median=a=>{const x=[...a].sort((p,q)=>p-q),n=x.length;return n%2?x[(n-1)/2]:(x[n/2-1]+x[n/2])/2;};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function rng(seed){let x=parseInt(seed.slice(0,8),16)>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/2**32;};}
function pct(a,p){const x=[...a].sort((m,n)=>m-n);const i=Math.max(0,Math.min(x.length-1,Math.floor((x.length-1)*p)));return x[i];}
function score(speedup){return clamp(1-(0.5/Math.max(speedup,1e-12)));}
export function evaluateInvariantCognitionTransfer({contractDigest,expectedContractDigest,families=[]}={}){
 const reasons=[];
 if(!contractDigest||contractDigest!==expectedContractDigest)reasons.push('frozen-contract-digest-mismatch');
 if(!Array.isArray(families)||families.length!==3)reasons.push('exact-three-families-required');
 const rows=[];
 for(const f of Array.isArray(families)?families:[]){
  const current=Array.isArray(f.currentLatenciesNs)?f.currentLatenciesNs.map(Number):[];
  const candidate=Array.isArray(f.candidateLatenciesNs)?f.candidateLatenciesNs.map(Number):[];
  const local=[];
  if(current.length<11||candidate.length<11||current.length!==candidate.length||current.some(x=>!Number.isFinite(x)||x<=0)||candidate.some(x=>!Number.isFinite(x)||x<=0))local.push('eleven-matched-positive-latency-rounds-required');
  if(!f.currentSemanticDigest||f.currentSemanticDigest!==f.candidateSemanticDigest)local.push('semantic-identity-required');
  if(f.currentAuthorityDigest!==f.candidateAuthorityDigest)local.push('authority-identity-required');
  if(f.currentTruthBoundaryDigest!==f.candidateTruthBoundaryDigest)local.push('truth-boundary-identity-required');
  if(f.wallTimeBudgetMs!==5000||f.monetaryCostMicros!==0||f.humanAssistanceMinutes!==0)local.push('frozen-matched-budget-required');
  let speedup=0,candidateScore=0,candidateLow=0,candidateHigh=0;
  if(!local.length){
    speedup=median(current)/median(candidate);candidateScore=score(speedup);
    const R=rng(hash({contractDigest,familyId:f.familyId})),boots=[];
    for(let b=0;b<5000;b++){const ca=[],cb=[];for(let i=0;i<current.length;i++){const j=Math.floor(R()*current.length);ca.push(current[j]);cb.push(candidate[j]);}boots.push(score(median(ca)/median(cb)));}
    candidateLow=pct(boots,.025);candidateHigh=pct(boots,.975);
  }
  const robustGain=candidateLow-0.5;
  const passes=!local.length&&robustGain>=0.05;
  if(local.length)reasons.push(...local.map(x=>`${f.familyId||'UNKNOWN'}:${x}`));
  rows.push({familyId:f.familyId,currentScore:0.5,candidateScore,speedup,scoreInterval:{low:candidateLow,high:candidateHigh},robustGainVsCurrent:robustGain,passes});
 }
 const improved=rows.filter(r=>r.passes).length;
 const supported=reasons.length===0&&improved>=2;
 return {ok:reasons.length===0,status:supported?'C13_INVARIANT_TRANSFER_SUPPORTED':'C13_INVARIANT_TRANSFER_NOT_SUPPORTED',supported,robustImprovedFamilies:improved,requiredRobustImprovedFamilies:2,families:rows,reasonCodes:[...new Set(reasons)],promotionAuthority:'NONE',externalEffectAuthority:'NONE',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',truthBoundary:'C13_TRANSFER_EVALUATION_ONLY__NO_AUTOMATIC_PROMOTION__NO_C21_OR_ASI_CLAIM'};
}
