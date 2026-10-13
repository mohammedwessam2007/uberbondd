import crypto from 'node:crypto';
import {
  registerSendingDomain, logSendingDomainEvent, recordMailboxLinked, loadSendingDomain
} from './sending-domain-registry.mjs';
import {
  registerSendingMailbox, logSendingMailboxEvent, loadSendingMailbox
} from './sending-mailbox-registry.mjs';
import { inspectWinnrCredentialExport } from './uberwinnr-credential-import.mjs';
import { WINNR_PILOT_PREWARMED_OWNERSHIP, classifyWinnrDomainOwnership } from './winnr-domain-ownership.mjs';

export const UBERWINNR_POSTPURCHASE_VERSION='uberbond.uberwinnr-postpurchase.v1';
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const hash=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());

const domainIdFor=domain=>`winnr-domain-${hash(String(domain).toLowerCase()).slice(0,20)}`;
const mailboxIdFor=email=>`winnr-mailbox-${hash(String(email).toLowerCase()).slice(0,20)}`;

// Legacy single-domain plan. It is the pilot path only: the pilot domain is a pre-warmed Winnr lease, so the
// default ownership is the pilot identity. Fleet callers must classify each domain from its provider record.
export function compileWinnrPostPurchaseRegistryPlan({
  csvText='',
  workspaceId='uberbond-outreach',
  providerDomainId='',
  providerMailboxIdsByEmail={},
  plannedDailyCap=2,
  ownership=WINNR_PILOT_PREWARMED_OWNERSHIP
}={}){
  return registryPlanFromInspection({
    inspection:inspectWinnrCredentialExport(csvText),
    workspaceId,
    providerDomainId,
    providerMailboxIdsByEmail,
    plannedDailyCap,
    ownership
  });
}

