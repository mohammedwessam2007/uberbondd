import crypto from 'node:crypto';
import { JEV_CALIBRATION_SETTING, JEV_CALIBRATION_SCHEMA } from './jev-calibration-vault.mjs';

export const JEV_PROMOTION_FOUNDRY_SCHEMA='uberbond.jev-promotion-foundry.v1';

const stable=value=>Array.isArray(value)?value.map(stable):(!value||typeof value!=='object')?value:
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
const h=value=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const finite=value=>Number.isFinite(Number(value))?Number(value):null;
const band=value=>{
  const n=finite(value);
  if(n==null)return 'UNKNOWN';
  if(n>=.75)return 'HIGH';
  if(n<=.25)return 'LOW';
  return 'MID';
};
const int=value=>{
  const n=finite(value);
  return n!=null&&Number.isInteger(n)?n:null;
};
const sum=(rows,selector)=>rows.reduce((n,row)=>{
  const v=finite(selector(row));
  return n+(v==null?0:v);
},0);

function signatureFor(row){
  return {
    qualityClass:row.qualityClass??'UNKNOWN',
    taskShape:row.jevAnswers?.task_shape?.choice??'UNKNOWN',
    hardReasoning:int(row.jevAnswers?.hard_reasoning?.score),
    sourceCompressionValue:int(row.jevAnswers?.source_compression_value?.score),
    independentChallengeBand:band(row.jevAnswers?.independent_challenge?.noul),
    crownNecessityBand:band(row.jevAnswers?.crown_necessity?.noul),
    selectedWriterId:row.selectedWriterId??'unknown',
    writerModel:row.writerModel??'unknown',
    jevModel:row.jevModel??'unknown',
    jevModelRevision:row.jevModelRevision??null,
    crownModel:row.crownModel??null,
    crownModelRevision:row.crownModelRevision??null
  };
}

