import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePostmasterV2Compliance,createUberWarm3GooglePostmasterReader
} from '../src/uberwarm3-google-postmaster-v2.mjs';
const domain='uberbond.example';
const reply=(rows=[])=>({
  name:'domains/'+domain+'/complianceStatus',
  complianceData:{domainId:domain,rowData:rows,
    deliverabilityStatusVerdict:{state:{status:'COMPLIANT'},reason:'MESSAGE_VOLUME_LOW'}}
});
test('postmaster reader refuses missing OAuth and unverified domains without network calls',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>reply()}};
 const blocked=createUberWarm3GooglePostmasterReader({
    accessToken:'',authorized:false,verifiedDomains:[domain],fetchImpl
 });
 assert.equal((await blocked.readCompliance(domain)).ok,false);
 const ready=createUberWarm3GooglePostmasterReader({
   accessToken:'test-long-token-not-for-real-google',authorized:true,
   verifiedDomains:[domain],fetchImpl
 });
 assert.equal((await ready.readCompliance('other.example')).ok,false);
 assert.equal(calls,0);
});
test('valid API response yields observed SPF DKIM DMARC with low volume explicitly unknown',()=>{
 const r=normalizePostmasterV2Compliance({
  domain,response:reply([
   {requirement:'SPF_AND_DKIM',status:{status:'COMPLIANT'}},
   {requirement:'DMARC_ALIGNMENT',status:{status:'COMPLIANT'}}
  ]),observedAt:'2026-10-12T18:00:00Z'
 });
 assert.equal(r.ok,true);
 assert.equal(r.status,'OBSERVED_COMPLIANCE');
 assert.equal(r.lowVolumeEvidenceInsufficient,true);
 assert.equal(r.independentInboxPlacements,0);
 assert.equal(r.inferredSpamRate,null);
});
test('postmaster negative compliance is not promoted to healthy',()=>{
 const r=normalizePostmasterV2Compliance({
  domain,response:reply([{requirement:'DKIM',status:{status:'NEEDS_WORK'}}]),
  observedAt:'2026-10-12T18:00:00Z'
 });
 assert.equal(r.status,'NEEDS_WORK');
 assert.deepEqual(r.failures,['DKIM']);
});
test('missing rows are NO_DATA rather than compliant',()=>{
 const r=normalizePostmasterV2Compliance({domain,response:reply()});
 assert.equal(r.status,'NO_DATA');
 assert.equal(r.missingData,true);
});
test('domain mismatch, duplicate or malformed statuses are refused',()=>{
 const a=normalizePostmasterV2Compliance({
   domain,response:{...reply(),name:'domains/attacker.example/complianceStatus'}
 });
 assert.equal(a.ok,false);
 const b=normalizePostmasterV2Compliance({
   domain,response:reply([
     {requirement:'SPF',status:{status:'COMPLIANT'}},
     {requirement:'SPF',status:{status:'NEEDS_WORK'}}
   ])
 });
 assert.equal(b.ok,false);
});
test('Google Postmaster calls only GET for allowlisted domains and never sends mail',async()=>{
 let call;
 const reader=createUberWarm3GooglePostmasterReader({
  accessToken:'test-long-token-not-for-real-google',
  authorized:true,verifiedDomains:[domain],
  fetchImpl:async(url,request)=>{
    call={url,request};return {ok:true,json:async()=>reply([
      {requirement:'SPF_AND_DKIM',status:{status:'COMPLIANT'}}
    ])}
  },
  now:()=>new Date('2026-10-12T18:00:00Z')
 });
 const r=await reader.readCompliance(domain);
 assert.equal(r.ok,true);
 assert.equal(call.request.method,'GET');
 assert.equal(call.url,'https://gmailpostmastertools.googleapis.com/v2/domains/uberbond.example/complianceStatus');
 assert.equal(r.sendsPerformed,0);
});

test('negative Google deliverability verdict overrides fully green compliance rows',()=>{
 const response=reply([{requirement:'SPF_AND_DKIM',status:{status:'COMPLIANT'}}]);
 response.complianceData.deliverabilityStatusVerdict={
   state:{status:'NEEDS_WORK'},reason:'USER_FEEDBACK_NEGATIVE'
 };
 const r=normalizePostmasterV2Compliance({
   domain,response,observedAt:'2026-10-12T18:00:00Z'
 });
 assert.equal(r.status,'NEEDS_WORK');
 assert.equal(r.deliverabilityAdverse,true);
 assert.equal(r.deliverabilityReason,'USER_FEEDBACK_NEGATIVE');
});
test('Google subdomain result is explicitly labeled registrable-domain aggregate',()=>{
 const subdomain='mail.uberbond.example';
 const response={...reply([{requirement:'DKIM',status:{status:'COMPLIANT'}}]),
   name:'domains/'+subdomain+'/complianceStatus',
   complianceData:{...reply().complianceData,domainId:'uberbond.example',
     rowData:[{requirement:'DKIM',status:{status:'COMPLIANT'}}]}
 };
 const r=normalizePostmasterV2Compliance({domain:subdomain,response});
 assert.equal(r.ok,true);
 assert.equal(r.reportedComplianceDomain,'uberbond.example');
 assert.equal(r.subdomainSpecificEvidenceAvailable,false);
});
