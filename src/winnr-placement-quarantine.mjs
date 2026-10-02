import { createStore } from './store.mjs';

const clean=(v,n=500)=>String(v??'').trim().slice(0,n);

export async function applyWinnrPlacementQuarantine({
  config,
  ordinalText=process.env.WINNR_PLACEMENT_QUARANTINE_ORDINALS || '',
  storeFactory=createStore
}={}){
  const ordinals=[...new Set(String(ordinalText||'').split(',').map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=3))].sort((a,b)=>a-b);
  if(!ordinals.length)return {ok:true,status:'WINNR_PLACEMENT_QUARANTINE_DISABLED',pausedOrdinals:[]};
  const store=storeFactory(config);
  try{
    await store.init();
    const accounts=(await store.list('accounts'))
      .filter(a=>a?.provider==='smtp-relay'&&String(a?.slot||'').startsWith('winnr:'))
      .sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
    if(accounts.length!==3)return {ok:false,status:'WINNR_PLACEMENT_QUARANTINE_REFUSED',reasonCodes:['exact-three-winnr-smtp-accounts-required'],observedAccountCount:accounts.length};
    const paused=[];
    for(const ordinal of ordinals){
      const account=accounts[ordinal-1];
      if(!account?.slot)return {ok:false,status:'WINNR_PLACEMENT_QUARANTINE_REFUSED',reasonCodes:['ordinal-account-missing'],ordinal};
      await store.setSenderPaused(account.slot,true,'winnr-gmail-placement-red-2026-10-02');
      paused.push(ordinal);
    }
    const receipt={
      appliedAt:new Date().toISOString(),
      pausedOrdinals:paused,
      reason:'GMAIL_PLACEMENT_RED',
      scope:'SMTP_FLEET_SELECTION_ONLY',
      imapCustodyChanged:false,
      prospectSendAuthorityGranted:false
    };
    await store.setSetting('winnrPlacementQuarantineV1',receipt);
    await store.log('winnr_placement_quarantine_applied',{
      pausedOrdinals:paused,
      reason:receipt.reason,
      senderAddressesLogged:false,
      credentialsLogged:false,
      imapCustodyChanged:false
    });
    return {ok:true,status:'WINNR_PLACEMENT_QUARANTINE_APPLIED',...receipt};
  }catch(error){
    return {ok:false,status:'WINNR_PLACEMENT_QUARANTINE_FAILED',reasonCodes:[clean(error?.message||error,200)]};
  }finally{await store.close().catch(()=>{});}
}
