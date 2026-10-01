import {
  recordDomainWarmupStateChange, logSendingDomainEvent
} from './sending-domain-registry.mjs';
import {
  recordMailboxWarmupStatus, recordMailboxPause, logSendingMailboxEvent
} from './sending-mailbox-registry.mjs';

export const UBERWARM2_REGISTRY_BRIDGE_VERSION='uberbond.uberwarm2-registry-bridge.v1';

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);

function mapState(decision={}){
  switch(String(decision.state||'').toUpperCase()){
    case 'RAMP':
    case 'HOLD':
      return {warmupStatus:'WARMUP_COMPLETE',pause:false};
    case 'WARMING':
    case 'LIMITED_CANARY':
      return {warmupStatus:'WARMUP_ACTIVE',pause:false};
    case 'BLOCKED':
    case 'QUARANTINED':
      return {warmupStatus:'WARMUP_BLOCKED',pause:true};
    default:
      return {warmupStatus:'WARMUP_UNCERTAIN',pause:true};
  }
}

export function compileUberWarm2RegistryTransitions({
  warm2Plan={},
  sendingDomainIdByMailbox={}
}={}){
  const decisions=Array.isArray(warm2Plan?.warmFleet?.decisions)?warm2Plan.warmFleet.decisions:[];
  const transitions=[];
  const reasons=[];
  for(const decision of decisions){
    const mailboxId=clean(decision?.mailboxId,120);
    const sendingDomainId=clean(sendingDomainIdByMailbox?.[mailboxId],120);
    if(!mailboxId){reasons.push('mailbox-id-required');continue;}
    if(!sendingDomainId){reasons.push(`sending-domain-id-required:${mailboxId}`);continue;}
    const mapped=mapState(decision);
    transitions.push(Object.freeze({
      mailboxId,
      sendingDomainId,
      sourceState:clean(decision.state,60).toUpperCase()||'UNKNOWN',
      warmupStatus:mapped.warmupStatus,
      currentDailyCap:Math.max(0,Math.floor(Number(decision.recommendedColdDailyCap)||0)),
      pause:mapped.pause,
      reasonCodes:Array.isArray(decision.reasonCodes)?decision.reasonCodes.map(x=>clean(x,120)).filter(Boolean):[]
    }));
  }
  return Object.freeze({
    ok:reasons.length===0&&transitions.length>0,
    status:reasons.length?'UBERWARM2_REGISTRY_TRANSITIONS_REFUSED':transitions.length?'UBERWARM2_REGISTRY_TRANSITIONS_READY':'UBERWARM2_REGISTRY_TRANSITIONS_EMPTY',
    version:UBERWARM2_REGISTRY_BRIDGE_VERSION,
    transitions,
    reasonCodes:[...new Set(reasons)],
    externalEffectAuthority:'NONE',
    messagesSent:0,
    truthBoundary:'These transitions map observed UberWarm² evidence state into local readiness receipts only. WARMUP_COMPLETE here means the UberWarm² evidence gate is complete enough for separate owner outreach authorization; it is not a claim that a provider warm-up product ran.'
  });
}

export async function applyUberWarm2RegistryTransitions({store,compiled,date=new Date()}={}){
  if(!store||typeof store.log!=='function'){
    return {ok:false,status:'UBERWARM2_REGISTRY_APPLY_REFUSED',reasonCodes:['durable-store-required'],eventsWritten:0};
  }
  if(compiled?.ok!==true){
    return {ok:false,status:'UBERWARM2_REGISTRY_APPLY_REFUSED',reasonCodes:['valid-transition-plan-required'],eventsWritten:0};
  }
  let eventsWritten=0;
  for(const row of compiled.transitions){
    const mailbox=recordMailboxWarmupStatus({
      store,
      mailboxId:row.mailboxId,
      warmupStatus:row.warmupStatus,
      currentDailyCap:row.currentDailyCap,
      currentHourlyCap:null,
      date
    });
    if(!mailbox.ok)return {ok:false,status:'UBERWARM2_MAILBOX_TRANSITION_REFUSED',reasonCodes:mailbox.reasonCodes,eventsWritten};
    await logSendingMailboxEvent(store,mailbox.event);
    eventsWritten++;

    const domain=recordDomainWarmupStateChange({
      store,
      domainId:row.sendingDomainId,
      mailboxId:row.mailboxId,
      warmupState:row.warmupStatus,
      date
    });
    if(!domain.ok)return {ok:false,status:'UBERWARM2_DOMAIN_TRANSITION_REFUSED',reasonCodes:domain.reasonCodes,eventsWritten};
    await logSendingDomainEvent(store,domain.event);
    eventsWritten++;

    if(row.pause){
      const pause=recordMailboxPause({
        store,
        mailboxId:row.mailboxId,
        reasonCodes:row.reasonCodes.length?row.reasonCodes:['uberwarm2-protective-pause'],
        ownerRequired:false,
        date
      });
      if(!pause.ok)return {ok:false,status:'UBERWARM2_PAUSE_REFUSED',reasonCodes:pause.reasonCodes,eventsWritten};
      await logSendingMailboxEvent(store,pause.event);
      eventsWritten++;
    }
  }
  return Object.freeze({
    ok:true,status:'UBERWARM2_REGISTRY_TRANSITIONS_APPLIED',
    version:UBERWARM2_REGISTRY_BRIDGE_VERSION,
    eventsWritten,
    messagesSent:0,
    externalEffectAuthority:'NONE',
    truthBoundary:'Only local readiness and protective-pause receipts were written. This does not authorize outreach or create provider/network reputation.'
  });
}
