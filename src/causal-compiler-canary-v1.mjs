import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CAUSAL_COMPILER_CANARY_V1_VERSION = 'uberbond.causal-compiler-canary.v1';

const ZERO = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope = extra => ({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:ZERO(),
  ...extra
});

const NODE_TYPES = Object.freeze(['INPUT','CONST0','CONST1','AND','OR','XOR','NOT','COPY']);

function validateModel(model) {
  if (!model || !Array.isArray(model.nodes) || model.nodes.length === 0 || model.nodes.length > 128) {
    return { ok:false, reasonCodes:['bounded-node-array-required'] };
  }
  const seen=new Set();
  for(const [index,node] of model.nodes.entries()){
    if(!node?.id || typeof node.id!=='string' || seen.has(node.id) || !NODE_TYPES.includes(node.type)){
      return {ok:false,reasonCodes:[`node-${index}-invalid-or-duplicate`]};
    }
    const parents=Array.isArray(node.parents)?node.parents:[];
    if(node.type==='INPUT' && parents.length) return {ok:false,reasonCodes:[`input-node-${node.id}-cannot-have-parents`]};
    if(['CONST0','CONST1'].includes(node.type) && parents.length) return {ok:false,reasonCodes:[`constant-node-${node.id}-cannot-have-parents`]};
    if(['NOT','COPY'].includes(node.type) && parents.length!==1) return {ok:false,reasonCodes:[`unary-node-${node.id}-needs-one-parent`]};
    if(['AND','OR','XOR'].includes(node.type) && parents.length<2) return {ok:false,reasonCodes:[`aggregate-node-${node.id}-needs-two-parents`]};
    for(const parent of parents){
      if(!seen.has(parent)) return {ok:false,reasonCodes:[`node-${node.id}-parent-must-precede-child:${parent}`]};
    }
    seen.add(node.id);
  }
  const controllable=Array.isArray(model.controllableIds)?model.controllableIds:[];
  if(new Set(controllable).size!==controllable.length) return {ok:false,reasonCodes:['controllable-ids-must-be-unique']};
  for(const id of controllable){
    const node=model.nodes.find(n=>n.id===id);
    if(!node || node.type!=='INPUT') return {ok:false,reasonCodes:[`controllable-must-be-input:${id}`]};
  }
  return {ok:true};
}

function bool(value){return value?1:0;}

function evalNode(node, values, exogenous) {
  const parents=(node.parents||[]).map(id=>values[id]);
  switch(node.type){
    case 'INPUT': return bool(exogenous?.[node.id] ?? 0);
    case 'CONST0': return 0;
    case 'CONST1': return 1;
    case 'AND': return parents.every(Boolean)?1:0;
    case 'OR': return parents.some(Boolean)?1:0;
    case 'XOR': return parents.reduce((a,b)=>a^bool(b),0);
    case 'NOT': return parents[0]?0:1;
    case 'COPY': return bool(parents[0]);
    default: throw new Error(`unknown-node-type:${node.type}`);
  }
}

export function simulateCausalModel({model, interventions={}}={}) {
  const valid=validateModel(model);
  if(!valid.ok) return envelope({ok:false,status:'CAUSAL_MODEL_INVALID',reasonCodes:valid.reasonCodes});
  if(!interventions || typeof interventions!=='object' || Array.isArray(interventions)){
    return envelope({ok:false,status:'CAUSAL_INTERVENTION_INVALID',reasonCodes:['interventions-object-required']});
  }
  const controllable=new Set(model.controllableIds||[]);
  for(const [id,value] of Object.entries(interventions)){
    if(!controllable.has(id)) return envelope({ok:false,status:'CAUSAL_INTERVENTION_INVALID',reasonCodes:[`intervention-not-declared-controllable:${id}`]});
    if(value!==0 && value!==1 && value!==false && value!==true){
      return envelope({ok:false,status:'CAUSAL_INTERVENTION_INVALID',reasonCodes:[`intervention-must-be-boolean:${id}`]});
    }
  }
  const values={};
  for(const node of model.nodes){
    values[node.id]=Object.hasOwn(interventions,node.id)
      ? bool(interventions[node.id])
      : evalNode(node,values,model.exogenous||{});
  }
  return envelope({ok:true,status:'CAUSAL_MODEL_SIMULATED',values});
}

