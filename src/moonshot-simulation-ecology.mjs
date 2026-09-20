import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_SIMULATION_ECOLOGY_VERSION='uberbond.moonshot-simulation-ecology.v1';

export const SIMULATION_EFFECT_OPS=Object.freeze(['ADD','MULTIPLY','SET','MIN','MAX']);
export const SIMULATION_CONDITION_OPS=Object.freeze(['LT','LTE','GT','GTE','EQ','NEQ']);

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const fail=(status,reasons,extra={})=>envelope({
  ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});

const text=(value,max=240)=>{
  const out=String(value??'').trim();
  return out&&out.length<=max?out:null;
};
const number=value=>{
  const n=Number(value);
  return Number.isFinite(n)&&Math.abs(n)<=1e12?n:null;
};

function normalizeState(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const keys=Object.keys(raw);
  if(keys.length===0||keys.length>64) return null;
  const out={};
  for(const key of keys.sort()){
    const k=text(key,80),v=number(raw[key]);
    if(!k||v==null) return null;
    out[k]=v;
  }
  return out;
}

function normalizeEffects(raw=[]){
  if(!Array.isArray(raw)||raw.length>128) return null;
  const out=[];
  for(const [index,effect] of raw.entries()){
    const key=text(effect?.key,80);
    const op=String(effect?.op||'').toUpperCase();
    const value=number(effect?.value);
    if(!key||!SIMULATION_EFFECT_OPS.includes(op)||value==null) return null;
    out.push({key,op,value,index});
  }
  return out;
}

function normalizeConditions(raw=[]){
  if(!Array.isArray(raw)||raw.length>64) return null;
  const out=[];
  for(const condition of raw){
    const key=text(condition?.key,80);
    const op=String(condition?.op||'').toUpperCase();
    const value=number(condition?.value);
    if(!key||!SIMULATION_CONDITION_OPS.includes(op)||value==null) return null;
    out.push({key,op,value});
  }
  return out;
}

function conditionHolds(state,c){
  const actual=state[c.key];
  if(actual==null) return false;
  if(c.op==='LT') return actual<c.value;
  if(c.op==='LTE') return actual<=c.value;
  if(c.op==='GT') return actual>c.value;
  if(c.op==='GTE') return actual>=c.value;
  if(c.op==='EQ') return actual===c.value;
  if(c.op==='NEQ') return actual!==c.value;
  return false;
}

function applyEffect(state,effect){
  const current=state[effect.key];
  if(current==null) throw new Error(`unknown-state-key:${effect.key}`);
  let next=current;
  if(effect.op==='ADD') next=current+effect.value;
  else if(effect.op==='MULTIPLY') next=current*effect.value;
  else if(effect.op==='SET') next=effect.value;
  else if(effect.op==='MIN') next=Math.min(current,effect.value);
  else if(effect.op==='MAX') next=Math.max(current,effect.value);
  if(!Number.isFinite(next)||Math.abs(next)>1e12) throw new Error(`state-bound-exceeded:${effect.key}`);
  state[effect.key]=next;
}

function applyEffects(state,effects){
  for(const effect of effects) applyEffect(state,effect);
}

export function compileDeclarativeWorld(raw={}){
  const id=text(raw?.id,160);
  const initialState=normalizeState(raw?.initialState);
  const dynamics=normalizeEffects(raw?.dynamics||[]);
  const terminalConditions=normalizeConditions(raw?.terminalConditions||[]);
  const maxSteps=Number(raw?.maxSteps??100);
  if(!id||!initialState||!dynamics||!terminalConditions||
     !Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>1000){
    return fail('SIMULATION_WORLD_INVALID',['id-state-dynamics-terminal-and-bounded-steps-required']);
  }
  if(!Array.isArray(raw?.actions)||raw.actions.length===0||raw.actions.length>128){
    return fail('SIMULATION_WORLD_INVALID',['one-to-128-actions-required']);
  }
  const actions=[];
  const ids=new Set();
  for(const [index,action] of raw.actions.entries()){
    const actionId=text(action?.id,160);
    const effects=normalizeEffects(action?.effects||[]);
    if(!actionId||!effects||ids.has(actionId)){
      return fail('SIMULATION_WORLD_INVALID',[`action-${index}-invalid-or-duplicate`]);
    }
    for(const effect of effects){
      if(!Object.hasOwn(initialState,effect.key)) return fail('SIMULATION_WORLD_INVALID',[`action-unknown-state-key:${effect.key}`]);
    }
    ids.add(actionId);
    actions.push({id:actionId,effects});
  }
  for(const effect of dynamics){
    if(!Object.hasOwn(initialState,effect.key)) return fail('SIMULATION_WORLD_INVALID',[`dynamics-unknown-state-key:${effect.key}`]);
  }
  for(const condition of terminalConditions){
    if(!Object.hasOwn(initialState,condition.key)) return fail('SIMULATION_WORLD_INVALID',[`terminal-unknown-state-key:${condition.key}`]);
  }
  return envelope({
    ok:true,status:'DECLARATIVE_SIMULATION_WORLD_COMPILED',
    world:{id,initialState,actions,dynamics,terminalConditions,maxSteps},
    executionAuthority:'NONE',
    truthBoundary:'WORLD_IS_A_DECLARED_SYNTHETIC_MODEL__NOT_A_CLAIM_THAT_REALITY_FOLLOWS_ITS_DYNAMICS'
  });
}

