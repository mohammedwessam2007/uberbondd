/**
 * UberWarm³ independent and opt-in recipient observatory.
 *
 * No unsolicited invitations, seed accounts created, credential access,
 * warm-up replies, spam rescue or sender reputation manufactured.
 * Real volunteers may choose to receive sparse, transparent test messages
 * and report actual Inbox/Spam placement via approved integrations.
 */
export const UBERWARM3_PANEL_VERSION = 'uberbond.uberwarm3-consent-panel.v1';
const lower=v=>String(v??'').trim().toLowerCase();
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);
const dateMs=v=>{const n=Date.parse(v);return Number.isFinite(n)?n:null};
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower(v));
const validProvider=p=>['GOOGLE','MICROSOFT','YAHOO','APPLE','OTHER'].includes(p);
const SPARSE_MIN_GAP_DAYS=7;
const MIN_PANEL_CONSENT_DAYS=1;
const refused=reasons=>({ok:false,status:'UBERWARM3_PANEL_REFUSED',reasonCodes:reasons,approvedProbes:[],messagesSent:0,networkClaims:0});
/**
 * Participant is a person / organization with REAL explicit opt-in and an
 * independent receiving mailbox. No metadata alone establishes consent:
 * a verified consent receipt must be supplied by an authenticated app.
 */
export function compileUberWarm3ConsentingPanel({records=[],verifyConsentReceipt,verifyRecipientNetwork,now=new Date()}={}) {
  const at=dateMs(now),seen=new Set(),members=[],excluded=[];
  if(at===null)return refused(['invalid-current-time']);
  for(const row of Array.isArray(records)?records:[]){
    const email=lower(row.email),provider=clean(row.provider,80).toUpperCase();
    const org=clean(row.participantOrganizationId,180);
    const since=dateMs(row.consentGrantedAt),expiry=dateMs(row.consentExpiresAt);
    const proof=clean(row.consentEvidenceRef,800);
    const reasons=[];
    if(!emailOk(email)||!validProvider(provider)||!org)reasons.push('participant-identity-and-provider-required');
    // A record merely labeling itself "Gmail" or "Outlook" is not evidence
    // of an independent receiving network. Verify against an authenticated
    // provider/MX identity binding before claiming network coverage.
    let verifiedNetwork=false;
    try { verifiedNetwork=typeof verifyRecipientNetwork==='function' &&
      verifyRecipientNetwork({email,provider,record:row})===true; } catch {}
    if(!verifiedNetwork)reasons.push('independent-recipient-provider-binding-required');
    if(seen.has(email))reasons.push('duplicate-participant');
    if(row.ownerControlled!==true && row.independentParticipant!==true)reasons.push('participant-ownership-required');
    let verified=false;
    try { verified=typeof verifyConsentReceipt==='function' &&
      verifyConsentReceipt(row)===true; } catch {}
    if(row.optedIn !== true || row.authenticatedConsentReceipt !== true ||
      !proof || !proof.startsWith('verified-consent:') || !verified)
      reasons.push('authentic-current-consent-required');
    if(!Array.isArray(row.allowedPurposes)||!row.allowedPurposes.includes('TRANSPARENT_DELIVERY_DIAGNOSTIC'))
      reasons.push('explicit-diagnostic-purpose-required');
    if(row.optedOut===true||row.suppressed===true)reasons.push('optout-or-suppression-active');
    if(row.receiveReady!==true)reasons.push('verified-receive-readiness-required');
    if(since===null||expiry===null||since>at||expiry<=at||expiry-since<MIN_PANEL_CONSENT_DAYS*86400000)
      reasons.push('valid-effective-consent-window-required');
    if(row.automaticReplyConsent===true || row.autoSpamRescue===true)
      reasons.push('manufactured-engagement-not-supported');
    if(reasons.length){excluded.push({email:emailOk(email)?email:null,reasonCodes:reasons});continue}
    seen.add(email);
    members.push(Object.freeze({
      email,provider,participantOrganizationId:org,
      ownerControlled:row.ownerControlled===true,
      independentParticipant:row.independentParticipant===true,
      consentEvidenceRef:proof,
      consentExpiresAt:new Date(expiry).toISOString(),
      lastTestAt:dateMs(row.lastTestAt)===null?null:new Date(row.lastTestAt).toISOString(),
      canReportIndependentPlacement:row.authorizedReceivingAdapter===true,
      receiveReady:true,consentToTest:true,
      permittedPurpose:'TRANSPARENT_DELIVERY_DIAGNOSTIC'
    }));
  }
  const diversity=[...new Set(members.map(x=>x.provider))];
  return Object.freeze({
    ok:true,status:'UBERWARM3_PANEL_COMPILED',
    members,excluded,realParticipantCount:members.length,
    independentParticipantCount:members.filter(x=>x.independentParticipant).length,
    networkCoverage:diversity,networkCount:diversity.length,
    eligibleForTwoProviderTests:diversity.length>=2,
    messagesSent:0,automaticReplies:0,engagementSyntheticClaims:0,
    truthBoundary:'A declared consent receipt must be authenticated at ingestion. This source-only registry cannot establish any real external panel member, vendor-equivalent warming, or recipient trust.'
  });
}
/**
 * Reserve scarce verified-panel recipient capacity for transparent diagnostic
 * tests, capped to one eligible test per participant per 7 days.
 * All assignments are PLAN ONLY; the live sender still uses separate exact
 * batch approval and durable send quotas.
 */
