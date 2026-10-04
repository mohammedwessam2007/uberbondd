import { createStore } from './store.mjs';
import { pollImapForwardingAccount } from './uberimap.mjs';
import { diagnoseWinnrImapStages } from './winnr-imap-stage-diagnostic.mjs';

const SUBJECTS=new Map([
  ['Re: UberBond Winnr runtime canary 2/3',2],
  ['Re: UberBond Winnr runtime canary 3/3',3]
]);
const RETRYABLE=new Set(['IMAP_CONNECT_FAILED','ETIMEDOUT','ENETUNREACH','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENOTFOUND']);

export function classifyImapProbeException(error){
  const code=String(error?.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'_');
  if(code&&code!=='ERROR')return code.slice(0,80);
  const message=String(error?.message||'').toLowerCase();
  if(message.includes('imap-connect-failed'))return'IMAP_CONNECT_FAILED';
  if(message.includes('timeout'))return'ETIMEDOUT';
  if(message.includes('certificate')||message.includes('tls'))return'TLS_FAILURE';
  if(message.includes('imap-command-rejected'))return'IMAP_COMMAND_REJECTED';
  if(message.includes('greeting'))return'IMAP_GREETING_ERROR';
  return'IMAP_PROBE_EXCEPTION';
}

async function pollWithOneSafeRetry(pollFn,args){
  let attempts=0,lastError=null;
  while(attempts<2){
    attempts+=1;
    try{return {poll:await pollFn(args),attempts,errorClass:null};}
    catch(error){
      lastError=classifyImapProbeException(error);
      if(attempts>=2||!RETRYABLE.has(lastError))break;
    }
  }
  return {poll:{ok:false,status:'IMAP_PROBE_EXCEPTION',messages:[]},attempts,errorClass:lastError||'IMAP_PROBE_EXCEPTION'};
}

export async function verifyWinnrReplyCanaries({
  config,
  storeFactory=createStore,
  pollFn=pollImapForwardingAccount,
  diagnosticFn=diagnoseWinnrImapStages
}={}){
  if(!config?.encryptionKey)return {ok:false,transportHealthy:false,canaryPresenceObserved:false,status:'WINNR_REPLY_CANARY_VERIFY_REFUSED',reasonCodes:['encryption-key-required']};
  const store=storeFactory(config);
  try{
    await store.init();
    const accounts=(await store.list('accounts'))
      .filter(a=>String(a?.provider||'').toLowerCase()==='imap-forwarding'&&String(a?.slot||'').startsWith('winnr-imap:'));
    const found=new Set();
    const accountResults=[];
    let commandDiagnostic=null;
    for(const account of accounts){
      const {poll,attempts,errorClass}=await pollWithOneSafeRetry(pollFn,{account:{...account,lastImapUid:0},encryptionKey:config.encryptionKey,limit:100});
      if(errorClass==='IMAP_COMMAND_REJECTED'&&!commandDiagnostic&&typeof diagnosticFn==='function'){
        try{
          const detail=await diagnosticFn({account:{...account,lastImapUid:0},encryptionKey:config.encryptionKey});
          commandDiagnostic={accountId:account.id,...detail};
        }catch(error){
          commandDiagnostic={accountId:account.id,ok:false,stage:'DIAGNOSTIC',errorClass:classifyImapProbeException(error),rawProviderTextLogged:false,credentialsLogged:false};
        }
      }
      for(const message of poll?.messages||[]){
        const ordinal=SUBJECTS.get(String(message?.subject||'').trim());
        if(ordinal)found.add(ordinal);
      }
      accountResults.push({
        accountId:account.id,
        ok:poll?.ok===true,
        status:poll?.status||'UNKNOWN',
        attempts,
        ...(errorClass?{errorClass}:{})
      });
    }
    const foundOrdinals=[...found].sort((a,b)=>a-b);
    const canaryPresenceObserved=[2,3].every(n=>found.has(n));
    const transportHealthy=accountResults.length>0&&accountResults.every(x=>x.ok===true&&x.status==='UBERIMAP_FETCH_CONFIRMED');
    const ok=canaryPresenceObserved;
    const status=canaryPresenceObserved
      ?'WINNR_REPLY_CANARIES_INGESTIBLE'
      :transportHealthy
        ?'WINNR_IMAP_TRANSPORT_HEALTHY_CANARIES_NOT_OBSERVED_IN_RECENT_WINDOW'
        :'WINNR_REPLY_CANARIES_NOT_CONFIRMED';
    const safeDiagnostic=commandDiagnostic?{
      accountId:commandDiagnostic.accountId,
      ok:commandDiagnostic.ok===true,
      stage:String(commandDiagnostic.stage||'UNKNOWN').slice(0,40),
      status:String(commandDiagnostic.status||'').slice(0,20)||undefined,
      responseCode:String(commandDiagnostic.responseCode||'').slice(0,80)||undefined,
      errorClass:String(commandDiagnostic.errorClass||'').slice(0,80)||undefined,
      rawProviderTextLogged:false,
      credentialsLogged:false
    }:null;
    await store.log('winnr_reply_canary_verification',{
      ok,
      status,
      transportHealthy,
      canaryPresenceObserved,
      foundOrdinals,
      expectedOrdinals:[2,3],
      imapAccountsChecked:accounts.length,
      failedAccountCount:accountResults.filter(x=>!x.ok).length,
      failureClasses:[...new Set(accountResults.map(x=>x.errorClass).filter(Boolean))],
      ...(safeDiagnostic?{commandDiagnostic:safeDiagnostic}:{}),
      messageBodiesLogged:false,
      senderAddressesLogged:false,
      credentialsLogged:false
    });
    return {
      ok,
      status,
      transportHealthy,
      canaryPresenceObserved,
      foundOrdinals,
      expectedOrdinals:[2,3],
      imapAccountsChecked:accounts.length,
      accountResults,
      ...(safeDiagnostic?{commandDiagnostic:safeDiagnostic}:{}),
      messageBodiesLogged:false,
      senderAddressesLogged:false,
      credentialsLogged:false
    };
  }finally{await store.close().catch(()=>{});}
}
