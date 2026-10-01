import crypto from 'node:crypto';
import {
  registerSendingDomain, logSendingDomainEvent, recordMailboxLinked, loadSendingDomain
} from './sending-domain-registry.mjs';
import {
  registerSendingMailbox, logSendingMailboxEvent, loadSendingMailbox
} from './sending-mailbox-registry.mjs';
import { inspectWinnrCredentialExport } from './uberwinnr-credential-import.mjs';

export const UBERWINNR_POSTPURCHASE_VERSION='uberbond.uberwinnr-postpurchase.v1';
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const hash=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());

const domainIdFor=domain=>`winnr-domain-${hash(String(domain).toLowerCase()).slice(0,20)}`;
const mailboxIdFor=email=>`winnr-mailbox-${hash(String(email).toLowerCase()).slice(0,20)}`;

export function compileWinnrPostPurchaseRegistryPlan({
  csvText='',
  workspaceId='uberbond-outreach',
  providerDomainId='',
  providerMailboxIdsByEmail={},
  plannedDailyCap=2
}={}){
  const inspection=inspectWinnrCredentialExport(csvText);
  const reasons=[];
  if(!clean(workspaceId,120))reasons.push('workspace-id-required');
  if(inspection.rowCount<1)reasons.push('credential-export-mailboxes-required');
  if(inspection.domains.length!==1)reasons.push('exactly-one-prewarmed-domain-required');
  const domain=inspection.domains[0]||'';
  const cap=Number(plannedDailyCap);
  if(!Number.isFinite(cap)||cap<0||cap>5)reasons.push('bounded-initial-daily-cap-required');
  if(reasons.length)return Object.freeze({
    ok:false,status:'WINNR_POSTPURCHASE_PLAN_REFUSED',reasonCodes:[...new Set(reasons)],
    providerCalls:0,messagesSent:0,externalEffectAuthority:'NONE'
  });

  const domainId=domainIdFor(domain);
  const mailboxRows=inspection.rows.map(row=>{
    const mailboxId=mailboxIdFor(row.email);
    return Object.freeze({
      email:row.email,
      domain:row.domain,
      mailboxId,
      sendingDomainId:domainId,
      providerMailboxId:clean(providerMailboxIdsByEmail?.[row.email],240)||null,
      plannedDailyCap:Math.floor(cap)
    });
  });

  return Object.freeze({
    ok:true,
    status:'WINNR_POSTPURCHASE_REGISTRY_PLAN_READY',
    version:UBERWINNR_POSTPURCHASE_VERSION,
    workspaceId:clean(workspaceId,120),
    domain:Object.freeze({
      domain,
      domainId,
      providerDomainId:clean(providerDomainId,240)||null,
      ownershipStatus:'PROVIDER_CONTROL_CONFIRMED',
      provider:'winnr-prewarmed',
      registrar:'winnr-managed'
    }),
    mailboxes:mailboxRows,
    linksByEmail:Object.freeze(Object.fromEntries(mailboxRows.map(row=>[
      row.email,
      Object.freeze({sendingDomainId:row.sendingDomainId,sendingMailboxId:row.mailboxId})
    ]))),
    sourceDigest:inspection.sourceDigest,
    providerCalls:0,
    messagesSent:0,
    externalEffectAuthority:'NONE',
    truthBoundary:'This plan maps an already-purchased provider-controlled Winnr domain and its credential export into canonical UberBond registry identities. It does not claim legal ownership of the domain, DNS health, mailbox authentication, warmup completion, inbox placement or send authority.'
  });
}