function causalAncestors(model,targetIds){
  const byId=new Map(model.nodes.map(node=>[node.id,node]));
  const ancestors=new Set();
  const stack=[...targetIds];
  while(stack.length){
    const id=stack.pop();
    const node=byId.get(id);
    if(!node) continue;
    for(const parent of node.parents||[]){
      if(!ancestors.has(parent)){
        ancestors.add(parent);
        stack.push(parent);
      }
    }
  }
  return ancestors;
}

function combinations(items,k,start=0,prefix=[],out=[]){
  if(prefix.length===k){out.push([...prefix]);return out;}
  for(let i=start;i<=items.length-(k-prefix.length);i++){
    prefix.push(items[i]);
    combinations(items,k,i+1,prefix,out);
    prefix.pop();
  }
  return out;
}

function goalSatisfied(values,goal){
  return Object.entries(goal).every(([id,wanted])=>values[id]===bool(wanted));
}

function searchInterventions({model,goal,candidateControls}){
  let evaluations=0;
  const controls=[...candidateControls].sort();
  for(let k=0;k<=controls.length;k++){
    const combos=combinations(controls,k);
    for(const combo of combos){
      const assignments=2**combo.length;
      for(let mask=0;mask<assignments;mask++){
        const interventions={};
        for(let i=0;i<combo.length;i++) interventions[combo[i]]=(mask>>i)&1;
        evaluations+=1;
        const sim=simulateCausalModel({model,interventions});
        if(!sim.ok) return {ok:false,reasonCodes:sim.reasonCodes,evaluations};
        if(goalSatisfied(sim.values,goal)){
          return {
            ok:true,
            satisfiable:true,
            interventionCardinality:k,
            interventions,
            evaluations,
            candidateControlCount:controls.length
          };
        }
      }
    }
  }
  return {
    ok:true,
    satisfiable:false,
    interventionCardinality:null,
    interventions:null,
    evaluations,
    candidateControlCount:controls.length
  };
}

export function compileMinimumIntervention({
  model,
  goal,
  mode='CAUSAL_RELEVANCE_PRUNED'
}={}) {
  const valid=validateModel(model);
  if(!valid.ok) return envelope({ok:false,status:'CAUSAL_MODEL_INVALID',reasonCodes:valid.reasonCodes});
  if(!goal || typeof goal!=='object' || Array.isArray(goal) || Object.keys(goal).length===0){
    return envelope({ok:false,status:'CAUSAL_GOAL_INVALID',reasonCodes:['nonempty-goal-object-required']});
  }
  const known=new Set(model.nodes.map(node=>node.id));
  for(const [id,value] of Object.entries(goal)){
    if(!known.has(id)) return envelope({ok:false,status:'CAUSAL_GOAL_INVALID',reasonCodes:[`unknown-goal-node:${id}`]});
    if(value!==0 && value!==1 && value!==false && value!==true) return envelope({ok:false,status:'CAUSAL_GOAL_INVALID',reasonCodes:[`goal-must-be-boolean:${id}`]});
  }

  const all=[...(model.controllableIds||[])].sort();
  const targetIds=Object.keys(goal);
  const ancestors=causalAncestors(model,targetIds);
  const relevant=all.filter(id=>ancestors.has(id));
  const candidateControls=mode==='EXHAUSTIVE_ALL_CONTROLS'?all:relevant;
  if(!['CAUSAL_RELEVANCE_PRUNED','EXHAUSTIVE_ALL_CONTROLS'].includes(mode)){
    return envelope({ok:false,status:'CAUSAL_COMPILER_MODE_INVALID',reasonCodes:['known-mode-required']});
  }
  const result=searchInterventions({model,goal,candidateControls});
  if(!result.ok) return envelope({ok:false,status:'CAUSAL_SEARCH_FAILED',reasonCodes:result.reasonCodes});
  return envelope({
    ok:true,
    status:result.satisfiable?'MINIMUM_INTERVENTION_COMPILED':'GOAL_UNREACHABLE_UNDER_DECLARED_CONTROLS',
    mode,
    targetIds,
    allControllableCount:all.length,
    relevantControllableCount:relevant.length,
    prunedControllableIds:all.filter(id=>!ancestors.has(id)),
    ...result,
    truthBoundary:'MINIMUM_IS_EXACT_ONLY_FOR_THE_DECLARED_FINITE_BOOLEAN_SCM_AND_DECLARED_CONTROLS'
  });
}

