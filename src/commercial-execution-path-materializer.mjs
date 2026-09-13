import crypto from 'node:crypto';

export const COMMERCIAL_EXECUTION_PATH_MATERIALIZER_VERSION='uberbond.commercial-execution-path-materializer.v1';
const STAGES=['OPPORTUNITY','OFFER','DISTRIBUTION','PAYMENT','FULFILLMENT','ACCEPTANCE','RENEWAL','RECONCILIATION'];
const FALLBACK={
  distribution:['marketplace','partner-referral','seo','direct-email','app-marketplace','local-search'],
  payment:['checkout','invoice','bank-transfer','marketplace-payout'],
  fulfillment:['automated-software','ai-assisted-service','report-delivery','data-delivery','integration','partner-fulfillment'],
  geographies:['local','global'],
  offerTypes:['audit','diagnosis','done-for-you','automation','research','asset','access'],
  pricingModels:['one-time','subscription','retainer','usage','success-fee','commission','hybrid']
};
const hash=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');
const text=(v,f='')=>String(v??'').trim()||f;
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(x=>text(x)).filter(Boolean))];
const claim=v=>String(v?.claimType||v?.evidenceClass||'').toUpperCase();
const evidenceRefs=v=>uniq(v?.evidenceRefs||v?.refs||[]);
const safeStatus=v=>['READY','BLOCKED_INTERNAL','BLOCKED_EXTERNAL','BLOCKED_EVIDENCE','BLOCKED_AUTHORITY','PROHIBITED','UNKNOWN'].includes(String(v||'').toUpperCase())?String(v).toUpperCase():'UNKNOWN';

function verifiedField(field){return field&&typeof field==='object'&&['VERIFIED_FACT','OBSERVED','VERIFIED'].includes(claim(field));}
function verifiedOpportunity(candidate){return verifiedField(candidate?.buyer)&&verifiedField(candidate?.pain)&&verifiedField(candidate?.value);}
function buyerValue(candidate,buyer){return text(buyer,text(candidate?.buyer?.value??candidate?.buyer,'unknown'))}
function mapBuyer(v){const s=text(v,'unknown').toLowerCase();if(s.includes('agenc'))return'agency';if(s.includes('saas'))return'b2b-saas';if(s.includes('health')||s.includes('clinic'))return'healthcare-business';if(s.includes('home')||s.includes('hvac')||s.includes('plumb'))return'home-services';if(s.includes('ecom'))return'ecommerce';if(s.includes('creator'))return'creator';if(s.includes('developer'))return'developer';if(s.includes('enterprise'))return'enterprise-team';if(s.includes('local')||s.includes('smb'))return'local-smb';return s.replace(/\s+/g,'-').slice(0,60)||'unknown';}
function deterministicPick(values,seed){return values[parseInt(hash(seed).slice(0,8),16)%values.length];}
function normalizeEvidence(record,fallbackStatus='BLOCKED_EVIDENCE'){
  const x=record&&typeof record==='object'?record:{};
  const refs=evidenceRefs(x);
  const authority=String(x.authority||x.authorityStatus||'NONE').toUpperCase();
  let status=safeStatus(x.status||fallbackStatus);
  if(status==='READY'&&(!refs.length||!['ALLOWED','AUTHORIZED','APPROVED','NONE_REQUIRED'].includes(authority))) status='BLOCKED_EVIDENCE';
  return{status,evidenceRefs:refs,railId:text(x.id||x.railId)||null,substituteRailIds:uniq(x.substituteRailIds)};
}
function normalizeRails(registry,key,fallback){
  const rows=Array.isArray(registry?.[key])?registry[key]:[];
  if(rows.length)return rows.map((r,i)=>({...normalizeEvidence(r,'UNKNOWN'),kind:text(r.kind||r.channel||r.mode||r.type,r.id||`${key}-${i+1}`)}));
  return fallback.map(kind=>({kind,status:'UNKNOWN',evidenceRefs:[],railId:`archetype:${kind}`,substituteRailIds:[]}));
}
function stageEvidence(stage,all={}){return normalizeEvidence(all?.[stage]||all?.[stage.toLowerCase()]||{},'BLOCKED_EVIDENCE');}
function offerEvidence(offer,all={}){const key=text(offer?.candidateId);return normalizeEvidence(all?.[key]||{},'BLOCKED_EVIDENCE');}
function routeId(parts){return `route_${hash(JSON.stringify(parts)).slice(0,24)}`;}
function outcomeFor(id,outcomes={}){const x=outcomes?.[id]&&typeof outcomes[id]==='object'?outcomes[id]:{};return{observedTrials:Math.max(0,Math.floor(Number(x.observedTrials)||0)),observedSuccesses:Math.max(0,Math.floor(Number(x.observedSuccesses)||0)),observedClearedPayments:Math.max(0,Math.floor(Number(x.observedClearedPayments)||0)),acceptedDeliveries:Math.max(0,Math.floor(Number(x.acceptedDeliveries)||0)),successProbability:Number.isFinite(Number(x.successProbability))?Number(x.successProbability):0.05,evidenceQuality:Number.isFinite(Number(x.evidenceQuality))?Number(x.evidenceQuality):0.2,expectedNetContribution:Number.isFinite(Number(x.expectedNetContribution))?Number(x.expectedNetContribution):0};}

