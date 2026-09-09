import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileSelfImprovementCausalAdmission } from '../src/self-improvement-causal-admission.mjs';
import { compileConstraintMutationPlan } from '../src/constraint-mutation-engine.mjs';

const BASE='a'.repeat(40);
const proposal=()=>({
  baseRevision:BASE,
  task:{taskId:'c16-causal-1',objective:'reduce false-positive promotion decisions without weakening refusal',acceptanceTests:['node --test tests/compound-intelligence-evaluator.test.mjs']},
  bottleneck:{id:'promotion-fp',statement:'matched evaluation still admits one reproducible false-positive class',status:'REPRODUCED_DEFECT',evidenceRefs:['test://promotion-fp/repro']},
  hypothesis:{id:'h-selected',mechanismId:'causal-provenance-gate',mechanism:'bind causal task provenance before candidate generation',predictedObservations:['false-positive fixture is refused','existing valid candidate remains admissible'],falsifier:'valid candidates are rejected at a higher rate without reducing false positives'},
  rivals:[{id:'h-rival',mechanismId:'threshold-increase',mechanism:'increase evaluator threshold without causal provenance',predictedObservations:['false-positive fixture and some valid candidates are both refused'],falsifier:'threshold increase removes false positives without additional valid-candidate loss'}],
  probe:{description:'run the focused hostile fixture and existing positive fixture with zero external effects',costCents:0,timeMinutes:10,reversibility:'REVERSIBLE',effects:[]},
  budget:{maxCostCents:0,maxTimeMinutes:20,maxDeclaredEffects:0},
  voi:{decision:'build causal admission now',unit:'decision-local-evidence-units',budgetUnits:5,currentEvidenceSufficient:true,observe:{canChangeDecision:false,discriminating:false,informationValueUnits:0,costUnits:0,delayCostUnits:0,optionDecayUnits:0,requiresExternalEffect:false},defer:{informationGainUnits:0,delayCostUnits:1,optionDecayUnits:0,windowRemainsOpen:true}}
});
const mutationReceipt=()=>{
  const a={objectiveId:'promotion-fp',mechanismId:'old-threshold-loop',providerId:'local',evidenceRefs:['test://old-failure'],failure:{failureClass:'IMPLEMENTATION_DEFECT',failedSignature:'sig-old',outcomeUncertain:true}};
  return compileConstraintMutationPlan({currentAttempt:a,history:[a]});
};

test('causal admission composes canonical bounded experiment and VOI without authority',()=>{
  const result=compileSelfImprovementCausalAdmission(proposal());
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.status,'SELF_IMPROVEMENT_CAUSALLY_ADMISSIBLE_FOR_EXISTING_MAINTAINER');
  assert.match(result.causalAdmissionDigest,/^[0-9a-f]{64}$/);
  assert.match(result.boundedExperimentDigest,/^[0-9a-f]{64}$/);
  assert.match(result.valueOfInformationDigest,/^[0-9a-f]{64}$/);
  assert.equal(result.boundedExperiment.discrimination.discriminating,true);
  assert.equal(result.valueOfInformation.status,'ACT_NOW_INFORMATIONALLY_SUFFICIENT');
  assert.equal(result.writeAuthority,'NONE');assert.equal(result.promotionAuthority,'NONE');assert.equal(result.selfModificationAuthority,'NONE');assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(result.maintainerTask.causalAdmissionDigest,result.causalAdmissionDigest);
});

test('unmeasured or evidence-free bottleneck cannot become a self-improvement task',()=>{
  let p=proposal();p.bottleneck.status='HYPOTHESIS';assert.ok(compileSelfImprovementCausalAdmission(p).reasonCodes.includes('observed-or-measured-bottleneck-required'));
  p=proposal();p.bottleneck.evidenceRefs=[];assert.ok(compileSelfImprovementCausalAdmission(p).reasonCodes.includes('bottleneck-evidence-required'));
});

test('causal hypothesis requires a predeclared falsifier and acceptance criteria',()=>{
  let p=proposal();delete p.hypothesis.falsifier;assert.ok(compileSelfImprovementCausalAdmission(p).reasonCodes.includes('causal-hypothesis-mechanism-predictions-and-falsifier-required'));
  p=proposal();p.task.acceptanceTests=[];assert.ok(compileSelfImprovementCausalAdmission(p).reasonCodes.includes('predeclared-acceptance-tests-required'));
});

test('renamed formatting of the same rival mechanism is not materially different',()=>{
  const p=proposal();p.rivals[0].mechanism='  BIND causal-task provenance, before candidate generation!!! ';
  p.rivals[0].mechanismId='other-label';
  const out=compileSelfImprovementCausalAdmission(p);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('rival-mechanism-must-materially-differ'));
});

test('duplicate mechanism identities are refused even when prose differs',()=>{
  const p=proposal();p.rivals[0].mechanismId=' CAUSAL provenance GATE ';
  const out=compileSelfImprovementCausalAdmission(p);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('hypothesis-mechanism-identities-must-be-unique-when-supplied'));
});

test('non-discriminating predictions and budget escape are refused by canonical experiment law',()=>{
  let p=proposal();p.rivals[0].predictedObservations=[...p.hypothesis.predictedObservations];let out=compileSelfImprovementCausalAdmission(p);assert.equal(out.ok,false);assert.equal(out.boundedExperiment.status,'EXPERIMENT_NOT_DISCRIMINATING');
  p=proposal();p.probe.timeMinutes=21;out=compileSelfImprovementCausalAdmission(p);assert.equal(out.ok,false);assert.equal(out.boundedExperiment.status,'EXPERIMENT_BUDGET_EXCEEDED');
});

