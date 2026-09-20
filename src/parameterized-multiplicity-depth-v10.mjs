import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PARAMETERIZED_MULTIPLICITY_DEPTH_V10_VERSION='uberbond.parameterized-multiplicity-depth.v10';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const MIN_X=2,MAX_X=4097;
const THRESHOLDS=Object.freeze([2,3,4,5,6]);

function factorStats(x){
  let n=x,distinct=0,maxExponent=0;
  for(let p=2;p*p<=n;p+=1){
    if(n%p!==0) continue;
    distinct+=1; let exponent=0;
    while(n%p===0){n=Math.floor(n/p);exponent+=1;}
    maxExponent=Math.max(maxExponent,exponent);
  }
  if(n>1){distinct+=1;maxExponent=Math.max(maxExponent,1);}
  return {distinct,maxExponent};
}
function kPowerFree(x,k){return factorStats(x).maxExponent<k?1:0;}
function mobiusPositive(x){
  const s=factorStats(x);
  return s.maxExponent<2 && ((s.distinct&1)===0) ? 1 : 0;
}
const TARGETS=Object.freeze([
  {id:'FOURTH_POWER_FREE',label:x=>kPowerFree(x,4)},
  {id:'CUBEFREE',label:x=>kPowerFree(x,3)},
  {id:'SQUAREFREE',label:x=>kPowerFree(x,2)},
  {id:'MOBIUS_POSITIVE',label:mobiusPositive},
  {id:'DISTINCT_PRIME_PARITY',label:x=>factorStats(x).distinct&1}
]);

