import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2TrustedReceiverEvidenceDonor } from '../src/uberwarm2-trusted-receiver-evidence-donor.mjs';
import { createUberWarm2WinnrReadOnlyObservationDonor } from '../src/uberwarm2-winnr-readonly-observation-donor.mjs';
import { compileUberWarm2ProtectedRuntimePreflight, PROTECTED_RUNTIME_REQUIREMENT_IDS } from '../src/uberwarm2-protected-runtime-preflight-donor.mjs';
import { createUberWarm2TrustedHealthSupplier } from '../src/uberwarm2-trusted-health-supplier.mjs';

const NOW=Date.parse('2026-10-16T02:03:00.000Z');
const iso=(ms=NOW)=>new Date(ms).toISOString();
const probe={probeId:'owned-seed-probe-1',senderEmail:'sender@example.test',
  seedEmail:'owned-seed@gmail.com',seedProvider:'google',bodyToken:'owned-seed-probe-1'};
const receipt={probeId:probe.probeId,senderEmail:probe.senderEmail,seedEmail:probe.seedEmail,
  providerMessageId:'msg-abc-1',submittedAt:iso(NOW-120000)};
const message={probeId:probe.probeId,senderEmail:probe.senderEmail,seedEmail:probe.seedEmail,
  messageId:receipt.providerMessageId,bodyToken:probe.bodyToken,provider:'google',providerFolder:'SPAM',
  observedAt:iso(NOW-30000),receivingProviderEvidenceRef:'gmail:auth-folder-1',authenticated:true};
const reference={verified:true,immutable:true,signed:true,receiverAuthenticated:true,
  providerFolder:message.providerFolder,bodyToken:message.bodyToken,observedAt:message.observedAt,
  receivingProviderEvidenceRef:message.receivingProviderEvidenceRef,
  probeId:probe.probeId,messageId:receipt.providerMessageId,senderEmail:probe.senderEmail,
  seedEmail:probe.seedEmail,provider:probe.seedProvider};
function receiver(m=message, ref=reference){
  return createUberWarm2TrustedReceiverEvidenceDonor({
    readAuthenticatedReceivingEvidence:async()=>[m],
    readVerifiedEvidenceReference:async()=>[ref],clock:()=>NOW
  });
}
test('real async receiver evidence binds exact folder SPAM, not caller INBOX',async()=>{
  const r=await receiver().inspect({probe,receipt,at:NOW});
  assert.equal(r.ok,true);
  assert.equal(r.observation.folder,'SPAM');
  assert.equal(r.verifyReceivingObservation({observation:r.observation,probe,receipt}),true);
  assert.equal(r.verifyReceivingObservation({observation:{...r.observation,folder:'INBOX'},probe,receipt}),false);
  assert.equal(r.verifyReceivingObservation({observation:{...r.observation,evidenceRef:'forged'},probe,receipt}),false);
  assert.equal(r.verifyReceivingObservation({observation:{...r.observation,donorProofVersion:'forged'},probe,receipt}),false);
});
test('receiver evidence requires independent signed reference with identical source identity',async()=>{
  for(const bad of [{signed:false},{receiverAuthenticated:false},{messageId:'different'},
    {seedEmail:'someone@gmail.com'},{provider:'microsoft'},{providerFolder:'INBOX'},
    {bodyToken:'other'},{observedAt:iso(NOW-1000)}]){
    const r=await receiver(message,{...reference,...bad}).inspect({probe,receipt,at:NOW});
    assert.equal(r.ok,false,JSON.stringify(bad));
  }
});
test('unsigned row cannot relabel SPAM before initial proof compilation',async()=>{
  const r=await receiver({...message,providerFolder:'INBOX'},reference).inspect({probe,receipt,at:NOW});
  assert.equal(r.ok,false);
});
test('recipient connector cannot relabel unknown, mismatched, future or stale placement',async()=>{
  for(const bad of [{providerFolder:'FAKE'},{provider:'yahoo'},
    {observedAt:iso(NOW-200000)},{observedAt:iso(NOW+301000)},
    {messageId:'tampered'},{bodyToken:'tampered'}]){
    const r=await receiver({...message,...bad}).inspect({probe,receipt,at:NOW});
    assert.equal(r.ok,false,JSON.stringify(bad));
  }
});
test('per-instance receiver replay and absent protected source fail closed',async()=>{
  const d=receiver();
  assert.equal((await d.inspect({probe,receipt,at:NOW})).ok,true);
  assert.equal((await d.inspect({probe,receipt,at:NOW})).ok,false);
  const missing=createUberWarm2TrustedReceiverEvidenceDonor({clock:()=>NOW});
  assert.equal((await missing.inspect({probe,receipt,at:NOW})).ok,false);
});

