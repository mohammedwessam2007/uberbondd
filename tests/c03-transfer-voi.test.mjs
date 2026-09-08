import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCrossDomainTransfer } from '../src/cross-domain-transfer-evaluator.mjs';
import { evaluateValueOfInformation } from '../src/value-of-information-governor.mjs';

const arm=(score)=>({score,computeUnits:100,toolBudgetRef:'tools:v1'});
const families=[
 {familyId:'software-recovery',baseline:arm(.4),current:arm(.5),candidate:arm(.62)},
 {familyId:'evidence-reconciliation',baseline:arm(.5),current:arm(.55),candidate:arm(.68)},
 {familyId:'resource-planning',baseline:arm(.45),current:arm(.5),candidate:arm(.61)},
 {familyId:'causal-reasoning',baseline:arm(.6),current:arm(.62),candidate:arm(.63)}
];

test('matched-budget multi-domain gains support transfer feasibility but not generality',()=>{
 const r=evaluateCrossDomainTransfer({experimentId:'x',evaluatorContractHash:'eval',holdoutProtocolHash:'hold',minimumMeaningfulGain:.05,maxAllowedRegression:.02,families});
 assert.equal(r.ok,true);assert.equal(r.supported,true);assert.equal(r.status,'CROSS_DOMAIN_TRANSFER_FEASIBILITY_SUPPORTED');assert.match(r.generalityClaim,/WITHHELD/);assert.equal(r.businessEffectAuthority,'NONE');
});

test('extra candidate compute invalidates transfer comparison',()=>{
 const mutated=structuredClone(families);mutated[0].candidate.computeUnits=101;
 const r=evaluateCrossDomainTransfer({experimentId:'x',evaluatorContractHash:'eval',holdoutProtocolHash:'hold',families:mutated});
 assert.equal(r.ok,false);assert.equal(r.status,'TRANSFER_BUDGET_MISMATCH');
});

test('tool budget mismatch invalidates transfer comparison',()=>{
 const mutated=structuredClone(families);mutated[1].candidate.toolBudgetRef='tools:v2';
 const r=evaluateCrossDomainTransfer({experimentId:'x',evaluatorContractHash:'eval',holdoutProtocolHash:'hold',families:mutated});
 assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('matched-compute-and-tool-budget-required'));
});

test('protected gate regression has zero tolerance',()=>{
 const mutated=structuredClone(families);mutated[0].protectedGate=true;mutated[0].candidate.score=.49;
 const r=evaluateCrossDomainTransfer({experimentId:'x',evaluatorContractHash:'eval',holdoutProtocolHash:'hold',families:mutated});
 assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('protected-gate-regression-zero-tolerance'));
});

test('ordinary regression beyond tolerance refuses transfer',()=>{
 const mutated=structuredClone(families);mutated[0].candidate.score=.4;
 const r=evaluateCrossDomainTransfer({experimentId:'x',evaluatorContractHash:'eval',holdoutProtocolHash:'hold',maxAllowedRegression:.02,families:mutated});
 assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('family-regression-exceeds-tolerance'));
});

test('small panel cannot be less than three unique task families',()=>{
 const r=evaluateCrossDomainTransfer({experimentId:'x',evaluatorContractHash:'eval',holdoutProtocolHash:'hold',families:families.slice(0,2)});
 assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('at-least-three-unique-task-families-required'));
});

const voiBase={decision:'whether to commit to the current mechanism',unit:'decision-loss-points',budgetUnits:10,currentEvidenceSufficient:false,observe:{canChangeDecision:true,discriminating:true,informationValueUnits:10,costUnits:2,delayCostUnits:1,optionDecayUnits:1,requiresExternalEffect:false},defer:{informationGainUnits:2,delayCostUnits:1,optionDecayUnits:1,windowRemainsOpen:true}};

test('one discriminating observation wins only when information value clears cost and alternatives',()=>{
 const r=evaluateValueOfInformation(voiBase);assert.equal(r.ok,true);assert.equal(r.status,'OBSERVE_ONE_JUSTIFIED');assert.equal(r.businessEffectAuthority,'NONE');
});

test('non-discriminating observation cannot win even if caller claims huge information value',()=>{
 const r=evaluateValueOfInformation({...voiBase,observe:{...voiBase.observe,discriminating:false,informationValueUnits:999}});assert.notEqual(r.status,'OBSERVE_ONE_JUSTIFIED');
});

test('observation that cannot change the decision is not justified',()=>{
 const r=evaluateValueOfInformation({...voiBase,observe:{...voiBase.observe,canChangeDecision:false}});assert.notEqual(r.status,'OBSERVE_ONE_JUSTIFIED');
});

test('observation outside the fixed budget cannot win',()=>{
 const r=evaluateValueOfInformation({...voiBase,budgetUnits:2});assert.notEqual(r.status,'OBSERVE_ONE_JUSTIFIED');
});

test('defer wins when future information exceeds delay and option decay while window stays open',()=>{
 const r=evaluateValueOfInformation({...voiBase,observe:{...voiBase.observe,informationValueUnits:2},defer:{informationGainUnits:8,delayCostUnits:1,optionDecayUnits:1,windowRemainsOpen:true}});assert.equal(r.status,'DEFER_JUSTIFIED');
});

test('act now is only informationally sufficient when evidence is already sufficient and no better information action dominates',()=>{
 const r=evaluateValueOfInformation({...voiBase,currentEvidenceSufficient:true,observe:{...voiBase.observe,canChangeDecision:false},defer:{informationGainUnits:0,delayCostUnits:2,optionDecayUnits:2,windowRemainsOpen:false}});assert.equal(r.status,'ACT_NOW_INFORMATIONALLY_SUFFICIENT');
});

test('external observation never becomes execution authority',()=>{
 const r=evaluateValueOfInformation({...voiBase,observe:{...voiBase.observe,requiresExternalEffect:true}});assert.match(r.executionBoundary,/SEPARATE_BOUNDED_EXPERIMENT/);assert.equal(r.businessEffectAuthority,'NONE');
});

test('units are explicitly decision-local rather than a scalar human-life utility',()=>{
 const r=evaluateValueOfInformation(voiBase);assert.match(r.valueBoundary,/NOT_A_SCALAR_UTILITY_OF_A_HUMAN_LIFE/);
});