function independentObservations(rows){
  const byRequest=new Map();
  const severity=row=>row?.rewriteRequired===true?2:row?.patchRequired===true?1:0;
  for(const row of rows){
    const key=String(row?.requestFingerprint??'');
    if(!key)continue;
    const current=byRequest.get(key);
    if(!current||severity(row)>severity(current)||
      (severity(row)===severity(current)&&Date.parse(row.observedAt)<Date.parse(current.observedAt)))
      byRequest.set(key,row);
  }
  return [...byRequest.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
}

function stableWindows(rows,count){
  const sorted=[...rows].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  if(!sorted.length||!Number.isSafeInteger(count)||count<1)return[];
  const windows=[];
  for(let i=0;i<count;i++){
    const start=Math.floor(i*sorted.length/count);
    const end=Math.floor((i+1)*sorted.length/count);
    const slice=sorted.slice(start,end);
    if(!slice.length)continue;
    const accepted=slice.filter(x=>x.acceptedWithoutMutation===true).length;
    windows.push({
      ordinal:i+1,
      count:slice.length,
      acceptedWithoutMutation:accepted,
      regressions:slice.length-accepted,
      zeroLoss:accepted===slice.length,
      firstObservedAt:slice[0]?.observedAt??null,
      lastObservedAt:slice.at(-1)?.observedAt??null
    });
  }
  return windows;
}

export function compileJevPromotionCandidates(state={},{
  minimumOutcomes=100,
  stableWindowCount=3,
  minimumWindowOutcomes=20,
  minimumTemporalSpanMs=24*60*60*1000
}={}){
  const rows=Array.isArray(state?.observations)?state.observations:[];
  if(state?.schemaVersion&&state.schemaVersion!==JEV_CALIBRATION_SCHEMA)
    return {ok:false,status:'JEV_PROMOTION_FOUNDRY_REFUSED',reasons:['jev-calibration-schema-drift'],
      providerCallsPerformed:0,spendUsd:0,crownSuppressionAuthority:'NONE'};
  if(!Number.isSafeInteger(minimumOutcomes)||minimumOutcomes<20||
     !Number.isSafeInteger(stableWindowCount)||stableWindowCount<3||
     !Number.isSafeInteger(minimumWindowOutcomes)||minimumWindowOutcomes<1||
     !Number.isSafeInteger(minimumTemporalSpanMs)||minimumTemporalSpanMs<60*60*1000)
    return {ok:false,status:'JEV_PROMOTION_FOUNDRY_REFUSED',reasons:['valid-zero-loss-promotion-bounds-required'],
      providerCallsPerformed:0,spendUsd:0,crownSuppressionAuthority:'NONE'};

  const groups=new Map();
  for(const row of rows){
    const signature=signatureFor(row);
    const key=h(signature);
    const existing=groups.get(key)??{signature,rows:[]};
    existing.rows.push(row);
    groups.set(key,existing);
  }

  const candidates=[];
  for(const [signatureDigest,group] of groups){
    const rawObs=[...group.rows].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
    const obs=independentObservations(rawObs);
    const accepted=obs.filter(x=>x.acceptedWithoutMutation===true).length;
    const patched=obs.filter(x=>x.patchRequired===true).length;
    const rewritten=obs.filter(x=>x.rewriteRequired===true).length;
    const regressions=patched+rewritten;
    const windows=stableWindows(obs,stableWindowCount);
    const firstAt=obs.length?Date.parse(obs[0].observedAt):NaN;
    const lastAt=obs.length?Date.parse(obs.at(-1).observedAt):NaN;
    const temporalSpanMs=Number.isFinite(firstAt)&&Number.isFinite(lastAt)?Math.max(0,lastAt-firstAt):0;
    const currentAllInMicrousd=sum(obs,row=>
      Number(row.costsMicrousd?.jev??0)+Number(row.costsMicrousd?.writer??0)+
      Number(row.costsMicrousd?.critic??0)+Number(row.costsMicrousd?.crown??0));
    const candidateWithoutCrownMicrousd=sum(obs,row=>
      Number(row.costsMicrousd?.jev??0)+Number(row.costsMicrousd?.writer??0)+Number(row.costsMicrousd?.critic??0));
    const observedCrownMicrousd=sum(obs,row=>row.costsMicrousd?.crown??0);
    const blockers=[];
    if(obs.length<minimumOutcomes)blockers.push('minimum-distinct-crown-supervised-outcomes-not-met');
    if(rawObs.length>obs.length)blockers.push('duplicate-request-observations-excluded-from-evidence-count');
    if(temporalSpanMs<minimumTemporalSpanMs)blockers.push('minimum-temporal-coverage-not-met');
    if(regressions>0)blockers.push('observed-crown-mutation-regression-present');
    if(!group.signature.jevModelRevision)blockers.push('jev-model-revision-unbound');
    if(!group.signature.crownModel||!group.signature.crownModelRevision)blockers.push('crown-model-revision-unbound');
    if(windows.length!==stableWindowCount)blockers.push('stable-window-count-not-met');
    if(windows.some(w=>w.count<minimumWindowOutcomes))blockers.push('stable-window-size-not-met');
    if(windows.some(w=>!w.zeroLoss))blockers.push('stable-window-regression-present');

    const ready=blockers.length===0;
    candidates.push({
      candidateId:'jevreflex_'+signatureDigest.slice(7,31),
      signatureDigest,
      taskDomain:group.signature,
      rawObservationCount:rawObs.length,
      observationCount:obs.length,
      uniqueRequestCount:obs.length,
      duplicateObservationCount:Math.max(0,rawObs.length-obs.length),
      temporalSpanMs,
      minimumTemporalSpanMs,
      acceptedWithoutMutation:accepted,
      patched,
      rewritten,
      observedRegressions:regressions,
      acceptRate:obs.length?accepted/obs.length:null,
      stableWindows:windows,
      currentSupervisedAllInUsd:currentAllInMicrousd/1e6,
      candidateWithoutCrownUsd:candidateWithoutCrownMicrousd/1e6,
      observedCrownReviewUsd:observedCrownMicrousd/1e6,
      modeledPostCertificationCompressionFactor:candidateWithoutCrownMicrousd>0
        ? currentAllInMicrousd/candidateWithoutCrownMicrousd:null,
      modeledPostCertificationSavingsPercent:currentAllInMicrousd>0
        ? (observedCrownMicrousd/currentAllInMicrousd)*100:null,
      status:ready?'READY_FOR_CANONICAL_SEALED_CERTIFICATION':
        regressions>0?'FROZEN_OBSERVED_REGRESSION':'ACCUMULATING_CROWN_SUPERVISION',
      readyForCanonicalSealedCertification:ready,
      certificationBlockers:blockers,
      requiredNextEvidence:ready?[
        'fresh-identical-sealed-task-pair',
        'direct-current-crown-baseline',
        'candidate-architecture-on-identical-holdouts',
        'canonical-untampered-zero-loss-certificate',
        'strict-all-in-economics-improvement',
        'current-applicability-passport'
      ]:[],
      automaticPromotionAuthorized:false,
      crownSuppressionAuthority:'NONE',
      truthBoundary:'Observed Crown ACCEPT means no mutation was required on this exact supervised request. Promotion evidence counts distinct request fingerprints only; repeated requests are deduplicated using the worst observed Crown outcome and cannot manufacture sample size. Even a temporally stable zero-loss 100+ distinct-request domain cannot suppress Crown until the independent canonical sealed certificate is minted and current.'
    });
  }

  candidates.sort((a,b)=>{
    if(a.readyForCanonicalSealedCertification!==b.readyForCanonicalSealedCertification)
      return a.readyForCanonicalSealedCertification?-1:1;
    if(a.observedRegressions!==b.observedRegressions)return a.observedRegressions-b.observedRegressions;
    return b.observationCount-a.observationCount;
  });

  return {
    ok:true,
    schemaVersion:JEV_PROMOTION_FOUNDRY_SCHEMA,
    status:candidates.some(x=>x.readyForCanonicalSealedCertification)
      ?'JEV_ZERO_LOSS_DOMAIN_READY_FOR_CANONICAL_CERTIFICATION'
      :'JEV_PROMOTION_EVIDENCE_ACCUMULATING',
    totalObservations:rows.length,
    domainCount:candidates.length,
    readyDomainCount:candidates.filter(x=>x.readyForCanonicalSealedCertification).length,
    candidates,
    automaticPromotionAuthorized:false,
    crownSuppressionAuthority:'NONE',
    providerCallsPerformed:0,
    spendUsd:0,
    law:'JEV_MAY_ACCUMULATE_AND_PROPOSE__ONLY_CANONICAL_SEALED_ZERO_LOSS_CERTIFICATION_CAN_CREATE_BOUNDED_CROWN_SUPPRESSION_AUTHORITY'
  };
}

export async function readJevPromotionFoundry(store,options={}){
  if(typeof store?.transaction!=='function')throw new Error('jev-promotion-foundry-durable-store-required');
  return store.transaction(async tx=>{
    const settings=await tx.getSettings();
    const state=settings?.[JEV_CALIBRATION_SETTING]??{
      schemaVersion:JEV_CALIBRATION_SCHEMA,observations:[],promotionState:'SHADOW',
      crownSuppressionAuthority:'NONE',updatedAt:null
    };
    return compileJevPromotionCandidates(state,options);
  });
}