export function compileDeclarativePolicy({id,rules=[],defaultActionId}={}){
  const policyId=text(id,160),fallback=text(defaultActionId,160);
  if(!policyId||!fallback||!Array.isArray(rules)||rules.length>128){
    return fail('SIMULATION_POLICY_INVALID',['id-rules-and-default-action-required']);
  }
  const normalized=[];
  for(const [index,rule] of rules.entries()){
    const conditions=normalizeConditions(rule?.conditions||[]);
    const actionId=text(rule?.actionId,160);
    if(!conditions||!actionId) return fail('SIMULATION_POLICY_INVALID',[`rule-${index}-invalid`]);
    normalized.push({conditions,actionId});
  }
  return envelope({
    ok:true,status:'DECLARATIVE_SIMULATION_POLICY_COMPILED',
    policy:{id:policyId,rules:normalized,defaultActionId:fallback},
    executionAuthority:'NONE'
  });
}

function chooseAction(policy,state){
  for(const rule of policy.rules){
    if(rule.conditions.every(c=>conditionHolds(state,c))) return rule.actionId;
  }
  return policy.defaultActionId;
}

export function runDeclarativeSimulation({world,policy,steps}={}){
  if(!world?.id||!policy?.id) return fail('SIMULATION_RUN_INVALID',['compiled-world-and-policy-required']);
  const stepLimit=steps==null?world.maxSteps:Number(steps);
  if(!Number.isSafeInteger(stepLimit)||stepLimit<1||stepLimit>world.maxSteps){
    return fail('SIMULATION_RUN_INVALID',['steps-must-fit-world-bound']);
  }
  const actions=new Map(world.actions.map(a=>[a.id,a]));
  for(const rule of policy.rules){
    if(!actions.has(rule.actionId)) return fail('SIMULATION_RUN_INVALID',[`unknown-policy-action:${rule.actionId}`]);
  }
  if(!actions.has(policy.defaultActionId)) return fail('SIMULATION_RUN_INVALID',[`unknown-default-action:${policy.defaultActionId}`]);

  const state=structuredClone(world.initialState);
  const trace=[];
  const actionCounts={};
  let terminated=false;
  for(let step=0;step<stepLimit;step++){
    const actionId=chooseAction(policy,state);
    const action=actions.get(actionId);
    const before=structuredClone(state);
    try{
      applyEffects(state,action.effects);
      applyEffects(state,world.dynamics);
    }catch(error){
      return fail('SIMULATION_RUN_INVALID',[String(error?.message||error)]);
    }
    actionCounts[actionId]=(actionCounts[actionId]||0)+1;
    trace.push({step:step+1,actionId,before,after:structuredClone(state)});
    if(world.terminalConditions.length&&world.terminalConditions.every(c=>conditionHolds(state,c))){
      terminated=true;
      break;
    }
  }
  return envelope({
    ok:true,status:'DECLARATIVE_SIMULATION_COMPLETED',
    worldId:world.id,policyId:policy.id,stepsExecuted:trace.length,terminated,
    finalState:state,actionCounts,trace,
    simulationOnly:true,networkCalls:0,executionAuthority:'NONE',
    truthBoundary:'SIMULATED_OUTCOME_IS_CONDITIONAL_ON_DECLARED_WORLD_RULES__NOT_FORECAST_OR_REAL_WORLD_EVIDENCE'
  });
}

function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}

