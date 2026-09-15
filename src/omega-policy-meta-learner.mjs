import { ZERO_EFFECTS, POLICIES, digest, normalizeProblem, solveProblem } from './omega-private-lab-core.mjs';

export const OMEGA_POLICY_META_LEARNER_VERSION='uberbond.omega-policy-meta-learner.v2';
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS},...extra});
const fail=(...r)=>envelope({ok:false,status:'OMEGA_POLICY_META_LEARNER_REFUSED',version:OMEGA_POLICY_META_LEARNER_VERSION,reasonCodes:[...new Set(r.flat().filter(Boolean))]});
const TYPES=['neq','eq','lt','sumEq','allDifferent'];
const work=r=>Number(r?.metrics?.totalWork??Number.POSITIVE_INFINITY);

export function extractStructuralFeatures(raw){
  const p=normalizeProblem(raw); if(!p) return null;
  const degree=Object.fromEntries(p.variables.map(v=>[v.id,0]));
  for(const c of p.constraints) for(const v of c.vars) degree[v]++;
  const deg=Object.values(degree), typeCounts=Object.fromEntries(TYPES.map(t=>[t,0]));
  for(const c of p.constraints) typeCounts[c.type]++;
  const n=p.variables.length,m=p.constraints.length;
  const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const features={nVars:n,nConstraints:m,meanDomain:mean(p.variables.map(v=>v.domain.length)),givenFraction:n?Object.keys(p.givens).length/n:0,meanDegree:mean(deg),maxDegree:deg.length?Math.max(...deg):0,degreeStd:deg.length?Math.sqrt(mean(deg.map(x=>(x-mean(deg))**2))):0,meanArity:m?mean(p.constraints.map(c=>c.vars.length)):0,hyperFraction:m?p.constraints.filter(c=>c.vars.length>2).length/m:0};
  for(const t of TYPES) features[`type_${t}`]=m?typeCounts[t]/m:0;
  return features;
}

const FEATURE_KEYS=['nVars','nConstraints','meanDomain','givenFraction','meanDegree','maxDegree','degreeStd','meanArity','hyperFraction',...TYPES.map(t=>`type_${t}`)];
function vector(f,scales){ return FEATURE_KEYS.map(k=>(f[k]??0)/(scales[k]||1)); }
function distance(a,b){ let s=0; for(let i=0;i<a.length;i++)s+=(a[i]-b[i])**2; return Math.sqrt(s); }

export function trainPolicyMetaCrystal({sourceTasks=[],policyBudget=5000}={}){
  if(!Array.isArray(sourceTasks)||sourceTasks.length<6||sourceTasks.length>512) return fail('six-or-more-source-tasks-required');
  if(!Number.isInteger(policyBudget)||policyBudget<100||policyBudget>1000000) return fail('valid-policy-budget-required');
  const tasks=sourceTasks.map(normalizeProblem); if(tasks.some(x=>!x)) return fail('invalid-source-task');
  const examples=[]; let discoveryWork=0;
  for(const task of tasks){
    const scores=[];
    for(const policy of POLICIES.filter(policy=>policy!=='INPUT_ORDER')){ const run=solveProblem({problem:task,policy,maxWork:policyBudget}); const w=work(run); discoveryWork+=w; scores.push({policy,work:w,solved:run.ok===true&&run.verifier?.valid===true,cutoff:run.metrics?.cutoff===true}); }
    const solved=scores.filter(x=>x.solved).sort((a,b)=>a.work-b.work||a.policy.localeCompare(b.policy));
    if(!solved.length) return fail('source-task-unsolved-within-budget');
    examples.push({featureHash:digest(extractStructuralFeatures(task)),features:extractStructuralFeatures(task),bestPolicy:solved[0].policy,bestWork:solved[0].work,domain:task.domain,cutoffPolicies:scores.filter(x=>x.cutoff).map(x=>x.policy)});
  }
  const scales={}; for(const k of FEATURE_KEYS) scales[k]=Math.max(1,...examples.map(e=>Math.abs(e.features[k]??0)));
  const core={featureKeys:FEATURE_KEYS,scales,examples:examples.map(e=>({features:e.features,bestPolicy:e.bestPolicy})),sourceDomains:[...new Set(tasks.map(t=>t.domain))].sort(),k:3,policyBudget};
  return envelope({ok:true,status:'OMEGA_POLICY_META_CRYSTAL_TRAINED',version:OMEGA_POLICY_META_LEARNER_VERSION,crystal:{...core,crystalHash:digest(core),containsAnswers:false,containsTargetTasks:false,promotionAuthority:'NONE'},training:{discoveryWork,examples},truthBoundary:'This meta-crystal learns nearest-neighbor policy selection over a fixed structural solver-policy portfolio and declared structural feature schema. It cannot transfer lexical or input-order shortcuts.'});
}

