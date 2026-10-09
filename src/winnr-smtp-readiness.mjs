import crypto from 'node:crypto';
import { probeSmtpFleetAccount } from './uberfleet.mjs';

export const WINNR_SMTP_READINESS_VERSION='uberbond.winnr-smtp-readiness.v1';
export const SMTP_PROBE_FAILURE_PAUSE_REASON='winnr-smtp-auth-noop-probe-failed';

const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digest=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');
const parseOrdinals=value=>new Set(String(value||'').split(',').map(Number).filter(n=>Number.isInteger(n)&&n>0));
const isOwnProbePause=health=>health?.paused===true&&String(health?.pauseReason||'')===SMTP_PROBE_FAILURE_PAUSE_REASON;
const hardProtectivePause=health=>health?.paused===true&&!isOwnProbePause(health);
const providerCallCount=probe=>{
  // Unknown stays unknown: Number(null) and Number('') are 0, which would turn a
  // probe that threw mid-session into a claim that the provider was never contacted.
  const raw=probe?.providerCalls;
  if(raw===null||raw===undefined||(typeof raw==='string'&&!raw.trim()))return null;
  const n=Number(raw);
  return Number.isInteger(n)&&n>=0?n:null;
};
const responseCode=value=>Number.isInteger(Number(value))?Number(value):null;