export function compileSimulationEcology({
  worlds=[],
  policies=[],
  metricKeys=[],
  score={key:null,direction:'MAX'}
}={}){
  if(!Array.isArray(worlds)||!worlds.length||worlds.length>128||
     !Array.isArray(policies)||!policies.length||policies.length>128||
     worlds.length*policies.length>4096||
     !Array.isArray(metricKeys)||!metricKeys.length||metricKeys.length>32){
    return fail('SIMULATION_ECOLOGY_INVALID',['bounded-world-policy-cross-product-and-metrics-required']);
  }
  const compiledWorlds=[];
  for(const raw of worlds){
    const result=raw?.status==='DECLARATIVE_SIMULATION_WORLD_COMPILED'?raw:compileDeclarativeWorld(raw);
    if(!result.ok) return result;
    compiledWorlds.push(result.world);
  }
  const compiledPolicies=[];
  for(const raw of policies){
    const result=raw?.status==='DECLARATIVE_SIMULATION_POLICY_COMPILED'?raw:compileDeclarativePolicy(raw);
    if(!result.ok) return result;
    compiledPolicies.push(result.policy);
  }
  for(const key of metricKeys){
    if(!compiledWorlds.every(w=>Object.hasOwn(w.initialState,key))) return fail('SIMULATION_ECOLOGY_INVALID',[`metric-key-missing:${key}`]);
  }
  const scoreKey=text(score?.key,80);
  const direction=String(score?.direction||'MAX').toUpperCase();
  if(scoreKey&&!metricKeys.includes(scoreKey)) return fail('SIMULATION_ECOLOGY_INVALID',['score-key-must-be-metric']);
  if(!['MAX','MIN'].includes(direction)) return fail('SIMULATION_ECOLOGY_INVALID',['score-direction-max-or-min']);

  const runs=[];
  for(const world of compiledWorlds){
    for(const policy of compiledPolicies){
      const run=runDeclarativeSimulation({world,policy});
      if(!run.ok) return run;
      runs.push({
        worldId:world.id,policyId:policy.id,stepsExecuted:run.stepsExecuted,
        terminated:run.terminated,metrics:Object.fromEntries(metricKeys.map(key=>[key,run.finalState[key]])),
        actionCounts:run.actionCounts
      });
    }
  }

  const policySummaries=compiledPolicies.map(policy=>{
    const rows=runs.filter(run=>run.policyId===policy.id);
    const metrics={};
    for(const key of metricKeys){
      const values=rows.map(row=>row.metrics[key]);
      metrics[key]={
        mean:Number(mean(values).toFixed(6)),
        min:Math.min(...values),
        max:Math.max(...values)
      };
    }
    let wins=0,ties=0,losses=0;
    if(scoreKey){
      for(const world of compiledWorlds){
        const own=runs.find(run=>run.worldId===world.id&&run.policyId===policy.id).metrics[scoreKey];
        const peers=runs.filter(run=>run.worldId===world.id).map(run=>run.metrics[scoreKey]);
        const best=direction==='MAX'?Math.max(...peers):Math.min(...peers);
        if(own===best){
          const count=peers.filter(v=>v===best).length;
          if(count===1) wins+=1; else ties+=1;
        }else losses+=1;
      }
    }
    return {policyId:policy.id,worldCount:rows.length,metrics,wins,ties,losses};
  });
  if(scoreKey){
    policySummaries.sort((a,b)=>{
      const av=a.metrics[scoreKey].mean,bv=b.metrics[scoreKey].mean;
      return (direction==='MAX'?bv-av:av-bv)||b.wins-a.wins||a.policyId.localeCompare(b.policyId);
    });
  }

  return envelope({
    ok:true,status:'SIMULATION_ECOLOGY_COMPLETED',
    worldCount:compiledWorlds.length,policyCount:compiledPolicies.length,runCount:runs.length,
    metricKeys:[...metricKeys],score:{key:scoreKey,direction},
    runs,policySummaries,
    simulationOnly:true,networkCalls:0,executionAuthority:'NONE',
    law:'SIMULATION_ECOLOGY_COMPARES_POLICIES_ACROSS_MULTIPLE_DECLARED_WORLDS_AND_PRESERVES_COUNTEREXAMPLES',
    truthBoundary:'POLICY_RANKING_IS_SYNTHETIC_AND_CONDITIONAL_ON_THE_DECLARED_WORLDS__IT_IS_NOT_A_FORECAST_OR_REAL_WORLD_POLICY_RECOMMENDATION'
  });
}

export function perturbWorldInitialState({world,variants=[]}={}){
  if(!world?.id||!Array.isArray(variants)||variants.length>256){
    return fail('SIMULATION_PERTURBATION_INVALID',['compiled-world-and-bounded-variants-required']);
  }
  const worlds=[];
  for(const [index,variant] of variants.entries()){
    if(!variant||typeof variant!=='object'||Array.isArray(variant)) return fail('SIMULATION_PERTURBATION_INVALID',[`variant-${index}-object-required`]);
    const next=structuredClone(world);
    next.id=`${world.id}:variant:${index+1}`;
    for(const [key,deltaRaw] of Object.entries(variant)){
      const delta=number(deltaRaw);
      if(delta==null||!Object.hasOwn(next.initialState,key)) return fail('SIMULATION_PERTURBATION_INVALID',[`variant-${index}-invalid-key-or-delta:${key}`]);
      const value=next.initialState[key]+delta;
      if(!Number.isFinite(value)||Math.abs(value)>1e12) return fail('SIMULATION_PERTURBATION_INVALID',[`variant-${index}-state-bound:${key}`]);
      next.initialState[key]=value;
    }
    worlds.push(next);
  }
  return envelope({
    ok:true,status:'SIMULATION_WORLD_NEIGHBORHOOD_READY',worlds,
    truthBoundary:'PERTURBATIONS_ARE_DECLARED_SYNTHETIC_NEIGHBORS__NOT_EMPIRICAL_UNCERTAINTY_DISTRIBUTIONS'
  });
}
