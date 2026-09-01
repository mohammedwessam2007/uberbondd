import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePaymentRailReadiness } from '../src/payment-rail-doctor.mjs';
import { createLeadPathSprint, advanceLeadPathSprint, runSyntheticFulfillmentCanary } from '../src/lead-path-sprint-fulfillment.mjs';
import { buildFirstCashCanaryPacket, canaryDecision } from '../src/first-cash-canary-packet.mjs';
import { classifyFounderAbsenceBlockers } from '../src/founder-absence-blocker-doctor.mjs';
import { compileDomainPurposePlan, evaluateDomainObservation } from '../src/domain-purpose-plan.mjs';

const NOW='2026-09-02T00:00:00.000Z';
const env={DATABASE_URL:'postgres://redacted',LEMONSQUEEZY_WEBHOOK_SECRET:'present-not-secret',LEMONSQUEEZY_CHECKOUT_URL:'https://example.test/checkout'};

test('payment LIVE_READY cannot derive from environment presence alone',()=>{
  const result=evaluatePaymentRailReadiness({env,now:NOW,mode:'LIVE'});
  assert.notEqual(result.state,'LIVE_READY');
  assert.equal(result.state,'LIVE_KYC_REQUIRED');
});

test('payment LIVE_READY requires fresh KYC and independent provider verification receipt',()=>{
  const kyc={status:'VERIFIED',observedAt:'2026-09-01T20:00:00.000Z',evidenceRefs:['receipt:owner-kyc']};
  const withoutProvider=evaluatePaymentRailReadiness({env,ownerKycAttestation:kyc,now:NOW,mode:'LIVE'});
  assert.equal(withoutProvider.state,'SANDBOX_VERIFICATION_FAILED');
  const ready=evaluatePaymentRailReadiness({env,ownerKycAttestation:kyc,verificationReceipt:{provider:'LEMON_SQUEEZY',providerEventId:'evt-real',verified:true,observedAt:'2026-09-01T21:00:00.000Z',evidenceRefs:['payment:provider-verification']},now:NOW,mode:'LIVE'});
  assert.equal(ready.state,'LIVE_READY');
  assert.equal(JSON.stringify(ready).includes('present-not-secret'),false);
});

test('synthetic origin can never create PAID or accepted commercial delivery',()=>{
  const denied=createLeadPathSprint({customerRef:'c1',paymentEvidence:{evidenceClass:'EXTERNAL_PAYMENT',evidenceRef:'payment:synthetic',origin:'SYNTHETIC'},at:NOW});
  assert.equal(denied.ok,false);
  const canary=runSyntheticFulfillmentCanary({at:NOW});
  assert.equal(canary.ok,true);
  assert.equal(canary.refusedSyntheticPayment,true);
  assert.equal(canary.refusedSyntheticCustomerAcceptance,true);
  assert.equal(canary.commercialDeliveryCount,0);
});

test('real-like paid sprint cannot become CUSTOMER_ACCEPTED without external customer evidence',()=>{
  let state=createLeadPathSprint({customerRef:'c1',paymentEvidence:{evidenceClass:'EXTERNAL_PAYMENT',evidenceRef:'payment:fixture',origin:'TEST_FIXTURE'},at:NOW});
  for(const target of ['INPUT_READY','ANALYSIS_RUNNING','QA_REQUIRED','QA_PASSED','DELIVERY_READY','DELIVERED']) {
    const step=advanceLeadPathSprint({state,to:target,artifactRefs:target==='DELIVERED'?['artifact:report']:[],at:NOW});
    assert.equal(step.ok,true,`${target}: ${step.reasonCodes}`);
    state=step.state;
  }
  const denied=advanceLeadPathSprint({state,to:'CUSTOMER_ACCEPTED',evidence:{evidenceClass:'INTERNAL_QA',evidenceRef:'test:qa',origin:'TEST_FIXTURE'},at:NOW});
  assert.equal(denied.ok,false);
  assert.equal(state.commercialDeliveryCount,0);
});

test('first-cash packet canContact is false while any gate is false and five conversations kills no-pay canary',()=>{
  const gates={jurisdictionApproved:true,providerPurposeAllowed:false,contactProvenanceApproved:true,senderReady:true,authorityGranted:true,canaryOpen:true};
  const packet=buildFirstCashCanaryPacket({gates,qualifiedConversationCount:5,paidPilotCount:0});
  assert.equal(packet.canContact,false);
  assert.equal(packet.canaryDecision,'KILL_OR_RETHINK');
  assert.equal(canaryDecision({qualifiedConversationCount:4,paidPilotCount:0}),'CONTINUE_BOUNDED_CANARY');
});

test('founder-absence doctor cannot report CODE_READY with credential blocker or absent elapsed proof',()=>{
  assert.equal(classifyFounderAbsenceBlockers({credentials:['ai-key-missing']}).overall,'CREDENTIAL_BLOCKED');
  assert.equal(classifyFounderAbsenceBlockers({}).overall,'ELAPSED_EVIDENCE_PENDING');
});

test('domain plan refuses invented roots and generated expected DNS cannot yield VERIFIED',()=>{
  assert.equal(compileDomainPurposePlan({rootDomain:'invented.example'}).ok,false);
  const plan=compileDomainPurposePlan({rootDomain:'uberbond.agency',assignments:{APP_PRODUCT:'uberbond.agency',OUTBOUND:'out.uberbond.agency',INBOUND_REPLIES:'reply.uberbond.agency',TRACKING:'track.uberbond.agency',TRANSACTIONAL:'tx.uberbond.agency',TESTING:'test.uberbond.agency'},providerRequirements:{OUTBOUND:{requiresTls:true},TRACKING:{requiresTls:true},TRANSACTIONAL:{requiresTls:true}}});
  assert.equal(plan.ok,true);
  const outbound=plan.rows.find(row=>row.purpose==='OUTBOUND');
  const result=evaluateDomainObservation({planRow:outbound,observation:{observedAt:'2026-09-01T23:00:00.000Z',status:'GREEN',tlsVerified:true,generatedExpectedRecords:true},now:NOW});
  assert.notEqual(result.state,'VERIFIED');
  assert.equal(result.state,'CONFIGURED');
});