function buildModel({family,relevantCount,distractorCount,seed=0}){
  const nodes=[];
  const exogenous={};
  const controllableIds=[];
  for(let i=0;i<relevantCount;i++){
    const id=`R${i}`;
    nodes.push({id,type:'INPUT',parents:[]});
    exogenous[id]=(seed+i)%2;
    controllableIds.push(id);
  }
  for(let i=0;i<distractorCount;i++){
    const id=`D${i}`;
    nodes.push({id,type:'INPUT',parents:[]});
    exogenous[id]=(seed+i+1)%2;
    controllableIds.push(id);
  }

  const r=Array.from({length:relevantCount},(_,i)=>`R${i}`);
  if(family==='AND'){
    nodes.push({id:'T',type:'AND',parents:r});
  }else if(family==='OR'){
    nodes.push({id:'T',type:'OR',parents:r});
  }else if(family==='XOR'){
    nodes.push({id:'T',type:'XOR',parents:r});
  }else if(family==='NESTED_AND_OR'){
    if(relevantCount===2){
      nodes.push({id:'T',type:'OR',parents:r});
    }else{
      nodes.push({id:'M0',type:'AND',parents:[r[0],r[1]]});
      const tail=r.slice(2);
      if(tail.length===1) nodes.push({id:'T',type:'OR',parents:['M0',tail[0]]});
      else{
        nodes.push({id:'M1',type:'AND',parents:tail});
        nodes.push({id:'T',type:'OR',parents:['M0','M1']});
      }
    }
  }else if(family==='NESTED_XOR_AND'){
    if(relevantCount===2){
      nodes.push({id:'T',type:'XOR',parents:r});
    }else{
      nodes.push({id:'M0',type:'XOR',parents:[r[0],r[1]]});
      const tail=r.slice(2);
      if(tail.length===1) nodes.push({id:'T',type:'AND',parents:['M0',tail[0]]});
      else{
        nodes.push({id:'M1',type:'OR',parents:tail});
        nodes.push({id:'T',type:'AND',parents:['M0','M1']});
      }
    }
  }else{
    throw new Error(`unknown-family:${family}`);
  }
  return {nodes,exogenous,controllableIds};
}

function benchmarkCases(){
  const families=['AND','OR','XOR','NESTED_AND_OR','NESTED_XOR_AND'];
  const cases=[];
  let index=0;
  for(const family of families){
    for(const relevantCount of [2,3,4]){
      for(const distractorCount of [4,6,8]){
        const model=buildModel({family,relevantCount,distractorCount,seed:index%5});
        const initial=simulateCausalModel({model,interventions:{}});
        const goal={T:initial.values.T?0:1};
        cases.push({
          id:`case-${String(++index).padStart(2,'0')}`,
          family,relevantCount,distractorCount,model,goal,negativeControl:false
        });
      }
      const model=buildModel({family,relevantCount,distractorCount:0,seed:(index+3)%5});
      const initial=simulateCausalModel({model,interventions:{}});
      cases.push({
        id:`negative-${family.toLowerCase()}-${relevantCount}`,
        family,relevantCount,distractorCount:0,model,goal:{T:initial.values.T?0:1},negativeControl:true
      });
    }
  }
  const impossible={
    nodes:[
      {id:'R0',type:'INPUT',parents:[]},
      {id:'T',type:'CONST0',parents:[]}
    ],
    exogenous:{R0:0},
    controllableIds:['R0']
  };
  cases.push({
    id:'impossible-constant-target',
    family:'IMPOSSIBLE_CONSTANT',
    relevantCount:0,
    distractorCount:1,
    model:impossible,
    goal:{T:1},
    negativeControl:false,
    impossibleControl:true
  });
  return cases;
}

