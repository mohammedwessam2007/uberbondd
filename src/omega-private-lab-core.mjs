import crypto from 'node:crypto';

export const OMEGA_PRIVATE_LAB_CORE_VERSION = 'uberbond.omega-private-lab-core.v2';
export const ZERO_EFFECTS = Object.freeze({ providerCalls:0, messages:0, purchases:0, deployments:0, credentialChanges:0, dnsChanges:0, productionMutations:0, spendCents:0 });
const envelope = extra => ({ businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EFFECTS}, ...extra });
const fail = (...reasons) => envelope({ ok:false, status:'OMEGA_PRIVATE_LAB_REFUSED', version:OMEGA_PRIVATE_LAB_CORE_VERSION, reasonCodes:[...new Set(reasons.flat().filter(Boolean))] });
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
export const digest = v => crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

const SUPPORTED = new Set(['neq','eq','lt','sumEq','allDifferent']);
function primitive(v){ return typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)); }
function idOk(v){ return /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(String(v ?? '')); }

export function normalizeProblem(raw = {}) {
  const id = String(raw.id ?? '').trim();
  const domainName = String(raw.domain ?? 'UNSPECIFIED').trim();
  if (!idOk(id) || !domainName) return null;
  if (!Array.isArray(raw.variables) || raw.variables.length < 1 || raw.variables.length > 64) return null;
  const seen = new Set();
  const variables = [];
  for (const rv of raw.variables) {
    const vid = String(rv?.id ?? '').trim();
    if (!idOk(vid) || seen.has(vid) || !Array.isArray(rv?.domain) || !rv.domain.length || rv.domain.length > 64) return null;
    const vals=[]; const keys=new Set();
    for (const v of rv.domain) { if (!primitive(v)) return null; const k=JSON.stringify(v); if(!keys.has(k)){keys.add(k);vals.push(v);} }
    if (!vals.length) return null;
    seen.add(vid); variables.push({id:vid,domain:vals});
  }
  const ids = new Set(variables.map(v=>v.id));
  if (!Array.isArray(raw.constraints)) return null;
  const constraints=[];
  for (const rc of raw.constraints) {
    const type=String(rc?.type ?? '');
    if(!SUPPORTED.has(type)) return null;
    const vars=Array.isArray(rc.vars)?rc.vars.map(String):[];
    if(!vars.length || new Set(vars).size!==vars.length || vars.some(v=>!ids.has(v))) return null;
    if(['neq','eq','lt'].includes(type) && vars.length!==2) return null;
    if(type==='allDifferent' && vars.length<2) return null;
    if(['lt','sumEq'].includes(type)) {
      for(const vid of vars){ if(variables.find(v=>v.id===vid).domain.some(x=>typeof x!=='number'||!Number.isFinite(x))) return null; }
    }
    const c={type,vars:[...vars]};
    if(type==='sumEq'){ const target=Number(rc.target); if(!Number.isFinite(target)) return null; c.target=target; }
    constraints.push(c);
  }
  const givens={};
  for(const [k,v] of Object.entries(raw.givens ?? {})){
    const variable=variables.find(x=>x.id===k); if(!variable || !variable.domain.some(x=>Object.is(x,v))) return null; givens[k]=v;
  }
  return {id,domain:domainName,variables,constraints,givens};
}

export function verifyAssignment({problem:raw, assignment}={}){
  const problem=normalizeProblem(raw);
  if(!problem || !assignment || typeof assignment!=='object' || Array.isArray(assignment)) return fail('problem-and-assignment-required');
  const ids=problem.variables.map(v=>v.id), expected=new Set(ids), keys=Object.keys(assignment);
  const exactKeys=keys.length===ids.length && keys.every(k=>expected.has(k));
  const domainValid=exactKeys && problem.variables.every(v=>v.domain.some(x=>Object.is(x,assignment[v.id])));
  const givensValid=Object.entries(problem.givens).every(([k,v])=>Object.is(assignment[k],v));
  const one = c => {
    const vals=c.vars.map(v=>assignment[v]);
    if(vals.some(v=>v===undefined)) return false;
    if(c.type==='neq') return !Object.is(vals[0],vals[1]);
    if(c.type==='eq') return Object.is(vals[0],vals[1]);
    if(c.type==='lt') return Number(vals[0])<Number(vals[1]);
    if(c.type==='sumEq') return vals.reduce((s,v)=>s+Number(v),0)===c.target;
    if(c.type==='allDifferent') return new Set(vals.map(JSON.stringify)).size===vals.length;
    return false;
  };
  const constraintsValid=exactKeys && domainValid && problem.constraints.every(one);
  return envelope({ok:true,status:'OMEGA_ASSIGNMENT_VERIFIED',version:OMEGA_PRIVATE_LAB_CORE_VERSION,valid:Boolean(exactKeys&&domainValid&&givensValid&&constraintsValid),checks:{exactKeys,domainValid,givensValid,constraintsValid}});
}

