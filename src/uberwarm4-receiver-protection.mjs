/**
 * UberWarm⁴ Receiving Network Circuit Breaker.
 * Public-source donor facts: Gmail 4.7.28 shared DKIM/SPF/IP quota handling,
 * Microsoft permanent 5xx no-retry, Gmail <0.1% complaint target.
 *
 * No SMTP, DNS, purchases, synthetic replies, automatic resume or campaign
 * permission. All actionable observations require trusted authenticated
 * ingestion; source-code existence does not imply production enforcement.
 */
export const UBERWARM4_RECEIVER_VERSION='uberbond.uberwarm4-receiver-protection.v1';
const email=v=>String(v??'').trim().toLowerCase();
const str=(v,n=240)=>String(v??'').trim().slice(0,n);
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const ms=v=>{const t=new Date(v).getTime();return Number.isFinite(t)?t:null};
const ordered=(items)=>[...new Set(items)].sort();
const allowedKinds=new Set(['SMTP_TEMPFAIL','SMTP_PERMFAIL','USER_COMPLAINT','UNSUBSCRIBE','AUTH_FAILURE','RECOVERY_VERIFIED']);
const severity={NONE:0,HOLD:1,QUARANTINE:2};
function upgrade(row,state,reason,eventId) {
  if(severity[state]>severity[row.state])row.state=state;
  row.reasonCodes.push(reason);
  row.eventIds.push(eventId);
}
const denied=(reasons)=>Object.freeze({
  version:UBERWARM4_RECEIVER_VERSION,status:'REFUSED',reasonCodes:reasons,
  decisions:[],blockedProviderGroups:[],suppressionActions:[],
  coldSendAuthority:false,effectsPerformed:0
});

/**
 * One event corresponds to one independently authenticated receiving/provider
 * receipt. The provider routing group must be bound from a trusted MX/provider
 * resolver, not self-declared by an agent or CRM entry.
 *
 * A 4.7.28 event holds the WHOLE matching domain+receiving-provider fleet.
 * A timer can mark first review time but never lifts that hold by itself.
 */
