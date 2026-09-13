import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { UBERDOSO_ROOTS, compileUberDosoCycle } from './uberdoso-kernel.mjs';
import {
  registerSendingDomain,
  recordMailboxLinked,
  logSendingDomainEvent,
  listSendingDomains
} from './sending-domain-registry.mjs';
import {
  registerSendingMailbox,
  logSendingMailboxEvent,
  listSendingMailboxesForDomain
} from './sending-mailbox-registry.mjs';

export const UBERDOSO_JOB_VERSION='uberbond.uberdoso-job.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const text=(value,max=300)=>String(value??'').trim().slice(0,max);
const domainIdFor=root=>`uberdoso-domain-${digest(root).slice(0,20)}`;
const mailboxIdFor=address=>`uberdoso-mailbox-${digest(address.toLowerCase()).slice(0,20)}`;
function fail(reasonCodes){return{ok:false,status:'UBERDOSO_SUPERVISOR_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};}

async function ensureRegistry({store,workspaceId,date,localPart='mohamed'}={}){
  let domains=await listSendingDomains(store);
  const byRoot=new Map(domains.map(row=>[String(row?.domain||'').toLowerCase(),row]));
  const createdDomains=[];const createdMailboxes=[];
  for(const root of UBERDOSO_ROOTS){
    let domain=byRoot.get(root);
    if(!domain){
      const registered=registerSendingDomain({domainId:domainIdFor(root),workspaceId,domain:root,ownershipStatus:'OWNER_CONFIRMED',purpose:'outreach',provider:'uberdoso-postal',date});
      if(!registered.ok)return fail(['domain-registration-refused',...(registered.reasonCodes||[])]);
      await logSendingDomainEvent(store,registered.event);
      createdDomains.push(root);
    }
  }
  domains=await listSendingDomains(store);
  const owned=domains.filter(row=>UBERDOSO_ROOTS.includes(String(row?.domain||'').toLowerCase()));
  for(const domain of owned){
    const mailboxes=await listSendingMailboxesForDomain(store,domain.domainId);
    const address=`${localPart}@${domain.domain}`.toLowerCase();
    if(mailboxes.some(row=>String(row?.address||'').toLowerCase()===address))continue;
    const mailboxId=mailboxIdFor(address);
    const registered=registerSendingMailbox({store,mailboxId,workspaceId,address,sendingDomainId:domain.domainId,provider:'uberdoso-postal',providerAccountId:'self-hosted-postal',plannedDailyCap:15,date});
    if(!registered.ok)return fail(['mailbox-registration-refused',...(registered.reasonCodes||[])]);
    await logSendingMailboxEvent(store,registered.event);
    const linked=recordMailboxLinked({store,domainId:domain.domainId,mailboxId,date});
    if(!linked.ok)return fail(['domain-mailbox-link-refused',...(linked.reasonCodes||[])]);
    await logSendingDomainEvent(store,linked.event);
    createdMailboxes.push(address);
  }
  return{ok:true,createdDomains,createdMailboxes};
}

export async function runUberDosoJob({
  store,
  enqueueJob,
  workspaceId='uberbond-sovereign',
  localPart='mohamed',
  expectedRecordsByDomain={},
  sentCountByMailbox={},
  date=new Date()
}={}){
  if(!store||typeof store.list!=='function'||typeof store.log!=='function')return fail(['canonical-store-required']);
  if(typeof enqueueJob!=='function')return fail(['durable-enqueue-function-required']);
  const bootstrap=await ensureRegistry({store,workspaceId:text(workspaceId,120)||'uberbond-sovereign',date,localPart:text(localPart,64)||'mohamed'});
  if(!bootstrap.ok)return bootstrap;

  const domains=(await listSendingDomains(store)).filter(row=>UBERDOSO_ROOTS.includes(String(row?.domain||'').toLowerCase()));
  const mailboxRows=await Promise.all(domains.map(domain=>listSendingMailboxesForDomain(store,domain.domainId)));
  const mailboxes=mailboxRows.flat();
  const cycle=compileUberDosoCycle({domains,mailboxes,sentCountByMailbox,date});
  if(!cycle.ok)return fail(['uberdoso-cycle-refused',...(cycle.reasonCodes||[])]);

  const scheduled=[];const blocked=[];
  for(const action of cycle.actions){
    if(action.kind==='VERIFY_DNS'||action.kind==='VERIFY_AUTHENTICATION'){
      const domain=domains.find(row=>row.domainId===action.domainId)||(action.mailboxId?domains.find(row=>mailboxes.find(box=>box.mailboxId===action.mailboxId)?.sendingDomainId===row.domainId):null);
      const root=String(domain?.domain||'').toLowerCase();
      const expected=expectedRecordsByDomain?.[root];
      if(!domain||!expected||typeof expected!=='object'){
        blocked.push({kind:action.kind,domain:root||null,mailboxId:action.mailboxId||null,reasonCode:'physical-dns-contract-not-yet-observed'});
        continue;
      }
      const payload={domainId:domain.domainId,domain:domain.domain,expectedRecords:expected,date};
      const idempotencyKey=`uberdoso:dns:${domain.domainId}:${digest(JSON.stringify(expected)).slice(0,20)}`;
      await enqueueJob('domainMailbox.dns.verify',payload,{idempotencyKey,maxAttempts:3});
      scheduled.push({type:'domainMailbox.dns.verify',domainId:domain.domainId,idempotencyKey});
      continue;
    }
    if(action.kind==='PAUSE_OR_REPAIR'){
      const mailbox=mailboxes.find(row=>row.mailboxId===action.mailboxId);
      const idempotencyKey=`uberdoso:breaker:${action.mailboxId}:${digest(JSON.stringify(action.repair||{})).slice(0,20)}`;
      await enqueueJob('domainMailbox.circuit_breaker.evaluate',{mailboxId:action.mailboxId,domainId:mailbox?.sendingDomainId||null,sentCount:Number(sentCountByMailbox?.[action.mailboxId]||0),date},{idempotencyKey,maxAttempts:3});
      scheduled.push({type:'domainMailbox.circuit_breaker.evaluate',mailboxId:action.mailboxId,idempotencyKey});
      continue;
    }
    if(action.kind==='START_WARMUP'||action.kind==='RECONCILE_WARMUP'){
      blocked.push({kind:action.kind,mailboxId:action.mailboxId,reasonCode:'owned-seed-warmup-mesh-not-yet-evidenced'});
      continue;
    }
    blocked.push({kind:action.kind,mailboxId:action.mailboxId||null,reasonCode:'unsupported-uberdoso-supervisor-action'});
  }

  const status=scheduled.length?'UBERDOSO_SUPERVISOR_ENERGIZED':blocked.length?'UBERDOSO_WAITING_ON_PHYSICAL_EVIDENCE':'UBERDOSO_SUPERVISOR_STABLE';
  const receipt={
    schemaVersion:UBERDOSO_JOB_VERSION,
    status,
    rootDomains:[...UBERDOSO_ROOTS],
    registeredDomainCount:domains.length,
    registeredMailboxCount:mailboxes.length,
    createdDomains:bootstrap.createdDomains,
    createdMailboxes:bootstrap.createdMailboxes,
    readyMailboxIds:cycle.readyMailboxIds,
    quarantined:cycle.quarantined,
    scheduled,
    blocked,
    truthBoundary:'UberDoso may create canonical internal registry state and schedule zero-authority reconciliation jobs. It cannot publish DNS, allocate a public IP, change PTR, send warm-up/cold mail, spend, deploy or claim deliverability evidence without physical receipts.',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zero()
  };
  receipt.receiptDigest=digest(JSON.stringify(receipt));
  return{ok:true,...receipt};
}
