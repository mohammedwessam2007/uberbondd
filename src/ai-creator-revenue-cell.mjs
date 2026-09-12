export const AI_CREATOR_REVENUE_CELL_VERSION='uberbond.ai-creator-revenue-cell.v1';

const safeNumber=v=>Number.isFinite(Number(v))?Number(v):0;

export function scoreCreatorExperiment(x={}){
 const hook=safeNumber(x.hookStrength), retention=safeNumber(x.retentionPotential), repeat=safeNumber(x.repeatability), monetization=safeNumber(x.monetizationFit), differentiation=safeNumber(x.differentiation), minutes=Math.max(1,safeNumber(x.founderMinutes)||1), cost=Math.max(0,safeNumber(x.cashCost));
 const value=(hook*.22+retention*.24+repeat*.18+monetization*.22+differentiation*.14)*100;
 return Number((value/minutes-cost*.05).toFixed(4));
}

export function validateVirtualCreator(candidate={}){
 const reasons=[];
 if(candidate.impersonatesRealPerson===true) reasons.push('real-person-impersonation-prohibited');
 if(candidate.adultContent===true) reasons.push('adult-content-not-supported-by-this-cell');
 if(candidate.syntheticDisclosure===false) reasons.push('synthetic-origin-disclosure-required');
 if(!String(candidate.identity||'').trim()) reasons.push('creator-identity-required');
 if(!Array.isArray(candidate.monetizationRoutes)||candidate.monetizationRoutes.length===0) reasons.push('monetization-route-required');
 return {ok:reasons.length===0,reasons,status:reasons.length?'CREATOR_REJECTED':'CREATOR_ELIGIBLE'};
}

export function buildCreatorRevenueCell({creator={},experiments=[],maxLive=3}={}){
 const creatorGate=validateVirtualCreator(creator);
 if(!creatorGate.ok) return {version:AI_CREATOR_REVENUE_CELL_VERSION,ok:false,status:creatorGate.status,reasons:creatorGate.reasons,selected:[]};
 const ranked=(Array.isArray(experiments)?experiments:[]).map(e=>({...e,score:scoreCreatorExperiment(e)})).filter(e=>String(e.id||'').trim()).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id)));
 const selected=ranked.slice(0,Math.max(0,Math.floor(maxLive))).map(e=>e.id);
 return {
  version:AI_CREATOR_REVENUE_CELL_VERSION,
  ok:true,
  status:selected.length?'CREATOR_EXPERIMENTS_SELECTED':'NO_CREATOR_EXPERIMENT_SELECTED',
  selected,
  ranked,
  monetizationPriority:['sponsorship','affiliate','digital-product','service-lead','platform-revenue'],
  contentLoop:['niche-hypothesis','hook-generation','asset-generation','publish','measure-retention','measure-clicks','measure-cleared-revenue','archive-learning'],
  truthBoundary:'NO_REVENUE_CLAIM_WITHOUT_CLEARED_PAYMENT_RECEIPT'
 };
}

export function recordCreatorOutcome({experimentId,views=0,watchSeconds=0,clicks=0,clearedRevenue=0,cost=0,founderMinutes=0}={}){
 const v=Math.max(0,safeNumber(views)), watch=Math.max(0,safeNumber(watchSeconds)), c=Math.max(0,safeNumber(clicks)), revenue=Math.max(0,safeNumber(clearedRevenue)), spend=Math.max(0,safeNumber(cost)), mins=Math.max(0,safeNumber(founderMinutes));
 return {
  schema:'uberbond.ai-creator-revenue-outcome.v1',
  experimentId:String(experimentId||''),
  views:v,
  avgWatchSeconds:v?Number((watch/v).toFixed(4)):0,
  ctr:v?Number((c/v).toFixed(6)):0,
  clearedRevenue:revenue,
  contribution:Number((revenue-spend).toFixed(2)),
  contributionPerFounderMinute:mins?Number(((revenue-spend)/mins).toFixed(4)):0,
  promotable:revenue>0&&revenue>=spend,
  truthBoundary:'CLEARED_REVENUE_ONLY'
 };
}