function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  if(!sorted.length) return null;
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}

export function runCausalCompilerCanaryV1(){
  const cases=benchmarkCases();
  const results=[];
  for(const c of cases){
    const pruned=compileMinimumIntervention({model:c.model,goal:c.goal,mode:'CAUSAL_RELEVANCE_PRUNED'});
    const exhaustive=compileMinimumIntervention({model:c.model,goal:c.goal,mode:'EXHAUSTIVE_ALL_CONTROLS'});
    const correctnessAgreement=
      pruned.ok && exhaustive.ok &&
      pruned.satisfiable===exhaustive.satisfiable &&
      pruned.interventionCardinality===exhaustive.interventionCardinality;
    const reductionFactor=pruned.evaluations>0?exhaustive.evaluations/pruned.evaluations:null;
    results.push({
      id:c.id,
      family:c.family,
      relevantCount:c.relevantCount,
      distractorCount:c.distractorCount,
      negativeControl:Boolean(c.negativeControl),
      impossibleControl:Boolean(c.impossibleControl),
      correctnessAgreement,
      pruned:{
        satisfiable:pruned.satisfiable,
        interventionCardinality:pruned.interventionCardinality,
        interventions:pruned.interventions,
        evaluations:pruned.evaluations,
        relevantControllableCount:pruned.relevantControllableCount,
        prunedControllableIds:pruned.prunedControllableIds
      },
      exhaustive:{
        satisfiable:exhaustive.satisfiable,
        interventionCardinality:exhaustive.interventionCardinality,
        interventions:exhaustive.interventions,
        evaluations:exhaustive.evaluations
      },
      evaluationReductionFactor:Number((reductionFactor||0).toFixed(6))
    });
  }

  const distractor=results.filter(row=>!row.negativeControl&&!row.impossibleControl);
  const negatives=results.filter(row=>row.negativeControl);
  const impossible=results.find(row=>row.impossibleControl);
  const agreementRate=results.filter(row=>row.correctnessAgreement).length/results.length;
  const medianReduction=median(distractor.map(row=>row.evaluationReductionFactor));
  const maxNegativeRatio=Math.max(...negatives.map(row=>row.evaluationReductionFactor));
  const impossibleAgreement=Boolean(impossible?.correctnessAgreement && !impossible.pruned.satisfiable && !impossible.exhaustive.satisfiable);

  const success=
    agreementRate===1 &&
    medianReduction>=10 &&
    maxNegativeRatio<=1.05 &&
    impossibleAgreement;

  return envelope({
    ok:true,
    status:success
      ? 'CAUSAL_COMPILER_V1_NARROW_SOFTWARE_PRIMITIVE_SUPPORTED__REVIEW_REQUIRED'
      : 'CAUSAL_COMPILER_V1_PREREGISTERED_FALSIFIER_TRIGGERED',
    preregistration:'artifacts/research/CAUSAL_COMPILER_CANARY_V1_PREREGISTRATION_20260920.json',
    benchmarkCaseCount:results.length,
    distractorCaseCount:distractor.length,
    negativeControlCount:negatives.length,
    correctnessAgreementRate:agreementRate,
    medianDistractorEvaluationReductionFactor:Number(medianReduction.toFixed(6)),
    maximumNegativeControlEvaluationRatio:Number(maxNegativeRatio.toFixed(6)),
    impossibleCaseAgreement:impossibleAgreement,
    falsifierTriggered:!success,
    results,
    promotionCandidate:success?{
      moonshotId:'founder-moonshot-0001',
      scope:'KNOWN_DETERMINISTIC_BOOLEAN_SCM_MINIMUM_INTERVENTION_WITH_CAUSAL_RELEVANCE_PRUNING',
      from:'SIMULATION_READY',
      to:'SOFTWARE_DEMONSTRATED',
      authority:'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    }:null,
    claimBoundary:'THIS_DOES_NOT_DISCOVER_CAUSAL_STRUCTURE_OR_VALIDATE_REAL_WORLD_INTERVENTIONS__IT_SOLVES_A_DECLARED_FINITE_KNOWN_SCM'
  });
}
