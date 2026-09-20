import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileMinimumIntervention, simulateCausalModel } from './causal-compiler-canary-v1.mjs';
import { compileCausalGoalV2 } from './causal-compiler-canary-v2.mjs';

export const CAUSAL_SEMANTIC_CRYSTALLIZER_VERSION = 'uberbond.causal-semantic-crystallizer.v1';

const envelope = extra => ({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bool = value => value ? 1 : 0;

function byId(model){
  return new Map((model?.nodes||[]).map(node=>[node.id,node]));
}

function ancestorCone(model, rootId){
  const map=byId(model);
  if(!map.has(rootId)) return null;
  const nodes=new Set();
  const boundaryInputs=new Set();
  const stack=[rootId];
  while(stack.length){
    const id=stack.pop();
    if(nodes.has(id)) continue;
    const node=map.get(id);
    if(!node) return null;
    nodes.add(id);
    if(node.type==='INPUT'){
      boundaryInputs.add(id);
      continue;
    }
    for(const parent of node.parents||[]) stack.push(parent);
  }
  return {
    rootId,
    nodeIds:[...nodes],
    boundaryInputIds:[...boundaryInputs].sort()
  };
}

function coneSyntaxDigest(model, rootId){
  const cone=ancestorCone(model,rootId);
  if(!cone) return null;
  const map=byId(model);
  const internal=cone.nodeIds
    .map(id=>map.get(id))
    .filter(Boolean)
    .map(node=>({id:node.id,type:node.type,parents:[...(node.parents||[])]}));
  return digest(internal);
}

function truthTableForRoot(model,rootId){
  const cone=ancestorCone(model,rootId);
  if(!cone || cone.boundaryInputIds.length>8) return null;
  const outputs=[];
  for(let mask=0;mask<2**cone.boundaryInputIds.length;mask++){
    const interventions={};
    for(let i=0;i<cone.boundaryInputIds.length;i++){
      interventions[cone.boundaryInputIds[i]]=(mask>>i)&1;
    }
    const sim=simulateCausalModel({model,interventions});
    if(!sim.ok) return null;
    outputs.push(sim.values[rootId]);
  }
  return {
    arity:cone.boundaryInputIds.length,
    boundaryInputIds:cone.boundaryInputIds,
    outputs,
    semanticSignature:`${cone.boundaryInputIds.length}:${outputs.join('')}`
  };
}

export function describeCausalMotif({id,model,rootId}={}){
  const motifId=String(id||'').trim();
  const root=String(rootId||'').trim();
  if(!motifId||!root||!model) return envelope({ok:false,status:'CAUSAL_MOTIF_INVALID',reasonCodes:['id-model-root-required']});
  const table=truthTableForRoot(model,root);
  const syntaxDigest=coneSyntaxDigest(model,root);
  if(!table||!syntaxDigest) return envelope({ok:false,status:'CAUSAL_MOTIF_INVALID',reasonCodes:['bounded-executable-boolean-cone-required']});
  return envelope({
    ok:true,
    status:'CAUSAL_MOTIF_DESCRIBED',
    motif:{
      id:motifId,
      rootId:root,
      syntaxDigest,
      ...table
    },
    truthBoundary:'TRUTH_TABLE_DESCRIBES_ONLY_THE_DECLARED_FINITE_BOOLEAN_BOUNDARY'
  });
}

export function crystallizeSemanticCausalOperators({motifs=[],minimumDistinctSyntaxes=2}={}){
  const min=Number(minimumDistinctSyntaxes);
  if(!Array.isArray(motifs)||motifs.length<2||motifs.length>256||!Number.isSafeInteger(min)||min<2||min>20){
    return envelope({ok:false,status:'CAUSAL_CRYSTALLIZATION_INVALID',reasonCodes:['bounded-motifs-and-distinct-syntax-threshold-required']});
  }
  const described=[];
  for(const raw of motifs){
    const result=describeCausalMotif(raw);
    if(!result.ok) return result;
    described.push(result.motif);
  }
  const groups=new Map();
  for(const motif of described){
    const rows=groups.get(motif.semanticSignature)||[];
    rows.push(motif);
    groups.set(motif.semanticSignature,rows);
  }
  const crystals=[];
  for(const [signature,rows] of groups){
    const distinct=[...new Set(rows.map(row=>row.syntaxDigest))];
    if(distinct.length<min) continue;
    const first=rows[0];
    crystals.push({
      crystalId:`causal_crystal_${digest({signature,distinctSyntaxes:distinct.sort()}).slice(0,24)}`,
      semanticSignature:signature,
      arity:first.arity,
      truthTable:[...first.outputs],
      trainingMotifIds:rows.map(row=>row.id).sort(),
      distinctSyntaxCount:distinct.length,
      promotionAuthority:'NONE',
      heldOutSemanticMatchRequired:true
    });
  }
  crystals.sort((a,b)=>a.semanticSignature.localeCompare(b.semanticSignature));
  return envelope({
    ok:true,
    status:'CAUSAL_SEMANTIC_CRYSTALS_READY',
    describedMotifCount:described.length,
    crystalCount:crystals.length,
    crystals,
    rejectedSingletonSignatures:[...groups.entries()]
      .filter(([,rows])=>new Set(rows.map(row=>row.syntaxDigest)).size<min)
      .map(([signature])=>signature)
      .sort(),
    law:'SYNTACTIC_DIFFERENCE_PLUS_EXACT_BEHAVIORAL_EQUIVALENCE_CREATES_A_CRYSTAL_CANDIDATE__NOT_CAUSAL_DISCOVERY'
  });
}

function usageCounts(model,targetId){
  const map=byId(model);
  const relevant=new Set();
  const stack=[targetId];
  while(stack.length){
    const id=stack.pop();
    if(relevant.has(id)) continue;
    relevant.add(id);
    const node=map.get(id);
    for(const p of node?.parents||[]) stack.push(p);
  }
  const counts=new Map();
  for(const id of relevant){
    const node=map.get(id);
    for(const p of node?.parents||[]){
      if(relevant.has(p)) counts.set(p,(counts.get(p)||0)+1);
    }
  }
  return {relevant,counts};
}

function matchesByNode(model,targetId,crystals){
  const {relevant,counts}=usageCounts(model,targetId);
  const matches=new Map();
  for(const nodeId of relevant){
    if(nodeId===targetId) continue;
    const node=(model.nodes||[]).find(row=>row.id===nodeId);
    if(!node || node.type==='INPUT' || node.type==='CONST0' || node.type==='CONST1') continue;
    const cone=ancestorCone(model,nodeId);
    if(!cone) continue;
    // A crystal may only replace an isolated upstream cone. Shared internal
    // variables remain delegated to the exact fallback compiler.
    const internalShared=cone.nodeIds
      .filter(id=>!cone.boundaryInputIds.includes(id) && id!==nodeId)
      .some(id=>(counts.get(id)||0)>1);
    const boundaryShared=cone.boundaryInputIds.some(id=>(counts.get(id)||0)>1);
    if(internalShared||boundaryShared) continue;
    const table=truthTableForRoot(model,nodeId);
    if(!table) continue;
    const crystal=crystals.find(row=>row.semanticSignature===table.semanticSignature);
    if(crystal){
      matches.set(nodeId,{
        crystal,
        boundaryInputIds:table.boundaryInputIds,
        semanticSignature:table.semanticSignature
      });
    }
  }
  return matches;
}

function canonicalPlan(plan){
  return JSON.stringify(Object.entries(plan).sort(([a],[b])=>a.localeCompare(b)));
}
function planCost(plan){return Object.keys(plan).length;}
function dedupeMinimum(plans){
  const map=new Map();
  for(const plan of plans) map.set(canonicalPlan(plan),plan);
  const values=[...map.values()];
  if(!values.length) return [];
  const min=Math.min(...values.map(planCost));
  return values.filter(plan=>planCost(plan)===min)
    .sort((a,b)=>canonicalPlan(a).localeCompare(canonicalPlan(b)));
}
function mergePlans(a,b,metrics){
  metrics.planMergesAttempted+=1;
  const out={...a};
  for(const [id,v] of Object.entries(b)){
    if(Object.hasOwn(out,id)&&out[id]!==v) return null;
    out[id]=v;
  }
  return out;
}
function combineSets(sets,metrics,cap=50000){
  let acc=[{}];
  for(const set of sets){
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
function desiredVectors(count,target){
  const rows=[];
  for(let mask=0;mask<2**count;mask++){
    const bits=Array.from({length:count},(_,i)=>(mask>>i)&1);
    if(bits.reduce((a,b)=>a^b,0)===target) rows.push(bits);
  }
  return rows;
}

function directTreeEligibility(model,targetId){
  const {relevant,counts}=usageCounts(model,targetId);
  const supported=new Set(['INPUT','CONST0','CONST1','AND','OR','XOR','NOT','COPY']);
  const map=byId(model);
  if([...relevant].some(id=>!supported.has(map.get(id)?.type))) return false;
  return ![...counts.values()].some(count=>count>1);
}

export function compileCausalGoalWithCrystals({model,goal,crystals=[]}={}){
  if(!goal||typeof goal!=='object'||Array.isArray(goal)||Object.keys(goal).length!==1||!Array.isArray(crystals)){
    return envelope({ok:false,status:'CAUSAL_CRYSTAL_GOAL_INVALID',reasonCodes:['single-target-goal-model-and-crystals-required']});
  }
  const [targetId,desiredRaw]=Object.entries(goal)[0];
  if(!directTreeEligibility(model,targetId)){
    const fallback=compileCausalGoalV2({model,goal});
    return envelope({...fallback,crystalFallback:true,crystalMatches:0});
  }
  const matches=matchesByNode(model,targetId,crystals);
  const map=byId(model);
  const controllable=new Set(model.controllableIds||[]);
  const metrics={goalStatesExpanded:0,planMergesAttempted:0,crystalExpansions:0};
  const memo=new Map();

  function solve(id,wanted){
    const key=`${id}:${wanted}`;
    if(memo.has(key)) return memo.get(key);
    metrics.goalStatesExpanded+=1;
    const node=map.get(id);
    let plans=[];

    const match=matches.get(id);
    if(match){
      metrics.crystalExpansions+=1;
      const table=match.crystal.truthTable;
      for(let mask=0;mask<table.length;mask++){
        if(table[mask]!==wanted) continue;
        const assignment=match.boundaryInputIds.map((inputId,index)=>({inputId,value:(mask>>index)&1}));
        const merged=combineSets(assignment.map(row=>solve(row.inputId,row.value)),metrics);
        plans.push(...merged);
      }
      plans=dedupeMinimum(plans);
      memo.set(key,plans);
      return plans;
    }

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
      plans=wanted===1
        ? combineSets(node.parents.map(parent=>solve(parent,1)),metrics)
        : node.parents.flatMap(parent=>solve(parent,0));
    }else if(node.type==='OR'){
      plans=wanted===0
        ? combineSets(node.parents.map(parent=>solve(parent,0)),metrics)
        : node.parents.flatMap(parent=>solve(parent,1));
    }else if(node.type==='XOR'){
      for(const vector of desiredVectors(node.parents.length,wanted)){
        plans.push(...combineSets(node.parents.map((parent,index)=>solve(parent,vector[index])),metrics));
      }
    }
    plans=dedupeMinimum(plans);
    memo.set(key,plans);
    return plans;
  }

  const plans=solve(targetId,bool(desiredRaw));
  if(!plans.length){
    return envelope({
      ok:true,status:'CAUSAL_CRYSTAL_GOAL_UNREACHABLE',satisfiable:false,
      interventionCardinality:null,interventions:null,symbolicWork:metrics,
      fullModelEvaluations:0,crystalMatches:matches.size,crystalFallback:false
    });
  }
  const selected=plans[0];
  const verify=simulateCausalModel({model,interventions:selected});
  if(!verify.ok||verify.values[targetId]!==bool(desiredRaw)){
    return envelope({
      ok:false,status:'CAUSAL_CRYSTAL_FORWARD_VERIFICATION_FAILED',
      reasonCodes:verify.reasonCodes||['compiled-plan-failed-forward-verification'],
      symbolicWork:metrics,crystalMatches:matches.size
    });
  }
  return envelope({
    ok:true,status:'CAUSAL_CRYSTAL_GOAL_COMPILED',satisfiable:true,
    interventionCardinality:planCost(selected),interventions:selected,
    symbolicWork:metrics,fullModelEvaluations:1,crystalMatches:matches.size,
    matchedNodeIds:[...matches.keys()].sort(),crystalFallback:false,
    truthBoundary:'SEMANTIC_CRYSTALS_ARE_EXACT_ONLY_ON_DECLARED_FINITE_BOOLEAN_BOUNDARIES'
  });
}

function motifXorDirect(){
  return {nodes:[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
    {id:'M',type:'XOR',parents:['A','B']}
  ],exogenous:{A:0,B:0},controllableIds:['A','B']};
}
function motifXorExpanded(){
  return {nodes:[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
    {id:'NB',type:'NOT',parents:['B']},{id:'L',type:'AND',parents:['A','NB']},
    {id:'NA',type:'NOT',parents:['A']},{id:'R',type:'AND',parents:['NA','B']},
    {id:'M',type:'OR',parents:['L','R']}
  ],exogenous:{A:0,B:0},controllableIds:['A','B']};
}
function motifAndDirect(){
  return {nodes:[{id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},{id:'M',type:'AND',parents:['A','B']}],exogenous:{A:0,B:0},controllableIds:['A','B']};
}
function motifAndDemorgan(){
  return {nodes:[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
    {id:'NA',type:'NOT',parents:['A']},{id:'NB',type:'NOT',parents:['B']},
    {id:'O',type:'OR',parents:['NA','NB']},{id:'M',type:'NOT',parents:['O']}
  ],exogenous:{A:0,B:0},controllableIds:['A','B']};
}
function motifOrDirect(){
  return {nodes:[{id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},{id:'M',type:'OR',parents:['A','B']}],exogenous:{A:0,B:0},controllableIds:['A','B']};
}
function motifOrDemorgan(){
  return {nodes:[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
    {id:'NA',type:'NOT',parents:['A']},{id:'NB',type:'NOT',parents:['B']},
    {id:'D',type:'AND',parents:['NA','NB']},{id:'M',type:'NOT',parents:['D']}
  ],exogenous:{A:0,B:0},controllableIds:['A','B']};
}

export function frozenTrainingMotifs(){
  return [
    {id:'xor-direct',model:motifXorDirect(),rootId:'M'},
    {id:'xor-expanded',model:motifXorExpanded(),rootId:'M'},
    {id:'and-direct',model:motifAndDirect(),rootId:'M'},
    {id:'and-demorgan',model:motifAndDemorgan(),rootId:'M'},
    {id:'or-direct',model:motifOrDirect(),rootId:'M'},
    {id:'or-demorgan',model:motifOrDemorgan(),rootId:'M'}
  ];
}

function appendHeldOutMotif(nodes,kind){
  nodes.push({id:'A1',type:'COPY',parents:['A']},{id:'B1',type:'COPY',parents:['B']});
  if(kind==='XOR'){
    nodes.push({id:'X0',type:'XOR',parents:['A1','B1']},{id:'N0',type:'NOT',parents:['X0']},{id:'N1',type:'NOT',parents:['N0']},{id:'M',type:'COPY',parents:['N1']});
  }else if(kind==='AND'){
    nodes.push({id:'NA',type:'NOT',parents:['A1']},{id:'NB',type:'NOT',parents:['B1']},{id:'O0',type:'OR',parents:['NA','NB']},{id:'N0',type:'NOT',parents:['O0']},{id:'M',type:'COPY',parents:['N0']});
  }else{
    nodes.push({id:'NA',type:'NOT',parents:['A1']},{id:'NB',type:'NOT',parents:['B1']},{id:'G0',type:'AND',parents:['NA','NB']},{id:'N0',type:'NOT',parents:['G0']},{id:'M',type:'COPY',parents:['N0']});
  }
}

function heldOutCase({kind,targetGate,seed,distractors}){
  const nodes=[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},{id:'C',type:'INPUT',parents:[]}
  ];
  const exogenous={A:seed&1,B:(seed>>1)&1,C:(seed>>2)&1};
  const controllableIds=['A','B','C'];
  for(let i=0;i<distractors;i++){
    const id=`D${i}`;
    nodes.push({id,type:'INPUT',parents:[]});
    exogenous[id]=(seed+i+1)&1;
    controllableIds.push(id);
  }
  appendHeldOutMotif(nodes,kind);
  nodes.push({id:'T',type:targetGate,parents:['M','C']});
  const model={nodes,exogenous,controllableIds};
  const initial=simulateCausalModel({model,interventions:{}});
  return {model,goal:{T:initial.values.T?0:1}};
}

function median(values){
  const x=[...values].sort((a,b)=>a-b);
  if(!x.length) return null;
  const m=Math.floor(x.length/2);
  return x.length%2?x[m]:(x[m-1]+x[m])/2;
}

function negativeMotifs(){
  const nand={nodes:[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
    {id:'D',type:'AND',parents:['A','B']},{id:'M',type:'NOT',parents:['D']}
  ],exogenous:{A:0,B:0},controllableIds:['A','B']};
  const xnor={nodes:[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
    {id:'X',type:'XOR',parents:['A','B']},{id:'M',type:'NOT',parents:['X']}
  ],exogenous:{A:0,B:0},controllableIds:['A','B']};
  const majority={nodes:[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},{id:'C',type:'INPUT',parents:[]},
    {id:'AB',type:'AND',parents:['A','B']},{id:'AC',type:'AND',parents:['A','C']},
    {id:'BC',type:'AND',parents:['B','C']},{id:'M',type:'OR',parents:['AB','AC','BC']}
  ],exogenous:{A:0,B:0,C:0},controllableIds:['A','B','C']};
  return [
    {id:'nand-negative',model:nand,rootId:'M'},
    {id:'xnor-negative',model:xnor,rootId:'M'},
    {id:'majority3-negative',model:majority,rootId:'M'}
  ];
}

export function runCausalSemanticCrystallizerV1(){
  const crystalResult=crystallizeSemanticCausalOperators({motifs:frozenTrainingMotifs(),minimumDistinctSyntaxes:2});
  if(!crystalResult.ok) return crystalResult;
  const crystals=crystalResult.crystals;

  const negatives=negativeMotifs().map(raw=>{
    const desc=describeCausalMotif(raw);
    const matched=crystals.some(c=>c.semanticSignature===desc.motif.semanticSignature);
    return {id:raw.id,semanticSignature:desc.motif.semanticSignature,wrongCrystalMatched:matched};
  });

  const rows=[];
  let caseIndex=0;
  for(const kind of ['XOR','AND','OR']){
    for(const targetGate of ['AND','OR','XOR']){
      for(const seed of [1,3]){
        for(const distractors of [4,8]){
          const c=heldOutCase({kind,targetGate,seed,distractors});
          const candidate=compileCausalGoalWithCrystals({model:c.model,goal:c.goal,crystals});
          const baseline=compileCausalGoalV2({model:c.model,goal:c.goal});
          const exhaustive=compileMinimumIntervention({model:c.model,goal:c.goal,mode:'EXHAUSTIVE_ALL_CONTROLS'});
          const exact=
            candidate.ok&&baseline.ok&&exhaustive.ok&&
            candidate.satisfiable===exhaustive.satisfiable&&
            candidate.interventionCardinality===exhaustive.interventionCardinality&&
            baseline.interventionCardinality===exhaustive.interventionCardinality;
          const baseExp=baseline.symbolicWork?.goalStatesExpanded??0;
          const candExp=candidate.symbolicWork?.goalStatesExpanded??0;
          const reduction=baseExp>0?(baseExp-candExp)/baseExp:0;
          rows.push({
            id:`heldout-${String(++caseIndex).padStart(2,'0')}`,
            motifKind:kind,targetGate,seed,distractors,
            exact,
            candidate:{cardinality:candidate.interventionCardinality,satisfiable:candidate.satisfiable,symbolicExpansions:candExp,fullModelEvaluations:candidate.fullModelEvaluations,crystalMatches:candidate.crystalMatches,matchedNodeIds:candidate.matchedNodeIds||[]},
            baseline:{cardinality:baseline.interventionCardinality,satisfiable:baseline.satisfiable,symbolicExpansions:baseExp,fullModelEvaluations:baseline.fullModelEvaluations},
            exhaustive:{cardinality:exhaustive.interventionCardinality,satisfiable:exhaustive.satisfiable,evaluations:exhaustive.evaluations},
            symbolicExpansionReductionFraction:Number(reduction.toFixed(6))
          });
        }
      }
    }
  }

  const exactRate=rows.filter(row=>row.exact).length/rows.length;
  const crystalPrecision=rows.filter(row=>row.candidate.crystalMatches>0).length/rows.length;
  const falseMatchRate=negatives.filter(row=>row.wrongCrystalMatched).length/negatives.length;
  const medianReduction=median(rows.map(row=>row.symbolicExpansionReductionFraction));
  const maxAddedVerification=Math.max(...rows.map(row=>Math.max(0,(row.candidate.fullModelEvaluations||0)-(row.baseline.fullModelEvaluations||0))));
  const success=
    exactRate===1&&
    crystalPrecision===1&&
    falseMatchRate===0&&
    medianReduction>=0.30&&
    maxAddedVerification<=1;

  return envelope({
    ok:true,
    status:success?'CAUSAL_SEMANTIC_CRYSTALLIZER_V1_SUPPORTED__REVIEW_REQUIRED':'CAUSAL_SEMANTIC_CRYSTALLIZER_V1_FALSIFIER_TRIGGERED',
    preregistration:'artifacts/research/CAUSAL_SEMANTIC_CRYSTALLIZER_V1_PREREGISTRATION_20260920.json',
    trainingMotifCount:frozenTrainingMotifs().length,
    crystalCount:crystals.length,
    crystals,
    heldOutCaseCount:rows.length,
    exactMinimumAgreementRate:exactRate,
    crystalMatchRate:crystalPrecision,
    negativeControlFalseMatchRate:falseMatchRate,
    medianSymbolicExpansionReductionFraction:Number(medianReduction.toFixed(6)),
    maximumAdditionalFullModelVerificationEvaluations:maxAddedVerification,
    negativeControls:negatives,
    falsifierTriggered:!success,
    rows,
    promotionCandidate:success?{
      childMechanism:'SEMANTICALLY_VERIFIED_CAUSAL_SUBGRAPH_CRYSTALLIZATION',
      state:'SOFTWARE_DEMONSTRATED',
      authority:'REVIEW_REQUIRED__NO_SELF_PROMOTION'
    }:null,
    claimBoundary:'RESULT_APPLIES_ONLY_TO_EXACT_FINITE_BOOLEAN_BOUNDARY_EQUIVALENCE_AND_DECLARED_HELDOUT_GRAPHS'
  });
}