test('VOI observation dominates build when decision-changing information is worth acquiring',()=>{
  const p=proposal();p.voi.currentEvidenceSufficient=false;p.voi.observe={canChangeDecision:true,discriminating:true,informationValueUnits:10,costUnits:1,delayCostUnits:0,optionDecayUnits:0,requiresExternalEffect:false};
  const out=compileSelfImprovementCausalAdmission(p);assert.equal(out.ok,false);assert.equal(out.valueOfInformation.status,'OBSERVE_ONE_JUSTIFIED');
});

test('canonical strategy-mutation receipt binds exact objective and forces a different mechanism id',()=>{
  const p=proposal();p.task.constraintObjectiveId='promotion-fp';p.strategyMutationReceipt=mutationReceipt();
  const out=compileSelfImprovementCausalAdmission(p);assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.strategyMutationIdentity.mechanismId,'old-threshold-loop');assert.match(out.strategyMutationReceiptDigest,/^[0-9a-f]{64}$/);
  const same=proposal();same.task.constraintObjectiveId='promotion-fp';same.hypothesis.mechanismId='OLD threshold loop';same.strategyMutationReceipt=mutationReceipt();
  const refused=compileSelfImprovementCausalAdmission(same);assert.equal(refused.ok,false);assert.ok(refused.reasonCodes.includes('strategy-mutation-proposed-mechanism-must-differ-from-failed-mechanism'));
});

test('hand-forged legacy mutation shape cannot masquerade as canonical receipt',()=>{
  const p=proposal();p.task.constraintObjectiveId='promotion-fp';p.strategyMutationReceipt={ok:true,status:'STRATEGY_MUTATION_REQUIRED',nextMechanismMustDiffer:true,taskId:p.task.taskId,businessEffectAuthority:'NONE'};
  const out=compileSelfImprovementCausalAdmission(p);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('strategy-mutation-policy-version-mismatch'));assert.ok(out.reasonCodes.includes('strategy-mutation-identity-fields-required'));
});

test('mutation receipt fingerprint is independently recomputed rather than trusting a hex-looking value',()=>{
  const p=proposal();p.task.constraintObjectiveId='promotion-fp';p.strategyMutationReceipt=mutationReceipt();p.strategyMutationReceipt.strategyFingerprint='f'.repeat(32);
  const out=compileSelfImprovementCausalAdmission(p);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('strategy-mutation-fingerprint-integrity-mismatch'));
});

test('unknown-unknown receipt may inform proposal but cannot grant authority and is digest-bound',()=>{
  const p=proposal();p.unknownUnknownReceipt={ok:true,status:'UNKNOWN_UNKNOWN_MINED',businessEffectAuthority:'NONE',questions:[{question:'WHAT_MECHANISM'}]};
  const a=compileSelfImprovementCausalAdmission(p);assert.equal(a.ok,true);assert.match(a.unknownUnknownReceiptDigest,/^[0-9a-f]{64}$/);
  const q=proposal();q.unknownUnknownReceipt={ok:true,status:'UNKNOWN_UNKNOWN_MINED',businessEffectAuthority:'NONE',questions:[{question:'WHAT_OTHER_MECHANISM'}]};const b=compileSelfImprovementCausalAdmission(q);assert.notEqual(a.causalAdmissionDigest,b.causalAdmissionDigest);
  const bad=proposal();bad.unknownUnknownReceipt={ok:true,status:'UNKNOWN_UNKNOWN_MINED',businessEffectAuthority:'GRANTED'};assert.ok(compileSelfImprovementCausalAdmission(bad).reasonCodes.includes('unknown-unknown-receipt-must-not-carry-authority'));
});

test('full VOI child decision is load-bearing even when top-level status remains ACT_NOW',()=>{
  const a=compileSelfImprovementCausalAdmission(proposal());
  const p=proposal();p.voi.defer.delayCostUnits=2;
  const b=compileSelfImprovementCausalAdmission(p);
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(a.valueOfInformation.status,b.valueOfInformation.status);assert.notEqual(a.valueOfInformationDigest,b.valueOfInformationDigest);assert.notEqual(a.causalAdmissionDigest,b.causalAdmissionDigest);
});

test('bounded experiment child decision is load-bearing in causal identity',()=>{
  const a=compileSelfImprovementCausalAdmission(proposal());const p=proposal();p.probe.timeMinutes=11;const b=compileSelfImprovementCausalAdmission(p);
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.notEqual(a.boundedExperimentDigest,b.boundedExperimentDigest);assert.notEqual(a.causalAdmissionDigest,b.causalAdmissionDigest);
});

test('causal digest changes when bottleneck evidence or selected mechanism changes',()=>{
  const a=compileSelfImprovementCausalAdmission(proposal());const p=proposal();p.bottleneck.evidenceRefs=['test://promotion-fp/different'];const b=compileSelfImprovementCausalAdmission(p);const q=proposal();q.hypothesis.mechanism='different causal intervention';const c=compileSelfImprovementCausalAdmission(q);
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(c.ok,true);assert.notEqual(a.causalAdmissionDigest,b.causalAdmissionDigest);assert.notEqual(a.causalAdmissionDigest,c.causalAdmissionDigest);
});