function splitBucket(x){
  let z=(x+0x9e3779b9)>>>0;
  z=(z^(z>>>16))>>>0; z=Math.imul(z,0x85ebca6b)>>>0;
  z=(z^(z>>>13))>>>0; z=Math.imul(z,0xc2b2ae35)>>>0;
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
    const p=evaluate(row.x)?1:0;
    if(row.y===1&&p===1)tp++;
    else if(row.y===0&&p===0)tn++;
    else if(row.y===0)fp++;
    else fn++;
  }
  const pr=tp+fn?tp/(tp+fn):1,nr=tn+fp?tn/(tn+fp):1;
  return {accuracy:(tp+tn)/rows.length,balancedAccuracy:(pr+nr)/2,positiveRecall:pr,negativeRecall:nr,tp,tn,fp,fn};
}
function negativeHash(x){
  let z=(x+0x082efa98)>>>0;
  z^=z>>>16;z=Math.imul(z,0x7feb352d)>>>0;
  z^=z>>>15;z=Math.imul(z,0x846ca68b)>>>0;
  z^=z>>>16;
  return (z>>>31)&1;
}
function updateAccumulator(state,mode){
  if(mode==='TOGGLE_PER_DIVISION_EVENT')return state^1;
  if(mode==='SET_ONE_ON_EVENT')return 1;
  if(mode==='SET_ZERO_ON_EVENT')return 0;
  return state;
}
function output(acc,depth,mode,k){
  if(mode==='ACCUMULATOR')return acc;
  if(mode==='NOT_ACCUMULATOR')return acc?0:1;
  if(mode==='DEPTH_LT')return depth<k?1:0;
  if(mode==='DEPTH_GE')return depth>=k?1:0;
  if(mode==='ACCUMULATOR_AND_DEPTH_LT')return acc&&depth<k?1:0;
  if(mode==='NOT_ACCUMULATOR_AND_DEPTH_LT')return !acc&&depth<k?1:0;
  return acc!==(depth>=k?1:0)?1:0;
}
function evaluateProgram(x,spec){
  let working=x,acc=spec.initialAccumulator,maxDepth=0;
  const consume=d=>{
    let count=0;
    if(spec.divisionPolicy==='SINGLE_IF_DIVISIBLE'){
      if(working%d===0){
        count=1;working=Math.floor(working/d);
        if(spec.accumulatorUpdate!=='TOGGLE_ON_DIVISOR_HIT')acc=updateAccumulator(acc,spec.accumulatorUpdate);
      }
    }else{
      while(working%d===0){
        count++;working=Math.floor(working/d);
        if(spec.accumulatorUpdate!=='TOGGLE_ON_DIVISOR_HIT')acc=updateAccumulator(acc,spec.accumulatorUpdate);
      }
    }
    if(count>0&&spec.accumulatorUpdate==='TOGGLE_ON_DIVISOR_HIT')acc^=1;
    if(count>0)maxDepth=Math.max(maxDepth,Math.min(8,count));
  };
  if(spec.divisorOrder==='ASCENDING_2_TO_DYNAMIC_SQRT'){
    for(let d=2;d*d<=working;d++)consume(d);
  }else{
    for(let d=Math.floor(Math.sqrt(x));d>=2;d--)consume(d);
  }
  if(working>1){
    maxDepth=Math.max(maxDepth,1);
    if(spec.leftoverPolicy==='TOGGLE_IF_WORKING_GT_1')acc^=1;
    else if(spec.leftoverPolicy==='SET_ONE_IF_WORKING_GT_1')acc=1;
  }
  return output(acc,maxDepth,spec.outputMode,spec.threshold);
}
function grammar(){
  const rows=[];
  const outputFamilies=['ACCUMULATOR','NOT_ACCUMULATOR','DEPTH_LT','DEPTH_GE','ACCUMULATOR_AND_DEPTH_LT','NOT_ACCUMULATOR_AND_DEPTH_LT','ACCUMULATOR_XOR_DEPTH_GE'];
  for(const divisorOrder of ['ASCENDING_2_TO_DYNAMIC_SQRT','DESCENDING_FROM_ORIGINAL_SQRT'])
  for(const divisionPolicy of ['SINGLE_IF_DIVISIBLE','REPEAT_WHILE_DIVISIBLE'])
  for(const accumulatorUpdate of ['TOGGLE_PER_DIVISION_EVENT','TOGGLE_ON_DIVISOR_HIT','SET_ONE_ON_EVENT','SET_ZERO_ON_EVENT'])
  for(const leftoverPolicy of ['IGNORE_LEFTOVER','TOGGLE_IF_WORKING_GT_1','SET_ONE_IF_WORKING_GT_1'])
  for(const initialAccumulator of [0,1])
  for(const outputMode of outputFamilies){
    const ks=['ACCUMULATOR','NOT_ACCUMULATOR'].includes(outputMode)?[null]:THRESHOLDS;
    for(const threshold of ks){
      const spec={divisorOrder,divisionPolicy,accumulatorUpdate,leftoverPolicy,initialAccumulator,maxExponentRule:'GLOBAL_MAX_PRIME_EXPONENT_SATURATED_AT_8',outputMode,threshold};
      const complexity=3+(divisorOrder.startsWith('ASCENDING')?1:2)+(divisionPolicy.startsWith('REPEAT')?1:2)+(accumulatorUpdate.startsWith('TOGGLE')?1:2)+(leftoverPolicy==='IGNORE_LEFTOVER'?1:2)+initialAccumulator+(threshold??0)+(outputMode.includes('AND')||outputMode.includes('XOR')?3:1);
      const id=[divisorOrder,divisionPolicy,accumulatorUpdate,leftoverPolicy,'ACC_INIT_'+initialAccumulator,'MAX_EXPONENT_SAT8',outputMode,threshold?'K_'+threshold:'NO_K'].join('__');
      rows.push({id,descriptionCost:complexity,spec,evaluate:x=>evaluateProgram(x,spec)});
    }
  }
  return rows;
}
function select(split){
  const programs=grammar();let best=null;
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
function evaluateTarget(target){
  const split=splitRows(target.label),selected=select(split);
  return {id:target.id,selectedProgramId:selected.program.id,selectedProgramSpec:selected.program.spec,train:selected.train,validation:selected.validation,heldOut:metrics(split.heldOut,selected.program.evaluate),candidateCount:selected.evaluated};
}
export function parameterizedMultiplicityProgramsV10(){
  return grammar().map(p=>({id:p.id,descriptionCost:p.descriptionCost,spec:structuredClone(p.spec),evaluate:p.evaluate}));
}
export function runParameterizedMultiplicityDepthV10(){
  const results=TARGETS.map(evaluateTarget);
  const neg=evaluateTarget({id:'NEGATIVE_HASH',label:negativeHash});
  const success=results.every(r=>r.train.accuracy===1&&r.validation.accuracy===1&&r.heldOut.accuracy===1)&&neg.heldOut.balancedAccuracy<=0.65;
  return envelope({
    ok:true,
    status:success?'V10_PARAMETERIZED_MULTIPLICITY_DEPTH_EXACT_SEMANTICS_SUPPORTED__REVIEW_REQUIRED':'V10_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration:'artifacts/research/PARAMETERIZED_MULTIPLICITY_DEPTH_V10_PREREGISTRATION_20260920.json',
    heldOutUsedForSelection:false,
    targetSpecificNamedPrimitivePresent:false,
    candidateCount:grammar().length,
    results,
    negativeControl:{selectedProgramId:neg.selectedProgramId,heldOut:neg.heldOut,passed:neg.heldOut.balancedAccuracy<=0.65},
    falsifierTriggered:!success,
    promotionCandidate:success?{concept:'PARAMETERIZED_MULTIPLICITY_DEPTH',state:'SOFTWARE_DEMONSTRATED_CANDIDATE_PENDING_UNSEEN_ORDER_TEST_AND_REPLICATION',authority:'REVIEW_REQUIRED__NO_SELF_PROMOTION'}:null,
    claimBoundary:'V10_IS_CONFIRMATORY_ON_FOURTH_POWER_FREE__FRESH_UNSEEN_K_ORDER_AND_INDEPENDENT_REPLICATION_REMAIN_REQUIRED'
  });
}
