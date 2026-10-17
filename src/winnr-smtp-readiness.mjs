import crypto from 'node:crypto';
import { probeSmtpFleetAccount } from './uberfleet.mjs';
import { connectImapSocket, openImapCredential } from './uberimap.mjs';

export const WINNR_SMTP_READINESS_VERSION='uberbond.winnr-smtp-readiness.v1';
export const SMTP_PROBE_FAILURE_PAUSE_REASON='winnr-smtp-auth-noop-probe-failed';

const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digest=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');
const parseOrdinals=value=>new Set(String(value||'').split(',').map(Number).filter(n=>Number.isInteger(n)&&n>0));
const parseSlots=value=>new Set(String(value||'').split(',').map(s=>s.trim()).filter(Boolean));
const isOwnProbePause=health=>health?.paused===true&&String(health?.pauseReason||'')===SMTP_PROBE_FAILURE_PAUSE_REASON;
const hardProtectivePause=health=>health?.paused===true&&!isOwnProbePause(health);
const providerCallCount=probe=>{
  // Number(null) is 0, so only a real number may count as a known provider-call total.
  const n=probe?.providerCalls;
  return typeof n==='number'&&Number.isInteger(n)&&n>=0?n:null;
};
const responseCode=value=>Number.isInteger(Number(value))?Number(value):null;

export async function runWinnrSmtpReadinessProbe({
  store,
  encryptionKey='',
  quarantineOrdinalsText=process.env.WINNR_PLACEMENT_QUARANTINE_ORDINALS||'',
  quarantineSlotsText=process.env.WINNR_PLACEMENT_QUARANTINE_SLOTS||'',
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
  const quarantineSlots=parseSlots(quarantineSlotsText);
  // Ordinals are positions in a hash-sorted list. They only identify the pilot while the fleet is the three-mailbox pilot.
  if(configuredQuarantine.size>0&&accounts.length>3){
    return {ok:false,status:'WINNR_SMTP_READINESS_REFUSED',reasonCodes:['ordinal-quarantine-requires-slot-keys'],providerCalls:0,messagesSent:0};
  }
  const results=[];

  for(let i=0;i<accounts.length;i++){
    const account=accounts[i];
    const ordinal=i+1;
    const slot=String(account.slot||'');
    const health=healthBySlot.get(slot)||null;
    const configuredHold=configuredQuarantine.has(ordinal)||quarantineSlots.has(slot);
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

    // Decide from a fresh read, never the snapshot taken before the probe. A rollback or operator hold that landed while
    // the probe was in flight must not be overwritten by a stale "own pause" view.
    const current=(await store.list('senderHealth')).find(row=>String(row?.inbox||'')===slot)||null;
    if(ready){
      if(isOwnProbePause(current))await store.setSenderPaused(slot,false,'');
    }else if(!current||current?.paused!==true||isOwnProbePause(current)){
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

// IMAP readiness for one Winnr mailbox. The only commands it may send are CAPABILITY, LOGIN and LOGOUT. It never selects
// a mailbox, searches, fetches, stores or expunges, so no message is read or changed. It is deliberately separate from
// the SMTP gate above and from diagnoseWinnrImapStages, which sends SELECT and FETCH and must never run as a readiness
// step. The result is a bounded classification. Raw server text, usernames and passwords are never returned.
export const WINNR_IMAP_READINESS_VERSION='uberbond.winnr-imap-readiness.v1';
export const WINNR_IMAP_READINESS_COMMANDS=Object.freeze(['CAPABILITY','LOGIN','LOGOUT']);
const IMAP_UNREACHABLE=new Set(['ETIMEDOUT','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ECONNRESET','EAI_AGAIN','ENOTFOUND']);
const safeImapCode=error=>String(error?.code||error?.name||'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'_').slice(0,80)||'UNKNOWN';
const imapQuote=value=>`"${String(value??'').replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;
// A port is a number or a plain decimal string. Anything else, including booleans and null, is not a port.
const imapPortOf=value=>(typeof value==='number'||(typeof value==='string'&&/^\s*\d+\s*$/.test(value)))?Number(value):NaN;

function imapTagged(socket,tag,line,timeoutMs){
  return new Promise((resolve,reject)=>{
    let buffer='';
    const timer=setTimeout(()=>done(Object.assign(new Error('imap-readiness-timeout'),{code:'ETIMEDOUT'})),timeoutMs);
    const onData=chunk=>{
      buffer+=Buffer.from(chunk).toString('latin1');
      if(buffer.length>65536)return done(Object.assign(new Error('imap-readiness-response-too-large'),{code:'IMAP_RESPONSE_TOO_LARGE'}));
      const match=buffer.match(new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)(?: \\[([A-Z0-9_-]{1,80})\\])?`,'i'));
      if(match)done(null,{status:match[1].toUpperCase(),responseCode:(match[2]||'NONE').toUpperCase()});
    };
    const onError=error=>done(error);
    const onClose=()=>done(Object.assign(new Error('imap-readiness-connection-closed'),{code:'IMAP_CONNECTION_CLOSED'}));
    function done(error,value){
      clearTimeout(timer);
      socket.off('data',onData);socket.off('error',onError);socket.off('close',onClose);
      if(error)reject(error);else resolve(value);
    }
    socket.on('data',onData);socket.once('error',onError);socket.once('close',onClose);
    socket.write(`${tag} ${line}\r\n`);
  });
}

