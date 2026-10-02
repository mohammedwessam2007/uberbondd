import { createStore } from './store.mjs';
import { createWinnrApiClient } from './uberwinnr-adapter.mjs';
import { compileWinnrPostPurchaseRegistryPlan, applyWinnrPostPurchaseRegistryPlan } from './uberwinnr-postpurchase.mjs';
import { compileWinnrCredentialImport } from './uberwinnr-credential-import.mjs';
import { dispatchSmtpFleetAccount } from './uberfleet.mjs';
import { pollImapForwardingAccount } from './uberimap.mjs';

const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);

function domainObserved(value,wanted,depth=0){
  if(depth>6||value==null)return false;
  const target=clean(wanted,253).toLowerCase();
  if(typeof value==='string')return value.trim().toLowerCase()===target;
  if(Array.isArray(value))return value.some(item=>domainObserved(item,target,depth+1));
  if(typeof value==='object')return Object.values(value).some(item=>domainObserved(item,target,depth+1));
  return false;
}

function safeFailure(error){
  return clean(error?.message||error,300).replace(/[^a-zA-Z0-9 .:_-]/g,'?');
}

export async function runWinnrRuntimeBootstrap({
  config,
  csvText='',
  canaryTarget='',
  workspaceId='uberbond-outreach',
  smtpSkipOrdinals=[],
  smtpInterProbeDelayMs=15000
}={}){
  const startedAt=new Date().toISOString();
  const reasons=[];
  if(!config)reasons.push('config-required');
  if(!clean(csvText,2_000_000))reasons.push('credential-export-required');
  if(!/^[a-f0-9]{64}$/i.test(String(config?.encryptionKey||'')))reasons.push('token-encryption-key-required');
  if(!clean(canaryTarget,320).includes('@'))reasons.push('owner-controlled-canary-target-required');
  if(reasons.length)return {ok:false,status:'WINNR_RUNTIME_BOOTSTRAP_REFUSED',reasonCodes:reasons,messagesSent:0};

  const winnr=createWinnrApiClient({
    token:config.providers?.winnr?.apiKey||'',
    authorized:config.providers?.winnr?.accountAuthorized===true,
    termsCompatible:config.providers?.winnr?.termsCompatible===true,
    evidenceRef:config.providers?.winnr?.termsEvidenceRef||''
  });
  if(!winnr.ok)return {ok:false,status:'WINNR_RUNTIME_BOOTSTRAP_REFUSED',reasonCodes:winnr.reasonCodes||['winnr-client-not-ready'],messagesSent:0};

  const plan=compileWinnrPostPurchaseRegistryPlan({csvText,workspaceId,plannedDailyCap:2});
  if(!plan.ok)return {...plan,messagesSent:0};

  const owned=await winnr.listMyPrewarmed();
  if(!owned.ok)return {ok:false,status:'WINNR_RUNTIME_ENTITLEMENT_UNRECONCILED',reasonCodes:['provider-owned-prewarmed-read-required'],providerReceipt:owned.receipt||null,messagesSent:0};
  if(!domainObserved(owned.data,plan.domain.domain))return {ok:false,status:'WINNR_RUNTIME_ENTITLEMENT_UNRECONCILED',reasonCodes:['credential-export-domain-not-observed-in-provider-account'],providerReceipt:owned.receipt||null,messagesSent:0};

  const providerDigest=clean(owned.receipt?.responseDigest,200);
  if(!providerDigest)return {ok:false,status:'WINNR_RUNTIME_ENTITLEMENT_UNRECONCILED',reasonCodes:['provider-entitlement-receipt-digest-required'],messagesSent:0};

  const store=createStore(config);
  try{
    await store.init();
    const applied=await applyWinnrPostPurchaseRegistryPlan({store,plan,date:new Date()});
    if(!applied.ok)return {...applied,messagesSent:0};

    const routeEvidenceRef=`winnr:list-my-prewarmed:${providerDigest}`;
    const prepared=compileWinnrCredentialImport({
      csvText,
      encryptionKey:config.encryptionKey,
      workspaceId:plan.workspaceId,
      linksByEmail:applied.linksByEmail,
      routeEvidenceRef,
      routeAuthorized:true,
      termsCompatible:config.providers?.winnr?.termsCompatible===true,
      plannedDailyCap:2,
      plannedHourlyCap:1,
      minGapSeconds:Math.max(900,Number(config.outbound?.canaryMinGapSeconds||1800))
    });
    if(!['IMPORT_READY','PARTIAL_IMPORT_READY'].includes(prepared.status)||prepared.failureCount){
      return {ok:false,status:'WINNR_RUNTIME_CREDENTIAL_IMPORT_REFUSED',reasonCodes:prepared.reasonCodes||['credential-import-not-ready'],messagesSent:0};
    }

    for(const row of prepared.prepared){
      await store.upsert('accounts',{...row.smtpAccount,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      await store.upsert('accounts',{...row.imapAccount,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    }
    await store.log('winnr_postpurchase_credentials_imported',{
      domainId:plan.domain.domainId,
      domain:plan.domain.domain,
      mailboxCount:prepared.preparedCount,
      accountRowsWritten:prepared.preparedCount*2,
      providerEvidenceRef:routeEvidenceRef,
      credentialStorage:'AES_256_GCM_ENCRYPTED',
      plaintextCredentialsLogged:false,
      plannedDailyCap:2,
      source:'one-time-runtime-bootstrap'
    });

    const probes=[];
    let messagesSent=0;
    const skipSmtp=new Set((Array.isArray(smtpSkipOrdinals)?smtpSkipOrdinals:[]).map(Number).filter(n=>Number.isInteger(n)&&n>0));
    let attemptedSmtp=0;
    for(let i=0;i<prepared.prepared.length;i++){
      const row=prepared.prepared[i];
      const ordinal=i+1;
      let imap={ok:false,status:'NOT_RUN'};
      let smtp=skipSmtp.has(ordinal)
        ? {classification:'PREVIOUSLY_CONFIRMED',reasonCodes:[]}
        : {classification:'REJECTED',reasonCodes:['not-run']};
      try{
        imap=await pollImapForwardingAccount({account:row.imapAccount,encryptionKey:config.encryptionKey,limit:1});
      }catch(error){
        imap={ok:false,status:'IMAP_PROBE_EXCEPTION',error:safeFailure(error)};
      }
      if(!skipSmtp.has(ordinal)){
        if(attemptedSmtp>0)await new Promise(resolve=>setTimeout(resolve,Math.max(1000,Math.min(60000,Number(smtpInterProbeDelayMs)||15000))));
        attemptedSmtp++;
      try{
        smtp=await dispatchSmtpFleetAccount({
          account:row.smtpAccount,
          encryptionKey:config.encryptionKey,
          message:{
            to:clean(canaryTarget,320).toLowerCase(),
            subject:`UberBond Winnr runtime canary ${i+1}/${prepared.prepared.length}`,
            body:'Owner-controlled infrastructure verification from the UberBond cloud runtime. No action required.'
          }
        });
        if(smtp?.classification==='ACCEPTED')messagesSent++;
      }catch(error){
        smtp={classification:'REJECTED',reasonCodes:['smtp-probe-exception'],dispatchError:safeFailure(error)};
      }
      }
      probes.push({
        accountOrdinal:ordinal,
        smtpConfirmed:['ACCEPTED','PREVIOUSLY_CONFIRMED'].includes(smtp?.classification),
        smtpClassification:smtp?.classification||'UNKNOWN',
        smtpReasonCodes:Array.isArray(smtp?.reasonCodes)?smtp.reasonCodes.map(x=>clean(x,120)).slice(0,5):[],
        smtpError:clean(smtp?.dispatchError,300)||null,
        imapConfirmed:imap?.ok===true,
        imapStatus:imap?.status||'UNKNOWN'
      });
    }

    const smtpConfirmed=probes.filter(x=>x.smtpConfirmed).length;
    const imapConfirmed=probes.filter(x=>x.imapConfirmed).length;
    const allGreen=smtpConfirmed===prepared.preparedCount&&imapConfirmed===prepared.preparedCount;
    await store.log('winnr_runtime_transport_probe',{
      domainId:plan.domain.domainId,
      mailboxCount:prepared.preparedCount,
      smtpConfirmed,
      imapConfirmed,
      messagesSent,
      ownerControlledTarget:true,
      plaintextCredentialsLogged:false,
      allGreen
    });

    return {
      ok:allGreen,
      status:allGreen?'WINNR_RUNTIME_TRANSPORT_VERIFIED':'WINNR_RUNTIME_TRANSPORT_PARTIAL',
      domain:plan.domain.domain,
      mailboxCount:prepared.preparedCount,
      accountRowsWritten:prepared.preparedCount*2,
      credentialStorage:'AES_256_GCM_ENCRYPTED',
      plaintextCredentialsLogged:false,
      providerEvidenceRef:routeEvidenceRef,
      smtpConfirmed,
      imapConfirmed,
      messagesSent,
      probes,
      startedAt,
      finishedAt:new Date().toISOString()
    };
  }finally{
    await store.close().catch(()=>{});
  }
}
