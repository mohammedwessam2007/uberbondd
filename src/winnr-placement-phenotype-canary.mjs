import { createStore } from './store.mjs';
import { dispatchSmtpFleetAccount } from './uberfleet.mjs';

const TARGET='uberbond.co@gmail.com';
const STATE_KEY='winnrPlacementPhenotypeV1';
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Separate founder-authorized seed experiment; never expands prospect authority.
const PERSONAL_TARGET='mohammedwessam306@gmail.com';
const PERSONAL_STATE_KEY='winnrPersonalInboxCanary20261002';
export async function runWinnrPersonalInboxCanary({
  config, storeFactory=createStore, dispatchFn=dispatchSmtpFleetAccount,
  target=PERSONAL_TARGET, now=new Date(), delayFn=delay
}={}){
  if(!config?.encryptionKey || target!==PERSONAL_TARGET)
    return {ok:false,status:'WINNR_PERSONAL_CANARY_REFUSED',reasonCodes:['fixed-owner-target-and-encryption-required']};
  const store=storeFactory(config);
  try{
    await store.init();
    const accounts=(await store.list('accounts'))
      .filter(a=>a?.provider==='smtp-relay'&&String(a?.slot||'').startsWith('winnr:')&&a?.connected===true)
      .sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
    if(accounts.length!==3 || new Set(accounts.map(a=>a.id)).size!==3)
      return {ok:false,status:'WINNR_PERSONAL_CANARY_REFUSED',reasonCodes:['exact-three-distinct-connected-smtp-accounts-required']};
    // Reserve before any effect. Overlapping boots, crashes and uncertain sends
    // require external reconciliation, never an automatic replay.
    const claim=await store.transaction(async tx=>{
      if(tx.pool)await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',[PERSONAL_STATE_KEY]);
      const prior=(await tx.getSettings())[PERSONAL_STATE_KEY];
      if(prior)return {claimed:false,prior};
      await tx.setSetting(PERSONAL_STATE_KEY,{startedAt:now.toISOString(),results:[],automaticRetryAuthorized:false});
      return {claimed:true};
    });
    if(!claim.claimed)return {
      ok:Boolean(claim.prior.completedAt),
      status:claim.prior.completedAt?'WINNR_PERSONAL_CANARY_ALREADY_COMPLETED':'WINNR_PERSONAL_CANARY_RECONCILE_REQUIRED',
      results:claim.prior.results||[],automaticRetryAuthorized:false
    };
    const results=[];
    for(let i=0;i<3;i++){
      let result;
      try{
        result=await dispatchFn({account:accounts[i],encryptionKey:config.encryptionKey,message:{
          to:PERSONAL_TARGET,fromName:'Wessam Solomon | UberBond',
          subject:'UberBond personal inbox check',
          body:`Hi Wessam,\n\nThis is the one-time personal inbox delivery check you requested for mailbox ${i+1} of 3. No action needed.\n\nWessam Solomon | UberBond`
        }});
      }catch{result={classification:'UNCERTAIN'};}
      const classification=['ACCEPTED','REJECTED','UNCERTAIN'].includes(result?.classification)?result.classification:'UNCERTAIN';
      results.push({ordinal:i+1,classification,messageId:classification==='ACCEPTED'?clean(result?.messageId,500)||null:null,sentAt:new Date().toISOString()});
      const complete=results.length===3&&results.every(x=>x.classification==='ACCEPTED');
      await store.setSetting(PERSONAL_STATE_KEY,{
        startedAt:now.toISOString(),results,automaticRetryAuthorized:false,
        ...(complete?{completedAt:new Date().toISOString()}:{})
      });
      await store.log('winnr_personal_inbox_canary_attempt',{
        ordinal:i+1,classification,targetClass:'FIXED_OWNER_PERSONAL_GMAIL',
        senderAddressesLogged:false,credentialsLogged:false,prospectSendAuthorityGranted:false
      });
      if(classification!=='ACCEPTED')return {ok:false,status:'WINNR_PERSONAL_CANARY_RECONCILE_REQUIRED',results,automaticRetryAuthorized:false};
      if(i<2)await delayFn(2000);
    }
    return {ok:true,status:'WINNR_PERSONAL_CANARY_SENT',results,automaticRetryAuthorized:false,prospectSendAuthorityGranted:false};
  }finally{await store.close().catch(()=>{});}
}

