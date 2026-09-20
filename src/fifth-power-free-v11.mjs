import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { parameterizedMultiplicityProgramsV10 } from './parameterized-multiplicity-depth-v10.mjs';

export const FIFTH_POWER_FREE_V11_VERSION='uberbond.fifth-power-free.v11';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const MIN_X=2,MAX_X=4097;

function fifthPowerFree(x){
  for(let p=2;p**5<=x;p+=1){
    const q=p**5;
    if(x%q===0) return 0;
  }
  return 1;
}
function negativeHash(x){
  let z=(x+0x299f31d0)>>>0;
  z^=z>>>16;z=Math.imul(z,0x21f0aaad)>>>0;
  z^=z>>>15;z=Math.imul(z,0x735a2d97)>>>0;
  z^=z>>>15;
  return (z>>>31)&1;
}
function splitBucket(x){
  let z=(x+0x9e3779b9)>>>0;
  z=(z^(z>>>16))>>>0;z=Math.imul(z,0x85ebca6b)>>>0;
  z=(z^(z>>>13))>>>0;z=Math.imul(z,0xc2b2ae35)>>>0;
  z=(z^(z>>>16))>>>0;
  return z%5;
}
function splitRows(label){
  const buckets=[[],[],[],[],[]];
  for(let x=MIN_X;x<=MAX_X;x+=1)buckets[splitBucket(x)].push({x,y:label(x)});
  return {train:buckets[0].concat(buckets[1]),validation:buckets[2],heldOut:buckets[3],reserve:buckets[4]};
}
function metrics(rows,evaluate){
  let tp=0,tn=0,fp=0,fn=0;
  for(const row of rows){
    const p=evaluate(row.x)?1:0;
    if(row.y===1&&p===1)tp++;
    else if(row.y===0&&p===0)tn++;
    else if(row.y===0)fp++;
    else fn++;
  }
  const pr=tp+fn?tp/(tp+fn):1,nr=tn+fp?tn/(tn+fp):1;
  return {accuracy:(tp+tn)/rows.length,balancedAccuracy:(pr+nr)/2,positiveRecall:pr,negativeRecall:nr,tp,tn,fp,fn};
}
function select(split){
  const programs=parameterizedMultiplicityProgramsV10();let best=null;
  for(const program of programs){
    const train=metrics(split.train,program.evaluate),validation=metrics(split.validation,program.evaluate);
    const row={program,train,validation};
    if(!best||
      train.accuracy>best.train.accuracy||
      (train.accuracy===best.train.accuracy&&validation.accuracy>best.validation.accuracy)||
      (train.accuracy===best.train.accuracy&&validation.accuracy===best.validation.accuracy&&program.descriptionCost<best.program.descriptionCost)||
      (train.accuracy===best.train.accuracy&&validation.accuracy===best.validation.accuracy&&program.descriptionCost===best.program.descriptionCost&&program.id<best.program.id))best=row;
  }
  return {...best,evaluated:programs.length};
}
export function runFifthPowerFreeV11(){
  const split=splitRows(fifthPowerFree),selected=select(split),heldOut=metrics(split.heldOut,selected.program.evaluate);
  const negSplit=splitRows(negativeHash),neg=select(negSplit),negHeldOut=metrics(negSplit.heldOut,neg.program.evaluate);
  const success=
    selected.train.accuracy===1&&
    selected.validation.accuracy===1&&
    heldOut.accuracy===1&&
    selected.program.spec.outputMode==='DEPTH_LT'&&
    selected.program.spec.threshold===5&&
    negHeldOut.balancedAccuracy<=0.65;
  return envelope({
    ok:true,
    status:success?'V11_UNSEEN_FIFTH_POWER_FREE_EXACT_GENERALIZATION_SUPPORTED__REVIEW_REQUIRED':'V11_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration:'artifacts/research/FIFTH_POWER_FREE_V11_PREREGISTRATION_20260920.json',
    heldOutUsedForSelection:false,
    grammarMutationAfterPreregistration:false,
    grammarCandidateCount:selected.evaluated,
    selectedProgramId:selected.program.id,
    selectedProgramSpec:selected.program.spec,
    train:selected.train,
    validation:selected.validation,
    heldOut,
    negativeControl:{selectedProgramId:neg.program.id,heldOut:negHeldOut,passed:negHeldOut.balancedAccuracy<=0.65},
    falsifierTriggered:!success,
    promotionCandidate:success?{
      concept:'PARAMETERIZED_MULTIPLICITY_DEPTH',
      proposedState:'SOFTWARE_DEMONSTRATED_WITH_FRESH_UNSEEN_ORDER_TRANSFER__REPLICATION_PENDING',
      authority:'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    }:null,
    claimBoundary:'V11_SUPPORTS_FRESH_UNSEEN_K_ORDER_TRANSFER_ON_A_FINITE_ARITHMETIC_FAMILY__IT_DOES_NOT_PROVE_GENERAL_MATHEMATICAL_DISCOVERY'
  });
}