export async function runWinnrSmtpReadinessProbe({
  store,
  encryptionKey='',
  quarantineOrdinalsText=process.env.WINNR_PLACEMENT_QUARANTINE_ORDINALS||'',
  now=new Date(),
  probeFn=probeSmtpFleetAccount
}={}){
  const checkedAt=(now instanceof Date?now:new Date(now)).toISOString();
  if(!store||typeof store.list!=='function'||typeof store.setSenderPaused!=='function'||typeof store.setSetting!=='function'){
    return {ok:false,status:'WINNR_SMTP_READINESS_REFUSED',reasonCodes:['store-capabilities-required'],providerCalls:0,messagesSent:0};
  }
  if(!/^[a-f0-9]{64}$/i.test(String(encryptionKey||''))){
    return {ok:false,status:'WINNR_SMTP_READINESS_REFUSED',reasonCodes:['token-encryption-key-required'],providerCalls:0,messagesSent:0};
  }

  const [accountsRaw,healthRaw]=await Promise.all([store.list('accounts'),store.list('senderHealth')]);
  const accounts=(Array.isArray(accountsRaw)?accountsRaw:[])
    .filter(a=>a?.provider==='smtp-relay'&&a?.connected===true&&String(a?.slot||'').startsWith('winnr:'))
    .sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
  const healthBySlot=new Map((Array.isArray(healthRaw)?healthRaw:[]).map(row=>[String(row?.inbox||''),row]));
  const configuredQuarantine=parseOrdinals(quarantineOrdinalsText);
  const results=[];

  for(let i=0;i<accounts.length;i++){
    const account=accounts[i];
    const ordinal=i+1;
    const slot=String(account.slot||'');
    const health=healthBySlot.get(slot)||null;
    const configuredHold=configuredQuarantine.has(ordinal);
    const protectedHold=hardProtectivePause(health);
    if(configuredHold||protectedHold){
      results.push({
        ordinal,slotDigest:digest(slot),evaluated:false,classification:'SKIPPED_PROTECTIVE_HOLD',confirmed:false,
        configuredQuarantine:configuredHold,existingPause:health?.paused===true,
        pauseReasonClass:configuredHold?'CONFIGURED_PLACEMENT_QUARANTINE':'EXISTING_NON_PROBE_HOLD',
        providerCalls:0,providerCallState:'NOT_CONTACTED',messagesSent:0,mailFromIssued:false,recipientsIssued:0,dataIssued:false
      });
      continue;
    }

    let probe;
    try{probe=await probeFn({account,encryptionKey});}
    catch(error){probe={classification:'UNCERTAIN',reasonCodes:['smtp-readiness-probe-threw'],probeError:clean(error?.message||error,160),providerCalls:null,messagesSent:0};}
    const providerCalls=providerCallCount(probe);
    const ready=probe?.classification==='READY'
      && providerCalls!==null&&providerCalls>0
      && Boolean(clean(probe?.providerSessionReceiptId,500))
      && Boolean(clean(probe?.providerResponseDigest,128));

    if(ready){
      if(isOwnProbePause(health))await store.setSenderPaused(slot,false,'');
    }else if(!health||health?.paused!==true||isOwnProbePause(health)){
      await store.setSenderPaused(slot,true,SMTP_PROBE_FAILURE_PAUSE_REASON);
    }

    results.push({
      ordinal,
      slotDigest:digest(slot),
      evaluated:true,
      classification:ready?'READY':String(probe?.classification||'UNCERTAIN'),
      confirmed:ready,
      state:clean(probe?.state,120)||null,
      reasonCodes:Array.isArray(probe?.reasonCodes)?probe.reasonCodes.map(x=>clean(x,120)).slice(0,6):[],
      errorClass:ready?null:clean(probe?.errorClass,80)||null,
      errorStage:ready?null:clean(probe?.errorStage,40)||null,
      smtpResponseCode:ready?null:responseCode(probe?.smtpResponseCode),
      providerSessionReceiptId:ready?clean(probe?.providerSessionReceiptId,500)||null:null,
      providerResponseDigest:ready?clean(probe?.providerResponseDigest,128)||null:null,
      providerCalls,
      providerCallState:providerCalls===null?'UNKNOWN':providerCalls>0?'CONTACTED':'NOT_CONTACTED',
      messagesSent:0,
      mailFromIssued:false,
      recipientsIssued:0,
      dataIssued:false
    });
  }

  const evaluated=results.filter(r=>r.evaluated===true);
  const contacted=results.filter(r=>Number(r.providerCalls)>0);
  const unknownCalls=evaluated.filter(r=>r.providerCalls===null);
  const readyCount=evaluated.filter(r=>r.confirmed===true).length;
  const failedCount=evaluated.length-readyCount;
  const skippedProtective=results.length-evaluated.length;
  const providerCallsLowerBound=results.reduce((sum,r)=>sum+(Number.isInteger(r.providerCalls)&&r.providerCalls>=0?r.providerCalls:0),0);
  const ok=evaluated.length>0&&failedCount===0;
  const receipt={
    schemaVersion:WINNR_SMTP_READINESS_VERSION,
    ok,
    status:ok?'WINNR_SMTP_AUTH_NOOP_READY':evaluated.length?'WINNR_SMTP_AUTH_NOOP_PARTIAL':'WINNR_SMTP_AUTH_NOOP_NO_ELIGIBLE_ACCOUNTS',
    checkedAt,
    expiresAt:new Date(new Date(checkedAt).getTime()+75*60_000).toISOString(),
    accountCount:accounts.length,
    checkedAccounts:evaluated.length,
    providerContactedAccounts:contacted.length,
    readyAccounts:readyCount,
    failedAccounts:failedCount,
    skippedProtectiveAccounts:skippedProtective,
    configuredQuarantineOrdinals:[...configuredQuarantine].sort((a,b)=>a-b),
    results,
    providerCalls:unknownCalls.length?null:providerCallsLowerBound,
    providerCallsLowerBound,
    providerCallsComplete:unknownCalls.length===0,
    providerCallUnknownAccounts:unknownCalls.length,
    messagesSent:0,
    mailFromIssued:false,
    recipientsIssued:0,
    dataIssued:false,
    reputationObserved:false,
    inboxPlacementObserved:false,
    legalAuthorityGranted:false,
    prospectSendAuthorityGranted:false,
    automaticRetryAuthorized:false,
    truthBoundary:'This receipt proves only fresh authenticated SMTP session reachability for exact probed non-quarantined Winnr routes using TLS/EHLO/AUTH/NOOP/QUIT. It sends no message and proves no reputation, inbox placement, future SMTP acceptance, legal authority, buyer permission, reply, or revenue. Evaluation status and provider-contact count are tracked separately; unknown provider crossing remains unknown. Failure diagnostics expose only protocol stage and numeric SMTP response code, never provider response text, credentials, sender addresses, or message data.'
  };
  await store.setSetting('winnrSmtpReadinessV1',receipt);
  if(typeof store.log==='function')await store.log('winnr_smtp_readiness_probe',{
    status:receipt.status,checkedAccounts:receipt.checkedAccounts,providerContactedAccounts:receipt.providerContactedAccounts,
    readyAccounts:receipt.readyAccounts,failedAccounts:receipt.failedAccounts,skippedProtectiveAccounts:receipt.skippedProtectiveAccounts,
    providerCalls:receipt.providerCalls,providerCallsLowerBound:receipt.providerCallsLowerBound,providerCallsComplete:receipt.providerCallsComplete,
    providerCallUnknownAccounts:receipt.providerCallUnknownAccounts,messagesSent:0,mailFromIssued:false,recipientsIssued:0,dataIssued:false,
    senderAddressesLogged:false,credentialsLogged:false
  });
  return receipt;
}
