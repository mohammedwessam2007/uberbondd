import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2ProtectedActivationWiring } from '../src/uberwarm2-protected-activation-wiring-donor.mjs';
import { createUberWarm2ProtectedReceiverPlacementWiring } from '../src/uberwarm2-protected-receiver-placement-wiring-donor.mjs';
import { compileUberWarm2ProtectedWinnrReadPlan } from '../src/uberwarm2-protected-winnr-read-plan-donor.mjs';

const NOW=Date.parse('2026-10-16T03:00:00.000Z');
const email='owner-sender@example.test',seed='owner-seed@gmail.com',probe='owned-probe-1';
const row=(props={})=>({email,domain:'example.test',observedAt:new Date(NOW).toISOString(),evidenceRef:'protected:test-receipt',...props});
const consentRow=(props={})=>({email:seed,probeId:probe,observedAt:new Date(NOW).toISOString(),
 evidenceRef:'protected:consent-test',receiptId:'consent:one',verified:true,signed:true,...props});
function goodReaders(){
 return {
 clock:()=>NOW,
 readProviderMailbox:async()=>[row({connected:true,paused:false,quarantined:false,placementQuarantine:false,policyCompatible:true})],
 readProviderDomainDns:async()=>[row({ready:true})],
 readVerifiedSmtp:async()=>[row({authenticated:true,signed:true,transportAuthorized:true,secure:true,termsCompatible:true})],
 readLocalHold:async()=>[row({held:false,suppressed:false})],
 readVerifiedDnsAlignment:async()=>[row({aligned:true,signed:true})],
 readAuthenticatedConsent:async()=>[consentRow({ownerControlled:true,consentToTest:true,withdrawn:false,optedOut:false,suppressed:false,consentEvidenceRef:'optin:fixture',probeIds:[probe],permissionExpiresAt:new Date(NOW+300000).toISOString()})],
 readCurrentReceiveReady:async()=>[consentRow({receiptId:'receiver:fixture',ownerControlled:true,independentMailbox:true,receiveReady:true})],
 readSuppression:async()=>[consentRow({receiptId:'supp:fixture',withdrawn:false,optedOut:false,suppressed:false})]
 };
}
test('wiring is source-only and can never assert a live authorized sender merely from injected functions',async()=>{
 const x=createUberWarm2ProtectedActivationWiring(goodReaders());
 assert.equal(x.configured,true);
 assert.equal(x.ready,false);
 assert.equal(x.authorized,false);
 assert.equal(x.productionCredentialProvider,'external-authentication-required');
 assert.equal(await x.verifyCurrentSenderHealth(email,NOW),true);
 assert.equal(await x.verifyCurrentSeedConsent(seed,probe,NOW),true);
});
test('missing critical reader denies all sender and consent authority',async()=>{
 for(const k of Object.keys(goodReaders()).filter(x=>x.startsWith('read'))){
   const dep=goodReaders();delete dep[k];
   const x=createUberWarm2ProtectedActivationWiring(dep);
   assert.equal(x.ready,false);
   assert.equal(x.configured,false);
   assert.equal(await x.verifyCurrentSenderHealth(email,NOW),false,k);
   assert.equal(await x.verifyCurrentSeedConsent(seed,probe,NOW),false,k);
 }
});
test('revoked sender after prior verified call is rejected on fresh re-read',async()=>{
 const deps=goodReaders();let held=false;
 deps.readLocalHold=async()=>[row({held,suppressed:false})];
 const x=createUberWarm2ProtectedActivationWiring(deps);
 assert.equal(await x.verifyCurrentSenderHealth(email,NOW),true);
 held=true;
 assert.equal(await x.verifyCurrentSenderHealth(email,NOW),false);
});
test('withdrawal after prior verified call denies live seed consent',async()=>{
 const dep=goodReaders();let optOut=false;
 dep.readSuppression=async()=>[consentRow({receiptId:'supp:fixture',withdrawn:false,optedOut:optOut,suppressed:false})];
 const x=createUberWarm2ProtectedActivationWiring(dep);
 assert.equal(await x.verifyCurrentSeedConsent(seed,probe,NOW),true);
 optOut=true;
 assert.equal(await x.verifyCurrentSeedConsent(seed,probe,NOW),false);
});
test('source-only pure provider read plan never claims provider verified inventory or paid permission',()=>{
 const client={listAllMailboxes:async()=>({ok:false}),listAllDomains:async()=>({ok:false}),getDnsStatus:async()=>({ok:false}),
   createMailbox:()=>{throw Error('write not permitted')}};
 const x=compileUberWarm2ProtectedWinnrReadPlan({mailboxId:'mb1',email,domain:'example.test',client});
 assert.equal(x.ok,true);
 assert.equal(x.ready,false);
 assert.equal(x.configured,true);
 assert.equal(x.providerVerified,false);
 assert.equal(x.providerCalls,0);
 assert.equal(x.writeCapability,'NONE');
 assert.equal(x.plan.startup.mailboxes,null);
 assert.equal(x.plan.pilots.mailboxes,null);
 assert.equal(x.plan.startup.paymentObserved,false);
 assert.equal('client' in x,false);
});
test('pure read plan rejects wrong sender domain and missing supported API',()=>{
 const client={listAllMailboxes:async()=>[],listAllDomains:async()=>[],getDnsStatus:async()=>[]};
 assert.equal(compileUberWarm2ProtectedWinnrReadPlan({mailboxId:'mb',email,domain:'other.test',client}).ready,false);
 assert.equal(compileUberWarm2ProtectedWinnrReadPlan({mailboxId:'mb',email,domain:'example.test',client:{}}).ok,false);
});
test('receiver placement wiring cannot declare live proof without protected receiving connector',async()=>{
 const d=createUberWarm2ProtectedReceiverPlacementWiring();
 assert.equal(d.ready,false);
 assert.equal(d.configured,false);
 const x=await d.compileProtectedReceivedEvidence({});
 assert.equal(x.ok,false);
 assert.equal(x.acceptedObservations,0);
});
test('receiver placement wiring with only injected functions still refuses fabricated SMTP report',async()=>{
 const d=createUberWarm2ProtectedReceiverPlacementWiring({
  readAuthenticatedReceivingEvidence:async()=>[],readVerifiedEvidenceReference:async()=>[],clock:()=>NOW
 });
 assert.equal(d.configured,true);
 assert.equal(d.liveAuthorized,false);
 assert.equal(d.ready,false);
 const x=await d.compileProtectedReceivedEvidence({batch:{ok:true,probes:[]},receipts:[],at:NOW});
 assert.equal(x.ok,false);
 assert.equal(x.verifiedPlacements,0);
});