export async function runWinnrPlacementPhenotypeCanary({
  config,
  storeFactory=createStore,
  dispatchFn=dispatchSmtpFleetAccount,
  target=TARGET,
  now=new Date()
}={}){
  if(!config?.encryptionKey)return {ok:false,status:'WINNR_PLACEMENT_CANARY_REFUSED',reasonCodes:['encryption-key-required']};
  if(String(target||'').trim().toLowerCase()!==TARGET)return {ok:false,status:'WINNR_PLACEMENT_CANARY_REFUSED',reasonCodes:['owner-controlled-target-required']};
  const store=storeFactory(config);
  try{
    await store.init();
    const prior=(await store.getSettings())?.[STATE_KEY]||{};
    if(prior?.completedAt)return {ok:true,status:'WINNR_PLACEMENT_CANARY_ALREADY_COMPLETED',completedAt:prior.completedAt,results:prior.results||[]};

    const accounts=(await store.list('accounts'))
      .filter(a=>a?.provider==='smtp-relay'&&String(a?.slot||'').startsWith('winnr:')&&a?.connected===true)
      .sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
    if(accounts.length!==3)return {ok:false,status:'WINNR_PLACEMENT_CANARY_REFUSED',reasonCodes:['exact-three-winnr-smtp-accounts-required'],observedAccountCount:accounts.length};

    const previous=Array.isArray(prior?.results)?prior.results:[];
    const accepted=new Map(previous.filter(x=>x?.classification==='ACCEPTED').map(x=>[Number(x.ordinal),x]));
    const results=[...previous];
    const subject='quick note';
    const body="Hi Wessam,\n\nJust confirming everything is working after today's setup. No action needed.\n\nWessam";

    for(let i=0;i<accounts.length;i++){
      const ordinal=i+1;
      if(accepted.has(ordinal))continue;
      const result=await dispatchFn({
        account:accounts[i],
        encryptionKey:config.encryptionKey,
        message:{
          to:TARGET,
          subject,
          body,
          fromName:'Wessam Solomon | UberBond'
        }
      });
      const safe={
        ordinal,
        classification:clean(result?.classification,80)||'UNKNOWN',
        messageId:clean(result?.messageId,500)||null,
        providerReferenceId:clean(result?.providerReferenceId,500)||null,
        reasonCodes:Array.isArray(result?.reasonCodes)?result.reasonCodes.map(x=>clean(x,120)).filter(Boolean):[],
        sentAt:new Date().toISOString()
      };
      results.push(safe);
      await store.setSetting(STATE_KEY,{startedAt:prior?.startedAt||now.toISOString(),results});
      await store.log('winnr_placement_phenotype_canary_attempt',{
        ordinal,
        classification:safe.classification,
        messageId:safe.messageId,
        providerReferenceId:safe.providerReferenceId,
        targetClass:'OWNER_CONTROLLED_GMAIL',
        senderAddressLogged:false,
        messageBodyLogged:false,
        credentialsLogged:false
      });
      if(safe.classification!=='ACCEPTED'){
        return {ok:false,status:'WINNR_PLACEMENT_CANARY_PARTIAL',results,automaticRetryAuthorized:false};
      }
      if(i<accounts.length-1)await delay(2000);
    }

    const latestByOrdinal=new Map();
    for(const row of results)latestByOrdinal.set(Number(row.ordinal),row);
    const final=[1,2,3].map(n=>latestByOrdinal.get(n)).filter(Boolean);
    const ok=final.length===3&&final.every(x=>x.classification==='ACCEPTED');
    if(ok){
      const completedAt=new Date().toISOString();
      await store.setSetting(STATE_KEY,{startedAt:prior?.startedAt||now.toISOString(),completedAt,results:final});
      await store.log('winnr_placement_phenotype_canary_completed',{
        ok:true,
        acceptedOrdinals:[1,2,3],
        messageIds:final.map(x=>x.messageId).filter(Boolean),
        targetClass:'OWNER_CONTROLLED_GMAIL',
        senderAddressLogged:false,
        messageBodyLogged:false,
        credentialsLogged:false
      });
      return {ok:true,status:'WINNR_PLACEMENT_CANARY_SENT',completedAt,results:final};
    }
    return {ok:false,status:'WINNR_PLACEMENT_CANARY_PARTIAL',results:final,automaticRetryAuthorized:false};
  }finally{await store.close().catch(()=>{});}
}
