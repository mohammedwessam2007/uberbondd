import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSovereignRevenueRuntime, SOVEREIGN_REVENUE_ORGANS } from '../src/sovereign-revenue-runtime.mjs';

const evidence=()=>Object.fromEntries(SOVEREIGN_REVENUE_ORGANS.map(id=>[id,{sourceReady:true,runtimeReady:true,authorityRoot:'UBERBOND',evidenceRefs:[`receipt:${id.toLowerCase()}`]}]));
const authority={current:true,channel:'OWNED_EMAIL',audience:'public business contacts that pass provenance and suppression gates',senderHealthVerified:true,suppressionRecheckRequired:true,authorityRef:'founder-authority:sovereign-revenue'};

test('sovereign revenue runtime becomes ready only when every owned organ and consequence seam is ready',()=>{
  const r=compileSovereignRevenueRuntime({organEvidence:evidence(),founderMissionActive:true,durableQueueReady:true,paymentReconciliationReady:true,outboundAuthority:authority,fulfillmentReady:true,acceptedDeliveryTruthReady:true});
  assert.equal(r.ready,true);
  assert.equal(r.status,'SOVEREIGN_REVENUE_RUNTIME_READY');
  assert.deepEqual(r.blockers,[]);
  assert.equal(r.businessEffectAuthority,'EXISTING_GATES_ONLY');
  assert.equal(r.externalEffectAuthority,'EXISTING_GATES_ONLY');
  assert.match(r.executionPolicy,/OWNED_UBER_STACK_PRIMARY/);
});

test('runtime fails closed when sender health or suppression recheck is not proven',()=>{
  for(const patch of [{senderHealthVerified:false},{suppressionRecheckRequired:false},{authorityRef:''}]){
    const r=compileSovereignRevenueRuntime({organEvidence:evidence(),founderMissionActive:true,durableQueueReady:true,paymentReconciliationReady:true,outboundAuthority:{...authority,...patch},fulfillmentReady:true,acceptedDeliveryTruthReady:true});
    assert.equal(r.ready,false);
    assert.ok(r.blockers.includes('outboundReady'));
    assert.equal(r.externalEffectAuthority,'NONE');
  }
});

test('runtime refuses to call missing owned organs ready',()=>{
  const organEvidence=evidence();
  organEvidence.UBERPAY={sourceReady:true,runtimeReady:false,authorityRoot:'UBERBOND',evidenceRefs:['receipt:uberpay']};
  const r=compileSovereignRevenueRuntime({organEvidence,founderMissionActive:true,durableQueueReady:true,paymentReconciliationReady:true,outboundAuthority:authority,fulfillmentReady:true,acceptedDeliveryTruthReady:true});
  assert.equal(r.ready,false);
  assert.ok(r.blockers.includes('organsReady'));
  assert.ok(r.organs.find(x=>x.id==='UBERPAY').reasonCodes.includes('runtime-ready-required'));
});