export async function applyWinnrPostPurchaseRegistryPlan({store,plan,date=new Date()}={}){
  if(!store||typeof store.log!=='function'||typeof store.list!=='function'){
    return {ok:false,status:'WINNR_POSTPURCHASE_APPLY_REFUSED',reasonCodes:['durable-store-required'],eventsWritten:0};
  }
  if(plan?.ok!==true||plan?.status!=='WINNR_POSTPURCHASE_REGISTRY_PLAN_READY'){
    return {ok:false,status:'WINNR_POSTPURCHASE_APPLY_REFUSED',reasonCodes:['valid-registry-plan-required'],eventsWritten:0};
  }

  let eventsWritten=0;
  const domainExisting=await loadSendingDomain(store,plan.domain.domainId,{date});
  if(!domainExisting){
    const registered=registerSendingDomain({
      store,
      domainId:plan.domain.domainId,
      workspaceId:plan.workspaceId,
      domain:plan.domain.domain,
      registrar:plan.domain.registrar,
      ownershipStatus:'PROVIDER_CONTROL_CONFIRMED',
      purpose:'outreach',
      provider:plan.domain.provider,
      simulation:false,
      date
    });
    if(!registered.ok)return {ok:false,status:'WINNR_POSTPURCHASE_DOMAIN_REFUSED',reasonCodes:registered.reasonCodes,eventsWritten};
    await logSendingDomainEvent(store,registered.event);
    eventsWritten++;
  }else if(domainExisting.domain!==plan.domain.domain||domainExisting.ownershipStatus!=='PROVIDER_CONTROL_CONFIRMED'){
    return {ok:false,status:'WINNR_POSTPURCHASE_DOMAIN_CONFLICT',reasonCodes:['canonical-domain-identity-conflict'],eventsWritten};
  }

  for(const row of plan.mailboxes){
    if(!emailOk(row.email))return {ok:false,status:'WINNR_POSTPURCHASE_MAILBOX_REFUSED',reasonCodes:['invalid-mailbox-email'],eventsWritten};
    const existing=await loadSendingMailbox(store,row.mailboxId,{date});
    if(!existing){
      const registered=registerSendingMailbox({
        store,
        mailboxId:row.mailboxId,
        workspaceId:plan.workspaceId,
        address:row.email,
        sendingDomainId:row.sendingDomainId,
        provider:'winnr-prewarmed',
        providerAccountId:row.providerMailboxId||row.email,
        plannedDailyCap:row.plannedDailyCap,
        date
      });
      if(!registered.ok)return {ok:false,status:'WINNR_POSTPURCHASE_MAILBOX_REFUSED',reasonCodes:registered.reasonCodes,eventsWritten};
      await logSendingMailboxEvent(store,registered.event);
      eventsWritten++;
    }else if(existing.address!==row.email||existing.sendingDomainId!==row.sendingDomainId){
      return {ok:false,status:'WINNR_POSTPURCHASE_MAILBOX_CONFLICT',reasonCodes:['canonical-mailbox-identity-conflict'],eventsWritten};
    }
  }

  const domainState=await loadSendingDomain(store,plan.domain.domainId,{date});
  const linked=new Set(domainState?.mailboxState?.linkedMailboxIds||[]);
  for(const row of plan.mailboxes){
    if(linked.has(row.mailboxId))continue;
    const link=recordMailboxLinked({store,domainId:plan.domain.domainId,mailboxId:row.mailboxId,date});
    if(!link.ok)return {ok:false,status:'WINNR_POSTPURCHASE_LINK_REFUSED',reasonCodes:link.reasonCodes,eventsWritten};
    await logSendingDomainEvent(store,link.event);
    eventsWritten++;
  }

  return Object.freeze({
    ok:true,
    status:'WINNR_POSTPURCHASE_REGISTRY_APPLIED',
    version:UBERWINNR_POSTPURCHASE_VERSION,
    domainId:plan.domain.domainId,
    mailboxIds:plan.mailboxes.map(row=>row.mailboxId),
    linksByEmail:plan.linksByEmail,
    eventsWritten,
    providerCalls:0,
    messagesSent:0,
    externalEffectAuthority:'NONE',
    truthBoundary:'Registry application proves only that UberBond recorded the purchased provider-controlled identities locally. DNS/authentication/reputation evidence and owner outreach authorization remain separately required.'
  });
}
