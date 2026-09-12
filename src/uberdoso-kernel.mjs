import crypto from 'node:crypto';
import { OWNED_ROOT_DOMAINS } from './domain-purpose-plan.mjs';
import { evaluateCircuitBreaker } from './domain-mailbox-circuit-breaker.mjs';

export const UBERDOSO_POLICY_VERSION = 'uberdoso-sovereign-mail-1.0.0';
export const UBERDOSO_POSTAL_VERSION = '3.3.7';
export const UBERDOSO_ROOTS = Object.freeze([...OWNED_ROOT_DOMAINS]);
export const UBERDOSO_MAX_MAILBOXES_PER_DOMAIN = 8;
export const UBERDOSO_DEFAULT_COOLDOWN_DAYS = 14;

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const zeroEffects = () => ({ providerCalls:0, messages:0, purchases:0, deployments:0, credentialChanges:0, dnsChanges:0, productionMutations:0, spendCents:0 });
const clean = (value, max=300) => String(value ?? '').trim().slice(0,max);
const uniq = values => [...new Set((Array.isArray(values)?values:[]).map(v=>clean(v)).filter(Boolean))];
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = reasonCodes => ({ ok:false, policyVersion:UBERDOSO_POLICY_VERSION, status:'UBERDOSO_REFUSED', reasonCodes:uniq(reasonCodes), externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects() });

function exactOwnedRoots(roots) {
  const normalized = uniq(roots).map(v=>v.toLowerCase()).sort();
  const owned = [...UBERDOSO_ROOTS].sort();
  return normalized.length===owned.length && normalized.every((v,i)=>v===owned[i]);
}
function validateLocalPart(value) {
  const part=clean(value,64).toLowerCase();
  return /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(part) ? part : null;
}
function iso(value) { const d=value instanceof Date?value:new Date(value||Date.now()); return Number.isFinite(d.getTime())?d.toISOString():null; }

