import { createStore } from './store.mjs';
import { dispatchSmtpFleetAccount } from './uberfleet.mjs';
import { gateOutboundRoute, requestOutboundPackage } from './outbound-send-authorization.mjs';

const TARGET='uberbond.co@gmail.com';
const STATE_KEY='winnrPlacementPhenotypeV1';
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Separate founder-authorized seed experiment; never expands prospect authority.
const PERSONAL_TARGET='mohammedwessam306@gmail.com';
const PERSONAL_STATE_KEY='winnrPersonalInboxCanary20261002';
export async function runWinnrPersonalInboxCanary({
  config, storeFactory=createStore, dispatchFn=dispatchSmtpFleetAccount,
  target=PERSONAL_TARGET, now=new Date(), delayFn=delay,
  outboundAuthorization=null, consentVerifier=undefined
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
    // Exact-message gate for all three one-time sends, decided before the claim so a refusal consumes no reservation.
    const prepared=[];
    for(let i=0;i<accounts.length;i++){
      const message={
        to:PERSONAL_TARGET,from:accounts[i].email,fromName:'Wessam Solomon | UberBond',
        subject:'UberBond personal inbox check',
        body:`Hi Wessam,\n\nThis is the one-time personal inbox delivery check you requested for mailbox ${i+1} of 3. No action needed.\n\nWessam Solomon | UberBond`
      };
      const authorization=await requestOutboundPackage(outboundAuthorization,{message,account:accounts[i],ordinal:i+1});
      const refusal=gateOutboundRoute({account:accounts[i],message:{...message,authorization:authorization||undefined},consentVerifier});
      if(refusal)return {ok:false,status:'WINNR_PERSONAL_CANARY_REFUSED',reasonCodes:refusal.reasonCodes,automaticRetryAuthorized:false};
      prepared.push({message:{...message,authorization}});
    }

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
        result=await dispatchFn({account:accounts[i],encryptionKey:config.encryptionKey,message:prepared[i].message,consentVerifier});
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

// A placement ordinal whose outcome is anything but ACCEPTED may already have crossed the provider boundary. Such an
// ordinal is never dispatched again automatically. The run stops and the decision belongs to the owner.
const PLACEMENT_RECONCILE_REASON='owner-reconciliation-required-prior-outcome-not-accepted';
const PLACEMENT_CLAIM_REASON='dispatch-claimed-outcome-not-recorded';

function latestPlacementRows(rows){
  const latest=new Map();
  for(const row of rows)latest.set(Number(row?.ordinal),row);
  return latest;
}

// True when any ordinal's most recent recorded outcome is not ACCEPTED, which includes a claim whose outcome was never recorded.
function placementRunBlocked(rows){
  return [...latestPlacementRows(rows).values()].some(row=>row?.classification!=='ACCEPTED');
}

function placementRefusal(results){
  return {ok:false,status:'WINNR_PLACEMENT_CANARY_PARTIAL',results,automaticRetryAuthorized:false,reasonCodes:[PLACEMENT_RECONCILE_REASON]};
}

// Claims one ordinal in one transaction. On PostgreSQL the advisory lock serializes overlapping calls, so the check and the
// claim are a single step. The claim row is written before the send and replaced only after the outcome is recorded. A crash
// in between leaves a non-ACCEPTED row, and that row blocks the next call.
async function claimPlacementOrdinal(store,{ordinal,now}){
  return store.transaction(async tx=>{
    if(tx.pool)await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',[STATE_KEY]);
    const prior=(await tx.getSettings())?.[STATE_KEY]||{};
    if(prior.completedAt)return {completedAt:prior.completedAt,results:prior.results||[]};
    const rows=Array.isArray(prior.results)?prior.results:[];
    if(placementRunBlocked(rows))return {refused:true,results:rows};
    if(latestPlacementRows(rows).has(ordinal))return {skip:true,results:rows};
    const results=[...rows,{ordinal,classification:'DISPATCH_CLAIMED',messageId:null,providerReferenceId:null,reasonCodes:[PLACEMENT_CLAIM_REASON],sentAt:now.toISOString()}];
    await tx.setSetting(STATE_KEY,{startedAt:prior.startedAt||now.toISOString(),results});
    return {claimed:true,results};
  });
}

export async function runWinnrPlacementPhenotypeCanary({
  config,
  storeFactory=createStore,
  dispatchFn=dispatchSmtpFleetAccount,
  target=TARGET,
  now=new Date(),
  outboundAuthorization=null,
  consentVerifier=undefined,
  delayFn=delay
}={}){
  if(!config?.encryptionKey)return {ok:false,status:'WINNR_PLACEMENT_CANARY_REFUSED',reasonCodes:['encryption-key-required']};
  if(String(target||'').trim().toLowerCase()!==TARGET)return {ok:false,status:'WINNR_PLACEMENT_CANARY_REFUSED',reasonCodes:['owner-controlled-target-required']};
  const store=storeFactory(config);
  try{
    await store.init();
    const prior=(await store.getSettings())?.[STATE_KEY]||{};
    if(prior?.completedAt)return {ok:true,status:'WINNR_PLACEMENT_CANARY_ALREADY_COMPLETED',completedAt:prior.completedAt,results:prior.results||[]};
    // A recorded non-ACCEPTED outcome stops the run before any account read, authorization supplier call or send.
    const earlier=Array.isArray(prior?.results)?prior.results:[];
    if(placementRunBlocked(earlier))return placementRefusal(earlier);

    const accounts=(await store.list('accounts'))
      .filter(a=>a?.provider==='smtp-relay'&&String(a?.slot||'').startsWith('winnr:')&&a?.connected===true)
      .sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
    if(accounts.length!==3)return {ok:false,status:'WINNR_PLACEMENT_CANARY_REFUSED',reasonCodes:['exact-three-winnr-smtp-accounts-required'],observedAccountCount:accounts.length};

    const previous=Array.isArray(prior?.results)?prior.results:[];
    const accepted=new Set([...latestPlacementRows(previous)].filter(([,row])=>row?.classification==='ACCEPTED').map(([ordinal])=>ordinal));
    let results=[...previous];
    const subject='quick note';
    const body="Hi Wessam,\n\nJust confirming everything is working after today's setup. No action needed.\n\nWessam";

    // Exact-message gate for every pending send, decided before the first send so a refusal sends nothing and writes no state.
    const preparedByOrdinal=new Map();
    for(let i=0;i<accounts.length;i++){
      const ordinal=i+1;
      if(accepted.has(ordinal))continue;
      const message={to:TARGET,from:accounts[i].email,subject,body,fromName:'Wessam Solomon | UberBond'};
      const authorization=await requestOutboundPackage(outboundAuthorization,{message,account:accounts[i],ordinal});
      const refusal=gateOutboundRoute({account:accounts[i],message:{...message,authorization:authorization||undefined},consentVerifier});
      if(refusal)return {ok:false,status:'WINNR_PLACEMENT_CANARY_REFUSED',reasonCodes:refusal.reasonCodes,ordinal,automaticRetryAuthorized:false};
      preparedByOrdinal.set(ordinal,{message:{...message,authorization}});
    }

    for(let i=0;i<accounts.length;i++){
      const ordinal=i+1;
      if(accepted.has(ordinal))continue;
      // Nothing reaches the provider unless this call holds the claim. A refused or already-claimed ordinal is not sent.
      const claim=await claimPlacementOrdinal(store,{ordinal,now});
      if(claim.completedAt)return {ok:true,status:'WINNR_PLACEMENT_CANARY_ALREADY_COMPLETED',completedAt:claim.completedAt,results:claim.results};
      if(claim.refused)return placementRefusal(claim.results);
      results=claim.results;
      if(claim.skip)continue;
      let result;
      try{
        result=await dispatchFn({
          account:accounts[i],
          encryptionKey:config.encryptionKey,
          message:preparedByOrdinal.get(ordinal).message,
          consentVerifier
        });
      }catch{result={classification:'UNCERTAIN'};}
      const safe={
        ordinal,
        classification:clean(result?.classification,80)||'UNKNOWN',
        messageId:clean(result?.messageId,500)||null,
        providerReferenceId:clean(result?.providerReferenceId,500)||null,
        reasonCodes:Array.isArray(result?.reasonCodes)?result.reasonCodes.map(x=>clean(x,120)).filter(Boolean):[],
        sentAt:new Date().toISOString()
      };
      // The recorded outcome replaces this call's claim row. It is never appended beside it.
      results=[...results.slice(0,-1),safe];
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
      if(i<accounts.length-1)await delayFn(2000);
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