function registryPlanFromInspection({
  inspection,
  workspaceId='uberbond-outreach',
  providerDomainId='',
  providerMailboxIdsByEmail={},
  plannedDailyCap=2,
  ownership=WINNR_PILOT_PREWARMED_OWNERSHIP
}={}){
  const reasons=[];
  if(!clean(workspaceId,120))reasons.push('workspace-id-required');
  if(inspection.rowCount<1)reasons.push('credential-export-mailboxes-required');
  if(inspection.domains.length!==1)reasons.push('exactly-one-prewarmed-domain-required');
  if((inspection.mismatchedDomainRowCount||0)>0)reasons.push('domain-column-address-mismatch');
  if(!ownership?.ok)reasons.push('domain-ownership-classification-required');
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
      mailboxProvider:ownership.mailboxProvider,
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
      classification:ownership.classification,
      ownershipStatus:ownership.ownershipStatus,
      provider:ownership.provider,
      registrar:ownership.registrar,
      ownerAttestationRef:ownership.ownerAttestationRef||null
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

// Fleet variant: one provider-controlled prewarmed domain per registry plan, many domains per export.
// Each domain reuses the single-domain plan so identity, cap and no-password rules stay identical.
// Every domain is classified from its own provider record. Nothing defaults to pre-warmed, so a customer-owned
// domain can never be registered as a leased Winnr domain by omission. Mailboxes are keyed by the provider's
// stable mailbox id and address, never by position in the export.
export function compileWinnrPostPurchaseFleetPlan({
  csvText='',
  workspaceId='uberbond-outreach',
  providerDomainIdsByDomain={},
  providerDomainRecordsByDomain={},
  providerMailboxIdsByEmail={},
  ownerAttestedRegistrar='',
  ownerAttestationRef='',
  plannedDailyCap=2
}={}){
  const inspection=inspectWinnrCredentialExport(csvText);
  const reasons=[];
  if(!clean(workspaceId,120))reasons.push('workspace-id-required');
  if(inspection.rowCount<1)reasons.push('credential-export-mailboxes-required');
  if(inspection.domains.length<1)reasons.push('fleet-domain-required');
  if(inspection.rows.some(row=>!clean(providerMailboxIdsByEmail?.[row.email],240)))reasons.push('provider-mailbox-id-required');
  if(inspection.domains.some(domain=>!clean(providerDomainIdsByDomain?.[domain],240)))reasons.push('provider-domain-id-required');
  if(reasons.length)return Object.freeze({
    ok:false,status:'WINNR_POSTPURCHASE_FLEET_PLAN_REFUSED',reasonCodes:[...new Set(reasons)],
    domainCount:0,mailboxCount:0,providerCalls:0,messagesSent:0,externalEffectAuthority:'NONE'
  });

  const domainPlans=[];
  for(const domain of inspection.domains){
    const rows=inspection.rows.filter(row=>row.domain===domain);
    const ownership=classifyWinnrDomainOwnership({
      providerDomain:providerDomainRecordsByDomain?.[domain]||null,
      ownerAttestedRegistrar,
      ownerAttestationRef
    });
    if(!ownership.ok)return Object.freeze({
      ok:false,status:'WINNR_POSTPURCHASE_FLEET_PLAN_REFUSED',reasonCodes:ownership.reasonCodes,failedDomain:domain,
      domainCount:0,mailboxCount:0,providerCalls:0,messagesSent:0,externalEffectAuthority:'NONE'
    });
    const plan=registryPlanFromInspection({
      inspection:{...inspection,rows,rowCount:rows.length,domains:[domain]},
      workspaceId,
      providerDomainId:clean(providerDomainIdsByDomain?.[domain],240),
      providerMailboxIdsByEmail,
      plannedDailyCap,
      ownership
    });
    if(!plan.ok)return Object.freeze({
      ok:false,status:'WINNR_POSTPURCHASE_FLEET_PLAN_REFUSED',reasonCodes:plan.reasonCodes,failedDomain:domain,
      domainCount:0,mailboxCount:0,providerCalls:0,messagesSent:0,externalEffectAuthority:'NONE'
    });
    domainPlans.push(plan);
  }

  return Object.freeze({
    ok:true,
    status:'WINNR_POSTPURCHASE_FLEET_PLAN_READY',
    version:UBERWINNR_POSTPURCHASE_VERSION,
    workspaceId:clean(workspaceId,120),
    domainCount:domainPlans.length,
    mailboxCount:inspection.rowCount,
    domainPlans:Object.freeze(domainPlans),
    linksByEmail:Object.freeze(Object.assign({},...domainPlans.map(plan=>plan.linksByEmail))),
    sourceDigest:inspection.sourceDigest,
    providerCalls:0,
    messagesSent:0,
    externalEffectAuthority:'NONE',
    truthBoundary:'This fleet plan maps every provider-controlled prewarmed domain in one credential export into canonical registry identities, one domain at a time. It carries no passwords, performs no provider calls and claims no ownership, DNS health, placement or sending authority.'
  });
}

export async function applyWinnrPostPurchaseFleetPlan({store,fleetPlan,date=new Date()}={}){
  if(fleetPlan?.ok!==true||fleetPlan?.status!=='WINNR_POSTPURCHASE_FLEET_PLAN_READY'){
    return {ok:false,status:'WINNR_POSTPURCHASE_FLEET_APPLY_REFUSED',reasonCodes:['valid-fleet-plan-required'],eventsWritten:0};
  }
  let eventsWritten=0;
  const linksByEmail={};
  for(const plan of fleetPlan.domainPlans){
    const applied=await applyWinnrPostPurchaseRegistryPlan({store,plan,date});
    eventsWritten+=Number(applied?.eventsWritten||0);
    if(!applied?.ok)return {...applied,failedDomain:plan.domain.domain,eventsWritten};
    Object.assign(linksByEmail,applied.linksByEmail);
  }
  return Object.freeze({
    ok:true,
    status:'WINNR_POSTPURCHASE_FLEET_REGISTRY_APPLIED',
    domainCount:fleetPlan.domainCount,
    mailboxCount:fleetPlan.mailboxCount,
    eventsWritten,
    linksByEmail:Object.freeze(linksByEmail),
    messagesSent:0,
    externalEffectAuthority:'NONE'
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
      ownershipStatus:plan.domain.ownershipStatus,
      purpose:'outreach',
      provider:plan.domain.provider,
      simulation:false,
      date
    });
    if(!registered.ok)return {ok:false,status:'WINNR_POSTPURCHASE_DOMAIN_REFUSED',reasonCodes:registered.reasonCodes,eventsWritten};
    await logSendingDomainEvent(store,registered.event);
    eventsWritten++;
  }else if(domainExisting.domain!==plan.domain.domain||domainExisting.ownershipStatus!==plan.domain.ownershipStatus||domainExisting.registrar!==plan.domain.registrar){
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
        provider:row.mailboxProvider,
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