export async function probeWinnrImapReadiness({account={},encryptionKey='',connectFactory=connectImapSocket,timeoutMs=15000}={}){
  const bounded=fields=>Object.freeze({
    version:WINNR_IMAP_READINESS_VERSION,ok:false,commandsIssued:[],mailboxSelected:false,messagesRead:0,messagesSent:0,
    rawProviderTextLogged:false,credentialsLogged:false,...fields
  });
  // Refused before any socket. A disconnected account is not an active IMAP account, and a route without an explicit host
  // and port would be dialled at the connector's default address, where LOGIN would still be sent.
  if(account?.connected!==true)return bounded({classification:'ACCOUNT_NOT_CONNECTED',stage:'ROUTE'});
  const route=account?.imapRoute||{};
  const host=typeof route.host==='string'?route.host.trim():'';
  const port=imapPortOf(route.port);
  if(!host||!Number.isInteger(port)||port<1||port>65535)return bounded({classification:'IMAP_ROUTE_ABSENT',stage:'ROUTE'});
  let credential;
  try{credential=openImapCredential(account,encryptionKey);}
  catch{return bounded({classification:'CREDENTIAL_UNAVAILABLE',stage:'CREDENTIAL'});}
  if(/[\r\n\0]/.test(`${credential.username}${credential.password}`))return bounded({classification:'CREDENTIAL_UNSAFE_FOR_LITERAL',stage:'CREDENTIAL'});
  const sent=[];
  let socket;
  try{socket=await connectFactory({host,port,secure:route.secure!==false,timeoutMs});}
  catch(error){
    const code=safeImapCode(error);
    return bounded({classification:IMAP_UNREACHABLE.has(code)?'TRANSPORT_UNREACHABLE':'CONNECT_FAILED',stage:'CONNECT',errorClass:code});
  }
  try{
    sent.push('CAPABILITY');
    const capability=await imapTagged(socket,'WR0001','CAPABILITY',timeoutMs);
    if(capability.status!=='OK')return bounded({classification:'PROTOCOL_REJECTED',stage:'CAPABILITY',responseCode:capability.responseCode,commandsIssued:[...sent]});
    sent.push('LOGIN');
    const login=await imapTagged(socket,'WR0002',`LOGIN ${imapQuote(credential.username)} ${imapQuote(credential.password)}`,timeoutMs);
    if(login.status!=='OK')return bounded({classification:login.status==='NO'?'AUTH_REJECTED':'PROTOCOL_REJECTED',stage:'LOGIN',responseCode:login.responseCode,commandsIssued:[...sent]});
    sent.push('LOGOUT');
    try{await imapTagged(socket,'WR0003','LOGOUT',timeoutMs);}catch{/* login already answered */}
    return bounded({ok:true,classification:'CAPABILITY_LOGIN_CONFIRMED',stage:'LOGIN',responseCode:login.responseCode,commandsIssued:[...sent]});
  }catch(error){
    const code=safeImapCode(error);
    return bounded({classification:IMAP_UNREACHABLE.has(code)?'TRANSPORT_UNREACHABLE':'PROTOCOL_FAILED',stage:sent[sent.length-1]||'CAPABILITY',errorClass:code,commandsIssued:[...sent]});
  }finally{try{socket.destroy();}catch{/* already closed */}}
}
