import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSelfImprovementCausalAdmission } from '../src/self-improvement-causal-admission.mjs';

const BASE='a'.repeat(40);
const proposal=()=>({
  baseRevision:BASE,
  task:{taskId:'c16-causal-1',objective:'reduce false-positive promotion decisions without weakening refusal',acceptanceTests:['node --test tests/compound-intelligence-evaluator.test.mjs']},
  bottleneck:{id:'promotion-fp',statement:'matched evaluation still admits one reproducible false-positive class',status:'REPRODUCED_DEFECT',evidenceRefs:['test://promotion-fp/repro']},
  hypothesis:{id:'h-selected',mechanism:'bind causal task provenance before candidate generation',predictedObservations:['false-positive fixture is refused','existing valid candidate remains admissible'],falsifier:'valid candidates are rejected at a higher rate without reducing false positives'},
  rivals:[{id:'h-rival',mechanism:'increase evaluator threshold without causal provenance',predictedObservations:['false-positive fixture and some valid candidates are both refused'],falsifier:'threshold increase removes false positives without additional valid-candidate loss'}],
  probe:{description:'run the focused hostile fixture and existing positive fixture with zero external effects',costCents:0,timeMinutes:10,reversibility:'REVERSIBLE',effects:[]},
  budget:{maxCostCents:0,maxTimeMinutes:20,maxDeclaredEffects:0},
  voi:{decision:'build causal admission now',unit:'decision-local-evidence-units',budgetUnits:5,currentEvidenceSufficient:true,observe:{canChangeDecision:false,discriminating:false,informationValueUnits:0,costUnits:0,delayCostUnits:0,optionDecayUnits:0,requiresExternalEffect:false},defer:{informationGainUnits:0,delayCostUnits:1,optionDecayUnits:0,windowRemainsOpen:true}}
});

test('causal admission composes canonical bounded experiment and VOI without authority',()=>{
  const result=compileSelfImprovementCausalAdmission(proposal());
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.status,'SELF_IMPROVEMENT_CAUSALLY_ADMISSIBLE_FOR_EXISTING_MAINTAINER');
  assert.match(result.causalAdmissionDigest,/^[0-9a-f]{64}$/);
  assert.equal(result.boundedExperiment.discrimination.discriminating,true);
  assert.equal(result.valueOfInformation.status,'ACT_NOW_INFORMATIONALLY_SUFFICIENT');
  assert.equal(result.writeAuthority,'NONE');
  assert.equal(result.promotionAuthority,'NONE');
  assert.equal(result.selfModificationAuthority,'NONE');
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(result.maintainerTask.causalAdmissionDigest,result.causalAdmissionDigest);
});

test('unmeasured bottleneck cannot become a self-improvement task',()=>{
  const p=proposal();p.bottleneck.status='HYPOTHESIS';
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('observed-or-measured-bottleneck-required'));
});

test('bottleneck requires evidence rather than worker prose',()=>{
  const p=proposal();p.bottleneck.evidenceRefs=[];
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('bottleneck-evidence-required'));
});

test('causal hypothesis requires a predeclared falsifier',()=>{
  const p=proposal();delete p.hypothesis.falsifier;
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('causal-hypothesis-mechanism-predictions-and-falsifier-required'));
});

test('a renamed copy of the selected mechanism is not a rival explanation',()=>{
  const p=proposal();p.rivals[0].mechanism=p.hypothesis.mechanism;
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('rival-mechanism-must-materially-differ'));
});

test('acceptance criteria must exist before candidate generation',()=>{
  const p=proposal();p.task.acceptanceTests=[];
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('predeclared-acceptance-tests-required'));
});

test('non-discriminating rival predictions are refused by canonical experiment compiler',()=>{
  const p=proposal();p.rivals[0].predictedObservations=[...p.hypothesis.predictedObservations];
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('canonical-bounded-experiment-not-admissible'));
  assert.equal(result.boundedExperiment.status,'EXPERIMENT_NOT_DISCRIMINATING');
});

test('probe cannot outrun its declared time budget',()=>{
  const p=proposal();p.probe.timeMinutes=21;
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,false);
  assert.equal(result.boundedExperiment.status,'EXPERIMENT_BUDGET_EXCEEDED');
});

test('VOI observation dominates build when it is cheaper and decision-changing',()=>{
  const p=proposal();p.voi.currentEvidenceSufficient=false;p.voi.observe={canChangeDecision:true,discriminating:true,informationValueUnits:10,costUnits:1,delayCostUnits:0,optionDecayUnits:0,requiresExternalEffect:false};
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('information-acquisition-or-deferral-dominates-building-now'));
  assert.equal(result.valueOfInformation.status,'OBSERVE_ONE_JUSTIFIED');
});

test('canonical unknown-unknown receipt may inform proposal but cannot grant authority',()=>{
  const p=proposal();p.unknownUnknownReceipt={ok:true,status:'UNKNOWN_UNKNOWN_MINED',businessEffectAuthority:'NONE',questions:[{question:'WHAT_MECHANISM'}]};
  const result=compileSelfImprovementCausalAdmission(p);
  assert.equal(result.ok,true);
  assert.equal(result.unknownUnknownReceiptStatus,'UNKNOWN_UNKNOWN_MINED');
  const bad=proposal();bad.unknownUnknownReceipt={ok:true,status:'UNKNOWN_UNKNOWN_MINED',businessEffectAuthority:'GRANTED'};
  const refused=compileSelfImprovementCausalAdmission(bad);
  assert.equal(refused.ok,false);
  assert.ok(refused.reasonCodes.includes('unknown-unknown-receipt-must-not-carry-authority'));
});

test('strategy mutation receipt must bind the same task and require a different mechanism',()=>{
  const p=proposal();p.strategyMutationReceipt={ok:true,status:'STRATEGY_MUTATION_REQUIRED',taskId:p.task.taskId,nextMechanismMustDiffer:true};
  assert.equal(compileSelfImprovementCausalAdmission(p).ok,true);
  const wrong=proposal();wrong.strategyMutationReceipt={ok:true,status:'STRATEGY_MUTATION_REQUIRED',taskId:'other',nextMechanismMustDiffer:true};
  const refused=compileSelfImprovementCausalAdmission(wrong);
  assert.equal(refused.ok,false);
  assert.ok(refused.reasonCodes.includes('strategy-mutation-task-binding-mismatch'));
});

test('causal digest changes when bottleneck evidence or selected mechanism changes',()=>{
  const a=compileSelfImprovementCausalAdmission(proposal());
  const p=proposal();p.bottleneck.evidenceRefs=['test://promotion-fp/different'];
  const b=compileSelfImprovementCausalAdmission(p);
  const q=proposal();q.hypothesis.mechanism='different causal intervention';
  const c=compileSelfImprovementCausalAdmission(q);
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(c.ok,true);
  assert.notEqual(a.causalAdmissionDigest,b.causalAdmissionDigest);
  assert.notEqual(a.causalAdmissionDigest,c.causalAdmissionDigest);
});