const MB='sender@example.test', DOMAIN='example.test';
function winnrClient({extra=false,dnsAt=NOW,providerFlags={}}={}){
 const stats={calls:[],export:0};
 const response=(data,pagination={has_more:false},suffix='x')=>({
   ok:true,data,pagination,receipt:{responseDigest:'sha256:fixture-'+suffix}
 });
 const client={
   listAllMailboxes:async()=>{stats.calls.push('mailboxes');return response([{
    id:'mb1',email:MB,domain:DOMAIN,active:true,connected:true,paused:false,
    quarantined:false,placementQuarantine:false,policyCompatible:true,...providerFlags,
   },...(extra?[{id:'mb2',email:MB,domain:DOMAIN}]:[])],{has_more:false},'mb')},
   listAllDomains:async()=>{stats.calls.push('domains');return response([{
    id:'dom1',name:DOMAIN
   }],{has_more:false},'domains')},
   getDnsStatus:async({domainId})=>{stats.calls.push('dns:'+domainId);
    return response({domainId,domain:DOMAIN,ready:true,checkedAt:iso(dnsAt)},null,'dns')},
   exportMailboxes:async()=>{stats.export++;throw Error('never allowed')},
 };
 return {client,stats};
}
test('Winnr adapter reads only three account endpoints, never credential export or SMTP AUTH',async()=>{
 const {client,stats}=winnrClient();
 const w=createUberWarm2WinnrReadOnlyObservationDonor({client,clock:()=>NOW});
 const observed=await w.inspect({email:MB,at:NOW});
 assert.equal(observed.ok,true);
 assert.equal(observed.observation.providerReportedActive,true);
 assert.equal(observed.observation.smtpAuthenticationClaimed,false);
 assert.equal(observed.observation.dkimAlignmentClaimed,false);
 assert.deepEqual(stats.calls,['mailboxes','domains','dns:dom1']);
 assert.equal(stats.export,0);
 const m=await w.readProviderMailbox({email:MB,at:NOW});
 const d=await w.readProviderDomainDns({email:MB,at:NOW});
 assert.equal(m.length,1);
 assert.equal(d.length,1);
});
test('provider Active with missing health flags, duplicate identity or stale DNS stays held',async()=>{
 for(const options of [{extra:true},{providerFlags:{paused:true}},{dnsAt:NOW-300001}]){
 const {client}=winnrClient(options);
 const w=createUberWarm2WinnrReadOnlyObservationDonor({client,clock:()=>NOW});
 assert.deepEqual(await w.readProviderMailbox({email:MB,at:NOW}),[],JSON.stringify(options));
 }
});
test('provider inventory never replaces separate original-key SMTP and signed alignment suppliers',async()=>{
 const {client}=winnrClient();
 const w=createUberWarm2WinnrReadOnlyObservationDonor({client,clock:()=>NOW});
 const health=createUberWarm2TrustedHealthSupplier({
    readProviderMailbox:w.readProviderMailbox,readProviderDomainDns:w.readProviderDomainDns,
    clock:()=>NOW
 });
 assert.deepEqual(await health.readSenderHealth({email:MB,at:NOW}),[]);
});
function runtimeEvidence(){
 const base={truthClass:'AUTHENTICATED_CURRENT',signatureVerified:true,observedAt:iso(),
   evidenceRef:'protected:scope:fixture'};
 const named={
 authoritativeSourceDbContinuity:{authoritative:true,continuityVerified:true,
   sourceCurrent:true,writerContinuityVerified:true,pointInTimeOnly:false},
 restrictedNeonRole:{roleRestricted:true,leastPrivilege:true,roleName:'restricted_read'},
 originalKeyEncryptionCompatibility:{originalKeyEncryptionCompatible:true,verifiedKeyIds:['key:in-protected-host']},
 oneShotMigrationReceipts:{oneShot:true,receiptIds:['migration:1'],replayDetected:false},
 ledgerTransactionVersion:{ledgerVersionVerified:true,ledgerTransactionVersion:1},
 signedApprovalVerification:{verifierAvailable:true,signatureVerified:true,publicKeyDigest:'sha256:key'},
 serverHeldSmtpIdentity:{serverHeld:true,smtpIdentity:MB},
 currentDnsAlignment:{spfAligned:true,dkimAligned:true,dmarcAligned:true},
 consentingRecipientNetwork:{realConsenting:true,suppressionChecked:true,consentingRecipientCount:1},
 receiverCredentials:{independentlyVerifiable:true,credentialOwnerExternal:true,credentialsExposed:false},
 paidWarmupFirewall:{firewallConfigured:true,blocksPaidWarmingActivation:true,blocksBillingOperations:true}
 };
 return Object.fromEntries(Object.entries(named).map(([k,v])=>[k,{...base,...v}]));
}
test('runtime readiness cannot be forged with self-labeled authenticated data',()=>{
 const evidence=runtimeEvidence();
 const unverified=compileUberWarm2ProtectedRuntimePreflight({evidence,now:NOW});
 assert.equal(unverified.ready,false);
 assert.equal(unverified.actionItems.length,PROTECTED_RUNTIME_REQUIREMENT_IDS.length);
 assert.ok(unverified.actionItems.every(x=>x.reason==='trusted-attestation-verifier-required'));
 const verified=compileUberWarm2ProtectedRuntimePreflight({
    evidence,now:NOW,verifyAttestation:({key,entry})=>key in evidence && entry===evidence[key]});
 assert.equal(verified.ready,true);
 assert.equal(verified.authority.productionActions,'NONE');
});
test('source-only, stale, wrong source continuity and paid warmup firewall fail closed',()=>{
 const base=runtimeEvidence();
 for(const [key,change] of [
 ['authoritativeSourceDbContinuity',{sourceCurrent:false}],
 ['paidWarmupFirewall',{blocksPaidWarmingActivation:false}],
 ['consentingRecipientNetwork',{consentingRecipientCount:0}],
 ['receiverCredentials',{independentlyVerifiable:false}],
 ['serverHeldSmtpIdentity',{truthClass:'SOURCE_ONLY'}],
 ['oneShotMigrationReceipts',{observedAt:iso(NOW-900001)}],
 ]){
 const evidence={...base,[key]:{...base[key],...change}};
 const res=compileUberWarm2ProtectedRuntimePreflight({
   evidence,now:NOW,verifyAttestation:({key:k,entry})=>evidence[k]===entry});
 assert.equal(res.ready,false,key);
 assert.ok(res.actionItems.some(x=>x.id),key);
 }
});


