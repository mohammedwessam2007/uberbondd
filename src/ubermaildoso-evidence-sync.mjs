import crypto from 'node:crypto';
import { recordMailboxProviderHealthCheck, recordMailboxWarmupStatus, logSendingMailboxEvent } from './sending-mailbox-registry.mjs';

export const UBERMAILDOSO_EVIDENCE_SYNC_VERSION='uberbond.ubermaildoso-evidence-sync.v1';
const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);
const lower=(v,n=2000)=>clean(v,n).toLowerCase();
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const arr=v=>Array.isArray(v)?v:[];
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());

function rows(value){
  if(Array.isArray(value))return value;
  if(!value||typeof value!=='object')return [];
  for(const key of ['items','results','accounts','domains','warmups','services','data']){
    if(Array.isArray(value[key]))return value[key];
  }
  return [];
}
function stringStatus(row={}){
  return lower(row.status||row.state||row.account_status||row.domain_status||row.setup_status||row.warmup_status,120);
}
function findEmail(row={}){
  const candidates=[row.email,row.address,row.email_address,row.username,row.mailbox,row.account];
  return candidates.map(v=>lower(v,320)).find(emailOk)||'';
}
function findDomain(row={}){
  const direct=lower(row.domain||row.name||row.domain_name,253).replace(/^@/,'');
  if(direct&&/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(direct))return direct;
  const email=findEmail(row);return email.split('@')[1]||'';
}
function boolFact(row,keys){
  for(const key of keys)if(typeof row?.[key]==='boolean')return row[key];
  return null;
}
function numberFact(row,keys){
  for(const key of keys){
    const n=Number(row?.[key]);
    if(Number.isFinite(n))return n;
  }
  return null;
}
function safeProviderReceipt(row={},source=''){
  const allowed=['id','status','state','provider','reputation','reputation_status','warmup_status','warmupStatus','created_at','updated_at','last_test_at','lastTestAt','daily_limit','dailyLimit','send_limit','sendLimit'];
  const facts={source};
  for(const key of allowed)if(row?.[key]!==undefined&&row?.[key]!==null)facts[key]=row[key];
  return facts;
}
function warmupClassification(row={}){
  const s=stringStatus(row);
  const active=boolFact(row,['active','enabled','is_active','isActive']);
  const complete=boolFact(row,['complete','completed','is_complete','isComplete']);
  if(complete===true||/complete|completed|ready|finished/.test(s))return 'WARMUP_COMPLETE';
  if(active===true||/active|running|warming|warmup/.test(s))return 'WARMUP_ACTIVE';
  if(/pause|paused/.test(s))return 'WARMUP_PAUSED';
  if(/block|failed|error|disabled/.test(s))return 'WARMUP_BLOCKED';
  return 'WARMUP_UNCERTAIN';
}
function accountHealth(row={}){
  const s=stringStatus(row);
  const explicitReady=boolFact(row,['ready','active','enabled','is_active','isActive']);
  return {
    providerStatus:s||null,
    explicitlyReady:explicitReady===true||/ready|active|enabled|ok|verified/.test(s),
    explicitlyFailed:explicitReady===false||/failed|error|disabled|deleted|suspended|blocked/.test(s),
    observedDailyCap:numberFact(row,['daily_limit','dailyLimit','send_limit','sendLimit','daily_cap','dailyCap']),
    reputation:clean(row.reputation||row.reputation_status||row.reputationStatus,120)||null
  };
}
function flattenWarmupMailboxRefs(row={}){
  const values=[
    row.email,row.address,row.mailbox,row.email_address,
    ...(Array.isArray(row.accounts)?row.accounts:[]),
    ...(Array.isArray(row.mailboxes)?row.mailboxes:[]),
    ...(Array.isArray(row.attached_mailboxes)?row.attached_mailboxes:[])
  ];
  return values.flatMap(v=>typeof v==='string'?[lower(v,320)]:v&&typeof v==='object'?[findEmail(v)]:[]).filter(emailOk);
}

