import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberWarm3ReputationDecision as rawDecision,compareUberWarm3AgainstWinnr as rawCompare
} from '../src/uberwarm3-reputation-oracle.mjs';
const T=new Date('2026-10-12T18:00:00Z');
const compileUberWarm3ReputationDecision = args =>
  rawDecision({...args,verifyAuthenticatedSignal:()=>true});
const compareUberWarm3AgainstWinnr = args =>
  rawCompare({...args,verifyExperimentCohort:()=>true});
const M={address:'tara@example.net',authenticated:true,paused:false,conditioningDays:21,
  legalRecipientRouteCleared:true,ownerCampaignAuthority:true,
  providerColdDailyCap:15,uberWarm2ColdDailyCap:10};
function signal(provider='GOOGLE',extra={}){
  return {mailboxAddress:M.address,source:'INDEPENDENT_RECEIVER',
    provider,trustBoundary:'AUTHENTICATED_INGEST',evidenceRef:'authenticated:message-id:1',
    observedAt:'2026-10-12T17:00:00Z',folder:'INBOX',consentedSeed:true,
    spfAligned:true,dkimAligned:true,dmarcPass:true,...extra};
}
function cohort(pair,provider,arm,total,inbox){
  return {matchedPairId:pair,recipientProvider:provider,arm,independentlyObserved:total,
    inboxCount:inbox,source:'CAMPAIGN_GOVERNED_LEDGER',
    evidenceRef:'authenticated:independent-receivers:'+pair+arm,trustBoundary:'AUTHENTICATED_INGEST',
    legalRouteCleared:true,ownerAuthorized:true,randomizedAssignment:true,
    recipientEvidenceClass:'INDEPENDENT_REAL_RECIPIENT',
    observedAt:'2026-10-12T17:00:00Z'};
}
test('missing independent provider evidence blocks ramp even with two Gmail accounts',()=>{
  const result=compileUberWarm3ReputationDecision({mailbox:M,signals:[signal()],now:T});
  assert.equal(result.state,'NOT_READY');
  assert.equal(result.coldDailyCap,0);
  assert.ok(result.reasonCodes.includes('independent-recipient-provider-diversity-required'));
});
test('authenticated two-network evidence never grants more than prior UberWarm2 cap',()=>{
  const result=compileUberWarm3ReputationDecision({
    mailbox:M,signals:[signal(),signal('MICROSOFT')],now:T});
  assert.equal(result.state,'BOUNDED_RAMP_CANDIDATE');
  assert.equal(result.coldDailyCap,10);
  assert.equal(result.knownComplaints,false);
  assert.equal(result.knownBounces,false);
  assert.equal(result.contactEligibilityGranted,false);
});
test('real spam seed signal quarantines rather than hiding mixed placement',()=>{
  const r=compileUberWarm3ReputationDecision({
    mailbox:M,signals:[signal(),signal('MICROSOFT',{folder:'SPAM'})],now:T});
  assert.equal(r.state,'QUARANTINED');
  assert.equal(r.coldDailyCap,0);
});
test('missing legal or owner campaign authority always prevents launch',()=>{
  const r=compileUberWarm3ReputationDecision({
    mailbox:{...M,ownerCampaignAuthority:false,legalRecipientRouteCleared:false},
    signals:[signal(),signal('MICROSOFT')],now:T});
  assert.equal(r.coldDailyCap,0);
  assert.ok(r.reasonCodes.includes('owner-campaign-authorization-required'));
});
test('bad authentication and severe complaints stop all expansion',()=>{
  const r=compileUberWarm3ReputationDecision({
    mailbox:M,signals:[signal(),signal('MICROSOFT',{
      source:'MICROSOFT_SNDS',dkimAligned:false,spamComplaintRate:0.004
    })],now:T});
  assert.equal(r.state,'QUARANTINED');
  assert.equal(r.coldDailyCap,0);
});
test('self-attested, stale or foreign-mailbox signals do not count',()=>{
  const r=compileUberWarm3ReputationDecision({mailbox:M,signals:[
    signal('GOOGLE',{trustBoundary:'SELF_ATTESTED'}),
    signal('MICROSOFT',{observedAt:'2026-09-01T00:00:00Z'}),
    signal('YAHOO',{mailboxAddress:'someone-else@example.net'})
  ],now:T});
  assert.equal(r.verifiedEvidenceCount,0);
  assert.equal(r.coldDailyCap,0);
  assert.equal(r.excludedEvidenceCount,3);
});
test('zero complaints never inferred from missing Postmaster low-volume data',()=>{
  const r=compileUberWarm3ReputationDecision({
    mailbox:M,signals:[signal(),signal('MICROSOFT')],now:T});
  assert.equal(r.knownComplaints,false);
  assert.ok(r.evidenceWarnings.includes('spam-rate-unknown-not-zero'));
});
test('one provider and seed proxy alone cannot claim superiority',()=>{
  const rows=[cohort('one','GOOGLE','UBERWARM3_NO_ADDON',10,10),
    cohort('one','GOOGLE','WINNR_PAID_WARMING',10,5)];
  const r=compareUberWarm3AgainstWinnr({cohorts:rows,now:T});
  assert.equal(r.status,'INSUFFICIENT_REAL_CAUSAL_EVIDENCE');
  assert.equal(r.paidProviderWarmingBeaten,false);
});
test('invalid cohort evidence and synthetic seed proxies are excluded',()=>{
  const row=cohort('one','GOOGLE','UBERWARM3_NO_ADDON',100,95);
  const r=compareUberWarm3AgainstWinnr({cohorts:[
    {...row,recipientEvidenceClass:'SYNTHETIC_WARMUP'},
    {...row,ownerAuthorized:false},
    {...row,trustBoundary:'AI_SELF_REPORT'}
  ],now:T});
  assert.equal(r.evidenceCounts.validMatchedPairs,0);
  assert.equal(r.evidenceCounts.excludedRows,3);
  assert.equal(r.status,'INSUFFICIENT_REAL_CAUSAL_EVIDENCE');
});
test('credible two-network matched evidence can certify outcome advantage',()=>{
  const rows=['GOOGLE','MICROSOFT'].flatMap((p,i)=>[
    cohort('pair'+i,p,'UBERWARM3_NO_ADDON',200,198),
    cohort('pair'+i,p,'WINNR_PAID_WARMING',200,140)
  ]);
  const r=compareUberWarm3AgainstWinnr({cohorts:rows,now:T});
  assert.equal(r.status,'MEASURED_HIGHER_INBOX_RATE_WITH_MATCHED_EVIDENCE');
  assert.equal(r.paidProviderWarmingBeaten,true);
  assert.equal(r.evidenceCounts.uberWarm3,400);
  assert.equal(r.evidenceCounts.winnr,400);
});
test('small apparent result and identical groups remain inconclusive',()=>{
  const rows=['GOOGLE','MICROSOFT'].flatMap((p,i)=>[
    cohort('pair'+i,p,'UBERWARM3_NO_ADDON',50,40),
    cohort('pair'+i,p,'WINNR_PAID_WARMING',50,40)
  ]);
  const r=compareUberWarm3AgainstWinnr({cohorts:rows,now:T});
  assert.equal(r.status,'INCONCLUSIVE');
  assert.equal(r.paidProviderWarmingBeaten,false);
});

test('without server-side authenticated telemetry ingestion, claims fail closed',()=>{
  const suspect=rawDecision({
    mailbox:M,signals:[signal(),signal('MICROSOFT')],now:T
  });
  assert.equal(suspect.state,'NOT_READY');
  assert.equal(suspect.coldDailyCap,0);
  assert.equal(suspect.verifiedEvidenceCount,0);
});
test('without independent real-recipient verifier, a staged big win is refused',()=>{
 const rows=['GOOGLE','MICROSOFT'].flatMap((p,i)=>[
    cohort('pair'+i,p,'UBERWARM3_NO_ADDON',500,499),
    cohort('pair'+i,p,'WINNR_PAID_WARMING',500,100)
 ]);
 const r=rawCompare({cohorts:rows,now:T});
 assert.equal(r.status,'INSUFFICIENT_REAL_CAUSAL_EVIDENCE');
 assert.equal(r.evidenceCounts.validMatchedPairs,0);
 assert.equal(r.paidProviderWarmingBeaten,false);
});
