export const UBERLIT_RUNTIME_DOCTOR_SCHEMA='uberbond.uberlit-runtime-doctor.v1';
const SHA40=/^[0-9a-f]{40}$/;
const RELEASE=/^uberlit_[0-9a-f]{32}$/;
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);

export function diagnoseUberLitRuntime({
  nowMs=Date.now(),
  expectedSourceCommit=null,
  pointer=null,
  liveness=null,
  wealthReceiptMtimeMs=null,
  maxLivenessAgeMs=30_000,
  maxWealthAgeMs=300_000
}={}){
  const reasons=[];
  const now=finite(nowMs)??Date.now();
  const expected=String(expectedSourceCommit||'').toLowerCase();
  const pointerSource=String(pointer?.sourceCommit||'').toLowerCase();
  const releaseId=String(pointer?.releaseId||'');
  const liveSource=String(liveness?.sourceCommit||'').toLowerCase();
  const liveRelease=String(liveness?.releaseId||'');
  const heartbeatMs=Date.parse(String(liveness?.heartbeatAt||''));
  const livenessAgeMs=Number.isFinite(heartbeatMs)?Math.max(0,now-heartbeatMs):null;
  const wealthMtime=finite(wealthReceiptMtimeMs);
  const wealthAgeMs=wealthMtime==null?null:Math.max(0,now-wealthMtime);

  if(!pointer||typeof pointer!=='object') reasons.push('pointer-missing');
  else {
    if(!RELEASE.test(releaseId)) reasons.push('pointer-release-invalid');
    if(!SHA40.test(pointerSource)) reasons.push('pointer-source-invalid');
  }
  if(expected&&(!SHA40.test(expected)||pointerSource!==expected)) reasons.push('source-commit-mismatch');
  if(!liveness||typeof liveness!=='object') reasons.push('liveness-missing');
  else {
    if(liveness.status!=='LIVE_WEALTH_ADVANCING') reasons.push(`liveness-status:${String(liveness.status||'missing')}`);
    if(liveness.shouldRestart===true) reasons.push('liveness-restart-requested');
    if(liveness.autopilotEnabled!==true) reasons.push('autopilot-not-proven');
    if(liveness.childAlive!==true) reasons.push('worker-child-not-alive');
    if(liveSource!==pointerSource) reasons.push('liveness-source-mismatch');
    if(liveRelease!==releaseId) reasons.push('liveness-release-mismatch');
    if(livenessAgeMs==null) reasons.push('liveness-heartbeat-invalid');
    else if(livenessAgeMs>Math.max(1,Number(maxLivenessAgeMs)||30_000)) reasons.push('liveness-heartbeat-stale');
    if(liveness.wealthReceiptFresh!==true) reasons.push('liveness-wealth-not-fresh');
  }
  if(wealthAgeMs==null) reasons.push('wealth-receipt-missing');
  else if(wealthAgeMs>Math.max(1,Number(maxWealthAgeMs)||300_000)) reasons.push('wealth-receipt-stale');
  if(liveness?.wealthReceiptAgeMs!=null&&wealthAgeMs!=null){
    const claimed=finite(liveness.wealthReceiptAgeMs);
    if(claimed==null||Math.abs(claimed-wealthAgeMs)>Math.max(5_000,Number(maxLivenessAgeMs)||30_000)) reasons.push('wealth-age-witness-drift');
  }

  return {
    schema:UBERLIT_RUNTIME_DOCTOR_SCHEMA,
    ok:reasons.length===0,
    status:reasons.length?'UBERLIT_WEALTH_RUNTIME_UNHEALTHY':'UBERLIT_WEALTH_RUNTIME_HEALTHY',
    sourceCommit:pointerSource||null,
    releaseId:releaseId||null,
    livenessAgeMs,
    wealthReceiptAgeMs:wealthAgeMs,
    reasonCodes:[...new Set(reasons)].sort(),
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'READ_ONLY_RUNTIME_DIAGNOSTIC',
    truthBoundary:'HEALTHY_PROVES_SOURCE_RELEASE_LIVENESS_BINDING_AND_FRESH_WEALTH_RECEIPT_ONLY; IT_DOES_NOT_PROVE_REVENUE, CLEARED_PAYMENT, ACCEPTED_DELIVERY, OR CUSTOMER_EFFECTS'
  };
}