export function selectPolicyFromMetaCrystal({crystal,targetTask}={}){
  if(!crystal?.crystalHash||!Array.isArray(crystal.examples)||!crystal.examples.length) return fail('meta-crystal-required');
  const task=normalizeProblem(targetTask); if(!task) return fail('valid-target-task-required');
  const f=extractStructuralFeatures(task); const v=vector(f,crystal.scales);
  const neighbors=crystal.examples.map((e,i)=>({i,policy:e.bestPolicy,distance:distance(v,vector(e.features,crystal.scales))})).sort((a,b)=>a.distance-b.distance||a.i-b.i).slice(0,Math.max(1,Math.min(crystal.k??3,crystal.examples.length)));
  const votes=new Map(); for(const n of neighbors){const weight=1/(1e-9+n.distance);votes.set(n.policy,(votes.get(n.policy)||0)+weight);} const selected=[...votes.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
  const adapterCore={featureSchemaHash:digest(crystal.featureKeys),targetFeatureHash:digest(f),selectedPolicy:selected,neighborPolicies:neighbors.map(n=>n.policy)};
  return envelope({ok:true,status:'OMEGA_META_POLICY_SELECTED',version:OMEGA_POLICY_META_LEARNER_VERSION,selectedPolicy:selected,features:f,adapter:{...adapterCore,adapterHash:digest(adapterCore),answerFree:true,usesTargetPortfolioRuns:false,usesIdentifiers:false},neighbors,truthBoundary:'Selection uses target structural features only. No target answer, identifier semantics, target policy tournament, or target verifier result is used to choose the policy.'});
}

export function evaluateMetaTransfer({crystal,targetTasks=[]}={}){
  if(!crystal?.crystalHash) return fail('meta-crystal-required');
  if(!Array.isArray(targetTasks)||!targetTasks.length||targetTasks.length>512) return fail('target-tasks-required');
  const sourceDomains=new Set(crystal.sourceDomains??[]); const rows=[]; let coldWork=0,transferWork=0;
  for(const raw of targetTasks){ const task=normalizeProblem(raw); if(!task) return fail('invalid-target-task'); const selected=selectPolicyFromMetaCrystal({crystal,targetTask:task}); if(!selected.ok)return selected; const cold=solveProblem({problem:task,policy:'INPUT_ORDER'}); const run=solveProblem({problem:task,policy:selected.selectedPolicy}); if(!cold.ok||!run.ok||!cold.verifier?.valid||!run.verifier?.valid)return fail('target-solve-failed'); const cw=work(cold),tw=work(run);coldWork+=cw;transferWork+=tw;rows.push({taskHash:digest(task),domain:task.domain,selectedPolicy:selected.selectedPolicy,adapterHash:selected.adapter.adapterHash,coldWork:cw,transferredWork:tw,reduction:cw-tw,verified:true}); }
  const targetDomains=[...new Set(rows.map(r=>r.domain))].sort(),novelDomains=targetDomains.filter(d=>!sourceDomains.has(d));
  return envelope({ok:true,status:'OMEGA_META_TRANSFER_EVALUATED',version:OMEGA_POLICY_META_LEARNER_VERSION,receipt:{targetCount:rows.length,targetDomains,novelDomains,coldWork,transferWork,reduction:coldWork-transferWork,reductionFraction:coldWork?(coldWork-transferWork)/coldWork:0,improvedTasks:rows.filter(r=>r.reduction>0).length,worsenedTasks:rows.filter(r=>r.reduction<0).length,tiedTasks:rows.filter(r=>r.reduction===0).length,rows,passed:novelDomains.length>0&&transferWork<coldWork},truthBoundary:'A pass is bounded evidence that prior structural experience selected lower-work policies on unseen named domains within the declared finite-CSP super-family. It is not unrestricted cross-domain reasoning.'});
}
