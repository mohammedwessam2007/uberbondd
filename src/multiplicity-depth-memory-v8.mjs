import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MULTIPLICITY_DEPTH_MEMORY_V8_VERSION='uberbond.multiplicity-depth-memory.v8';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const MIN_X=2,MAX_X=4097;

function factorStats(x){
  let n=x,distinct=0,squarefree=1,cubefree=1;
  for(let p=2;p*p<=n;p+=1){
    if(n%p!==0) continue;
    distinct+=1;
    let exponent=0;
    while(n%p===0){n=Math.floor(n/p);exponent+=1;}
    if(exponent>=2) squarefree=0;
    if(exponent>=3) cubefree=0;
  }
  if(n>1) distinct+=1;
  return {distinct,squarefree,cubefree};
}

const TARGETS=Object.freeze([
  {id:'A212793_CUBEFREE_INDICATOR',metric:'BALANCED',label:x=>factorStats(x).cubefree},
  {id:'A008966_SQUAREFREE',metric:'ACCURACY',label:x=>factorStats(x).squarefree},
  {id:'A008683_MOBIUS_POSITIVE',metric:'ACCURACY',label:x=>{const s=factorStats(x);return s.squarefree&&((s.distinct&1)===0)?1:0;}},
  {id:'A001221_DISTINCT_PRIME_PARITY',metric:'ACCURACY',label:x=>factorStats(x).distinct&1}
]);

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
    accuracy:rows.length?(tp+tn)/rows.length:0,
    balancedAccuracy:(positiveRecall+negativeRecall)/2,
    positiveRecall,negativeRecall,tp,tn,fp,fn
  };
}
function negativeHash(x){
  let z=(x+0x13198a2e)>>>0;
  z^=z>>>16;z=Math.imul(z,0x7feb352d)>>>0;
  z^=z>>>15;z=Math.imul(z,0x846ca68b)>>>0;
  z^=z>>>16;
  return (z>>>31)&1;
}
function updateAccumulator(state,mode){
  if(mode==='TOGGLE_PER_DIVISION_EVENT') return state^1;
  if(mode==='SET_ONE_ON_EVENT') return 1;
  if(mode==='SET_ZERO_ON_EVENT') return 0;
  return state;
}
function outputState(acc,depth,mode){
  if(mode==='ACCUMULATOR') return acc;
  if(mode==='NOT_ACCUMULATOR') return acc?0:1;
  if(mode==='DEPTH_GE_1') return depth>=1?1:0;
  if(mode==='DEPTH_GE_2') return depth>=2?1:0;
  if(mode==='DEPTH_GE_3') return depth>=3?1:0;
  if(mode==='DEPTH_LT_1') return depth<1?1:0;
  if(mode==='DEPTH_LT_2') return depth<2?1:0;
  if(mode==='DEPTH_LT_3') return depth<3?1:0;
  if(mode==='ACCUMULATOR_AND_DEPTH_LT_2') return acc&&depth<2?1:0;
  if(mode==='ACCUMULATOR_AND_DEPTH_LT_3') return acc&&depth<3?1:0;
  if(mode==='NOT_ACCUMULATOR_AND_DEPTH_LT_2') return !acc&&depth<2?1:0;
  if(mode==='NOT_ACCUMULATOR_AND_DEPTH_LT_3') return !acc&&depth<3?1:0;
  if(mode==='ACCUMULATOR_XOR_DEPTH_GE_2') return acc!==(depth>=2?1:0)?1:0;
  return acc!==(depth>=3?1:0)?1:0;
}

