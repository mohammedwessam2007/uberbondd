import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { multiplicityDepthProgramsV8 } from './multiplicity-depth-memory-v8.mjs';

export const FOURTH_POWER_FREE_V9_VERSION='uberbond.fourth-power-free.v9';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const MIN_X=2,MAX_X=4097;

function fourthPowerFree(x){
  for(let p=2;p*p*p*p<=x;p+=1){
    const q=p*p*p*p;
    if(x%q===0) return 0;
  }
  return 1;
}
function negativeHash(x){
  let z=(x+0xa4093822)>>>0;
  z^=z>>>16;z=Math.imul(z,0x85ebca6b)>>>0;
  z^=z>>>13;z=Math.imul(z,0xc2b2ae35)>>>0;
  z^=z>>>16;
  return (z>>>31)&1;
}
function splitBucket(x){
  let z=(x+0x9e3779b9)>>>0;
  z=(z^(z>>>16))>>>0;
  z=Math.imul(z,0x85ebca6b)>>>0;
  z=(z^(z>>>13))>>>0;
  z=Math.imul(z,0xc2b2ae35)>>>0;
  z=(z^(z>>>16))>>>0;
  return z%5;
}
function splitRows(label){
  const buckets=[[],[],[],[],[]];
  for(let x=MIN_X;x<=MAX_X;x+=1) buckets[splitBucket(x)].push({x,y:label(x)});
  return {train:buckets[0].concat(buckets[1]),validation:buckets[2],heldOut:buckets[3],reserve:buckets[4]};
}
function metrics(rows,evaluate){
  let tp=0,tn=0,fp=0,fn=0;
  for(const row of rows){
    const pred=evaluate(row.x)?1:0;
    if(row.y===1&&pred===1) tp++;
    else if(row.y===0&&pred===0) tn++;
    else if(row.y===0) fp++;
    else fn++;
  }
  const positiveRecall=tp+fn?tp/(tp+fn):1;
  const negativeRecall=tn+fp?tn/(tn+fp):1;
  return {
    balancedAccuracy:(positiveRecall+negativeRecall)/2,
    positiveRecall,negativeRecall,
    accuracy:rows.length?(tp+tn)/rows.length:0,
    tp,tn,fp,fn
  };
}
function select(split){
  const programs=multiplicityDepthProgramsV8();
  let best=null;
  for(const program of programs){
    const train=metrics(split.train,program.evaluate);
    const validation=metrics(split.validation,program.evaluate);
    const row={program,train,validation};
    if(!best ||
      row.train.balancedAccuracy>best.train.balancedAccuracy ||
      (row.train.balancedAccuracy===best.train.balancedAccuracy&&row.validation.balancedAccuracy>best.validation.balancedAccuracy) ||
      (row.train.balancedAccuracy===best.train.balancedAccuracy&&row.validation.balancedAccuracy===best.validation.balancedAccuracy&&program.descriptionCost<best.program.descriptionCost) ||
      (row.train.balancedAccuracy===best.train.balancedAccuracy&&row.validation.balancedAccuracy===best.validation.balancedAccuracy&&program.descriptionCost===best.program.descriptionCost&&program.id<best.program.id)) best=row;
  }
  return {...best,evaluated:programs.length};
}
export function runFourthPowerFreeV9(){
  const split=splitRows(fourthPowerFree);
  const selected=select(split);
  const heldOut=metrics(split.heldOut,selected.program.evaluate);
  const frozenComparator=0.8808325232606582;
  const improvement=heldOut.balancedAccuracy-frozenComparator;

  const negSplit=splitRows(negativeHash);
  const negSelected=select(negSplit);
  const negHeldOut=metrics(negSplit.heldOut,negSelected.program.evaluate);

  const success=
    heldOut.balancedAccuracy>=0.95 &&
    heldOut.positiveRecall>=0.9 &&
    heldOut.negativeRecall>=0.9 &&
    improvement>=0.06 &&
    negHeldOut.balancedAccuracy<=0.65;

  return envelope({
    ok:true,
    status:success
      ? 'V9_UNSEEN_FOURTH_POWER_FREE_GENERALIZATION_SUPPORTED__REVIEW_REQUIRED'
      : 'V9_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration:'artifacts/research/FOURTH_POWER_FREE_V9_PREREGISTRATION_20260920.json',
    preflight:'artifacts/research/FOURTH_POWER_FREE_V9_PREFLIGHT_20260920.json',
    heldOutUsedForSelection:false,
    grammarMutationAfterPreregistration:false,
    grammarCandidateCount:selected.evaluated,
    selectedProgramId:selected.program.id,
    selectedProgramSpec:selected.program.spec,
    train:selected.train,
    validation:selected.validation,
    heldOut,
    frozenComparatorHeldOutBalancedAccuracy:frozenComparator,
    improvementOverFrozenComparator:Number(improvement.toFixed(6)),
    negativeControl:{
      selectedProgramId:negSelected.program.id,
      heldOut:negHeldOut,
      passed:negHeldOut.balancedAccuracy<=0.65
    },
    falsifierTriggered:!success,
    ontogenesisTrigger:success?null:'PARAMETERIZED_OR_UNBOUNDED_MULTIPLICITY_DEPTH_CANDIDATE',
    claimBoundary:'V9_TESTS_AN_UNSEEN_EXPONENT_4_THRESHOLD_AGAINST_THE_FROZEN_V8_DEPTH_SAT3_GRAMMAR__IT_DOES_NOT_PROVE_GENERAL_NUMBER_THEORY_DISCOVERY'
  });
}
