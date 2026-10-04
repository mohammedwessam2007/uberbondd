import crypto from 'node:crypto';
import { probeSmtpFleetAccount } from './uberfleet.mjs';
import {
  WINNR_SMTP_READINESS_VERSION,
  WINNR_SMTP_READINESS_SETTING,
  SMTP_PROBE_FAILURE_PAUSE_REASON,
  SMTP_PROBE_READY_RECEIPT_HOLD_REASON
} from './winnr-smtp-readiness-trust.mjs';

export {
  WINNR_SMTP_READINESS_VERSION,
  WINNR_SMTP_READINESS_SETTING,
  SMTP_PROBE_FAILURE_PAUSE_REASON,
  SMTP_PROBE_READY_RECEIPT_HOLD_REASON
} from './winnr-smtp-readiness-trust.mjs';

const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digest=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');
const parseOrdinals=value=>new Set(String(value||'').split(',').map(Number).filter(n=>Number.isInteger(n)&&n>0));
const ownProbePauseReason=reason=>[SMTP_PROBE_FAILURE_PAUSE_REASON,SMTP_PROBE_READY_RECEIPT_HOLD_REASON].includes(String(reason||''));
const isOwnProbePause=health=>health?.paused===true&&ownProbePauseReason(health?.pauseReason);
const hardProtectivePause=health=>health?.paused===true&&!isOwnProbePause(health);
const exactProviderCalls=probe=>{
  const n=Number(probe?.providerCalls);
  return Number.isFinite(n)&&n>=0?n:0;
};

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
        providerCalls:0,messagesSent:0,mailFromIssued:false,recipientsIssued:0,dataIssued:false
      });
      continue;
    }

    let probe;
    try{probe=await probeFn({account,encryptionKey});}
    catch(error){probe={classification:'UNCERTAIN',reasonCodes:['smtp-readiness-probe-threw'],probeError:clean(error?.message||error,160),providerCalls:0,messagesSent:0};}
    const providerCalls=exactProviderCalls(probe);
    const ready=probe?.classification==='READY'
      && providerCalls>0
      && Boolean(clean(probe?.providerSessionReceiptId,500))
      && Boolean(clean(probe?.providerResponseDigest,128));

    if(ready){
      await store.setSenderPaused(slot,true,SMTP_PROBE_READY_RECEIPT_HOLD_REASON);
    }else{
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
      providerSessionReceiptId:ready?clean(probe?.providerSessionReceiptId,500)||null:null,
      providerResponseDigest:ready?clean(probe?.providerResponseDigest,128)||null:null,
      providerCalls,
      messagesSent:0,
      mailFromIssued:false,
      recipientsIssued:0,
      dataIssued:false
    });
  }

  const evaluated=results.filter(r=>r.evaluated===true);
  const contacted=results.filter(r=>r.providerCalls>0);
  const readyCount=evaluated.filter(r=>r.confirmed===true).length;
  const failedCount=evaluated.length-readyCount;
  const skippedProtective=results.length-evaluated.length;
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
    providerCalls:results.reduce((sum,r)=>sum+Number(r.providerCalls||0),0),
    messagesSent:0,
    mailFromIssued:false,
    recipientsIssued:0,
    dataIssued:false,
    reputationObserved:false,
    inboxPlacementObserved:false,
    legalAuthorityGranted:false,
    prospectSendAuthorityGranted:false,
    automaticRetryAuthorized:false,
    senderHealthHeldFailClosed:true,
    truthBoundary:'This receipt proves only fresh authenticated SMTP session reachability for exact probed non-quarantined Winnr routes using TLS/EHLO/AUTH/NOOP/QUIT. It sends no message and proves no reputation, inbox placement, future SMTP acceptance, legal authority, buyer permission, reply, or revenue. Sender health remains paused until a consumer verifies this fresh exact-slot receipt instead of trusting an unpaused row.'
  };
  await store.setSetting(WINNR_SMTP_READINESS_SETTING,receipt);
  if(typeof store.log==='function')await store.log('winnr_smtp_readiness_probe',{
    status:receipt.status,checkedAccounts:receipt.checkedAccounts,providerContactedAccounts:receipt.providerContactedAccounts,
    readyAccounts:receipt.readyAccounts,failedAccounts:receipt.failedAccounts,skippedProtectiveAccounts:receipt.skippedProtectiveAccounts,
    providerCalls:receipt.providerCalls,messagesSent:0,mailFromIssued:false,recipientsIssued:0,dataIssued:false,
    senderHealthHeldFailClosed:true,senderAddressesLogged:false,credentialsLogged:false
  });
  return receipt;
}
