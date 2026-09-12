import { runRevenueDecisionDesk } from './revenue-decision-desk.mjs';

export const REVENUE_METHOD_EXCHANGE_VERSION='uberbond.revenue-method-exchange.v1';

export const REVENUE_METHOD_SEEDS=Object.freeze([
  {id:'voice-receptionist',buyer:'local-service-business',model:'managed-subscription',asset:'voice-intake-workflow',spawn:['workflow-template','dfy-setup','productized-saas']},
  {id:'workflow-template',buyer:'operator-builder',model:'digital-product',asset:'reusable-workflow-template',spawn:['build-guide','dfy-setup']},
  {id:'dfy-setup',buyer:'local-business',model:'setup-plus-retainer',asset:'client-specific-automation',spawn:['workflow-template','freelance-automation','productized-saas']},
  {id:'freelance-automation',buyer:'business-buyer',model:'project-plus-maintenance',asset:'automation-build',spawn:['workflow-template','dfy-setup']},
  {id:'lead-generation-service',buyer:'b2b-client',model:'managed-service',asset:'verified-prospect-and-outreach-system',spawn:['automation-output-subscription','productized-saas']},
  {id:'reputation-management',buyer:'local-business',model:'managed-subscription',asset:'review-response-workflow',spawn:['workflow-template','productized-saas']},
  {id:'content-production',buyer:'business-or-creator',model:'managed-subscription',asset:'research-backed-content-pipeline',spawn:['build-guide','workflow-template']},
  {id:'build-guide',buyer:'operator-builder',model:'digital-product',asset:'implementation-guide',spawn:['dfy-setup','freelance-automation']},
  {id:'automation-output-subscription',buyer:'information-buyer',model:'recurring-output-subscription',asset:'scheduled-information-product',spawn:['productized-saas']},
  {id:'productized-saas',buyer:'repeat-workflow-customer',model:'software-subscription',asset:'isolated-multi-tenant-agent-product',spawn:[]}
]);

const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const text=v=>String(v??'').trim();
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(String).filter(Boolean))];

export function validateRevenueMethod(method={}){
  const reasons=[];
  if(!text(method.id)) reasons.push('method-id-required');
  if(!text(method.buyer)) reasons.push('buyer-required');
  if(!text(method.model)) reasons.push('monetization-model-required');
  if(!text(method.asset)) reasons.push('delivery-asset-required');
  if(!Array.isArray(method.capabilityRefs)||method.capabilityRefs.length===0) reasons.push('capability-refs-required');
  if(!Array.isArray(method.evidenceRefs)||method.evidenceRefs.length===0) reasons.push('evidence-refs-required');
  if(!(method.authority===true||method.authority==='authorized')) reasons.push('authority-required');
  if(!Array.isArray(method.stopConditions)||method.stopConditions.length===0) reasons.push('stop-conditions-required');
  if(method.founderMinutes!==undefined&&n(method.founderMinutes,-1)<0) reasons.push('founder-minutes-must-be-nonnegative');
  if(method.cashCost!==undefined&&n(method.cashCost,-1)<0) reasons.push('cash-cost-must-be-nonnegative');
  return {ok:reasons.length===0,reasons,status:reasons.length?'METHOD_REJECTED':'METHOD_ELIGIBLE'};
}

function toDeskCandidate(method={}){
  return {
    id:method.id,
    fingerprint:text(method.fingerprint)||`revenue-method:${method.id}`,
    evidenceRefs:uniq(method.evidenceRefs),
    authority:method.authority,
    stopConditions:uniq(method.stopConditions),
    expectedClearedContribution:n(method.expectedClearedContribution),
    founderMinutes:Math.max(1,n(method.founderMinutes,1)),
    probability:Math.max(0,Math.min(1,n(method.probability))),
    downside:Math.max(0,n(method.downside)),
    reversibility:Math.max(0,Math.min(1,n(method.reversibility,1))),
    evidenceQuality:Math.max(0,Math.min(1,n(method.evidenceQuality))),
    evidenceRevision:n(method.evidenceRevision)
  };
}

function seedById(id){return REVENUE_METHOD_SEEDS.find(x=>x.id===id)||null;}

