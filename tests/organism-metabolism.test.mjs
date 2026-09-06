import test from 'node:test';
import assert from 'node:assert/strict';
import { compileObjectiveMetabolism, planMetabolismCycle, compileMetabolismLearningReceipt } from '../src/organism-metabolism.mjs';

function metabolism(){return compileObjectiveMetabolism({objective:'Reach a verified payment path without widening authority',successCriteria:['verified bounded path exists'],hardConstraints:['no-secret-exfiltration','authority:owner-reserved'],assumptions:['provider may be available'],unknowns:['current provider availability'],anomalies:['catalog lists a model but no runtime proof exists'],contradictions:['two price sources disagree'],blindSpots:['unknown outage behavior'],disagreements:['router and catalog confidence differ'],riskBudget:4,maxSpendCents:0,maxFounderMinutes:30});}
function candidate(overrides={}){return{id:'c1',family:'INFORMATION_ACQUISITION',mechanism:'Gather fresh provider-origin evidence before any effect',assumptions:['provider may be available'],constraintViolations:[],evidenceRefs:['source:plan'],reversible:true,successProbability:.8,expectedContributionCents:1000,costCents:0,founderMinutes:5,risk:1,evidenceStrength:8,novelty:3,robustness:8,...overrides};}
function boundOutcome(plan,overrides={}){const selected=plan.wallbreaker.selected.candidate;return{candidateId:selected.id,candidateSignature:selected.signature,...overrides};}

test('objective metabolism composes unknown-unknown agenda into Wallbreaker problem without authority',()=>{
  const result=metabolism();
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.metabolism.wallProblem.ok,true);
  assert.equal(result.metabolism.unknownUnknownAgenda.length,4);
  assert.equal(result.metabolism.consequenceAuthority,'NONE');
  assert.equal(result.metabolism.experimentAuthority,'PROPOSE_ONLY');
});

test('missing objective or success criteria fails closed',()=>{
  assert.equal(compileObjectiveMetabolism({successCriteria:['x']}).ok,false);
  assert.equal(compileObjectiveMetabolism({objective:'x'}).ok,false);
});

test('metabolism cycle reuses Wallbreaker scoring and exposes missing strategy families',()=>{
  const compiled=metabolism();
  const plan=planMetabolismCycle({metabolism:compiled.metabolism,candidates:[candidate()]});
  assert.equal(plan.ok,true,JSON.stringify(plan));
  assert.equal(plan.wallbreaker.selected.candidate.id,'c1');
  assert.ok(plan.missingFamilies.includes('CAPABILITY_SUBSTITUTION'));
  assert.equal(plan.consequenceAuthority,'NONE');
});

test('authority-violating candidate is rejected by existing Wallbreaker law',()=>{
  const compiled=metabolism();
  const plan=planMetabolismCycle({metabolism:compiled.metabolism,candidates:[candidate({constraintViolations:['authority:owner-reserved']})]});
  assert.equal(plan.ok,true);
  assert.equal(plan.wallbreaker.selected,null);
  assert.ok(plan.wallbreaker.rejected[0].reasonCodes.includes('authority-boundary-violation'));
});

test('failed outcome becomes evidence-bound learning and disables unsafe identical retry',()=>{
  const compiled=metabolism();
  const plan=planMetabolismCycle({metabolism:compiled.metabolism,candidates:[candidate()]});
  const learned=compileMetabolismLearningReceipt({metabolism:compiled.metabolism,plan,outcome:boundOutcome(plan,{succeeded:false,evidenceRefs:['receipt:provider-timeout'],failure:{failureClass:'PROVIDER_FAILURE',outcomeUncertain:true,invalidatedAssumptions:['provider may be available'],discoveredConstraints:['provider outcome uncertain']}})});
  assert.equal(learned.ok,true,JSON.stringify(learned));
  assert.equal(learned.receipt.failureClass,'PROVIDER_FAILURE');
  assert.equal(learned.receipt.retrySameMechanismAllowed,false);
  assert.equal(learned.receipt.authorityDelta,'NONE');
  assert.equal(learned.receipt.outcomeCandidateId,'c1');
  assert.equal(learned.receipt.outcomeCandidateSignature,plan.wallbreaker.selected.candidate.signature);
});

test('capability gap feeds acquisition recommendation but never grants acquisition authority',()=>{
  const compiled=metabolism();
  const plan=planMetabolismCycle({metabolism:compiled.metabolism,candidates:[candidate({requiredCapabilities:['runtime-verifier']})]});
  const learned=compileMetabolismLearningReceipt({metabolism:compiled.metabolism,plan,outcome:boundOutcome(plan,{succeeded:false,evidenceRefs:['receipt:missing-cap'],missingCapability:true,failure:{failureClass:'CAPABILITY_GAP',missingCapabilities:['runtime-verifier']}})});
  assert.equal(learned.ok,true);
  assert.equal(learned.receipt.capabilityAcquisitionRecommended,true);
  assert.deepEqual(learned.receipt.missingCapabilities,['runtime-verifier']);
  assert.equal(learned.receipt.authorityDelta,'NONE');
});

test('learning without evidence is refused',()=>{
  const compiled=metabolism();
  const plan=planMetabolismCycle({metabolism:compiled.metabolism,candidates:[candidate()]});
  assert.equal(compileMetabolismLearningReceipt({metabolism:compiled.metabolism,plan,outcome:boundOutcome(plan,{succeeded:true,evidenceRefs:[]})}).ok,false);
});

test('successful outcome cannot be laundered from another candidate id or signature',()=>{
  const compiled=metabolism();
  const plan=planMetabolismCycle({metabolism:compiled.metabolism,candidates:[candidate()]});
  const wrongId=compileMetabolismLearningReceipt({metabolism:compiled.metabolism,plan,outcome:{candidateId:'other-candidate',candidateSignature:plan.wallbreaker.selected.candidate.signature,succeeded:true,evidenceRefs:['receipt:foreign-success']}});
  assert.equal(wrongId.ok,false);
  assert.ok(wrongId.reasonCodes.includes('outcome-candidate-id-mismatch'));
  const wrongSignature=compileMetabolismLearningReceipt({metabolism:compiled.metabolism,plan,outcome:{candidateId:'c1',candidateSignature:'stale-or-forged-signature',succeeded:true,evidenceRefs:['receipt:foreign-success']}});
  assert.equal(wrongSignature.ok,false);
  assert.ok(wrongSignature.reasonCodes.includes('outcome-candidate-signature-mismatch'));
});

test('learning refuses unbound outcome even when evidence refs exist',()=>{
  const compiled=metabolism();
  const plan=planMetabolismCycle({metabolism:compiled.metabolism,candidates:[candidate()]});
  const learned=compileMetabolismLearningReceipt({metabolism:compiled.metabolism,plan,outcome:{succeeded:true,evidenceRefs:['receipt:unbound-success']}});
  assert.equal(learned.ok,false);
  assert.ok(learned.reasonCodes.includes('outcome-candidate-id-required'));
  assert.ok(learned.reasonCodes.includes('outcome-candidate-signature-required'));
});
