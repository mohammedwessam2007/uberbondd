import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileMinimumIntervention, simulateCausalModel } from './causal-compiler-canary-v1.mjs';

export const CAUSAL_COMPILER_CANARY_V2_VERSION = 'uberbond.causal-compiler-canary.v2';

const envelope = extra => ({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const SUPPORTED = new Set(['INPUT','CONST0','CONST1','AND','OR','XOR','NOT','COPY']);

function bool(v){return v?1:0;}

function canonicalPlan(plan){
  return JSON.stringify(Object.entries(plan).sort(([a],[b])=>a.localeCompare(b)));
}

function planCost(plan){return Object.keys(plan).length;}

function mergePlans(a,b,metrics){
  metrics.planMergesAttempted += 1;
  const out={...a};
  for(const [id,value] of Object.entries(b)){
    if(Object.hasOwn(out,id) && out[id]!==value) return null;
    out[id]=value;
  }
  return out;
}

function dedupeMinimum(plans){
  const map=new Map();
  for(const plan of plans){
    const key=canonicalPlan(plan);
    if(!map.has(key)) map.set(key,plan);
  }
  const values=[...map.values()];
  if(!values.length) return [];
  const min=Math.min(...values.map(planCost));
  return values
    .filter(plan=>planCost(plan)===min)
    .sort((a,b)=>canonicalPlan(a).localeCompare(canonicalPlan(b)));
}

function combineSets(planSets,metrics,cap=20000){
  let acc=[{}];
  for(const set of planSets){
    const next=[];
    for(const a of acc){
      for(const b of set){
        const merged=mergePlans(a,b,metrics);
        if(merged) next.push(merged);
        if(next.length>cap) return [];
      }
    }
    acc=dedupeMinimum(next);
    if(!acc.length) return [];
  }
  return acc;
}

function relevantSubgraph(model,targetId){
  const byId=new Map(model.nodes.map(node=>[node.id,node]));
  const relevant=new Set();
  const stack=[targetId];
  while(stack.length){
    const id=stack.pop();
    if(relevant.has(id)) continue;
    relevant.add(id);
    const node=byId.get(id);
    for(const parent of node?.parents||[]) stack.push(parent);
  }
  return {byId,relevant};
}

function directEligibility(model,targetId){
  const {byId,relevant}=relevantSubgraph(model,targetId);
  for(const id of relevant){
    const node=byId.get(id);
    if(!node || !SUPPORTED.has(node.type)) return {eligible:false,reason:'unsupported-node-type'};
  }
  const usage=new Map();
  for(const id of relevant){
    const node=byId.get(id);
    for(const parent of node?.parents||[]){
      if(!relevant.has(parent)) continue;
      usage.set(parent,(usage.get(parent)||0)+1);
    }
  }
  if([...usage.values()].some(count=>count>1)) return {eligible:false,reason:'shared-upstream-subgraph'};
  return {eligible:true,reason:null,byId,relevant};
}

function desiredVectors(count,targetParity){
  const out=[];
  for(let mask=0;mask<2**count;mask++){
    const bits=Array.from({length:count},(_,i)=>(mask>>i)&1);
    const parity=bits.reduce((a,b)=>a^b,0);
    if(parity===targetParity) out.push(bits);
  }
  return out;
}

function compileTreePlan({model,targetId,desired}){
  const eligibility=directEligibility(model,targetId);
  if(!eligibility.eligible){
    return {ok:false,status:'DIRECT_COMPILATION_INELIGIBLE',reason:eligibility.reason};
  }
  const controllable=new Set(model.controllableIds||[]);
  const metrics={goalStatesExpanded:0,planMergesAttempted:0};
  const memo=new Map();

  function solve(id,wanted){
    const key=`${id}:${wanted}`;
    if(memo.has(key)) return memo.get(key);
    metrics.goalStatesExpanded += 1;
    const node=eligibility.byId.get(id);
    let plans=[];

    if(node.type==='INPUT'){
      const baseline=bool(model.exogenous?.[id]??0);
      if(baseline===wanted) plans=[{}];
      else if(controllable.has(id)) plans=[{[id]:wanted}];
    }else if(node.type==='CONST0'){
      plans=wanted===0?[{}]:[];
    }else if(node.type==='CONST1'){
      plans=wanted===1?[{}]:[];
    }else if(node.type==='COPY'){
      plans=solve(node.parents[0],wanted);
    }else if(node.type==='NOT'){
      plans=solve(node.parents[0],wanted?0:1);
    }else if(node.type==='AND'){
      if(wanted===1){
        plans=combineSets(node.parents.map(parent=>solve(parent,1)),metrics);
      }else{
        plans=node.parents.flatMap(parent=>solve(parent,0));
      }
    }else if(node.type==='OR'){
      if(wanted===0){
        plans=combineSets(node.parents.map(parent=>solve(parent,0)),metrics);
      }else{
        plans=node.parents.flatMap(parent=>solve(parent,1));
      }
    }else if(node.type==='XOR'){
      const candidates=[];
      for(const vector of desiredVectors(node.parents.length,wanted)){
        const merged=combineSets(node.parents.map((parent,index)=>solve(parent,vector[index])),metrics);
        candidates.push(...merged);
      }
      plans=candidates;
    }

    const best=dedupeMinimum(plans);
    memo.set(key,best);
    return best;
  }

  const plans=solve(targetId,bool(desired));
  if(!plans.length){
    return {
      ok:true,
      status:'DIRECT_GOAL_UNREACHABLE',
      satisfiable:false,
      interventionCardinality:null,
      interventions:null,
      symbolicWork:metrics
    };
  }
  const selected=plans[0];
  const verification=simulateCausalModel({model,interventions:selected});
  if(!verification.ok || verification.values[targetId]!==bool(desired)){
    return {
      ok:false,
      status:'DIRECT_PLAN_FORWARD_VERIFICATION_FAILED',
      reasonCodes:verification.reasonCodes||['compiled-plan-did-not-reach-goal'],
      symbolicWork:metrics
    };
  }
  return {
    ok:true,
    status:'DIRECT_MINIMUM_INTERVENTION_COMPILED',
    satisfiable:true,
    interventionCardinality:planCost(selected),
    interventions:selected,
    symbolicWork:metrics,
    fullModelEvaluations:1
  };
}

export function compileCausalGoalV2({model,goal}={}){
  if(!goal || typeof goal!=='object' || Array.isArray(goal) || Object.keys(goal).length!==1){
    return envelope({ok:false,status:'CAUSAL_V2_GOAL_INVALID',reasonCodes:['exactly-one-target-goal-required']});
  }
  const [targetId,desired]=Object.entries(goal)[0];
  const eligibility=directEligibility(model,targetId);
  if(eligibility.eligible){
    const direct=compileTreePlan({model,targetId,desired});
    if(!direct.ok) return envelope(direct);
    return envelope({
      ok:true,
      status:direct.satisfiable?'CAUSAL_V2_DIRECT_COMPILED':'CAUSAL_V2_DIRECT_UNREACHABLE',
      mode:'GOAL_DIRECTED_BACKWARD_COMPILATION',
      targetId,
      desired:bool(desired),
      satisfiable:direct.satisfiable,
      interventionCardinality:direct.interventionCardinality,
      interventions:direct.interventions,
      symbolicWork:direct.symbolicWork,
      fullModelEvaluations:direct.fullModelEvaluations??0,
      fallbackUsed:false,
      truthBoundary:'DIRECT_MINIMUM_IS_EXACT_FOR_THE_DECLARED_TREE_LIKE_BOOLEAN_SUBGRAPH_AND_DECLARED_INPUT_CONTROLS'
    });
  }

  const fallback=compileMinimumIntervention({model,goal,mode:'CAUSAL_RELEVANCE_PRUNED'});
  if(!fallback.ok) return fallback;
  return envelope({
    ok:true,
    status:fallback.satisfiable?'CAUSAL_V2_EXACT_FALLBACK_COMPILED':'CAUSAL_V2_EXACT_FALLBACK_UNREACHABLE',
    mode:'EXACT_RELEVANCE_PRUNED_FALLBACK',
    fallbackReason:eligibility.reason,
    targetId,
    desired:bool(desired),
    satisfiable:fallback.satisfiable,
    interventionCardinality:fallback.interventionCardinality,
    interventions:fallback.interventions,
    symbolicWork:{goalStatesExpanded:0,planMergesAttempted:0},
    fullModelEvaluations:fallback.evaluations,
    fallbackUsed:true,
    truthBoundary:'FALLBACK_PRESERVES_V1_EXACT_SEARCH_WHEN_DIRECT_COMPILATION_PRECONDITIONS_ARE_NOT_MET'
  });
}

function buildModel({family,relevantCount,distractorCount,seed=0}){
  const nodes=[],exogenous={},controllableIds=[];
  for(let i=0;i<relevantCount;i++){
    const id=`R${i}`; nodes.push({id,type:'INPUT',parents:[]});
    exogenous[id]=(seed+i)%2; controllableIds.push(id);
  }
  for(let i=0;i<distractorCount;i++){
    const id=`D${i}`; nodes.push({id,type:'INPUT',parents:[]});
    exogenous[id]=(seed+i+1)%2; controllableIds.push(id);
  }
  const r=Array.from({length:relevantCount},(_,i)=>`R${i}`);
  if(family==='AND') nodes.push({id:'T',type:'AND',parents:r});
  else if(family==='OR') nodes.push({id:'T',type:'OR',parents:r});
  else if(family==='XOR') nodes.push({id:'T',type:'XOR',parents:r});
  else if(family==='NESTED_AND_OR'){
    if(relevantCount===2) nodes.push({id:'T',type:'OR',parents:r});
    else{
      nodes.push({id:'M0',type:'AND',parents:[r[0],r[1]]});
      const tail=r.slice(2);
      if(tail.length===1) nodes.push({id:'T',type:'OR',parents:['M0',tail[0]]});
      else{nodes.push({id:'M1',type:'AND',parents:tail});nodes.push({id:'T',type:'OR',parents:['M0','M1']});}
    }
  }else if(family==='NESTED_XOR_AND'){
    if(relevantCount===2) nodes.push({id:'T',type:'XOR',parents:r});
    else{
      nodes.push({id:'M0',type:'XOR',parents:[r[0],r[1]]});
      const tail=r.slice(2);
      if(tail.length===1) nodes.push({id:'T',type:'AND',parents:['M0',tail[0]]});
      else{nodes.push({id:'M1',type:'OR',parents:tail});nodes.push({id:'T',type:'AND',parents:['M0','M1']});}
    }
  }
  return {nodes,exogenous,controllableIds};
}

function benchmarkCases(){
  const families=['AND','OR','XOR','NESTED_AND_OR','NESTED_XOR_AND'];
  const cases=[]; let index=0;
  for(const family of families){
    for(const relevantCount of [2,3,4]){
      for(const distractorCount of [4,6,8]){
        const model=buildModel({family,relevantCount,distractorCount,seed:index%5});
        const initial=simulateCausalModel({model,interventions:{}});
        cases.push({id:`case-${String(++index).padStart(2,'0')}`,family,relevantCount,distractorCount,model,goal:{T:initial.values.T?0:1},negativeControl:false});
      }
      const model=buildModel({family,relevantCount,distractorCount:0,seed:(index+3)%5});
      const initial=simulateCausalModel({model,interventions:{}});
      cases.push({id:`negative-${family.toLowerCase()}-${relevantCount}`,family,relevantCount,distractorCount:0,model,goal:{T:initial.values.T?0:1},negativeControl:true});
    }
  }
  cases.push({
    id:'impossible-constant-target',
    family:'IMPOSSIBLE_CONSTANT',
    relevantCount:0,distractorCount:1,
    model:{nodes:[{id:'R0',type:'INPUT',parents:[]},{id:'T',type:'CONST0',parents:[]}],exogenous:{R0:0},controllableIds:['R0']},
    goal:{T:1},impossibleControl:true,negativeControl:false
  });

  const shared=[
    {
      id:'shared-input-fallback-1',
      model:{
        nodes:[
          {id:'R0',type:'INPUT',parents:[]},{id:'R1',type:'INPUT',parents:[]},
          {id:'A',type:'COPY',parents:['R0']},
          {id:'B',type:'OR',parents:['R0','R1']},
          {id:'T',type:'AND',parents:['A','B']}
        ],
        exogenous:{R0:0,R1:0},controllableIds:['R0','R1']
      },goal:{T:1}
    },
    {
      id:'shared-input-fallback-2',
      model:{
        nodes:[
          {id:'R0',type:'INPUT',parents:[]},{id:'R1',type:'INPUT',parents:[]},
          {id:'A',type:'XOR',parents:['R0','R1']},
          {id:'B',type:'AND',parents:['R0','R1']},
          {id:'T',type:'OR',parents:['A','B']}
        ],
        exogenous:{R0:0,R1:0},controllableIds:['R0','R1']
      },goal:{T:1}
    },
    {
      id:'shared-internal-fallback-3',
      model:{
        nodes:[
          {id:'R0',type:'INPUT',parents:[]},{id:'R1',type:'INPUT',parents:[]},{id:'R2',type:'INPUT',parents:[]},
          {id:'M',type:'XOR',parents:['R0','R1']},
          {id:'A',type:'AND',parents:['M','R2']},
          {id:'B',type:'OR',parents:['M','R2']},
          {id:'T',type:'XOR',parents:['A','B']}
        ],
        exogenous:{R0:0,R1:0,R2:0},controllableIds:['R0','R1','R2']
      },goal:{T:1}
    }
  ];
  for(const row of shared) cases.push({...row,family:'SHARED_FALLBACK',sharedFallbackControl:true,negativeControl:false});
  return cases;
}

function median(values){
  const x=[...values].sort((a,b)=>a-b);
  const m=Math.floor(x.length/2);
  return x.length%2?x[m]:(x[m-1]+x[m])/2;
}

export function runCausalCompilerCanaryV2(){
  const cases=benchmarkCases();
  const results=[];
  for(const c of cases){
    const compiled=compileCausalGoalV2({model:c.model,goal:c.goal});
    const exhaustive=compileMinimumIntervention({model:c.model,goal:c.goal,mode:'EXHAUSTIVE_ALL_CONTROLS'});
    const agreement=compiled.ok&&exhaustive.ok&&
      compiled.satisfiable===exhaustive.satisfiable&&
      compiled.interventionCardinality===exhaustive.interventionCardinality;
    const reduction=compiled.fullModelEvaluations>0
      ? exhaustive.evaluations/compiled.fullModelEvaluations
      : (exhaustive.evaluations>0?Number.POSITIVE_INFINITY:1);
    results.push({
      id:c.id,family:c.family,relevantCount:c.relevantCount??null,distractorCount:c.distractorCount??null,
      negativeControl:Boolean(c.negativeControl),impossibleControl:Boolean(c.impossibleControl),
      sharedFallbackControl:Boolean(c.sharedFallbackControl),
      agreement,
      compiled:{
        mode:compiled.mode,status:compiled.status,satisfiable:compiled.satisfiable,
        interventionCardinality:compiled.interventionCardinality,interventions:compiled.interventions,
        fullModelEvaluations:compiled.fullModelEvaluations,symbolicWork:compiled.symbolicWork,
        fallbackUsed:compiled.fallbackUsed,fallbackReason:compiled.fallbackReason||null
      },
      exhaustive:{satisfiable:exhaustive.satisfiable,interventionCardinality:exhaustive.interventionCardinality,evaluations:exhaustive.evaluations},
      fullModelEvaluationReductionFactor:Number.isFinite(reduction)?Number(reduction.toFixed(6)):'INFINITE'
    });
  }

  const distractor=results.filter(row=>!row.negativeControl&&!row.impossibleControl&&!row.sharedFallbackControl);
  const ratios=distractor.map(row=>{
    const v=row.fullModelEvaluationReductionFactor;
    return v==='INFINITE'?1e9:v;
  });
  const shared=results.filter(row=>row.sharedFallbackControl);
  const impossible=results.find(row=>row.impossibleControl);
  const agreementRate=results.filter(row=>row.agreement).length/results.length;
  const medianReduction=median(ratios);
  const directVerificationFailures=results.filter(row=>row.compiled.mode==='GOAL_DIRECTED_BACKWARD_COMPILATION'&&!row.agreement);
  const sharedAgreement=shared.every(row=>row.agreement&&row.compiled.fallbackUsed===true);
  const impossibleAgreement=Boolean(impossible?.agreement&&!impossible.compiled.satisfiable&&!impossible.exhaustive.satisfiable);

  const success=agreementRate===1&&medianReduction>=10&&directVerificationFailures.length===0&&sharedAgreement&&impossibleAgreement;
  return envelope({
    ok:true,
    status:success?'CAUSAL_COMPILER_V2_GOAL_DIRECTED_PRIMITIVE_SUPPORTED__REVIEW_REQUIRED':'CAUSAL_COMPILER_V2_PREREGISTERED_FALSIFIER_TRIGGERED',
    preregistration:'artifacts/research/CAUSAL_COMPILER_CANARY_V2_PREREGISTRATION_20260920.json',
    benchmarkCaseCount:results.length,
    correctnessAgreementRate:agreementRate,
    medianDistractorFullModelEvaluationReductionFactor:Number(medianReduction.toFixed(6)),
    directCaseCount:results.filter(row=>row.compiled.mode==='GOAL_DIRECTED_BACKWARD_COMPILATION').length,
    fallbackCaseCount:results.filter(row=>row.compiled.fallbackUsed).length,
    sharedFallbackAgreement:sharedAgreement,
    impossibleCaseAgreement:impossibleAgreement,
    directVerificationFailureCount:directVerificationFailures.length,
    falsifierTriggered:!success,
    results,
    promotionCandidate:success?{
      moonshotId:'founder-moonshot-0001',
      scope:'KNOWN_TREE_LIKE_BOOLEAN_SCM_GOAL_DIRECTED_MINIMUM_INTERVENTION_COMPILATION_WITH_EXACT_FALLBACK',
      from:'SIMULATION_READY',to:'SOFTWARE_DEMONSTRATED',
      authority:'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    }:null,
    claimBoundary:'V2_COMPILES_ONLY_KNOWN_FINITE_BOOLEAN_CAUSAL_MODELS__NO_CAUSAL_DISCOVERY_OR_REAL_WORLD_INTERVENTION_PROOF'
  });
}
