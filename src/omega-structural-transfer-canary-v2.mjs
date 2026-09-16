import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_STRUCTURAL_TRANSFER_CANARY_V2 = 'uberbond.omega-structural-transfer-canary.v2';
const envelope = extra => ({ businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const fail = reasonCodes => envelope({ ok:false, status:'OMEGA_STRUCTURAL_TRANSFER_V2_REFUSED', version:OMEGA_STRUCTURAL_TRANSFER_CANARY_V2, reasonCodes:[...new Set(reasonCodes)] });
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalize(raw={}) {
  const id=String(raw.id||'').trim(), domain=String(raw.domain||'').trim();
  const variables=[...new Set((raw.variables||[]).map(String))].sort();
  const labels=[...new Set((raw.labels||[]).map(String))].sort();
  if(!id||!domain||variables.length<2||variables.length>12||labels.length<2)return null;
  const known=new Set(variables), seen=new Set(), conflicts=[];
  for(const edge of raw.conflicts||[]){
    if(!Array.isArray(edge)||edge.length!==2)return null;
    const pair=edge.map(String).sort();
    if(pair[0]===pair[1]||pair.some(v=>!known.has(v)))return null;
    const key=pair.join('|'); if(!seen.has(key)){seen.add(key);conflicts.push(pair);}
  }
  conflicts.sort((a,b)=>a.join('|').localeCompare(b.join('|')));
  const givens={};
  for(const [v,label] of Object.entries(raw.givens||{})){
    if(!known.has(v)||!labels.includes(String(label)))return null;
    givens[v]=String(label);
  }
  return {id,domain,variables,labels,conflicts,givens};
}

const problemHash = p => digest({variables:p.variables,labels:p.labels,conflicts:p.conflicts,givens:p.givens});
const makeAdj = p => { const m=new Map(p.variables.map(v=>[v,new Set()])); for(const [a,b] of p.conflicts){m.get(a).add(b);m.get(b).add(a);} return m; };

export function verifyStructuralAssignment({problem:raw,assignment}={}){
  const p=normalize(raw); if(!p||!assignment||typeof assignment!=='object'||Array.isArray(assignment))return fail(['problem-and-assignment-required']);
  const keys=Object.keys(assignment), expected=new Set(p.variables);
  const exact=keys.length===p.variables.length&&keys.every(k=>expected.has(k));
  const labels=exact&&p.variables.every(v=>p.labels.includes(String(assignment[v])));
  const givens=Object.entries(p.givens).every(([v,x])=>String(assignment[v])===x);
  const conflicts=exact&&p.conflicts.every(([a,b])=>String(assignment[a])!==String(assignment[b]));
  return envelope({ok:true,status:'OMEGA_STRUCTURAL_ASSIGNMENT_VERIFIED',version:OMEGA_STRUCTURAL_TRANSFER_CANARY_V2,valid:Boolean(exact&&labels&&givens&&conflicts),checks:{exact,labels,givens,conflicts}});
}

function solve(p,policy){
  const adj=makeAdj(p), a={...p.givens}, metrics={branches:0,candidates:0};
  const choose=vars=>policy==='HIGH_DEGREE_FIRST'?[...vars].sort((x,y)=>adj.get(y).size-adj.get(x).size||x.localeCompare(y))[0]:policy==='LOW_DEGREE_FIRST'?[...vars].sort((x,y)=>adj.get(x).size-adj.get(y).size||x.localeCompare(y))[0]:[...vars].sort()[0];
  const localValid=v=>p.conflicts.every(([x,y])=>!((x===v||y===v)&&a[x]!==undefined&&a[y]!==undefined&&a[x]===a[y]));
  const visit=()=>{metrics.branches++;const rem=p.variables.filter(v=>a[v]===undefined);if(!rem.length)return verifyStructuralAssignment({problem:p,assignment:a}).valid?{...a}:null;const v=choose(rem);for(const label of p.labels){metrics.candidates++;a[v]=label;if(localValid(v)){const out=visit();if(out)return out;}delete a[v];}return null;};
  const assignment=visit(); return {assignment,metrics,verified:assignment?verifyStructuralAssignment({problem:p,assignment}).valid:false};
}

export function learnStructuralPolicy({sourceProblems=[]}={}){
  if(!Array.isArray(sourceProblems)||sourceProblems.length<2)return fail(['two-source-problems-required']);
  const problems=sourceProblems.map(normalize); if(problems.some(x=>!x))return fail(['invalid-source-problem']);
  const policies=['LEXICAL','HIGH_DEGREE_FIRST','LOW_DEGREE_FIRST'], totals=Object.fromEntries(policies.map(p=>[p,0]));
  for(const problem of problems)for(const policy of policies){const run=solve(problem,policy);if(!run.verified)return fail(['source-unsolved']);totals[policy]+=run.metrics.branches+run.metrics.candidates;}
  const selectedPolicy=[...policies].sort((a,b)=>totals[a]-totals[b]||a.localeCompare(b))[0];
  const core={mechanismClass:'CONFLICT_CSP_VARIABLE_ORDER',selectedPolicy,sourceDomains:[...new Set(problems.map(p=>p.domain))].sort(),trainingProblemHashes:problems.map(problemHash).sort()};
  return envelope({ok:true,status:'OMEGA_STRUCTURAL_POLICY_LEARNED',version:OMEGA_STRUCTURAL_TRANSFER_CANARY_V2,crystal:{...core,crystalHash:digest(core),containsAnswers:false,containsTargetProblems:false,promotionAuthority:'NONE'},sourceEvidence:{totals},truthBoundary:'The learner selects among three declared ordering policies on bounded conflict CSPs only.'});
}

export function evaluateStructuralPolicyTransfer({crystal,targetProblems=[]}={}){
  if(!crystal?.crystalHash||crystal.mechanismClass!=='CONFLICT_CSP_VARIABLE_ORDER')return fail(['structural-crystal-required']);
  const problems=Array.isArray(targetProblems)?targetProblems.map(normalize):[]; if(!problems.length||problems.some(x=>!x))return fail(['valid-target-problems-required']);
  const training=new Set(crystal.trainingProblemHashes||[]), targetHashes=problems.map(problemHash);
  if(targetHashes.some(h=>training.has(h)))return fail(['target-leakage-detected']);
  const rows=[];
  for(const problem of problems){const cold=solve(problem,'LEXICAL'), transferred=solve(problem,crystal.selectedPolicy);if(!cold.verified||!transferred.verified)return fail(['target-verification-failed']);const coldWork=cold.metrics.branches+cold.metrics.candidates, transferredWork=transferred.metrics.branches+transferred.metrics.candidates;rows.push({problemId:problem.id,domain:problem.domain,coldWork,transferredWork,reduction:coldWork-transferredWork});}
  const coldWork=rows.reduce((s,r)=>s+r.coldWork,0), transferredWork=rows.reduce((s,r)=>s+r.transferredWork,0);
  const sourceDomains=new Set(crystal.sourceDomains||[]), targetDomains=[...new Set(problems.map(p=>p.domain))].sort(), domainNovel=targetDomains.every(x=>!sourceDomains.has(x));
  return envelope({ok:true,status:'OMEGA_STRUCTURAL_POLICY_TRANSFER_EVALUATED',version:OMEGA_STRUCTURAL_TRANSFER_CANARY_V2,receipt:{crystalHash:crystal.crystalHash,targetHoldoutHash:digest(targetHashes.slice().sort()),targetDomains,domainNovel,selectedPolicy:crystal.selectedPolicy,rows,coldWork,transferredWork,verifiedWorkReduction:coldWork-transferredWork,verifiedReductionFraction:coldWork? (coldWork-transferredWork)/coldWork:0,passedNarrowTransferCanary:domainNovel&&transferredWork<coldWork},truthBoundary:'A pass is narrow evidence for policy transport between differently named domains sharing the same conflict-CSP algebra. It is not broad semantic transfer, frontier intelligence, ASI, or singularity evidence.'});
}
