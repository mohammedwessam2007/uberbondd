import { createHash } from 'node:crypto';

export const WINNR_SMTP_READINESS_VERSION='uberbond.winnr-smtp-readiness.v1';
export const WINNR_SMTP_READINESS_SETTING='winnrSmtpReadinessV1';
export const SMTP_PROBE_FAILURE_PAUSE_REASON='winnr-smtp-auth-noop-probe-failed';
export const SMTP_PROBE_READY_RECEIPT_HOLD_REASON='winnr-smtp-fresh-receipt-required-by-gspot';

const digest=v=>createHash('sha256').update(String(v??'')).digest('hex');
const clean=v=>String(v??'').trim();
const finiteTime=v=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:null;};
const noMessageEffects=v=>v?.messagesSent===0&&v?.mailFromIssued===false&&v?.recipientsIssued===0&&v?.dataIssued===false;
const noAuthority=v=>v?.legalAuthorityGranted===false&&v?.prospectSendAuthorityGranted===false&&v?.automaticRetryAuthorized===false;

export function evaluateWinnrSmtpReadinessTrust({senderId='',receipt=null,health=null,nowMs=Date.now(),futureSkewMs=120000,maxLifetimeMs=90*60000}={}){
  const sender=String(senderId||'');
  if(!sender.startsWith('winnr:'))return {applicable:false,trusted:false,reasonCodes:['not-winnr-sender']};
  const reasons=[];
  if(receipt?.schemaVersion!==WINNR_SMTP_READINESS_VERSION)reasons.push('readiness-schema-mismatch');
  const checkedAt=finiteTime(receipt?.checkedAt);
  const expiresAt=finiteTime(receipt?.expiresAt);
  if(checkedAt===null)reasons.push('readiness-checked-at-invalid');
  if(expiresAt===null)reasons.push('readiness-expiry-invalid');
  if(checkedAt!==null&&checkedAt>Number(nowMs)+futureSkewMs)reasons.push('readiness-checked-at-in-future');
  if(expiresAt!==null&&expiresAt<=Number(nowMs))reasons.push('readiness-expired');
  if(checkedAt!==null&&expiresAt!==null&&(expiresAt<=checkedAt||expiresAt-checkedAt>maxLifetimeMs))reasons.push('readiness-lifetime-invalid');
  if(receipt?.senderHealthHeldFailClosed!==true)reasons.push('readiness-fail-closed-marker-required');
  if(!noMessageEffects(receipt))reasons.push('readiness-top-level-message-effect-detected');
  if(!noAuthority(receipt))reasons.push('readiness-authority-marker-invalid');
  if(receipt?.reputationObserved!==false||receipt?.inboxPlacementObserved!==false)reasons.push('readiness-observation-boundary-invalid');

  if(!health)reasons.push('sender-health-missing');
  else {
    if(health.quarantined===true)reasons.push('sender-quarantined');
    if(health.paused!==true||String(health.pauseReason||'')!==SMTP_PROBE_READY_RECEIPT_HOLD_REASON)reasons.push('sender-not-on-receipt-hold');
  }

  const slotDigest=digest(sender);
  const rows=Array.isArray(receipt?.results)?receipt.results:[];
  const row=rows.find(r=>clean(r?.slotDigest)===slotDigest)||null;
  if(!row)reasons.push('exact-slot-readiness-result-missing');
  else {
    if(row.evaluated!==true)reasons.push('exact-slot-not-evaluated');
    if(row.classification!=='READY'||row.confirmed!==true||row.state!=='SMTP_AUTH_NOOP_CONFIRMED')reasons.push('exact-slot-not-confirmed-ready');
    if(!(Number(row.providerCalls)>0))reasons.push('exact-slot-provider-call-required');
    if(!clean(row.providerSessionReceiptId).startsWith('smtp-noop:'))reasons.push('exact-slot-provider-session-receipt-invalid');
    if(!/^[a-f0-9]{64}$/i.test(clean(row.providerResponseDigest)))reasons.push('exact-slot-provider-response-digest-invalid');
    if(!noMessageEffects(row))reasons.push('exact-slot-message-effect-detected');
  }

  return {
    applicable:true,
    trusted:reasons.length===0,
    reasonCodes:[...new Set(reasons)],
    checkedAt:checkedAt===null?null:new Date(checkedAt).toISOString(),
    expiresAt:expiresAt===null?null:new Date(expiresAt).toISOString(),
    slotDigest,
    providerSessionReceiptId:row&&reasons.length===0?clean(row.providerSessionReceiptId):null
  };
}

export async function verifyWinnrSmtpReadinessTrust({store,senderId='',nowMs=Date.now()}={}){
  if(!String(senderId||'').startsWith('winnr:'))return {applicable:false,trusted:false,reasonCodes:['not-winnr-sender']};
  if(!store?.getSettings||typeof store.list!=='function')return {applicable:true,trusted:false,reasonCodes:['readiness-store-capabilities-required']};
  try{
    const [settings,healthRows]=await Promise.all([store.getSettings(),store.list('senderHealth')]);
    const health=(Array.isArray(healthRows)?healthRows:[]).find(row=>String(row?.inbox||'')===String(senderId))||null;
    return evaluateWinnrSmtpReadinessTrust({senderId,receipt:settings?.[WINNR_SMTP_READINESS_SETTING]||null,health,nowMs});
  }catch(error){
    return {applicable:true,trusted:false,reasonCodes:['readiness-store-read-failed'],errorClass:String(error?.code||error?.name||'error').slice(0,80)};
  }
}
