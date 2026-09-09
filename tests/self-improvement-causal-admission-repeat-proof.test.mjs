import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileSelfImprovementCausalAdmission } from '../src/self-improvement-causal-admission.mjs';
import { CONSTRAINT_MUTATION_ENGINE_VERSION } from '../src/constraint-mutation-engine.mjs';

const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const base=()=>({
  baseRevision:'a'.repeat(40),
  task:{taskId:'repeat-proof',constraintObjectiveId:'objective-1',objective:'repair measured defect',acceptanceTests:['focused test']},
  bottleneck:{id:'b1',statement:'measured defect',status:'REPRODUCED_DEFECT',evidenceRefs:['test://b1']},
  hypothesis:{id:'new',mechanismId:'new-mechanism',mechanism:'use a genuinely different mechanism',predictedObservations:['new mechanism repairs defect'],falsifier:'defect persists'},
  rivals:[{id:'rival',mechanismId:'rival-mechanism',mechanism:'change threshold instead',predictedObservations:['threshold changes output without repairing cause'],falsifier:'threshold repairs cause'}],
  probe:{description:'zero-effect focused comparison',costCents:0,timeMinutes:1,reversibility:'REVERSIBLE',effects:[]},
  budget:{maxCostCents:0,maxTimeMinutes:2,maxDeclaredEffects:0},
  voi:{decision:'act',unit:'evidence-units',budgetUnits:1,currentEvidenceSufficient:true,observe:{canChangeDecision:false,discriminating:false,informationValueUnits:0,costUnits:0,delayCostUnits:0,optionDecayUnits:0,requiresExternalEffect:false},defer:{informationGainUnits:0,delayCostUnits:1,optionDecayUnits:0,windowRemainsOpen:true}}
});
function forgedNonRepeatReceipt(){
  const identity={objectiveId:'objective-1',mechanismId:'old-mechanism',providerId:'local',failureClass:'IMPLEMENTATION_DEFECT',failedSignature:'sig'};
  return{ok:true,policyVersion:CONSTRAINT_MUTATION_ENGINE_VERSION,status:'STRATEGY_MUTATION_REQUIRED',...identity,strategyFingerprint:digest(identity).slice(0,32),repeatCount:0,sameStrategyRepeated:false,hardMutationRequired:true,identicalRetryAllowed:false,decision:'MUTATE_STRATEGY_NOW',businessEffectAuthority:'NONE'};
}

test('mutation-required envelope without actual repeated-strategy proof is refused',()=>{
  const p=base();p.strategyMutationReceipt=forgedNonRepeatReceipt();
  const out=compileSelfImprovementCausalAdmission(p);
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('strategy-mutation-repeat-proof-required'));
});