function partialFeasible(problem, assignment, metrics){
  const domainMap=new Map(problem.variables.map(v=>[v.id,v.domain]));
  for(const c of problem.constraints){
    metrics.constraintChecks++;
    const assigned=c.vars.filter(v=>assignment[v]!==undefined);
    if(c.type==='neq' && assigned.length===2 && Object.is(assignment[c.vars[0]],assignment[c.vars[1]])) return false;
    if(c.type==='eq' && assigned.length===2 && !Object.is(assignment[c.vars[0]],assignment[c.vars[1]])) return false;
    if(c.type==='lt' && assigned.length===2 && !(Number(assignment[c.vars[0]])<Number(assignment[c.vars[1]]))) return false;
    if(c.type==='allDifferent'){
      const vals=assigned.map(v=>assignment[v]); if(new Set(vals.map(JSON.stringify)).size!==vals.length) return false;
    }
    if(c.type==='sumEq'){
      let fixed=0; const remaining=[];
      for(const v of c.vars){ if(assignment[v]!==undefined) fixed+=Number(assignment[v]); else remaining.push(domainMap.get(v).map(Number)); }
      const min=fixed+remaining.reduce((s,d)=>s+Math.min(...d),0); const max=fixed+remaining.reduce((s,d)=>s+Math.max(...d),0);
      if(c.target<min || c.target>max) return false;
      if(remaining.length===0 && fixed!==c.target) return false;
    }
  }
  return true;
}

function featureTable(problem, assignment){
  const degree=new Map(problem.variables.map(v=>[v.id,0]));
  const weighted=new Map(problem.variables.map(v=>[v.id,0]));
  const weights={neq:1,eq:1,lt:1.5,sumEq:2,allDifferent:2.5};
  for(const c of problem.constraints){ for(const v of c.vars){ degree.set(v,degree.get(v)+1); weighted.set(v,weighted.get(v)+weights[c.type]); } }
  return new Map(problem.variables.map(v=>[v.id,{degree:degree.get(v.id),weightedDegree:weighted.get(v.id),domainSize:v.domain.length,assigned:assignment[v.id]!==undefined} ]));
}