export function materializeCommercialExecutionPaths({commercialCandidate=null,commercialBuyer='',commercialEvidenceRefs=[],offerCandidates=[],executionRailRegistry={},stageEvidenceRegistry={},offerEvidenceRegistry={},routeOutcomeEvidence={},geographies=[],maxRoutes=128}={}){
  const offers=Array.isArray(offerCandidates)?offerCandidates.filter(x=>x&&x.candidateId):[];
  if(!commercialCandidate||!commercialCandidate.id||!offers.length)return{version:COMMERCIAL_EXECUTION_PATH_MATERIALIZER_VERSION,status:'NO_COMMERCIAL_OFFERS_TO_MATERIALIZE',routeCount:0,readyRouteCount:0,routes:[],externalEffectAuthority:'NONE',truthBoundary:'ABSENT_COMMERCIAL_OFFERS_STAY_ABSENT; ROUTE_MATERIALIZATION_NEVER_INVENTS_OBSERVED_DEMAND_OR_EXECUTION_READINESS'};
  const distributions=normalizeRails(executionRailRegistry,'distribution',FALLBACK.distribution);
  const payments=normalizeRails(executionRailRegistry,'payment',FALLBACK.payment);
  const fulfillments=normalizeRails(executionRailRegistry,'fulfillment',FALLBACK.fulfillment);
  const geos=uniq(geographies).length?uniq(geographies):FALLBACK.geographies;
  const buyerPool=mapBuyer(buyerValue(commercialCandidate,commercialBuyer));
  const oppReady=verifiedOpportunity(commercialCandidate)&&uniq(commercialEvidenceRefs).length>0;
  const opportunity=oppReady?{status:'READY',evidenceRefs:uniq(commercialEvidenceRefs),railId:'commercial-genome',substituteRailIds:[]}:stageEvidence('OPPORTUNITY',stageEvidenceRegistry);
  const routes=[];
  outer: for(const offer of offers){
    const offerStage=offerEvidence(offer,offerEvidenceRegistry);
    const offerType=deterministicPick(FALLBACK.offerTypes,offer.candidateId);
    const pricingModel=deterministicPick(FALLBACK.pricingModels,`${offer.candidateId}:pricing`);
    const mechanismFamily=`offer:${hash((offer.mechanismAtomIds||[]).join('|')||offer.candidateId).slice(0,12)}`;
    for(const distribution of distributions)for(const payment of payments)for(const fulfillment of fulfillments)for(const geography of geos){
      const parts=[commercialCandidate.id,offer.candidateId,distribution.kind,payment.kind,fulfillment.kind,geography];
      const id=routeId(parts);const outcome=outcomeFor(id,routeOutcomeEvidence);
      const acceptance=stageEvidence('ACCEPTANCE',stageEvidenceRegistry),renewal=stageEvidence('RENEWAL',stageEvidenceRegistry),reconciliation=stageEvidence('RECONCILIATION',stageEvidenceRegistry);
      const stages={
        OPPORTUNITY:opportunity,
        OFFER:offerStage,
        DISTRIBUTION:{status:distribution.status,evidenceRefs:distribution.evidenceRefs,railId:distribution.railId,substituteRailIds:distribution.substituteRailIds},
        PAYMENT:{status:payment.status,evidenceRefs:payment.evidenceRefs,railId:payment.railId,substituteRailIds:payment.substituteRailIds},
        FULFILLMENT:{status:fulfillment.status,evidenceRefs:fulfillment.evidenceRefs,railId:fulfillment.railId,substituteRailIds:fulfillment.substituteRailIds},
        ACCEPTANCE:acceptance,RENEWAL:renewal,RECONCILIATION:reconciliation
      };
      const readyStages=STAGES.filter(s=>stages[s].status==='READY').length;
      routes.push({id,mechanismFamily,buyerPool,acquisitionChannel:distribution.kind,offerType,paymentRail:payment.kind,fulfillmentMode:fulfillment.kind,geography,urgencyTier:'growth',pricingModel,stages,successProbability:outcome.successProbability,evidenceQuality:Math.max(outcome.evidenceQuality,readyStages/STAGES.length),observedTrials:outcome.observedTrials,observedSuccesses:outcome.observedSuccesses,observedClearedPayments:outcome.observedClearedPayments,acceptedDeliveries:outcome.acceptedDeliveries,expectedNetContribution:outcome.expectedNetContribution,capitalAtRisk:0,minutesToLaunch:0,externalEffectAuthority:'NONE'});
      if(routes.length>=Math.max(1,Math.floor(Number(maxRoutes)||128)))break outer;
    }
  }
  const readyRouteCount=routes.filter(r=>STAGES.every(s=>r.stages[s].status==='READY')).length;
  return{version:COMMERCIAL_EXECUTION_PATH_MATERIALIZER_VERSION,status:readyRouteCount?'COMMERCIAL_ROUTES_MATERIALIZED_WITH_EVIDENCE':'COMMERCIAL_ROUTES_MATERIALIZED_UNPROVEN',routeCount:routes.length,readyRouteCount,routes,routeDigests:routes.map(r=>hash(r.id).slice(0,16)),externalEffectAuthority:'NONE',capitalDeploymentAuthority:'NONE',truthBoundary:'MATERIALIZED_ROUTES_ARE_HYPOTHESES_UNTIL_EACH_EXECUTION_STAGE_HAS_EXPLICIT_EVIDENCE; READY_RAIL_LABELS_WITHOUT_EVIDENCE_AND_AUTHORITY_CLEARANCE_ARE_DOWNGRADED; NO_ROUTE_IS_REVENUE_WITHOUT_CLEARED_PAYMENT_PLUS_ACCEPTED_DELIVERY'};
}
