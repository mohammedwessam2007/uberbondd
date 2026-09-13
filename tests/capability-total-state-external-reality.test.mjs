import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCapabilityTotalState } from '../src/capability-total-state.mjs';

const observedAt='2026-09-13T11:15:00Z';
const base={synthetic:false,observedAt:'2026-09-13T11:00:00Z',evidenceRefs:['receipt:real']};
const receipts=[
{...base,id:'live-cross-platform-public-research-adapters',adapters:[{platform:'web-a',live:true,policyCompliant:true,publicDataObserved:true,receiptRef:'receipt:a'},{platform:'web-b',live:true,policyCompliant:true,publicDataObserved:true,receiptRef:'receipt:b'}]},
{...base,id:'messaging-provider-redundancy',paths:[{providerId:'mail-a',authorized:true,live:true,canaryObserved:true,senderIdentityRef:'receipt:sa',deliveryReceiptRef:'receipt:da'},{providerId:'mail-b',authorized:true,live:true,canaryObserved:true,senderIdentityRef:'receipt:sb',deliveryReceiptRef:'receipt:db'}]},
{...base,id:'live-payment-settlement-or-recovery',environment:'LIVE',settlementObserved:true,providerIdentity:'pay-a',providerReceiptRef:'receipt:pay'},
{...base,id:'independent-deployment-provider',distinctPhysicalProvider:true,exactReleaseBootObserved:true,cutoverObserved:true,rollbackObserved:true,providerIdentity:'host-b',releaseDigest:'sha256:release'},
{...base,id:'credential-custody',ownerEnrollmentObserved:true,threshold:2,factorTypes:['hardware-key','recovery-code'],custodyDomains:['home-safe','bank-box']},
{...base,id:'sovereign-identity',ownerConsentObserved:true,livenessObserved:true,recoveryRehearsalObserved:true,sameIdentityConfirmed:true}
];

test('total capability truth consumes safe reality receipts but preserves externally gated security runtime',()=>{
  const r=inspectCapabilityTotalState({sourceRevision:'TEST',observedAt,externalRealityReceipts:receipts});
  assert.equal(r.ok,true);
  assert.equal(r.state.internalCapabilityGapCount,0);
  assert.equal(r.state.externalRealityGapCount,1);
  assert.deepEqual(r.state.externalOnly.map(x=>x.id),['autonomous-exploit-verification-runtime']);
  assert.equal(r.state.closedExternalReality.length,6);
  assert.equal(r.externalEffectAuthority,'NONE');
});
