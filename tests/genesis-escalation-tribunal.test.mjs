import test from 'node:test';
import assert from 'node:assert/strict';
import {compileGenesisEscalationDecision,compileGenesisEscalationPortfolio} from '../src/genesis-escalation-tribunal.mjs';

const receipt={ok:true,result:{unresolved:['Whether the mechanism works on a fixed held-out task population.'],strongestCounterexamples:['baseline leakage'],confidence:.68}};
const base={candidateId:'genesis-candidate-test-0001',title:'Pure software idea',utility:.95,testability:.94,reversibility:.98,substrateNeeds:['QUEUE','CHECKPOINTING']};

test('high-value reversible pure-software idea goes to IMPLEMENT_NOW',()=>{
 const r=compileGenesisEscalationDecision({candidate:base,cognitionReceipt:receipt,callableSuppliers:[],paidProviderEnabled:false});
 assert.equal(r.ok,true); assert.equal(r.decision,'IMPLEMENT_NOW'); assert.equal(r.externalEffectAuthority,'NONE');
});

test('physical evidence requirement blocks implementation',()=>{
 const r=compileGenesisEscalationDecision({candidate:{...base,substrateNeeds:['UBERWATT','THERMAL_TELEMETRY']},cognitionReceipt:receipt});
 assert.equal(r.decision,'WAIT_REALITY_EVIDENCE'); assert.ok(r.realityBlockers.includes('UBERWATT'));
});

test('semantic dependency with no paid authority fails closed',()=>{
 const r=compileGenesisEscalationDecision({candidate:{...base,substrateNeeds:['MODEL_MARKET','FRONTIER_REVIEW']},cognitionReceipt:receipt,paidProviderEnabled:false});
 assert.equal(r.decision,'WAIT_PAID_SEMANTIC_AUTHORITY');
});

test('callable local semantic supplier outranks paid escalation',()=>{
 const r=compileGenesisEscalationDecision({candidate:{...base,substrateNeeds:['LOCAL_COMPUTE','MODEL_MARKET']},cognitionReceipt:receipt,callableSuppliers:[{supplierClass:'LOCAL',callable:true}],paidProviderEnabled:true});
 assert.equal(r.decision,'ESCALATE_LOCAL_SEMANTIC');
});

test('already implemented candidate is never re-realized',()=>{
 const r=compileGenesisEscalationDecision({candidate:base,cognitionReceipt:receipt,realization:{realizationState:'SOURCE_IMPLEMENTED_HYPOTHESIS_UNVALIDATED'}});
 assert.equal(r.decision,'ALREADY_IMPLEMENTED');
});

test('portfolio puts implement-now candidates first and remains bounded',()=>{
 const a=compileGenesisEscalationDecision({candidate:base,cognitionReceipt:receipt});
 const b=compileGenesisEscalationDecision({candidate:{...base,candidateId:'genesis-candidate-test-0002',substrateNeeds:['UBERWATT']},cognitionReceipt:receipt});
 const p=compileGenesisEscalationPortfolio({rows:[b,a],limit:1});
 assert.equal(p.ok,true); assert.equal(p.selectedCount,1); assert.equal(p.selected[0].decision,'IMPLEMENT_NOW');
});

test('unresolved supplier-quality uncertainty blocks direct implementation even without a model substrate tag',()=>{
 const semanticReceipt={ok:true,result:{...receipt.result,unresolved:['Supplier quality, latency, and coordination overhead must be measured on the actual runtime.']}};
 const r=compileGenesisEscalationDecision({candidate:base,cognitionReceipt:semanticReceipt,paidProviderEnabled:false});
 assert.equal(r.decision,'WAIT_PAID_SEMANTIC_AUTHORITY');
 assert.ok(r.semanticNeeds.includes('UNRESOLVED_SEMANTIC_SUPPLIER'));
});