function evaluateProgram(x,spec){
  let working=x;
  let accumulator=spec.initialAccumulator;
  let maxDepth=0;
  const consume=divisor=>{
    let count=0;
    if(spec.divisionPolicy==='SINGLE_IF_DIVISIBLE'){
      if(working%divisor===0){
        count=1;working=Math.floor(working/divisor);
        if(spec.accumulatorUpdate!=='TOGGLE_ON_DIVISOR_HIT') accumulator=updateAccumulator(accumulator,spec.accumulatorUpdate);
      }
    }else{
      while(working%divisor===0){
        count+=1;working=Math.floor(working/divisor);
        if(spec.accumulatorUpdate!=='TOGGLE_ON_DIVISOR_HIT') accumulator=updateAccumulator(accumulator,spec.accumulatorUpdate);
      }
    }
    if(count>0&&spec.accumulatorUpdate==='TOGGLE_ON_DIVISOR_HIT') accumulator^=1;
    if(count>0) maxDepth=Math.max(maxDepth,Math.min(3,count));
  };
  if(spec.divisorOrder==='ASCENDING_2_TO_DYNAMIC_SQRT'){
    for(let d=2;d*d<=working;d+=1) consume(d);
  }else{
    for(let d=Math.floor(Math.sqrt(x));d>=2;d-=1) consume(d);
  }
  if(working>1){
    maxDepth=Math.max(maxDepth,1);
    if(spec.leftoverPolicy==='TOGGLE_IF_WORKING_GT_1') accumulator^=1;
    else if(spec.leftoverPolicy==='SET_ONE_IF_WORKING_GT_1') accumulator=1;
  }
  return outputState(accumulator,maxDepth,spec.outputMode);
}

function grammar(){
  const out=[];
  const outputs=[
    'ACCUMULATOR','NOT_ACCUMULATOR','DEPTH_GE_1','DEPTH_GE_2','DEPTH_GE_3',
    'DEPTH_LT_1','DEPTH_LT_2','DEPTH_LT_3',
    'ACCUMULATOR_AND_DEPTH_LT_2','ACCUMULATOR_AND_DEPTH_LT_3',
    'NOT_ACCUMULATOR_AND_DEPTH_LT_2','NOT_ACCUMULATOR_AND_DEPTH_LT_3',
    'ACCUMULATOR_XOR_DEPTH_GE_2','ACCUMULATOR_XOR_DEPTH_GE_3'
  ];
  for(const divisorOrder of ['ASCENDING_2_TO_DYNAMIC_SQRT','DESCENDING_FROM_ORIGINAL_SQRT'])
  for(const divisionPolicy of ['SINGLE_IF_DIVISIBLE','REPEAT_WHILE_DIVISIBLE'])
  for(const accumulatorUpdate of ['TOGGLE_PER_DIVISION_EVENT','TOGGLE_ON_DIVISOR_HIT','SET_ONE_ON_EVENT','SET_ZERO_ON_EVENT'])
  for(const leftoverPolicy of ['IGNORE_LEFTOVER','TOGGLE_IF_WORKING_GT_1','SET_ONE_IF_WORKING_GT_1'])
  for(const initialAccumulator of [0,1])
  for(const outputMode of outputs){
    const spec={divisorOrder,divisionPolicy,accumulatorUpdate,leftoverPolicy,initialAccumulator,
      multiplicityDepthRule:'GLOBAL_MAX_EXPONENT_CLASS_SATURATED_AT_3',outputMode};
    const descriptionCost=
      3+
      (divisorOrder==='ASCENDING_2_TO_DYNAMIC_SQRT'?1:2)+
      (divisionPolicy==='REPEAT_WHILE_DIVISIBLE'?1:2)+
      (accumulatorUpdate.startsWith('TOGGLE')?1:2)+
      (leftoverPolicy==='IGNORE_LEFTOVER'?1:2)+
      initialAccumulator+
      (outputMode.includes('AND')||outputMode.includes('XOR')?3:1);
    const id=[divisorOrder,divisionPolicy,accumulatorUpdate,leftoverPolicy,`ACC_INIT_${initialAccumulator}`,
      'MAX_MULTIPLICITY_DEPTH_SAT3',outputMode].join('__');
    out.push({id,spec,descriptionCost,evaluate:x=>evaluateProgram(x,spec)});
  }
  return out;
}