export function compileMaildosoEvidenceSnapshot({
  domainsResponse=null,accountsResponse=null,warmupsResponse=null,forwardingResponse=null,statsResponse=null,
  fleetAccounts=[],observedAt=new Date().toISOString(),evidenceRefs={}
}={}){
  const domainRows=rows(domainsResponse);
  const accountRows=rows(accountsResponse);
  const warmupRows=rows(warmupsResponse);
  const forwardingRows=rows(forwardingResponse);
  const smtpFleet=arr(fleetAccounts).filter(a=>a?.connected===true&&lower(a?.provider,80)==='smtp-relay');

  const domains=domainRows.map(row=>({
    domain:findDomain(row)||null,
    providerStatus:stringStatus(row)||null,
    providerRowDigest:`sha256:${digest(row)}`,
    dnsAuthenticated:null,
    truth:'PROVIDER_DOMAIN_OBJECT_ONLY__DNS_MUST_BE_VERIFIED_SEPARATELY'
  })).filter(x=>x.domain);

  const accounts=accountRows.map(row=>{
    const email=findEmail(row),health=accountHealth(row);
    const local=smtpFleet.find(a=>lower(a.email,320)===email)||null;
    return {
      email:email||null,domain:findDomain(row)||null,providerStatus:health.providerStatus,
      explicitlyReady:health.explicitlyReady,explicitlyFailed:health.explicitlyFailed,
      observedDailyCap:health.observedDailyCap,reputation:health.reputation,
      localAccountId:local?.id||null,localMailboxId:local?.sendingMailboxId||null,
      providerRowDigest:`sha256:${digest(row)}`
    };
  }).filter(x=>x.email);

  const warmups=warmupRows.map(row=>({
    status:warmupClassification(row),
    mailboxEmails:flattenWarmupMailboxRefs(row),
    providerStatus:stringStatus(row)||null,
    providerRowDigest:`sha256:${digest(row)}`
  }));

  const forwarding=forwardingRows.map(row=>({
    email:findEmail(row)||null,
    providerStatus:stringStatus(row)||null,
    host:clean(row.imap_host||row.imapHost?.host||row.host,253)||null,
    port:numberFact(row,['imap_port','imapPort','port']),
    providerRowDigest:`sha256:${digest(row)}`,
    credentialsObserved:false
  }));

  const boundMailboxes=accounts.filter(x=>x.localMailboxId).length;
  const completeWarmups=new Set(warmups.filter(x=>x.status==='WARMUP_COMPLETE').flatMap(x=>x.mailboxEmails));
  const summary={
    providerDomainObjects:domains.length,
    providerAccountObjects:accounts.length,
    locallyBoundProviderAccounts:boundMailboxes,
    explicitReadyProviderAccounts:accounts.filter(x=>x.explicitlyReady&&!x.explicitlyFailed).length,
    explicitFailedProviderAccounts:accounts.filter(x=>x.explicitlyFailed).length,
    warmupServiceObjects:warmups.length,
    warmupCompleteMailboxRefs:completeWarmups.size,
    forwardingObjects:forwarding.length,
    forwardingReadyObjects:forwarding.filter(x=>/ready|active|enabled|ok/.test(x.providerStatus||'')).length,
    dnsAuthenticatedDomains:0,
    reputationHealthyMailboxes:accounts.filter(x=>/good|healthy|excellent|ready/.test(lower(x.reputation,120))).length
  };
  const sourceRefs={
    domains:clean(evidenceRefs.domains,1500)||null,
    accounts:clean(evidenceRefs.accounts,1500)||null,
    warmups:clean(evidenceRefs.warmups,1500)||null,
    forwarding:clean(evidenceRefs.forwarding,1500)||null,
    stats:clean(evidenceRefs.stats,1500)||null
  };
  return Object.freeze({
    version:UBERMAILDOSO_EVIDENCE_SYNC_VERSION,
    observedAt,domains,accounts,warmups,forwarding,
    statsDigest:statsResponse==null?null:`sha256:${digest(statsResponse)}`,
    sourceRefs,summary,
    externalEffectAuthority:'NONE',
    truthBoundary:'This snapshot promotes only explicit provider objects and fields. Maildoso domain/account presence never becomes independent DNS authentication, legal eligibility, inbox placement, sender reputation, or cold-send capacity unless separately observed.'
  });
}