export function compileUberWarm3PanelAssignments({panel={},senders=[],now=new Date(),maxTestsPerSender=2}={}) {
  const at=dateMs(now);
  if(at===null||panel?.ok!==true||!Array.isArray(panel.members))
    return refused(['valid-observed-panel-required']);
  const members=panel.members.filter(m=>{
    const last=dateMs(m.lastTestAt),expiry=dateMs(m.consentExpiresAt);
    return expiry!==null&&expiry>at&&
      (last===null||at-last>=SPARSE_MIN_GAP_DAYS*86400000);
  }).sort((a,b)=>a.provider.localeCompare(b.provider)||a.email.localeCompare(b.email));
  const assignments=[],used=new Set();
  const senderLimit=Math.min(4,Math.max(1,Number(maxTestsPerSender)||2));
  for(const sender of Array.isArray(senders)?senders:[]){
    if(sender?.authenticated!==true||sender?.paused===true||sender?.quarantined===true||
      sender?.placementQuarantine===true||!emailOk(sender?.address))continue;
    const available=members.filter(m=>!used.has(m.email)&&lower(sender.address)!==m.email);
    const byProvider=new Map();
    for(const m of available){if(!byProvider.has(m.provider))byProvider.set(m.provider,[]);byProvider.get(m.provider).push(m)}
    const selected=[];
    for(const provider of [...byProvider.keys()].sort()){
      const seed=byProvider.get(provider)[0];
      if(seed&&selected.length<senderLimit)selected.push(seed);
    }
    if(selected.length<senderLimit){
      for(const seed of available){if(selected.length>=senderLimit)break;
        if(!selected.some(p=>p.email===seed.email))selected.push(seed);
      }
    }
    for(const seed of selected){
      used.add(seed.email);
      assignments.push(Object.freeze({
        senderAddress:lower(sender.address),recipientAddress:seed.email,
        recipientProvider:seed.provider,
        recipientIndependent:seed.independentParticipant,
        consentEvidenceRef:seed.consentEvidenceRef,
        purpose:'TRANSPARENT_DELIVERY_DIAGNOSTIC',
        authority:'PLAN_ONLY',sendAuthorized:false,
        autoReplyRequested:false,spamRescueRequested:false
      }));
    }
  }
  return Object.freeze({
    ok:true,status:'UBERWARM3_PANEL_ASSIGNMENTS_PLAN_ONLY',
    assignments,recipientSlotsAvailable:members.length,
    recipientSlotsUsed:used.size,
    senderCount:(Array.isArray(senders)?senders:[]).length,
    potentialIndependentProviderCoverage:[...new Set(assignments.map(a=>a.recipientProvider))],
    sendsPerformed:0,unconsentedParticipantsContacted:0,
    nonGuarantee:'No created sending authority. A consenting participant remains free to withdraw, report Spam truthfully, or not reply.'
  });
}