export function compileUberDosoTopology({ roots=UBERDOSO_ROOTS, mailboxLocalParts=['mohamed'], mtaRoot='uberbond.cloud' }={}) {
  if(!exactOwnedRoots(roots)) return fail(['exact-owned-outreach-roots-required']);
  const mta=clean(mtaRoot,253).toLowerCase();
  if(!UBERDOSO_ROOTS.includes(mta)) return fail(['mta-root-must-be-owned']);
  const locals=uniq(mailboxLocalParts).map(validateLocalPart);
  if(!locals.length || locals.some(v=>!v)) return fail(['valid-mailbox-local-part-required']);
  if(locals.length>UBERDOSO_MAX_MAILBOXES_PER_DOMAIN) return fail([`mailboxes-per-domain-exceeds-${UBERDOSO_MAX_MAILBOXES_PER_DOMAIN}`]);
  const mtaHost=`mta.${mta}`;
  const topology={
    schemaVersion:'uberdoso.topology.v1',
    transport:{ engine:'postal', mode:'SELF_HOSTED_SOURCE_OWNED', pinnedVersion:UBERDOSO_POSTAL_VERSION, managedSaasDependency:false },
    roots:UBERDOSO_ROOTS.map(root=>({
      root,
      websiteRole:'NONE_OUTREACH_ONLY',
      outboundIdentityDomain:root,
      replyDomain:root,
      trackingHost:`link.${root}`,
      mailboxes:locals.map(localPart=>({ id:`uberdoso:${localPart}@${root}`, address:`${localPart}@${root}`, domain:root, state:'PLANNED_NOT_PROVISIONED' }))
    })),
    infrastructure:{
      mtaHost,
      spfHost:`spf.${mta}`,
      returnPathHost:`rp.${mta}`,
      routeHost:`routes.${mta}`,
      requiresStaticPublicIpv4:true,
      requiresOutboundPort25:true,
      requiresInboundPort25:true,
      requiresPtr:true,
      requiresTls:true
    },
    reputationIsolation:{ maxMailboxesPerDomain:UBERDOSO_MAX_MAILBOXES_PER_DOMAIN, initialMailboxesPerDomain:locals.length, crossDomainFailover:'HEALTH_GATED_ONLY' },
    externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects()
  };
  topology.topologyDigest=hash(JSON.stringify(topology));
  return { ok:true, policyVersion:UBERDOSO_POLICY_VERSION, status:'UBERDOSO_TOPOLOGY_READY', topology, externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
}

export function compileUberDosoDnsPlan({ topology, publicIpv4='', dkimRecordsByDomain={}, ptrHostname='', date=new Date() }={}) {
  if(!topology?.topologyDigest || topology?.schemaVersion!=='uberdoso.topology.v1') return fail(['valid-uberdoso-topology-required']);
  const ip=clean(publicIpv4,64);
  const ptr=clean(ptrHostname,253).toLowerCase().replace(/\.$/,'');
  const timestamp=iso(date); if(!timestamp) return fail(['valid-date-required']);
  const reasons=[];
  if(!IPV4.test(ip)) reasons.push('static-public-ipv4-required');
  if(ptr!==topology.infrastructure.mtaHost) reasons.push('ptr-must-match-mta-host');
  const records=[];
  if(IPV4.test(ip)) {
    records.push({host:topology.infrastructure.mtaHost,type:'A',value:ip,source:'UBERDOSO_TOPOLOGY'});
    records.push({host:topology.infrastructure.spfHost,type:'TXT',value:`v=spf1 ip4:${ip} -all`,source:'UBERDOSO_POLICY'});
    records.push({host:topology.infrastructure.returnPathHost,type:'A',value:ip,source:'UBERDOSO_TOPOLOGY'});
    records.push({host:topology.infrastructure.returnPathHost,type:'MX',value:`10 ${topology.infrastructure.mtaHost}.`,source:'UBERDOSO_TOPOLOGY'});
    records.push({host:topology.infrastructure.returnPathHost,type:'TXT',value:`v=spf1 a mx include:${topology.infrastructure.spfHost} -all`,source:'UBERDOSO_POLICY'});
    records.push({host:topology.infrastructure.routeHost,type:'MX',value:`10 ${topology.infrastructure.mtaHost}.`,source:'UBERDOSO_TOPOLOGY'});
  }
  for(const row of topology.roots) {
    const root=row.root;
    if(IPV4.test(ip)) {
      records.push({host:root,type:'MX',value:`10 ${topology.infrastructure.mtaHost}.`,source:'UBERDOSO_TOPOLOGY'});
      records.push({host:root,type:'TXT',value:`v=spf1 include:${topology.infrastructure.spfHost} -all`,source:'UBERDOSO_POLICY'});
      records.push({host:`_dmarc.${root}`,type:'TXT',value:'v=DMARC1; p=quarantine; adkim=r; aspf=r; pct=100',source:'UBERDOSO_POLICY'});
      records.push({host:row.trackingHost,type:'A',value:ip,source:'UBERDOSO_TOPOLOGY'});
    }
    const dkim=dkimRecordsByDomain?.[root];
    if(!dkim || typeof dkim!=='object' || !clean(dkim.host) || !clean(dkim.value,4096).toLowerCase().startsWith('v=dkim1;')) {
      reasons.push(`observed-postal-dkim-record-required:${root}`);
    } else {
      const host=clean(dkim.host,253).toLowerCase().replace(/\.$/,'');
      if(!(host===root || host.endsWith(`.${root}`))) reasons.push(`dkim-host-outside-owned-root:${root}`);
      else records.push({host,type:'TXT',value:clean(dkim.value,4096),source:'OBSERVED_POSTAL_DKIM_OUTPUT'});
    }
  }
  const status=reasons.length?'UBERDOSO_DNS_PLAN_BLOCKED_PHYSICAL_EVIDENCE':'UBERDOSO_DNS_PLAN_READY';
  const plan={schemaVersion:'uberdoso.dns-plan.v1',status,timestamp,topologyDigest:topology.topologyDigest,publicIpv4:IPV4.test(ip)?ip:null,ptrRequirement:{ip:IPV4.test(ip)?ip:null,expectedHostname:topology.infrastructure.mtaHost,observedHostname:ptr||null,verified:ptr===topology.infrastructure.mtaHost},records,reasonCodes:uniq(reasons),externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  plan.planDigest=hash(JSON.stringify(plan));
  return {ok:true,policyVersion:UBERDOSO_POLICY_VERSION,status,plan,externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

function remainingCapacity(mailbox) {
  const cap=Number(mailbox.currentDailyCap);
  const sent=Number(mailbox.sentToday||0);
  if(!Number.isFinite(cap) || cap<=0) return 0;
  return Math.max(0,cap-(Number.isFinite(sent)?sent:0));
}
function senderEligible(mailbox) {
  return Boolean(mailbox && EMAIL.test(String(mailbox.address||'')) && mailbox.connected===true && mailbox.paused!==true && mailbox.authenticationStatus==='AUTHENTICATED' && mailbox.warmupStatus==='WARMUP_COMPLETE' && remainingCapacity(mailbox)>0);
}

export function selectUberDosoSender({ mailboxes=[], recipientKey='' }={}) {
  const key=clean(recipientKey,500).toLowerCase();
  if(!key) return fail(['recipient-key-required']);
  const candidates=(Array.isArray(mailboxes)?mailboxes:[]).filter(senderEligible).map(mailbox=>{
    const capacity=remainingCapacity(mailbox);
    const score=BigInt(`0x${hash(`${key}|${mailbox.address}|${mailbox.mailboxId||''}`).slice(0,16)}`);
    return {mailbox,capacity,score};
  });
  if(!candidates.length) return {ok:false,policyVersion:UBERDOSO_POLICY_VERSION,status:'NO_HEALTHY_UBERDOSO_SENDER',reasonCodes:['no-authenticated-warmed-unpaused-sender-with-capacity'],externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  candidates.sort((a,b)=>a.score===b.score?String(a.mailbox.address).localeCompare(String(b.mailbox.address)):(a.score>b.score?-1:1));
  const selected=candidates[0];
  return {ok:true,policyVersion:UBERDOSO_POLICY_VERSION,status:'UBERDOSO_SENDER_SELECTED',sender:{mailboxId:selected.mailbox.mailboxId||null,address:selected.mailbox.address,domain:selected.mailbox.sendingDomain||selected.mailbox.domain||String(selected.mailbox.address).split('@')[1],remainingDailyCapacity:selected.capacity},candidateCount:candidates.length,routing:'RENDEZVOUS_HASH_HEALTH_GATED',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function evaluateUberDosoSelfHealing({ domainState=null, mailboxState=null, sentCount=0, duplicateReservationDetected=false, uncertainProviderOutcome=false, date=new Date(), cooldownDays=UBERDOSO_DEFAULT_COOLDOWN_DAYS }={}) {
  const breaker=evaluateCircuitBreaker({domainState,mailboxState,sentCount,duplicateReservationDetected,uncertainProviderOutcome,date});
  const timestamp=iso(date); if(!timestamp) return fail(['valid-date-required']);
  if(!breaker.shouldPause) return {ok:true,policyVersion:UBERDOSO_POLICY_VERSION,status:'UBERDOSO_HEALTHY_NO_REPAIR',breaker,repair:null,externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  const codes=breaker.triggers.map(t=>t.reasonCode);
  const ownerRequired=breaker.ownerRequired;
  const autoCooldownOnly=!ownerRequired && codes.every(code=>['provider-rate-limit','dns-evidence-expired'].includes(code));
  const resumeAfter=autoCooldownOnly ? new Date(new Date(timestamp).getTime()+Math.max(1,Number(cooldownDays)||UBERDOSO_DEFAULT_COOLDOWN_DAYS)*86400000).toISOString() : null;
  const repair={action:autoCooldownOnly?'AUTO_COOLDOWN_THEN_REVERIFY':'QUARANTINE_UNTIL_EVIDENCE_AND_OWNER_REVIEW',reasonCodes:codes,resumeAfter,requirements:['fresh-dns-evidence','mailbox-authenticated','no-uncertain-provider-outcome','health-thresholds-pass',...(ownerRequired?['owner-review-required']:[])],automaticResume:false};
  return {ok:true,policyVersion:UBERDOSO_POLICY_VERSION,status:'UBERDOSO_REPAIR_REQUIRED',breaker,repair,externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function compileUberDosoCycle({ domains=[], mailboxes=[], sentCountByMailbox={}, date=new Date() }={}) {
  const timestamp=iso(date); if(!timestamp) return fail(['valid-date-required']);
  const actions=[]; const ready=[]; const quarantined=[];
  for(const domain of Array.isArray(domains)?domains:[]) {
    if(!UBERDOSO_ROOTS.includes(String(domain?.domain||'').toLowerCase())) continue;
    if(domain?.dnsState?.status!=='GREEN') actions.push({kind:'VERIFY_DNS',domainId:domain.domainId||null,domain:domain.domain,reason:'dns-not-fresh-green'});
  }
  for(const mailbox of Array.isArray(mailboxes)?mailboxes:[]) {
    const healing=evaluateUberDosoSelfHealing({domainState:(Array.isArray(domains)?domains:[]).find(d=>d.domainId===mailbox.sendingDomainId)||null,mailboxState:mailbox,sentCount:Number(sentCountByMailbox?.[mailbox.mailboxId]||0),date});
    if(healing.status==='UBERDOSO_REPAIR_REQUIRED') { quarantined.push({mailboxId:mailbox.mailboxId,address:mailbox.address,repair:healing.repair}); actions.push({kind:'PAUSE_OR_REPAIR',mailboxId:mailbox.mailboxId,repair:healing.repair}); continue; }
    if(mailbox.authenticationStatus!=='AUTHENTICATED') { actions.push({kind:'VERIFY_AUTHENTICATION',mailboxId:mailbox.mailboxId}); continue; }
    if(mailbox.warmupStatus==='WARMUP_NOT_STARTED') { actions.push({kind:'START_WARMUP',mailboxId:mailbox.mailboxId}); continue; }
    if(mailbox.warmupStatus==='WARMUP_ACTIVE'||mailbox.warmupStatus==='WARMUP_UNCERTAIN') { actions.push({kind:'RECONCILE_WARMUP',mailboxId:mailbox.mailboxId}); continue; }
    if(senderEligible(mailbox)) ready.push(mailbox.mailboxId);
  }
  const status=actions.length?'UBERDOSO_ENERGIZED':ready.length?'UBERDOSO_READY_POOL':'UBERDOSO_BLOCKED_NO_READY_SENDER';
  return {ok:true,policyVersion:UBERDOSO_POLICY_VERSION,status,timestamp,actions,readyMailboxIds:ready,quarantined,externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
