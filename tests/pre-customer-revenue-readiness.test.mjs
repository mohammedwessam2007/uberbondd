import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFirstCashCanaryPacket, FIRST_CASH_QUESTIONS } from '../src/first-cash-canary-packet.mjs';
import { compilePreCustomerRevenueReadiness } from '../src/pre-customer-revenue-readiness.mjs';

const packet=compileFirstCashCanaryPacket({providers:[],date:new Date('2026-09-06T01:00:00Z')});

test('readiness matrix covers every canonical first-cash question without moving commercial truth',()=>{
  const result=compilePreCustomerRevenueReadiness({firstCashPacket:packet});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.matrix.questions.length,FIRST_CASH_QUESTIONS.length);
  assert.deepEqual(result.matrix.commercialTruth,{realCustomers:0,clearedRevenueCents:0,acceptedPaidDeliveries:0,retainedCustomers:0});
  assert.equal(result.matrix.businessEffectAuthority,'NONE');
});

test('delivery software is ready while acceptance remains external proof',()=>{
  const result=compilePreCustomerRevenueReadiness({firstCashPacket:packet});
  const delivered=result.matrix.questions.find(row=>row.question==='HOW_DELIVERED');
  const accepted=result.matrix.questions.find(row=>row.question==='HOW_ACCEPTED');
  assert.equal(delivered.classification,'SOFTWARE_READY_OR_PREPARED');
  assert.equal(accepted.classification,'EXTERNAL_PROOF_REQUIRED');
});

test('payment destination preparation does not launder reconciliation into software or payment proof',()=>{
  const result=compilePreCustomerRevenueReadiness({firstCashPacket:packet});
  const link=result.matrix.questions.find(row=>row.question==='WHAT_PAYMENT_LINK');
  const reconciliation=result.matrix.questions.find(row=>row.question==='HOW_RECONCILED');
  assert.equal(link.classification,'SOFTWARE_READY_OR_PREPARED');
  assert.equal(reconciliation.classification,'EXTERNAL_PROOF_REQUIRED');
  assert.equal(result.matrix.commercialTruth.clearedRevenueCents,0);
});

test('missing first-cash question fails closed instead of overstating readiness',()=>{
  const broken=structuredClone(packet); broken.questions=broken.questions.filter(row=>row.question!=='HOW_ACCEPTED');
  const result=compilePreCustomerRevenueReadiness({firstCashPacket:broken});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('first-cash-question-coverage-incomplete'));
});

test('matrix truth law keeps external activation visibly required today',()=>{
  const result=compilePreCustomerRevenueReadiness({firstCashPacket:packet});
  assert.equal(result.matrix.externalActivationRequired,true);
  assert.equal(result.matrix.canContact,false);
  assert.ok(result.matrix.stages.some(stage=>stage.status==='EXTERNAL_OR_CONFIGURATION_GATED'));
});