export async function syncMaildosoEvidence({
  adapter,store,fleetAccounts=[],now=new Date()
}={}){
  if(!adapter?.configured||typeof adapter.read!=='function')return {ok:false,status:'UBERMAILDOSO_EVIDENCE_SYNC_BLOCKED',reasonCodes:['configured-maildoso-adapter-required'],providerCalls:0};
  if(!store||typeof store.log!=='function')return {ok:false,status:'UBERMAILDOSO_EVIDENCE_SYNC_BLOCKED',reasonCodes:['durable-store-required'],providerCalls:0};
  const names=['domains','accountsLookup','warmups','forwardingLookup','stats'];
  const results={};let providerCalls=0;
  for(const name of names){
    const r=await adapter.read(name);providerCalls+=Number(r?.providerCalls||0);
    if(!r?.ok)return {ok:false,status:'UBERMAILDOSO_EVIDENCE_SYNC_READ_FAILED',reasonCodes:[`maildoso-read-failed:${name}`],providerCalls,failedRead:name,receipt:r?.receipt||null};
    results[name]=r;
  }
  const refs=Object.fromEntries(names.map(name=>[name,`maildoso:${name}:${results[name].receipt?.responseDigest||'unknown'}`]));
  const snapshot=compileMaildosoEvidenceSnapshot({
    domainsResponse:results.domains.data,
    accountsResponse:results.accountsLookup.data,
    warmupsResponse:results.warmups.data,
    forwardingResponse:results.forwardingLookup.data,
    statsResponse:results.stats.data,
    fleetAccounts,
    observedAt:now.toISOString(),
    evidenceRefs:refs
  });

  const warmupByEmail=new Map();
  for(const w of snapshot.warmups)for(const email of w.mailboxEmails){
    const current=warmupByEmail.get(email);
    if(!current||['WARMUP_UNCERTAIN','WARMUP_ACTIVE','WARMUP_PAUSED'].includes(current.status))warmupByEmail.set(email,w);
  }
  let mailboxEventsWritten=0;
  for(const fact of snapshot.accounts){
    if(!fact.localMailboxId)continue;
    const providerEvent=recordMailboxProviderHealthCheck({
      store,mailboxId:fact.localMailboxId,
      providerReceipt:{
        provider:'maildoso',status:fact.providerStatus,reputation:fact.reputation,
        observedDailyCap:fact.observedDailyCap,providerRowDigest:fact.providerRowDigest,
        evidenceRef:snapshot.sourceRefs.accounts
      },date:now
    });
    if(providerEvent.ok){await logSendingMailboxEvent(store,providerEvent.event);mailboxEventsWritten++;}
    const warm=warmupByEmail.get(fact.email);
    if(warm){
      const warmEvent=recordMailboxWarmupStatus({
        store,mailboxId:fact.localMailboxId,warmupStatus:warm.status,
        currentDailyCap:warm.status==='WARMUP_COMPLETE'&&Number.isFinite(Number(fact.observedDailyCap))?Number(fact.observedDailyCap):null,
        currentHourlyCap:null,date:now
      });
      if(warmEvent.ok){await logSendingMailboxEvent(store,warmEvent.event);mailboxEventsWritten++;}
    }
  }
  await store.log('ubermaildoso_evidence_snapshot',{
    version:snapshot.version,observedAt:snapshot.observedAt,summary:snapshot.summary,
    sourceRefs:snapshot.sourceRefs,snapshotDigest:`sha256:${digest(snapshot)}`,
    mailboxEventsWritten,providerCalls
  });
  return {
    ok:true,status:'UBERMAILDOSO_EVIDENCE_SYNCED',providerCalls,
    mailboxEventsWritten,snapshot,
    dnsMutations:0,messagesSent:0,spendCents:0,
    automaticSendAuthority:false
  };
}
