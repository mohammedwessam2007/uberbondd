export const UBERLIT_WORKER_LIVENESS_SCHEMA='uberbond.uberlit-worker-liveness.v1';

const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const nonnegative=(value,fallback=0)=>Math.max(0,finite(value,fallback));

export function assessUberLitWorkerLiveness({
  nowMs=Date.now(),
  startedAtMs=nowMs,
  childAlive=false,
  wealthReceiptMtimeMs=null,
  startupGraceMs=120_000,
  wealthStaleMs=300_000
}={}){
  const now=nonnegative(nowMs,Date.now());
  const started=nonnegative(startedAtMs,now);
  const grace=Math.max(1,nonnegative(startupGraceMs,120_000));
  const stale=Math.max(1,nonnegative(wealthStaleMs,300_000));
  const uptimeMs=Math.max(0,now-started);
  const hasReceipt=wealthReceiptMtimeMs!==null&&wealthReceiptMtimeMs!==undefined&&wealthReceiptMtimeMs!==''&&Number.isFinite(Number(wealthReceiptMtimeMs));
  const wealthReceiptAgeMs=hasReceipt?Math.max(0,now-Number(wealthReceiptMtimeMs)):null;

  if(!childAlive){
    return {status:'DEAD_CHILD',uptimeMs,wealthReceiptAgeMs,wealthReceiptFresh:false,shouldRestart:true};
  }
  if(uptimeMs<grace){
    return {status:'STARTING',uptimeMs,wealthReceiptAgeMs,wealthReceiptFresh:hasReceipt&&wealthReceiptAgeMs<=stale,shouldRestart:false};
  }
  if(!hasReceipt){
    return {status:'DEGRADED_NO_WEALTH_RECEIPT',uptimeMs,wealthReceiptAgeMs:null,wealthReceiptFresh:false,shouldRestart:true};
  }
  if(wealthReceiptAgeMs>stale){
    return {status:'DEGRADED_STALE_WEALTH_RECEIPT',uptimeMs,wealthReceiptAgeMs,wealthReceiptFresh:false,shouldRestart:true};
  }
  return {status:'LIVE_WEALTH_ADVANCING',uptimeMs,wealthReceiptAgeMs,wealthReceiptFresh:true,shouldRestart:false};
}

export function buildUberLitWorkerLivenessReceipt({
  nowMs=Date.now(),
  startedAtMs,
  sourceCommit,
  releaseId,
  supervisorPid,
  childPid,
  childAlive,
  wealthReceiptMtimeMs,
  startupGraceMs,
  wealthStaleMs,
  externalEffectsDisabled=true
}={}){
  const assessment=assessUberLitWorkerLiveness({nowMs,startedAtMs,childAlive,wealthReceiptMtimeMs,startupGraceMs,wealthStaleMs});
  return {
    schema:UBERLIT_WORKER_LIVENESS_SCHEMA,
    status:assessment.status,
    sourceCommit:String(sourceCommit||'').toLowerCase()||null,
    releaseId:String(releaseId||'')||null,
    supervisorPid:Number.isSafeInteger(Number(supervisorPid))?Number(supervisorPid):null,
    childPid:Number.isSafeInteger(Number(childPid))?Number(childPid):null,
    startedAt:new Date(Number(startedAtMs||nowMs)).toISOString(),
    heartbeatAt:new Date(Number(nowMs)).toISOString(),
    uptimeMs:assessment.uptimeMs,
    childAlive:Boolean(childAlive),
    autopilotEnabled:true,
    wealthReceiptObserved:Boolean(wealthReceiptMtimeMs!==null&&wealthReceiptMtimeMs!==undefined&&wealthReceiptMtimeMs!==''&&Number.isFinite(Number(wealthReceiptMtimeMs))),
    wealthReceiptAgeMs:assessment.wealthReceiptAgeMs,
    wealthReceiptFresh:assessment.wealthReceiptFresh,
    shouldRestart:assessment.shouldRestart,
    externalEffectsDisabled:Boolean(externalEffectsDisabled),
    businessEffectAuthority:'LOCAL_RUNTIME_LIVENESS_ONLY',
    truthBoundary:'LIVENESS_PROVES_RESIDENT_PROCESS_AND_WEALTH_RECEIPT_FRESHNESS_ONLY; IT_DOES_NOT_PROVE_REVENUE, CUSTOMER_EFFECTS, OR CLEARED_PAYMENT'
  };
}
