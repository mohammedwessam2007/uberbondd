import crypto from 'node:crypto';

export const ECONOMIC_ROUTE_CALIBRATION_VERSION='uberbond.economic-route-calibration.v1.1';
export const DEFAULT_ONE_SIDED_Z=2.326347874;
export const DEFAULT_MIN_TRIALS=20;
export const DEFAULT_MAX_TRIAL_AGE_MS=30*24*60*60*1000;
export const MAX_FUTURE_SKEW_MS=60_000;

const arr=v=>Array.isArray(v)?v:[];
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const int=v=>Number.isSafeInteger(Number(v))?Number(v):null;
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

export function wilsonLowerBound(successes,trials,{z=DEFAULT_ONE_SIDED_Z}={}){
  const n=int(trials),k=int(successes),zz=Number(z);
  if(n==null||n<=0||k==null||k<0||k>n||!Number.isFinite(zz)||zz<=0) return null;
  const phat=k/n;
  const z2=zz*zz;
  const denominator=1+z2/n;
  const centre=phat+z2/(2*n);
  const margin=zz*Math.sqrt((phat*(1-phat)+z2/(4*n))/n);
  return Math.max(0,Math.min(1,(centre-margin)/denominator));
}

function normalizeTrial(raw={}){
  const trialId=text(raw.trialId,180);
  const routeId=text(raw.routeId,180);
  const failureDomain=text(raw.failureDomain,180);
  const regimeId=text(raw.regimeId,180);
  const observedAt=text(raw.observedAt,100);
  const observedMs=Date.parse(observedAt||'');
  const evidenceRefs=arr(raw.evidenceRefs).map(v=>text(v,1200)).filter(Boolean);
  const profit=int(raw.clearedContributionProfitCents);
  const valid=Boolean(trialId&&routeId&&failureDomain&&regimeId&&Number.isFinite(observedMs)&&evidenceRefs.length&&raw.completed===true&&raw.providerReadback===true&&profit!=null);
  const success=valid&&raw.providerOrigin===true&&String(raw.settlementState||'').toUpperCase()==='CLEARED'&&profit>0;
  return {trialId,routeId,failureDomain,regimeId,observedAt:valid?new Date(observedMs).toISOString():null,observedMs,evidenceRefs,profit,valid,success};
}

export function calibrateEconomicRoute({routeId,failureDomain,regimeId,trials=[],minTrials=DEFAULT_MIN_TRIALS,z=DEFAULT_ONE_SIDED_Z,maxTrialAgeMs=DEFAULT_MAX_TRIAL_AGE_MS,now=new Date()}={}){
  const id=text(routeId,180),domain=text(failureDomain,180),regime=text(regimeId,180);
  const minimum=Math.max(1,int(minTrials)??DEFAULT_MIN_TRIALS);
  const reference=now instanceof Date?now:new Date(now);
  const nowMs=reference.getTime();
  const maxAge=Math.max(1,Number(maxTrialAgeMs)||DEFAULT_MAX_TRIAL_AGE_MS);
  const normalized=arr(trials).map(normalizeTrial);
  const identityMatched=normalized.filter(t=>t.valid&&t.routeId===id&&t.failureDomain===domain&&t.regimeId===regime);
  const fresh=Number.isFinite(nowMs)?identityMatched.filter(t=>t.observedMs<=nowMs+MAX_FUTURE_SKEW_MS&&nowMs-t.observedMs<=maxAge):[];
  const staleCount=identityMatched.length-fresh.length;
  const invalidOrMismatchedCount=normalized.length-identityMatched.length;
  const successes=fresh.filter(t=>t.success).length;
  const completedTrials=fresh.length;
  const lower=wilsonLowerBound(successes,completedTrials,{z});
  const enough=Boolean(id&&domain&&regime&&Number.isFinite(nowMs)&&completedTrials>=minimum);
  const calibrationPayload={
    schemaVersion:ECONOMIC_ROUTE_CALIBRATION_VERSION,
    routeId:id,
    failureDomain:domain,
    regimeId:regime,
    completedTrials,
    successes,
    failures:completedTrials-successes,
    staleOrFutureTrials:staleCount,
    invalidOrMismatchedTrials:invalidOrMismatchedCount,
    minTrials:minimum,
    maxTrialAgeMs:maxAge,
    calibratedAt:Number.isFinite(nowMs)?reference.toISOString():null,
    oneSidedZ:z,
    successProbabilityLowerBound:enough?lower:null,
    evidenceRefs:[...new Set(fresh.flatMap(t=>t.evidenceRefs))],
    latestObservedAt:fresh.map(t=>t.observedAt).sort().at(-1)||null,
    calibrated:enough&&lower!=null,
    independenceEvidenceRefs:[],
    truthBoundary:'Only fresh completed provider-readback trials from the exact current regime count. Stale, future-skewed, regime-mismatched, silent, pipeline, reply, promise, sandbox, model-estimated, and unverified outcomes cannot calibrate current reliability. Calibration estimates a conservative route-level success lower bound only and never proves independence.'
  };
  const calibrationRef=digest(calibrationPayload);
  return {...calibrationPayload,calibrationRef,status:calibrationPayload.calibrated?'ECONOMIC_ROUTE_CALIBRATED':'ECONOMIC_ROUTE_CALIBRATION_INSUFFICIENT_EVIDENCE'};
}

export function compileReliabilityRouteFromCalibration({calibration,routeEvidenceRefs=[],independenceEvidenceRefs=[],dependencyReceipt=null,policyCleared=false,executableNow=false,founderMinutes=0,timeToCashMinutes=0}={}){
  if(!calibration?.calibrated||!calibration?.calibrationRef||calibration.successProbabilityLowerBound==null) return {ok:false,status:'RELIABILITY_ROUTE_NOT_ADMISSIBLE',reasonCodes:['valid-fresh-calibration-required']};
  const evidenceRefs=[...new Set([...arr(routeEvidenceRefs),...arr(calibration.evidenceRefs),calibration.calibrationRef].map(v=>text(v,1200)).filter(Boolean))];
  return {
    ok:true,
    status:'RELIABILITY_ROUTE_CALIBRATION_BOUND',
    route:{
      routeId:calibration.routeId,
      failureDomain:calibration.failureDomain,
      regimeId:calibration.regimeId,
      successProbabilityLowerBound:calibration.successProbabilityLowerBound,
      evidenceRefs,
      calibrationRefs:[calibration.calibrationRef],
      independenceEvidenceRefs:arr(independenceEvidenceRefs).map(v=>text(v,1200)).filter(Boolean),
      dependencyReceipt:dependencyReceipt&&typeof dependencyReceipt==='object'?structuredClone(dependencyReceipt):null,
      policyCleared:policyCleared===true,
      executableNow:executableNow===true,
      founderMinutes:Math.max(0,Number(founderMinutes)||0),
      timeToCashMinutes:Math.max(0,Number(timeToCashMinutes)||0)
    },
    externalEffectAuthority:'NONE',
    truthBoundary:'Fresh calibration binds current-regime observed outcomes to a reliability route but does not mint independence, execution, messaging, spend, payment, customer, or settlement authority.'
  };
}