function structuralRoleKeys(problem){
  const index=new Map(problem.variables.map((v,i)=>[v.id,i]));
  let colors=problem.variables.map(v=>digest({domainSize:v.domain.length,incident:problem.constraints.filter(c=>c.vars.includes(v.id)).map(c=>`${c.type}/${c.vars.length}`).sort()}));
  for(let round=0;round<3;round++){
    colors=problem.variables.map((v,i)=>{
      const incident=problem.constraints.filter(c=>c.vars.includes(v.id)).map(c=>({type:c.type,arity:c.vars.length,neighbors:c.vars.filter(x=>x!==v.id).map(x=>colors[index.get(x)]).sort()})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return digest({self:colors[i],incident});
    });
  }
  return new Map(problem.variables.map((v,i)=>[v.id,colors[i]]));
}

export const POLICIES=Object.freeze(['INPUT_ORDER','HIGH_DEGREE','HIGH_WEIGHTED_DEGREE','SMALL_DOMAIN','LOW_DEGREE','ACTIVE_PRESSURE','FAIL_FIRST']);
function chooseVariable(problem, assignment, policy, metrics){
  const remaining=problem.variables.map(v=>v.id).filter(v=>assignment[v]===undefined);
  const features=featureTable(problem,assignment);
  const order=new Map(problem.variables.map((v,i)=>[v.id,i]));
  const roleKeys=structuralRoleKeys(problem);
  const activePressure=new Map();
  const feasibleCount=new Map();
  if(policy==='ACTIVE_PRESSURE'){
    for(const vid of remaining){
      let score=0;
      for(const c of problem.constraints){
        metrics.heuristicChecks++;
        if(!c.vars.includes(vid)) continue;
        const assignedOthers=c.vars.filter(x=>x!==vid && assignment[x]!==undefined).length;
        if(assignedOthers>0) score+=assignedOthers/c.vars.length;
      }
      activePressure.set(vid,score);
    }
  }
  if(policy==='FAIL_FIRST'){
    for(const vid of remaining){
      const variable=problem.variables.find(v=>v.id===vid); let count=0;
      for(const value of variable.domain){
        metrics.heuristicChecks++;
        assignment[vid]=value;
        if(partialFeasible(problem,assignment,metrics)) count++;
        delete assignment[vid];
      }
      feasibleCount.set(vid,count);
    }
  }
  const structuralTie=(a,b)=>roleKeys.get(a).localeCompare(roleKeys.get(b)) || order.get(a)-order.get(b);
  const cmp=(a,b)=>{
    const A=features.get(a), B=features.get(b);
    if(policy==='HIGH_DEGREE') return B.degree-A.degree || structuralTie(a,b);
    if(policy==='HIGH_WEIGHTED_DEGREE') return B.weightedDegree-A.weightedDegree || B.degree-A.degree || structuralTie(a,b);
    if(policy==='SMALL_DOMAIN') return A.domainSize-B.domainSize || B.degree-A.degree || structuralTie(a,b);
    if(policy==='LOW_DEGREE') return A.degree-B.degree || structuralTie(a,b);
    if(policy==='ACTIVE_PRESSURE') return (activePressure.get(b)-activePressure.get(a)) || B.weightedDegree-A.weightedDegree || structuralTie(a,b);
    if(policy==='FAIL_FIRST') return (feasibleCount.get(a)-feasibleCount.get(b)) || B.weightedDegree-A.weightedDegree || structuralTie(a,b);
    return order.get(a)-order.get(b);
  };
  return remaining.sort(cmp)[0];
}

export function solveProblem({problem:raw, policy='INPUT_ORDER', maxWork=Number.POSITIVE_INFINITY}={}){
  const problem=normalizeProblem(raw); if(!problem) return fail('invalid-problem');
  if(!POLICIES.includes(policy)) return fail('unsupported-policy');
  const assignment={...problem.givens};
  const metrics={branches:0,candidateAssignments:0,constraintChecks:0,heuristicChecks:0,verifierChecks:0,cutoff:false,maxAssigned:Object.keys(assignment).length};
  const currentWork=()=>metrics.branches+metrics.candidateAssignments+metrics.constraintChecks+metrics.heuristicChecks+metrics.verifierChecks;
  const visit=()=>{
    if(currentWork()>=maxWork){metrics.cutoff=true;return null;}
    metrics.branches++;
    metrics.maxAssigned=Math.max(metrics.maxAssigned,Object.keys(assignment).length);
    if(!partialFeasible(problem,assignment,metrics)) return null;
    const remaining=problem.variables.filter(v=>assignment[v.id]===undefined);
    if(!remaining.length){ metrics.verifierChecks++; const verdict=verifyAssignment({problem,assignment}); return verdict.valid?{...assignment}:null; }
    const vid=chooseVariable(problem,assignment,policy,metrics); const variable=problem.variables.find(v=>v.id===vid);
    for(const value of variable.domain){ if(currentWork()>=maxWork){metrics.cutoff=true;break;} metrics.candidateAssignments++; assignment[vid]=value; const out=visit(); if(out) return out; delete assignment[vid]; }
    delete assignment[vid]; return null;
  };
  const solution=visit();
  const work=metrics.branches+metrics.candidateAssignments+metrics.constraintChecks+metrics.heuristicChecks+metrics.verifierChecks;
  return envelope({ok:Boolean(solution),status:solution?'OMEGA_PROBLEM_SOLVED':metrics.cutoff?'OMEGA_PROBLEM_CUTOFF':'OMEGA_PROBLEM_UNSOLVED',version:OMEGA_PRIVATE_LAB_CORE_VERSION,solution,metrics:{...metrics,totalWork:work},verifier:solution?verifyAssignment({problem,assignment:solution}):null});
}

export function compileControlledLanguage({id='nl-task',domain='CONTROLLED_NL',text}={}){
  const source=String(text??'').trim(); if(!source) return fail('text-required');
  const lines=source.split(/\n|\./).map(s=>s.trim()).filter(Boolean);
  const vars=new Map(); const constraints=[]; const givens={}; const rejected=[];
  const ensure=(name,domainVals=null)=>{ if(!idOk(name)) return false; if(!vars.has(name)) vars.set(name,{id:name,domain:domainVals??[]}); else if(domainVals) vars.get(name).domain=domainVals; return true; };
  for(const line of lines){
    let m;
    if((m=line.match(/^variables\s+([A-Za-z0-9_, ]+)\s+use\s+values\s+(.+)$/i))){
      const names=m[1].split(',').map(x=>x.trim()).filter(Boolean); const values=m[2].split(',').map(x=>x.trim()).filter(Boolean).map(x=>/^[-+]?\d+(\.\d+)?$/.test(x)?Number(x):x);
      if(!names.length||!values.length||names.some(n=>!ensure(n,values))) rejected.push(line);
    } else if((m=line.match(/^([A-Za-z][\w.:-]*)\s+differs\s+from\s+([A-Za-z][\w.:-]*)$/i))){ ensure(m[1]);ensure(m[2]);constraints.push({type:'neq',vars:[m[1],m[2]]});
    } else if((m=line.match(/^([A-Za-z][\w.:-]*)\s+equals\s+([A-Za-z][\w.:-]*)$/i))){ ensure(m[1]);ensure(m[2]);constraints.push({type:'eq',vars:[m[1],m[2]]});
    } else if((m=line.match(/^([A-Za-z][\w.:-]*)\s+before\s+([A-Za-z][\w.:-]*)$/i))){ ensure(m[1]);ensure(m[2]);constraints.push({type:'lt',vars:[m[1],m[2]]});
    } else if((m=line.match(/^sum\s+of\s+([A-Za-z0-9_, ]+)\s+equals\s+([-+]?\d+(?:\.\d+)?)$/i))){ const names=m[1].split(',').map(x=>x.trim()).filter(Boolean);names.forEach(n=>ensure(n));constraints.push({type:'sumEq',vars:names,target:Number(m[2])});
    } else if((m=line.match(/^all\s+of\s+([A-Za-z0-9_, ]+)\s+are\s+different$/i))){ const names=m[1].split(',').map(x=>x.trim()).filter(Boolean);names.forEach(n=>ensure(n));constraints.push({type:'allDifferent',vars:names});
    } else if((m=line.match(/^given\s+([A-Za-z][\w.:-]*)\s*=\s*(.+)$/i))){ const name=m[1],raw=m[2].trim();ensure(name);givens[name]=/^[-+]?\d+(\.\d+)?$/.test(raw)?Number(raw):raw;
    } else rejected.push(line);
  }
  if(rejected.length) return fail('unparsed-controlled-language-clause');
  const variables=[...vars.values()];
  if(variables.some(v=>!v.domain.length)) return fail('domain-declaration-required-before-relations');
  const problem=normalizeProblem({id,domain,variables,constraints,givens});
  if(!problem) return fail('compiled-problem-invalid');
  return envelope({ok:true,status:'OMEGA_CONTROLLED_LANGUAGE_COMPILED',version:OMEGA_PRIVATE_LAB_CORE_VERSION,problem,sourceHash:digest(source),semanticScope:'CONTROLLED_EXPLICIT_GRAMMAR',truthBoundary:'Compilation is proven only for the declared controlled grammar. It is not evidence of unrestricted natural-language understanding.'});
}

export function canonicalProblemSemantics(problem){
  const p=normalizeProblem(problem); if(!p) return null;
  return stable({variables:p.variables.map(v=>({id:v.id,domain:v.domain})),constraints:p.constraints,givens:p.givens});
}
