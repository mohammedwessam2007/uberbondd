/**
 * UberWarm⁴ composition boundary: turn observed receiving-provider incidents
 * into a fail-closed, read-only decision for a PARTICULAR intended recipient.
 *
 * A caller must inject server-controlled verifiers for fresh sender caps,
 * receiving group mapping, durable suppression and legal/owner permission.
 * This module cannot authorize dispatch, cannot buy warming and cannot route
 * around a provider throttle via another sender account.
 */
export const UBERWARM4_DISPATCH_GUARD_VERSION='uberbond.uberwarm4-dispatch-guard.v1';
const email=v=>String(v??'').trim().toLowerCase();
const check=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const ms=v=>{const n=new Date(v).getTime();return Number.isFinite(n)?n:null};
const result=(status,reasons,detail={})=>Object.freeze({
  version:UBERWARM4_DISPATCH_GUARD_VERSION,status,
  reasonCodes:[...new Set(reasons)].sort(),
  recommendedMaximumFirstTouches:0,
  messagesSent:0,paidWarmupCents:0,
  dispatchAuthority:'NONE',
  ...detail
});
export async function compileUberWarm4DispatchGuard({
  senderEmail='',recipientEmail='',recipientProviderGroup='',
  receiverReport,now=new Date(),declaredExistingColdCap=0,
  verifyReceiverReport,verifyRecipientProviderGroup,verifyExistingColdCap,
  verifyDurableSuppressionApplied,lookupCurrentRecipientSuppression,
  verifyLegalRecipientRoute,verifyCurrentOwnerSendAuthority
}={}) {
  const at=ms(now),from=email(senderEmail),to=email(recipientEmail);
  const provider=String(recipientProviderGroup??'').trim().toUpperCase();
  if(at===null||!check(from)||!check(to)||from===to)
    return result('DENIED',['invalid-time-or-sender-recipient-identity']);
  if(!/^[A-Z0-9_.-]{2,120}$/.test(provider))
    return result('DENIED',['verified-recipient-provider-group-required']);
  let groupValid=false;
  try{groupValid=typeof verifyRecipientProviderGroup==='function'&&
    await verifyRecipientProviderGroup({recipientEmail:to,providerGroup:provider})===true}catch{}
  if(!groupValid)return result('DENIED',['recipient-mx-group-unverified']);
  const generated=ms(receiverReport?.generatedAt);
  if(receiverReport?.status!=='OBSERVED_RECEIVER_FEEDBACK_COMPILED'||
    generated===null||generated>at+300000||at-generated>15*60000)
    return result('DENIED',['fresh-receiver-protection-required']);
  let reportVerified=false;
  try{reportVerified=typeof verifyReceiverReport==='function'&&
    await verifyReceiverReport(receiverReport)===true}catch{}
  if(!reportVerified)return result('DENIED',['authenticated-receiver-report-required']);
  const sender=Array.isArray(receiverReport.decisions)?
    receiverReport.decisions.find(row=>row.senderEmail===from):null;
  if(!sender)return result('DENIED',['sender-not-in-protected-fleet']);
  const senderDomain=from.split('@')[1];
  const blocked=(Array.isArray(receiverReport.blockedProviderGroups)?
    receiverReport.blockedProviderGroups:[]).filter(p=>
    p.domain===senderDomain&&p.recipientProviderGroup===provider&&
    ['HOLD','QUARANTINE'].includes(p.state));
  if(sender.state==='QUARANTINE'||blocked.length)
    return result('HOLD',['receiving-provider-or-sender-quarantined'],{
      affectedProvider:provider,affectedSenderDomain:senderDomain,
      relevantIncidentIds:[...new Set(blocked.flatMap(p=>p.unresolvedIncidentIds||[]))]
    });
  // Permanently rejected / opted-out / complaining recipients must be
  // persisted in a durable global suppression ledger BEFORE another probe,
  // sender identity or campaign could reuse the address.
  const suppressions=Array.isArray(receiverReport.suppressionActions)?
    receiverReport.suppressionActions:[];
  let suppressionCommitted=false,liveSuppression;
  try{suppressionCommitted=typeof verifyDurableSuppressionApplied==='function'&&
    await verifyDurableSuppressionApplied(suppressions)===true}catch{}
  if(!suppressionCommitted)return result('DENIED',['global-feedback-suppression-not-durably-reconciled']);
  try{if(typeof lookupCurrentRecipientSuppression==='function')
    liveSuppression=await lookupCurrentRecipientSuppression(to)}catch{}
  if(liveSuppression?.verified!==true||
    typeof liveSuppression?.ledgerEvidenceRef!=='string'||
    !liveSuppression.ledgerEvidenceRef.trim())
    return result('DENIED',['fresh-recipient-suppression-ledger-required']);
  if(liveSuppression.suppressed!==false ||
    suppressions.some(x=>x.recipientEmail===to))
    return result('DENIED',['recipient-hard-bounced-unsubscribed-or-complained']);
  let legal=false,owner=false,capVerified=false;
  try{legal=typeof verifyLegalRecipientRoute==='function'&&
    await verifyLegalRecipientRoute({senderEmail:from,recipientEmail:to})===true}catch{}
  try{owner=typeof verifyCurrentOwnerSendAuthority==='function'&&
    await verifyCurrentOwnerSendAuthority({senderEmail:from,recipientEmail:to})===true}catch{}
  try{capVerified=typeof verifyExistingColdCap==='function'&&
    await verifyExistingColdCap({senderEmail:from,dailyCap:declaredExistingColdCap})===true}catch{}
  const reasons=[];
  if(!legal)reasons.push('legally-qualified-recipient-route-required');
  if(!owner)reasons.push('current-owner-exact-send-authority-required');
  if(!capVerified||!Number.isSafeInteger(declaredExistingColdCap)||declaredExistingColdCap<=0)
    reasons.push('verified-live-sender-cap-required');
  if(reasons.length)return result('DENIED',reasons);
  // A clean receiving report does not mean the sender is healthy or that the
  // next message is approved. This is only a zero-effect upper bound.
  return result('CLEAR_TO_REEVALUATE_IN_EXISTING_DISPATCH',[],{
    recommendedMaximumFirstTouches:Math.min(20,declaredExistingColdCap),
    verifiedRecipientGroup:provider,
    affectedSenderDomain:senderDomain,
    recipientSuppressionReceipt:liveSuppression.ledgerEvidenceRef,
    truthBoundary:'Governed dispatch must independently reconcile caps, recipient consent, suppression, current sender health and transaction authorization. This result does not send or permit evasion by shifting to another mailbox.'
  });
}