export function compileRevenueMethodExchange({methods=[],archive=[],maxLive=3}={}){
  const normalized=(Array.isArray(methods)?methods:[]).map(method=>{
    const seed=seedById(method?.id);
    return seed?{...seed,...method,spawn:uniq(method.spawn?.length?method.spawn:seed.spawn)}:{...method,spawn:uniq(method.spawn)};
  });
  const validations=normalized.map(method=>({id:method?.id||null,...validateRevenueMethod(method)}));
  const eligibleIds=new Set(validations.filter(v=>v.ok).map(v=>v.id));
  const eligible=normalized.filter(m=>eligibleIds.has(m.id));
  const desk=runRevenueDecisionDesk(eligible.map(toDeskCandidate),{archive,maxActions:Math.max(0,Math.floor(n(maxLive,3)))});
  const selected=new Set(desk.selected);
  const ranked=eligible.map(method=>{
    const decision=desk.decisions.find(d=>d.candidateId===method.id);
    return {...method,decision:selected.has(method.id)?'LIVE':'PARKED',score:decision?.economics?.score??Number.NEGATIVE_INFINITY,economics:decision?.economics??null};
  }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  return {
    version:REVENUE_METHOD_EXCHANGE_VERSION,
    ok:true,
    status:desk.selected.length?'REVENUE_METHODS_SELECTED':'NO_REVENUE_METHOD_SELECTED',
    selected:desk.selected,
    validations,
    ranked,
    methodCatalog:REVENUE_METHOD_SEEDS,
    executionMoat:['shared-capability-graph','buyer-specific-context','distribution','integration-reliability','evidence-receipts','delivery-acceptance','cleared-payment-history'],
    lifecycle:['DISCOVER','PAPER_TEST','CANARY','LIVE','SCALE','CLONE','DEGRADE','RETIRE'],
    truthBoundary:'PUBLIC_PROMPTS_DO_NOT_EQUAL_PROVEN_BUSINESS; ONLY CLEARED_PAYMENT_AND_ACCEPTED_DELIVERY PROMOTE A METHOD'
  };
}

export function recordRevenueMethodOutcome({methodId,attempts=0,acceptedDeliveries=0,clearedRevenue=0,cashCost=0,founderMinutes=0,refunds=0,disputes=0}={}){
  const revenue=Math.max(0,n(clearedRevenue)), cost=Math.max(0,n(cashCost)), mins=Math.max(0,n(founderMinutes)), refund=Math.max(0,n(refunds)), dispute=Math.max(0,n(disputes));
  const contribution=revenue-cost-refund-dispute;
  return {
    schema:'uberbond.revenue-method-outcome.v1',methodId:text(methodId),attempts:Math.max(0,Math.floor(n(attempts))),acceptedDeliveries:Math.max(0,Math.floor(n(acceptedDeliveries))),clearedRevenue:revenue,cashCost:cost,refunds:refund,disputes:dispute,contribution:Number(contribution.toFixed(2)),founderMinutes:mins,contributionPerFounderMinute:mins?Number((contribution/mins).toFixed(4)):0,promotable:revenue>0&&acceptedDeliveries>0&&contribution>0,truthBoundary:'CLEARED_PAYMENT_PLUS_ACCEPTED_DELIVERY_REQUIRED'
  };
}

export function reallocateRevenueMethods({methods=[],outcomes=[],maxLive=3,zeroSignalKillAttempts=20}={}){
  const byId=new Map((Array.isArray(outcomes)?outcomes:[]).map(o=>[o.methodId,o]));
  const scored=(Array.isArray(methods)?methods:[]).map(method=>{
    const outcome=byId.get(method.id)||recordRevenueMethodOutcome({methodId:method.id});
    const killed=outcome.attempts>=zeroSignalKillAttempts&&!outcome.promotable;
    const score=killed?Number.NEGATIVE_INFINITY:(outcome.promotable?outcome.contributionPerFounderMinute:0);
    return {methodId:method.id,score,killed,promotable:outcome.promotable,outcome};
  }).sort((a,b)=>b.score-a.score||a.methodId.localeCompare(b.methodId));
  const live=scored.filter(x=>!x.killed).slice(0,Math.max(0,Math.floor(n(maxLive,3)))).map(x=>x.methodId);
  return {version:REVENUE_METHOD_EXCHANGE_VERSION,status:'PORTFOLIO_REALLOCATED',live,retired:scored.filter(x=>x.killed).map(x=>x.methodId),ranking:scored,truthBoundary:'ALLOCATE BY OBSERVED CLEARED CONTRIBUTION PER FOUNDER MINUTE; VANITY ACTIVITY HAS ZERO PROMOTION AUTHORITY'};
}

export function spawnRevenueDerivatives({methodId,outcome,availableMethods=REVENUE_METHOD_SEEDS}={}){
  const seed=(Array.isArray(availableMethods)?availableMethods:[]).find(x=>x.id===methodId);
  if(!seed) return {ok:false,status:'UNKNOWN_METHOD',spawn:[]};
  if(!outcome?.promotable) return {ok:false,status:'PROVEN_OUTCOME_REQUIRED_BEFORE_SPAWN',spawn:[]};
  const allowed=new Set((Array.isArray(availableMethods)?availableMethods:[]).map(x=>x.id));
  return {ok:true,status:'DERIVATIVES_AVAILABLE',sourceMethodId:methodId,spawn:uniq(seed.spawn).filter(id=>allowed.has(id)),reason:'reuse proven delivery assets across adjacent monetization surfaces without claiming new revenue until separately earned'};
}