test('actual Winnr status-only mailbox yields identity but never vendor hold clearance', async () => {
 const {client}=winnrClient({providerFlags:{status:'active',active:undefined,
   connected:undefined,paused:undefined,quarantined:undefined,
   placementQuarantine:undefined,policyCompatible:undefined}});
 const donor=createUberWarm2WinnrReadOnlyObservationDonor({client,clock:()=>NOW});
 const result=await donor.inspect({email:MB,at:NOW});
 assert.equal(result.ok,true);
 assert.equal(result.observation.providerReportedActive,true);
 assert.equal(result.observation.healthRowEligible,false);
 assert.equal((await donor.readProviderMailbox({email:MB,at:NOW})).length,0);
 const identity=await donor.readProviderMailboxIdentity({email:MB,at:NOW});
 assert.equal(identity.length,1);
 assert.equal(identity[0].providerReportedActive,true);
 for(const key of ['connected','paused','quarantined','placementQuarantine','policyCompatible'])
   assert.equal(Object.hasOwn(identity[0],key),false);
});
test('status Active does not override explicitly adverse provider quarantine',async()=>{
 for (const fields of [{paused:true},{quarantined:true},{placementQuarantine:true},
   {connected:false},{policyCompatible:false},{active:false}]) {
  const {client}=winnrClient({providerFlags:{status:'active',active:undefined,
    connected:undefined,paused:undefined,quarantined:undefined,
    placementQuarantine:undefined,policyCompatible:undefined,...fields}});
  const donor=createUberWarm2WinnrReadOnlyObservationDonor({client,clock:()=>NOW});
  assert.deepEqual(await donor.readProviderMailboxIdentity({email:MB,at:NOW}),[],JSON.stringify(fields));
 }
});
