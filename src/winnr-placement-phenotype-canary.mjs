import { createStore } from './store.mjs';
import { dispatchSmtpFleetAccount } from './uberfleet.mjs';

const TARGET='uberbond.co@gmail.com';
const STATE_KEY='winnrPlacementPhenotypeV1';
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

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
