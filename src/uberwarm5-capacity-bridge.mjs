/**
 * UberWarm5: receiver-incident overlay for EXISTING UberReach sender capacity.
 *
 * This is a read-only safety reduction of historical warm sender capacity.
 * Never increase a cap, treat absent receiver history as zero, convert test
 * data to sending authority, or allow another mailbox to bypass MX holds.
 */
export const UBERWARM5_CAPACITY_VERSION='uberbond.uberwarm5-receiver-capacity.v1';
const validDate=v=>{const t=new Date(v).getTime();return Number.isFinite(t)?t:null};
const addr=v=>String(v??'').trim().toLowerCase();
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const emptyReasons=['receiver-history-not-authenticated-current-or-complete'];
export function protectUberWarm5FleetCapacity({
  warmFleet={},receiverReport=null,verifyReceiverReport,now=new Date()
}={}) {
  const at=validDate(now),reportTime=validDate(receiverReport?.generatedAt);
  let verified=false;
  try{verified=typeof verifyReceiverReport==='function' &&
    verifyReceiverReport(receiverReport)===true}catch{}
  const reportDecisions=Array.isArray(receiverReport?.decisions)?receiverReport.decisions:[];
  const rosterAddresses=reportDecisions.map(x=>addr(x?.senderEmail));
  const reportReady=at!==null&&reportTime!==null&&reportTime<=at+300000&&
    at-reportTime<=15*60000&&verified&&
    receiverReport?.status==='OBSERVED_RECEIVER_FEEDBACK_COMPILED'&&
    Array.isArray(receiverReport?.decisions)&&
    new Set(rosterAddresses).size===rosterAddresses.length&&
    rosterAddresses.every(validEmail)&&
    reportDecisions.every(x=>['NO_OBSERVED_INCIDENT','QUARANTINE'].includes(x.state))&&
    Array.isArray(receiverReport?.blockedProviderGroups)&&
    receiverReport.blockedProviderGroups.every(x=>['HOLD','QUARANTINE'].includes(x?.state)
      &&typeof x.domain==='string'&&x.domain.includes('.') &&
      typeof x.recipientProviderGroup==='string'&&x.recipientProviderGroup.length>0)&&
    Array.isArray(receiverReport?.suppressionActions)&&
    Array.isArray(receiverReport?.messageNoRetryActions);
  const reportSenders=new Map((reportReady?receiverReport.decisions:[])
    .map(x=>[addr(x?.senderEmail),x]));
  const blockedDomains=new Set((reportReady?receiverReport.blockedProviderGroups:[])
    .filter(x=>['HOLD','QUARANTINE'].includes(x?.state))
    .map(x=>addr(x?.domain)));
  const original=Array.isArray(warmFleet?.decisions)?warmFleet.decisions:[];
  const results=original.map(row=>{
    const senderEmail=addr(row?.address),domain=senderEmail.split('@')[1];
    const fresh=reportSenders.get(senderEmail);
    const reasons=[];
    if(!reportReady)reasons.push(...emptyReasons);
    if(!validEmail(senderEmail)||!fresh)reasons.push('sender-missing-from-protected-roster');
    if(fresh&&!['NO_OBSERVED_INCIDENT','QUARANTINE'].includes(fresh.state))
      reasons.push('unknown-sender-protection-state');
    if(fresh?.state==='QUARANTINE')reasons.push('receiver-sender-quarantined');
    if(blockedDomains.has(domain))reasons.push('receiving-network-hold-affects-sender-domain');
    const historical=Number(row?.recommendedColdDailyCap);
    const historicalCap=Number.isSafeInteger(historical)&&historical>0?historical:0;
    if(!['LIMITED_CANARY','RAMP','HOLD'].includes(row?.state))
      reasons.push('original-sender-readiness-not-positive');
    if(reasons.length)return {
      ...row,state:'QUARANTINED',recommendedColdDailyCap:0,
      reasonCodes:[...new Set([...(row?.reasonCodes||[]),...reasons])],
      receiverProtectiveOverride:true
    };
    return {...row,recommendedColdDailyCap:Math.min(historicalCap,20),
      receiverProtectiveOverride:false};
  });
  const remaining=results.reduce((sum,x)=>sum+x.recommendedColdDailyCap,0);
  return Object.freeze({
    ...warmFleet,version:UBERWARM5_CAPACITY_VERSION,
    originalWarmFleetVersion:warmFleet?.version??null,
    decisions:results,readyMailboxCount:results.filter(x=>x.recommendedColdDailyCap>0).length,
    quarantinedMailboxCount:results.filter(x=>x.state==='QUARANTINED').length,
    totalRecommendedDailyCap:remaining,
    receiverReportAuthenticated:reportReady,originalRecommendedDailyCap:
      original.reduce((sum,x)=>sum+(Number(x?.recommendedColdDailyCap)||0),0),
    externalEffectAuthority:'NONE',messagesSent:0,
    truthBoundary:'Read-only protective overlay; separate sender/recipient eligibility, legal, owner authority, live MX routing, transaction quotas and complete suppression reconciliation remain mandatory. No automatic dispatch.'
  });
}
