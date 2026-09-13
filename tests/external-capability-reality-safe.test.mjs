import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSafeExternalCapabilityReality } from '../src/external-capability-reality-safe.mjs';

const now='2026-09-13T11:15:00Z';
const base={synthetic:false,observedAt:'2026-09-13T11:00:00Z',evidenceRefs:['receipt:real']};

test('no receipts leaves all seven safe external gaps open',()=>{const r=evaluateSafeExternalCapabilityReality({receipts:[],now});assert.equal(r.closedCount,0);assert.equal(r.openCount,7);});

test('synthetic or unauthorized security evidence cannot close exploit runtime',()=>{
  const synthetic=evaluateSafeExternalCapabilityReality({now,receipts:[{...base,synthetic:true,id:'autonomous-exploit-verification-runtime',targetAuthorized:true,runtimeExecuted:true,exploitWitnessObserved:true,boundedNonDestructive:true,targetIdentityRef:'owned:fixture',runtimeReceiptRef:'receipt:security'}]});
  assert.ok(synthetic.openIds.includes('autonomous-exploit-verification-runtime'));
  const unauthorized=evaluateSafeExternalCapabilityReality({now,receipts:[{...base,id:'autonomous-exploit-verification-runtime',targetAuthorized:false,runtimeExecuted:true,exploitWitnessObserved:true,boundedNonDestructive:true,targetIdentityRef:'third-party',runtimeReceiptRef:'receipt:security'}]});
  assert.ok(unauthorized.openIds.includes('autonomous-exploit-verification-runtime'));
});

test('security receipt requires real bounded runtime and exploit witness',()=>{const r=evaluateSafeExternalCapabilityReality({now,receipts:[{...base,id:'autonomous-exploit-verification-runtime',targetAuthorized:true,runtimeExecuted:false,exploitWitnessObserved:false,boundedNonDestructive:true,targetIdentityRef:'owned:fixture',runtimeReceiptRef:'receipt:security'}]});assert.ok(r.openIds.includes('autonomous-exploit-verification-runtime'));});

test('sandbox payment does not close live payment reality',()=>{const r=evaluateSafeExternalCapabilityReality({now,receipts:[{...base,id:'live-payment-settlement-or-recovery',environment:'SANDBOX',settlementObserved:true,providerIdentity:'paypal',providerReceiptRef:'receipt:payment'}]});assert.ok(r.openIds.includes('live-payment-settlement-or-recovery'));});

test('same messaging provider twice does not prove redundancy',()=>{const path={providerId:'gmail',authorized:true,live:true,canaryObserved:true,senderIdentityRef:'receipt:sender',deliveryReceiptRef:'receipt:delivery'};const r=evaluateSafeExternalCapabilityReality({now,receipts:[{...base,id:'messaging-provider-redundancy',paths:[path,{...path,deliveryReceiptRef:'receipt:delivery2'}]}]});assert.ok(r.openIds.includes('messaging-provider-redundancy'));});

test('same physical deployment provider cannot close independence',()=>{const r=evaluateSafeExternalCapabilityReality({now,receipts:[{...base,id:'independent-deployment-provider',distinctPhysicalProvider:false,exactReleaseBootObserved:true,cutoverObserved:true,rollbackObserved:true,providerIdentity:'same',releaseDigest:'sha256:x'}]});assert.ok(r.openIds.includes('independent-deployment-provider'));});

test('single custody domain cannot close credential custody',()=>{const r=evaluateSafeExternalCapabilityReality({now,receipts:[{...base,id:'credential-custody',ownerEnrollmentObserved:true,threshold:2,factorTypes:['hardware-key','recovery-code'],custodyDomains:['home-safe']} ]});assert.ok(r.openIds.includes('credential-custody'));});

test('complete valid safe receipts close all seven without creating authority',()=>{const receipts=[
{...base,id:'autonomous-exploit-verification-runtime',targetAuthorized:true,runtimeExecuted:true,exploitWitnessObserved:true,boundedNonDestructive:true,targetIdentityRef:'owned:fixture',runtimeReceiptRef:'receipt:security'},
{...base,id:'live-cross-platform-public-research-adapters',adapters:[{platform:'web-a',live:true,policyCompliant:true,publicDataObserved:true,receiptRef:'receipt:a'},{platform:'web-b',live:true,policyCompliant:true,publicDataObserved:true,receiptRef:'receipt:b'}]},
{...base,id:'messaging-provider-redundancy',paths:[{providerId:'mail-a',authorized:true,live:true,canaryObserved:true,senderIdentityRef:'receipt:sa',deliveryReceiptRef:'receipt:da'},{providerId:'mail-b',authorized:true,live:true,canaryObserved:true,senderIdentityRef:'receipt:sb',deliveryReceiptRef:'receipt:db'}]},
{...base,id:'live-payment-settlement-or-recovery',environment:'LIVE',settlementObserved:true,providerIdentity:'pay-a',providerReceiptRef:'receipt:pay'},
{...base,id:'independent-deployment-provider',distinctPhysicalProvider:true,exactReleaseBootObserved:true,cutoverObserved:true,rollbackObserved:true,providerIdentity:'host-b',releaseDigest:'sha256:release'},
{...base,id:'credential-custody',ownerEnrollmentObserved:true,threshold:2,factorTypes:['hardware-key','recovery-code'],custodyDomains:['home-safe','bank-box']},
{...base,id:'sovereign-identity',ownerConsentObserved:true,livenessObserved:true,recoveryRehearsalObserved:true,sameIdentityConfirmed:true}
];const r=evaluateSafeExternalCapabilityReality({receipts,now});assert.equal(r.closedCount,7);assert.equal(r.openCount,0);assert.equal(r.externalEffectAuthority,'NONE');});
