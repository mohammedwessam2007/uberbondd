import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2TrustedSeedConsentSupplier } from '../src/uberwarm2-trusted-seed-consent-supplier.mjs';
import { createUberWarm2LivePreflight } from '../src/uberwarm2-smtp-seed-bridge.mjs';

const NOW=Date.parse('2026-10-16T01:00:00.000Z'), EMAIL='owned@example.test', PROBE='probe-1';
const row=(props={})=>({email:EMAIL,probeId:PROBE,observedAt:new Date(NOW).toISOString(),
  evidenceRef:'attestation:protected:fixture',receiptId:'proof:receipt',verified:true,signed:true,...props});
function make(overrides={},clock=()=>NOW){
  const state={
    consent:row({receiptId:'consent-1',ownerControlled:true,consentToTest:true,
      withdrawn:false,optedOut:false,suppressed:false,consentEvidenceRef:'verified-consent:fixture',
      probeIds:[PROBE],permissionExpiresAt:new Date(NOW+600000).toISOString()}),
    ready:row({receiptId:'ready-2',ownerControlled:true,independentMailbox:true,receiveReady:true}),
    suppression:row({receiptId:'suppress-3',withdrawn:false,optedOut:false,suppressed:false})
  };
  Object.assign(state,overrides);
  const counts=[];
  const reader=k=>async q=>{counts.push({k,q});return [state[k]]};
  const inputs={readAuthenticatedConsent:reader('consent'),readCurrentReceiveReady:reader('ready'),
    readSuppression:reader('suppression'),clock};
  return {state,counts,inputs,supplier:createUberWarm2TrustedSeedConsentSupplier(inputs)};
}
const query={email:EMAIL,probeId:PROBE,at:NOW};
test('genuinely asynchronous trusted readers produce one exact-current consent row',async()=>{
  const {supplier,counts}=make();const out=await supplier.readSeedConsent(query);
  assert.equal(out.length,1);assert.equal(out[0].consentToTest,true);
  assert.deepEqual(out[0].probeIds,[PROBE]);assert.equal(counts.length,3);
  const live=createUberWarm2LivePreflight({readSeedConsent:supplier.readSeedConsent,clock:()=>NOW});
  assert.equal(await live.verifyCurrentSeedConsent(EMAIL,PROBE,NOW),true);
  assert.equal(await live.verifyCurrentSeedConsent(EMAIL,'probe-2',NOW),false);
});
test('withdrawal or suppression revokes current permission when checked again',async()=>{
  const {state,supplier}=make();assert.equal((await supplier.readSeedConsent(query)).length,1);
  state.suppression.suppressed=true;
  assert.deepEqual(await supplier.readSeedConsent(query),[]);
  state.suppression.suppressed=false;state.consent.withdrawn=true;
  assert.deepEqual(await supplier.readSeedConsent(query),[]);
});
test('expired, unspecific or duplicate consent cannot pass',async()=>{
  for(const mutate of [{permissionExpiresAt:new Date(NOW).toISOString()},
      {probeIds:[]},{probeIds:[PROBE,PROBE]},{consentEvidenceRef:''},{signed:false}]){
    const {supplier}=make({consent:row({receiptId:'consent-1',ownerControlled:true,consentToTest:true,
      withdrawn:false,optedOut:false,suppressed:false,consentEvidenceRef:'verified-consent:fixture',
      probeIds:[PROBE],permissionExpiresAt:new Date(NOW+600000).toISOString(),...mutate})});
    assert.deepEqual(await supplier.readSeedConsent(query),[]);
  }
});
test('recipient owner control and actual independent mailbox readiness are mandatory',async()=>{
  for(const mutate of [{independentMailbox:false},{receiveReady:false},{ownerControlled:false}]){
    const {supplier}=make({ready:row({receiptId:'ready-2',ownerControlled:true,
      independentMailbox:true,receiveReady:true,...mutate})});
    assert.deepEqual(await supplier.readSeedConsent(query),[]);
  }
});
test('identity mismatch and evidence collisions are blocked',async()=>{
  for(const mutate of [{email:'other@example.test'},{probeId:'another-probe'},
    {observedAt:new Date(NOW+1).toISOString()},{observedAt:new Date(NOW-300001).toISOString()},
    {receiptId:'consent-1'},{verified:false}]){
    const {supplier}=make({ready:row({receiptId:'ready-2',ownerControlled:true,
      independentMailbox:true,receiveReady:true,...mutate})});
    assert.deepEqual(await supplier.readSeedConsent(query),[]);
  }
});
test('missing, throwing or duplicate protected source denies',async()=>{
  const {inputs}=make();
  delete inputs.readSuppression;
  assert.deepEqual(await createUberWarm2TrustedSeedConsentSupplier(inputs).readSeedConsent(query),[]);
  inputs.readSuppression=async()=>{throw Error('store down')};
  assert.deepEqual(await createUberWarm2TrustedSeedConsentSupplier(inputs).readSeedConsent(query),[]);
  const {inputs:dupe,state}=make();
  dupe.readSuppression=async()=>[state.suppression,state.suppression];
  assert.deepEqual(await createUberWarm2TrustedSeedConsentSupplier(dupe).readSeedConsent(query),[]);
});
test('slow awaited source must fail when consent expires or freshness limit crosses',async()=>{
  let time=NOW;
  const {inputs,state}=make({},()=>time);
  inputs.readCurrentReceiveReady=async()=>{time=NOW+600001;return [state.ready]};
  assert.deepEqual(await createUberWarm2TrustedSeedConsentSupplier(inputs).readSeedConsent(query),[]);
});
test('invalid inputs refuse before consulting protected sources',async()=>{
  const {counts,supplier}=make();
  for(const arg of [{email:'bad',probeId:PROBE,at:NOW},{email:EMAIL,probeId:'bad id',at:NOW},
    {email:EMAIL,probeId:PROBE,at:Infinity},{email:EMAIL,probeId:PROBE,at:NOW+1}]){
    assert.deepEqual(await supplier.readSeedConsent(arg),[]);
  }
  assert.equal(counts.length,0);
});
test('source rows marked signed but revoked remain denied',async()=>{
  const {supplier}=make({suppression:row({receiptId:'suppress-3',withdrawn:false,
    optedOut:true,suppressed:false})});
  assert.deepEqual(await supplier.readSeedConsent(query),[]);
});
