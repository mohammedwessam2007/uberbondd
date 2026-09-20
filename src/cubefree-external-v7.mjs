import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { multiplicitySensitiveMemoryProgramsV6 } from './multiplicity-sensitive-memory-canary-v6.mjs';

export const CUBEFREE_EXTERNAL_V7_VERSION = 'uberbond.cubefree-external-v7.v1';

const envelope = extra => ({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const MIN_X=2;
const MAX_X=4097;

function cubefree(x){
  let n=x;
  for(let p=2;p*p*p<=n;p+=1){
    const cube=p*p*p;
    if(n%cube===0) return 0;
  }
  return 1;
}

function negativeHash(x){
  let z=(x+0x243f6a88)>>>0;
  z^=z>>>16;
  z=Math.imul(z,0x85ebca6b)>>>0;
  z^=z>>>13;
  z=Math.imul(z,0xc2b2ae35)>>>0;
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
  for(let x=MIN_X;x<=MAX_X;x+=1){
    buckets[splitBucket(x)].push({x,y:label(x)});
  }
  return {
    train:buckets[0].concat(buckets[1]),
    validation:buckets[2],
    heldOut:buckets[3],
    reserve:buckets[4]
  };
}

function metrics(rows,evaluate){
  let tp=0,tn=0,fp=0,fn=0;
  for(const row of rows){
    const pred=evaluate(row.x)?1:0;
    if(row.y===1&&pred===1) tp+=1;
    else if(row.y===0&&pred===0) tn+=1;
    else if(row.y===0&&pred===1) fp+=1;
    else fn+=1;
  }
  const positiveRecall=tp+fn?tp/(tp+fn):1;
  const negativeRecall=tn+fp?tn/(tn+fp):1;
  const balancedAccuracy=(positiveRecall+negativeRecall)/2;
  const accuracy=rows.length?(tp+tn)/rows.length:0;
  return {balancedAccuracy,positiveRecall,negativeRecall,accuracy,tp,tn,fp,fn};
}

function chooseProgram(split){
  const programs=multiplicitySensitiveMemoryProgramsV6();
  let best=null;
  for(const program of programs){
    const train=metrics(split.train,program.evaluate);
    const validation=metrics(split.validation,program.evaluate);
    const row={program,train,validation};
    if(!best ||
      row.train.balancedAccuracy>best.train.balancedAccuracy ||
      (row.train.balancedAccuracy===best.train.balancedAccuracy && row.validation.balancedAccuracy>best.validation.balancedAccuracy) ||
      (row.train.balancedAccuracy===best.train.balancedAccuracy && row.validation.balancedAccuracy===best.validation.balancedAccuracy && row.program.descriptionCost<best.program.descriptionCost) ||
      (row.train.balancedAccuracy===best.train.balancedAccuracy && row.validation.balancedAccuracy===best.validation.balancedAccuracy && row.program.descriptionCost===best.program.descriptionCost && row.program.id<best.program.id)){
        best=row;
    }
  }
  return {...best,evaluated:programs.length};
}

export function runCubefreeExternalV7(){
  const split=splitRows(cubefree);
  const selected=chooseProgram(split);
  const heldOut=metrics(split.heldOut,selected.program.evaluate);
  const frozenBase=0.8614864864864865;
  const improvement=heldOut.balancedAccuracy-frozenBase;

  const negSplit=splitRows(negativeHash);
  const negSelected=chooseProgram(negSplit);
  const negHeldOut=metrics(negSplit.heldOut,negSelected.program.evaluate);

  const success=
    heldOut.balancedAccuracy>=0.95 &&
    heldOut.positiveRecall>=0.9 &&
    heldOut.negativeRecall>=0.9 &&
    improvement>=0.08 &&
    negHeldOut.balancedAccuracy<=0.65;

  return envelope({
    ok:true,
    status:success
      ? 'V7_UNSEEN_CUBEFREE_GENERALIZATION_SUPPORTED__REVIEW_REQUIRED'
      : 'V7_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration:'artifacts/research/CUBEFREE_EXTERNAL_V7_PREREGISTRATION_20260920.json',
    preflight:'artifacts/research/CUBEFREE_EXTERNAL_V7_PREFLIGHT_20260920.json',
    heldOutUsedForSelection:false,
    grammarCandidateCount:selected.evaluated,
    grammarMutationAfterPreregistration:false,
    selectedProgramId:selected.program.id,
    selectedProgramSpec:selected.program.spec,
    train:selected.train,
    validation:selected.validation,
    heldOut,
    frozenBaseHeldOutBalancedAccuracy:frozenBase,
    improvementOverFrozenBase:Number(improvement.toFixed(6)),
    negativeControl:{
      selectedProgramId:negSelected.program.id,
      heldOut:negHeldOut,
      passed:negHeldOut.balancedAccuracy<=0.65
    },
    falsifierTriggered:!success,
    ontogenesisTrigger:success?null:'MULTIPLICITY_DEPTH_STATE_CANDIDATE',
    claimBoundary:'V7_TESTS_GENERALIZATION_OF_THE_FROZEN_V6_864_PROGRAM_GRAMMAR_TO_ONE_UNSEEN_PUBLIC_MULTIPLICITY_THRESHOLD_TARGET__IT_DOES_NOT_PROVE_OPEN_ENDED_ONTOLOGY_INVENTION'
  });
}
