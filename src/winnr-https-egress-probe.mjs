import { createStore } from './store.mjs';
import { openSmtpAccountCredential } from './uberfleet.mjs';

const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export async function runWinnrHttpsEgressProbe({
  config,
  probeUrl=process.env.WINNR_HTTPS_PROBE_URL,
  probeToken=process.env.WINNR_HTTPS_PROBE_TOKEN,
  canaryTarget='uberbond.co@gmail.com',
  ordinals=[2,3]
}={}){
  if(!config||!/^[a-f0-9]{64}$/i.test(String(config.encryptionKey||'')))return {ok:false,status:'WINNR_HTTPS_EGRESS_REFUSED',reasonCodes:['encryption-key-required']};
  const url=clean(probeUrl,2000), token=clean(probeToken,1000);
  if(!/^https:\/\//i.test(url)||!token)return {ok:false,status:'WINNR_HTTPS_EGRESS_DISABLED',reasonCodes:['probe-url-and-token-required']};
  const wanted=[...new Set((Array.isArray(ordinals)?ordinals:[]).map(Number).filter(n=>n===2||n===3))];
  if(!wanted.length)return {ok:false,status:'WINNR_HTTPS_EGRESS_REFUSED',reasonCodes:['bounded-ordinals-required']};
  const store=createStore(config);
  try{
    await store.init();
    const rows=(await store.list('accounts',{orderBy:'createdAt',order:'asc'}))
      .filter(a=>String(a?.slot||'').startsWith('winnr:')&&a?.provider==='smtp-relay'&&a?.smtpRoute?.host==='inbound.mywinnr.com'&&Number(a?.smtpRoute?.port)===465);
    if(rows.length!==3)return {ok:false,status:'WINNR_HTTPS_EGRESS_REFUSED',reasonCodes:['exact-three-winnr-smtp-accounts-required'],observedAccountCount:rows.length};
    const settings=await store.getSettings();
    const state=settings?.winnrSealedBootstrapV1||{};
    const already=new Set((Array.isArray(state.smtpConfirmedOrdinals)?state.smtpConfirmedOrdinals:[]).map(Number));
    const results=[];
    for(const ordinal of wanted){
      if(already.has(ordinal)){results.push({ordinal,ok:true,accepted:true,status:'PREVIOUSLY_CONFIRMED'});continue;}
      const account=rows[ordinal-1];
      if(!account){results.push({ordinal,ok:false,accepted:false,status:'ACCOUNT_NOT_FOUND'});continue;}
      let credential;
      try{credential=openSmtpAccountCredential(account,config.encryptionKey);}
      catch{results.push({ordinal,ok:false,accepted:false,status:'CREDENTIAL_OPEN_REFUSED'});continue;}
      let response,body;
      try{
        response=await fetch(url,{
          method:'POST',
          headers:{'content-type':'application/json','authorization':`Bearer ${token}`},
          body:JSON.stringify({
            smtpHost:'inbound.mywinnr.com',smtpPort:465,
            username:credential.username,password:credential.password,
            fromName:'Wessam Solomon | UberBond',
            recipient:canaryTarget,
            ordinal,
            subject:`UberBond Winnr alternate-egress canary ${ordinal}/3`
          }),
          signal:AbortSignal.timeout(25000)
        });
        body=await response.json().catch(()=>({}));
      }catch(error){
        results.push({ordinal,ok:false,accepted:false,status:'HTTPS_BRIDGE_CALL_FAILED',errorCode:clean(error?.name||'fetch-error',80)});
        continue;
      }
      const accepted=response.ok&&body?.accepted===true&&body?.ok===true;
      results.push({ordinal,ok:accepted,accepted,status:clean(body?.stage||body?.status||(response.ok?'UNKNOWN':'HTTP_ERROR'),120),smtpCode:body?.smtpCode??null,tlsProtocol:clean(body?.tlsProtocol,80)||null,errorCode:clean(body?.errorCode,120)||null});
      if(accepted){
        already.add(ordinal);
        const next={...state,smtpConfirmedOrdinals:[...already].sort((a,b)=>a-b),smtpConfirmationUpdatedAt:new Date().toISOString()};
        await store.setSetting('winnrSealedBootstrapV1',next);
        await store.log('winnr_https_egress_smtp_confirmed',{ordinal,accepted:true,bridge:'https-bounded-owner-canary',plaintextCredentialsLogged:false});
      }
      await sleep(2000);
    }
    const confirmed=[...already].filter(n=>n>=1&&n<=3).sort((a,b)=>a-b);
    const ok=[1,2,3].every(n=>confirmed.includes(n));
    await store.log('winnr_https_egress_probe_completed',{ok,confirmedOrdinals:confirmed,results:results.map(r=>({ordinal:r.ordinal,accepted:r.accepted,status:r.status,smtpCode:r.smtpCode??null,tlsProtocol:r.tlsProtocol??null,errorCode:r.errorCode??null})),plaintextCredentialsLogged:false});
    return {ok,status:ok?'WINNR_HTTPS_EGRESS_TRANSPORT_VERIFIED':'WINNR_HTTPS_EGRESS_PARTIAL',confirmedOrdinals:confirmed,results};
  }finally{await store.close().catch(()=>{});}
}