export function compileUberWarm4ReceiverProtection({
  mailboxes=[],events=[],now=new Date(),
  verifyAuthenticatedEvent,verifyRecipientProviderGroup,verifyRecoveredCondition,
  maxEvents=2000
}={}) {
  const at=ms(now);
  if(at===null)return denied(['invalid-clock']);
  if(!Array.isArray(mailboxes)||!Array.isArray(events)||
    events.length>Math.min(2000,Math.max(1,maxEvents)))
    return denied(['invalid-input-or-event-volume']);
  const roster=new Map();
  for(const m of mailboxes) {
    const address=email(m?.address),domain=address.split('@')[1];
    if(!validEmail(address)||roster.has(address))
      return denied(['untrusted-or-duplicate-mailbox-roster']);
    roster.set(address,{address,domain,
      state:m.paused||m.quarantined||m.placementQuarantine?'QUARANTINE':'NONE',
      reasonCodes:[],eventIds:[]});
  }
  const seenIds=new Set(),accepted=[],excluded=[];
  for(const event of events) {
    const id=str(event?.eventId,160),sender=email(event?.senderEmail),kind=event?.kind;
    const time=ms(event?.occurredAt),provider=str(event?.recipientProviderGroup,120).toUpperCase();
    const recipient=email(event?.recipientEmail);
    const errors=[];
    if(!id||seenIds.has(id))errors.push('duplicate-or-missing-event-id');
    if(!allowedKinds.has(kind))errors.push('unrecognized-feedback-event');
    if(!roster.has(sender))errors.push('sender-not-in-authorized-fleet');
    if(time===null||time>at+300000||at-time>14*86400000)errors.push('stale-or-future-feedback');
    if(!/^[A-Z0-9_.-]{2,120}$/.test(provider))errors.push('unbound-recipient-provider-group');
    if(!validEmail(recipient))errors.push('recipient-address-invalid');
    if(!str(event?.receivingEvidenceRef,600))errors.push('provider-evidence-pointer-required');
    let verified=false,groupVerified=false;
    try{verified=typeof verifyAuthenticatedEvent==='function' &&
      verifyAuthenticatedEvent(event)===true}catch{}
    try{groupVerified=typeof verifyRecipientProviderGroup==='function' &&
      verifyRecipientProviderGroup({event,providerGroup:provider})===true}catch{}
    if(!verified)errors.push('trusted-receipt-authentication-required');
    if(!groupVerified)errors.push('trusted-provider-mx-group-binding-required');
    const code=str(event?.smtpResponseCode,30);
    const enhanced=str(event?.enhancedStatusCode,40);
    if(kind==='SMTP_TEMPFAIL' && !(code.startsWith('4')&&/^4\d\d$/.test(code)))
      errors.push('temporary-smtp-4xx-evidence-required');
    if(kind==='SMTP_PERMFAIL' && !(code.startsWith('5')&&/^5\d\d$/.test(code)))
      errors.push('permanent-smtp-5xx-evidence-required');
    if(kind==='RECOVERY_VERIFIED' && !str(event?.recoveryOfEventId,160))
      errors.push('recovery-target-required');
    if(errors.length){excluded.push({eventId:id||null,reasons:ordered(errors)});continue}
    seenIds.add(id);
    accepted.push({id,kind,at:time,sender,domain:roster.get(sender).domain,
      provider,recipient,code,enhanced,recoveryOfEventId:str(event.recoveryOfEventId,160),
      original:event});
  }
  // Ingestion order cannot permit an older "recovery" to clear a newer incident.
  accepted.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const providers=new Map(),suppressed=new Map(),incidentById=new Map(),messageNoRetry=new Map();
  const touched=new Map();
  const group=(domain,provider)=>domain+'|'+provider;
  for(const e of accepted) {
    const key=group(e.domain,e.provider);
    if(!providers.has(key))providers.set(key,{domain:e.domain,recipientProviderGroup:e.provider,
      state:'NONE',reasonCodes:[],eventIds:[],reviewNotBefore:null,unresolvedIncidents:new Set()});
    const p=providers.get(key);
    const m=roster.get(e.sender);
    if(e.kind==='SMTP_TEMPFAIL') {
      const googleQuota=e.enhanced==='4.7.28';
      const reason=googleQuota?'receiving-provider-shared-quota-4.7.28':'receiving-provider-temporary-4xx';
      upgrade(p,'HOLD',reason,e.id);
      // Google recommends at least 10 minutes. This timestamp is not an
      // automatic resume permission; verified clearance is mandatory.
      const delayMs=googleQuota?600000:1800000;
      const review=new Date(e.at+delayMs).toISOString();
      if(!p.reviewNotBefore||review>p.reviewNotBefore)p.reviewNotBefore=review;
      p.unresolvedIncidents.add(e.id);
      incidentById.set(e.id,{key,time:e.at});
    }
    if(e.kind==='AUTH_FAILURE'||(e.kind==='SMTP_PERMFAIL'&&
      ['5.7.26','5.7.1'].includes(e.enhanced))) {
      upgrade(m,'QUARANTINE','auth-or-policy-rejection',e.id);
      upgrade(p,'QUARANTINE','provider-auth-or-policy-rejection',e.id);
      p.unresolvedIncidents.add(e.id);incidentById.set(e.id,{key,time:e.at});
    }
    if(e.kind==='SMTP_PERMFAIL') {
      // RFC-style permanent SMTP failure prohibits replaying the same
      // message. It does NOT always mean the destination is invalid.
      // A 5.7.26 authentication reject quarantines the sender/domain but
      // should not poison the recipient's global suppression record.
      messageNoRetry.set(e.id,{
        recipientEmail:e.recipient,sourceEventId:e.id,
        reasonCode:'permanent-smtp-message-no-retry',
        requiresDurableNoRetryRecord:true
      });
      if(['5.1.1','5.1.10','5.2.1'].includes(e.enhanced)) {
        suppressed.set(e.recipient,{
          recipientEmail:e.recipient,reasonCode:'verified-invalid-or-disabled-recipient',
          sourceEventId:e.id,requiresDurableSuppression:true
        });
      }
    }
    if(e.kind==='USER_COMPLAINT') {
      upgrade(m,'QUARANTINE','verified-user-complaint',e.id);
      upgrade(p,'QUARANTINE','verified-user-complaint',e.id);
      suppressed.set(e.recipient,{recipientEmail:e.recipient,
        reasonCode:'user-complaint-suppression',sourceEventId:e.id,
        requiresDurableSuppression:true});
      p.unresolvedIncidents.add(e.id);incidentById.set(e.id,{key,time:e.at});
    }
    if(e.kind==='UNSUBSCRIBE') {
      suppressed.set(e.recipient,{recipientEmail:e.recipient,
        reasonCode:'confirmed-unsubscribe',sourceEventId:e.id,
        requiresDurableSuppression:true});
    }
    if(e.kind==='RECOVERY_VERIFIED') {
      const incident=incidentById.get(e.recoveryOfEventId);
      let cleared=false;
      try{cleared=typeof verifyRecoveredCondition==='function'&&
        verifyRecoveredCondition({recoveryEvent:e.original,incidentEventId:e.recoveryOfEventId})===true}catch{}
      if(incident&&incident.key===key&&e.at>incident.time&&cleared) {
        p.unresolvedIncidents.delete(e.recoveryOfEventId);
        touched.set(key, true);
      } else excluded.push({eventId:e.id,reasons:['recovery-does-not-clear-correlated-incident']});
    }
  }
  const providerRows=[...providers.values()].map(p=>{
    const unresolved=[...p.unresolvedIncidents];
    // Even a valid recovery is not a positive reputation observation. A
    // caller must obtain a NEW approved health/capacity check before ramping.
    return {
      domain:p.domain,recipientProviderGroup:p.recipientProviderGroup,
      state:p.state==='NONE'?'NO_OBSERVED_INCIDENT':p.state,
      reasonCodes:ordered(p.reasonCodes),relatedEvidenceEventIds:ordered(p.eventIds),
      unresolvedIncidentIds:ordered(unresolved),
      recoveredEvidenceRequiresNewApproval:Boolean(touched.get(group(p.domain,p.recipientProviderGroup))),
      reviewNotBefore:p.reviewNotBefore,automaticallyResumed:false,
      permittedColdSendCap:0
    }
  }).sort((a,b)=>a.domain.localeCompare(b.domain)||a.recipientProviderGroup.localeCompare(b.recipientProviderGroup));
  const fleet=roster.size?([...roster.values()].map(m=>({
    senderEmail:m.address,senderDomain:m.domain,
    state:m.state==='NONE'?'NO_OBSERVED_INCIDENT':m.state,
    reasonCodes:ordered(m.reasonCodes),relatedEvidenceEventIds:ordered(m.eventIds),
    coldSendAuthority:false
  })).sort((a,b)=>a.senderEmail.localeCompare(b.senderEmail))):[];
  return Object.freeze({
    version:UBERWARM4_RECEIVER_VERSION,status:'OBSERVED_RECEIVER_FEEDBACK_COMPILED',
    generatedAt:new Date(at).toISOString(),
    acceptedEvidenceCount:accepted.length,excludedEvidence:excluded,
    decisions:fleet,blockedProviderGroups:providerRows.filter(p=>p.state!=='NO_OBSERVED_INCIDENT'),
    suppressionActions:[...suppressed.values()].sort((a,b)=>a.recipientEmail.localeCompare(b.recipientEmail)),
    messageNoRetryActions:[...messageNoRetry.values()].sort((a,b)=>a.sourceEventId.localeCompare(b.sourceEventId)),
    receivingProviderGroupsObserved:providerRows.length,
    coldSendAuthority:false,effectsPerformed:0,sendsPerformed:0,paidWarmingAddedCents:0,
    action:'PERSIST_SUPPRESSIONS_AND_HOLDS_THROUGH_GOVERNED_EXTERNAL_DISPATCH; NO_AUTO_RESUME',
    truthBoundary:'Report-only. Not an enforced dispatcher gate or durable suppression write. Release requires fresh authenticated clearance; no synthetic engagement.'
  });
}