export function multiplicityDepthProgramsV8() {
  return grammar().map(program => ({
    id: program.id,
    descriptionCost: program.descriptionCost,
    spec: structuredClone(program.spec),
    evaluate: program.evaluate
  }));
}

function scoreFor(target,m){return target.metric==='BALANCED'?m.balancedAccuracy:m.accuracy;}
function select(target,split){
  const programs=grammar();let best=null;
  for(const program of programs){
    const train=metrics(split.train,program.evaluate);
    const validation=metrics(split.validation,program.evaluate);
    const row={program,train,validation,trainScore:scoreFor(target,train),validationScore:scoreFor(target,validation)};
    if(!best||
      row.trainScore>best.trainScore||
      (row.trainScore===best.trainScore&&row.validationScore>best.validationScore)||
      (row.trainScore===best.trainScore&&row.validationScore===best.validationScore&&program.descriptionCost<best.program.descriptionCost)||
      (row.trainScore===best.trainScore&&row.validationScore===best.validationScore&&program.descriptionCost===best.program.descriptionCost&&program.id<best.program.id)) best=row;
  }
  return {...best,evaluated:programs.length};
}
function evaluateTarget(target){
  const split=splitRows(target.label);
  const selected=select(target,split);
  const heldOut=metrics(split.heldOut,selected.program.evaluate);
  return {id:target.id,metric:target.metric,selectedProgramId:selected.program.id,selectedProgramSpec:selected.program.spec,
    train:selected.train,validation:selected.validation,heldOut,candidateCount:selected.evaluated};
}
export function runMultiplicityDepthMemoryV8(){
  const results=TARGETS.map(evaluateTarget);
  const cubefree=results.find(x=>x.id==='A212793_CUBEFREE_INDICATOR');
  const old=results.filter(x=>x.id!=='A212793_CUBEFREE_INDICATOR');
  const base=0.8614864864864865;
  const improvement=cubefree.heldOut.balancedAccuracy-base;
  const negTarget={id:'NEGATIVE_HASH',metric:'BALANCED',label:negativeHash};
  const neg=evaluateTarget(negTarget);
  const success=
    cubefree.heldOut.balancedAccuracy>=0.95&&
    cubefree.heldOut.positiveRecall>=0.9&&
    cubefree.heldOut.negativeRecall>=0.9&&
    improvement>=0.08&&
    old.every(x=>x.heldOut.accuracy>=0.99)&&
    neg.heldOut.balancedAccuracy<=0.65;
  return envelope({
    ok:true,
    status:success?'V8_MULTIPLICITY_DEPTH_HYPOTHESIS_SUPPORTED__REVIEW_REQUIRED':'V8_PREREGISTERED_FALSIFIER_TRIGGERED_OR_NOT_SUPPORTED',
    preregistration:'artifacts/research/MULTIPLICITY_DEPTH_MEMORY_V8_PREREGISTRATION_20260920.json',
    heldOutUsedForSelection:false,
    targetSpecificNamedPrimitivePresent:false,
    candidateCount:grammar().length,
    results,
    cubefreeImprovementOverFrozenBase:Number(improvement.toFixed(6)),
    negativeControl:{selectedProgramId:neg.selectedProgramId,heldOut:neg.heldOut,passed:neg.heldOut.balancedAccuracy<=0.65},
    falsifierTriggered:!success,
    promotionCandidate:success?{
      concept:'GENERIC_SATURATING_MULTIPLICITY_DEPTH_MEMORY',
      proposedState:'SOFTWARE_DEMONSTRATED_CANDIDATE_AFTER_INDEPENDENT_REPLICATION_AND_UNSEEN_ORDER_TEST',
      authority:'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    }:null,
    claimBoundary:'V8_IS_POST_FAILURE_CONFIRMATORY_EVIDENCE_ON_THE_SAME_CUBEFREE_TARGET__UNSEEN_MULTIPLICITY_ORDER_GENERALIZATION_REMAINS_UNTESTED'
  });
}
