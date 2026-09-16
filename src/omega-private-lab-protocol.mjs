import { ZERO_EFFECTS, POLICIES, digest, normalizeProblem, solveProblem, verifyAssignment } from './omega-private-lab-core.mjs';

export const OMEGA_PRIVATE_LAB_PROTOCOL_VERSION='uberbond.omega-private-lab-protocol.v1';
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS},...extra});
const fail=(...r)=>envelope({ok:false,status:'OMEGA_PRIVATE_LAB_PROTOCOL_REFUSED',version:OMEGA_PRIVATE_LAB_PROTOCOL_VERSION,reasonCodes:[...new Set(r.flat().filter(Boolean))]});
const hex64=v=>/^[a-f0-9]{64}$/.test(String(v??''));

export function commitHoldout({tasks=[],salt}={}){
  if(!Array.isArray(tasks)||!tasks.length||tasks.length>512) return fail('tasks-required');
  const normalized=tasks.map(normalizeProblem); if(normalized.some(x=>!x)) return fail('invalid-task');
  const s=String(salt??''); if(s.length<16) return fail('salt-too-short');
  const taskHashes=normalized.map(t=>digest(t));
  const commitment=digest({salt:s,taskHashes});
  return envelope({ok:true,status:'OMEGA_HOLDOUT_COMMITTED',version:OMEGA_PRIVATE_LAB_PROTOCOL_VERSION,commitment,taskCount:normalized.length,taskHashesDigest:digest(taskHashes),truthBoundary:'This commitment proves later reveal integrity only. Secrecy depends on keeping task payloads and salt outside the learner path until evaluation.'});
}

export function verifyHoldoutReveal({commitment,tasks=[],salt}={}){
  if(!hex64(commitment)) return fail('commitment-required');
  const rebuilt=commitHoldout({tasks,salt}); if(!rebuilt.ok) return rebuilt;
  return envelope({ok:true,status:'OMEGA_HOLDOUT_REVEAL_VERIFIED',version:OMEGA_PRIVATE_LAB_PROTOCOL_VERSION,valid:rebuilt.commitment===commitment,observedCommitment:rebuilt.commitment,expectedCommitment:commitment});
}

function totalWork(run){ return Number(run?.metrics?.totalWork ?? Number.POSITIVE_INFINITY); }
export function learnPolicyCrystal({sourceTasks=[]}={}){
  if(!Array.isArray(sourceTasks)||sourceTasks.length<2||sourceTasks.length>256) return fail('two-or-more-source-tasks-required');
  const tasks=sourceTasks.map(normalizeProblem); if(tasks.some(x=>!x)) return fail('invalid-source-task');
  const totals=Object.fromEntries(POLICIES.map(p=>[p,0])); const rows=[];
  for(const task of tasks){
    const one={taskHash:digest(task),domain:task.domain,policyWork:{}};
    for(const p of POLICIES){ const run=solveProblem({problem:task,policy:p}); if(!run.ok||!run.verifier?.valid) return fail('source-task-unsolved'); totals[p]+=totalWork(run); one.policyWork[p]=totalWork(run); }
    rows.push(one);
  }
  const selected=[...POLICIES].sort((a,b)=>totals[a]-totals[b]||a.localeCompare(b))[0];
  const core={mechanismClass:'GENERIC_CSP_VARIABLE_ORDERING',selectedPolicy:selected,sourceDomains:[...new Set(tasks.map(t=>t.domain))].sort(),featureContract:policyFeatureContract(selected),sourceTaskDigest:digest(rows.map(r=>r.taskHash))};
  return envelope({ok:true,status:'OMEGA_POLICY_CRYSTAL_LEARNED',version:OMEGA_PRIVATE_LAB_PROTOCOL_VERSION,crystal:{...core,crystalHash:digest(core),containsAnswers:false,containsTargetTasks:false,promotionAuthority:'NONE'},training:{totals,rows,totalDiscoveryWork:Object.values(totals).reduce((a,b)=>a+b,0)},truthBoundary:'The learner selects only among a fixed declared policy portfolio. This is policy selection, not open-ended algorithm invention.'});
}

function policyFeatureContract(policy){
  if(policy==='HIGH_DEGREE'||policy==='LOW_DEGREE') return ['constraintDegree'];
  if(policy==='HIGH_WEIGHTED_DEGREE') return ['constraintDegree','constraintTypeWeights'];
  if(policy==='SMALL_DOMAIN') return ['domainSize','constraintDegree'];
  if(policy==='ACTIVE_PRESSURE') return ['constraintDegree','assignedConstraintPressure'];
  if(policy==='FAIL_FIRST') return ['domainSize','partialFeasibility'];
  return ['stableIdentifier'];
}

export function discoverStructuralAdapter({crystal,targetTask}={}){
  if(!crystal?.crystalHash||crystal.mechanismClass!=='GENERIC_CSP_VARIABLE_ORDERING') return fail('policy-crystal-required');
  const task=normalizeProblem(targetTask); if(!task) return fail('valid-target-task-required');
  const available=new Set(['constraintDegree','constraintTypeWeights','domainSize','stableIdentifier','assignedConstraintPressure','partialFeasibility']);
  const missing=(crystal.featureContract??[]).filter(f=>!available.has(f));
  const sourceSpecific=(crystal.featureContract??[]).some(f=>String(f).startsWith('source:'));
  const core={crystalHash:crystal.crystalHash,targetDomain:task.domain,requiredFeatures:[...(crystal.featureContract??[])],featureBindings:Object.fromEntries((crystal.featureContract??[]).map(f=>[f,`TARGET.${f}`]))};
  return envelope({ok:missing.length===0&&!sourceSpecific,status:missing.length===0&&!sourceSpecific?'OMEGA_STRUCTURAL_ADAPTER_DISCOVERED':'OMEGA_STRUCTURAL_ADAPTER_REFUSED',version:OMEGA_PRIVATE_LAB_PROTOCOL_VERSION,adapter:missing.length===0&&!sourceSpecific?{...core,adapterHash:digest(core),answerFree:true}:null,reasonCodes:[...missing.map(f=>`missing-feature:${f}`),...(sourceSpecific?['source-specific-feature-refused']:[])],truthBoundary:'The adapter proves only that the learned policy depends on generic structural features available in the target representation. It does not prove semantic equivalence of arbitrary domains.'});
}

export function evaluateCommittedTransfer({commitment,tasks=[],salt,crystal,baselinePolicy='INPUT_ORDER'}={}){
  const reveal=verifyHoldoutReveal({commitment,tasks,salt}); if(!reveal.ok||!reveal.valid) return fail('holdout-commitment-mismatch');
  if(!crystal?.crystalHash||!POLICIES.includes(crystal.selectedPolicy)) return fail('policy-crystal-required');
  const normalized=tasks.map(normalizeProblem); const sourceDomains=new Set(crystal.sourceDomains??[]);
  const rows=[]; let coldWork=0, transferWork=0, verifierChecks=0;
  for(const task of normalized){
    const adapter=discoverStructuralAdapter({crystal,targetTask:task}); if(!adapter.ok) return fail('adapter-discovery-failed');
    const cold=solveProblem({problem:task,policy:baselinePolicy}); const transferred=solveProblem({problem:task,policy:crystal.selectedPolicy});
    if(!cold.ok||!transferred.ok||!cold.verifier?.valid||!transferred.verifier?.valid) return fail('target-verification-failed');
    const independent=verifyAssignment({problem:task,assignment:transferred.solution}); verifierChecks++;
    if(!independent.valid) return fail('independent-target-verifier-failed');
    const cw=totalWork(cold), tw=totalWork(transferred); coldWork+=cw; transferWork+=tw;
    rows.push({taskHash:digest(task),domain:task.domain,adapterHash:adapter.adapter.adapterHash,coldWork:cw,transferredWork:tw,reduction:cw-tw,verified:true});
  }
  const targetDomains=[...new Set(normalized.map(t=>t.domain))].sort();
  const novelDomains=targetDomains.filter(d=>!sourceDomains.has(d));
  return envelope({ok:true,status:'OMEGA_COMMITTED_TRANSFER_EVALUATED',version:OMEGA_PRIVATE_LAB_PROTOCOL_VERSION,receipt:{commitment,crystalHash:crystal.crystalHash,selectedPolicy:crystal.selectedPolicy,targetTaskCount:rows.length,targetDomains,novelDomains,rows,coldWork,transferWork,verifiedWorkReduction:coldWork-transferWork,reductionFraction:coldWork>0?(coldWork-transferWork)/coldWork:0,allIndependentlyVerified:verifierChecks===rows.length,passedNarrowCrossAlgebraTransfer:novelDomains.length>0&&transferWork<coldWork},truthBoundary:'A pass is evidence for a generic structural ordering policy on the declared finite-CSP representation. It is not broad semantic transfer or frontier intelligence.'});
}

export function renameProblem(problem,prefix='r'){
  const p=normalizeProblem(problem); if(!p) return null;
  const map=new Map(p.variables.map((v,i)=>[v.id,`${prefix}${i}`]));
  return {id:`${p.id}-renamed`,domain:p.domain,variables:p.variables.map(v=>({id:map.get(v.id),domain:[...v.domain]})),constraints:p.constraints.map(c=>({...c,vars:c.vars.map(v=>map.get(v))})),givens:Object.fromEntries(Object.entries(p.givens).map(([k,v])=>[map.get(k),v]))};
}

export function evaluateRobustness({crystal,tasks=[]}={}){
  if(!crystal?.crystalHash) return fail('crystal-required');
  const rows=[];
  for(const raw of tasks){
    const p=normalizeProblem(raw); if(!p) return fail('invalid-task');
    const renamed=renameProblem(p,`x${rows.length}_`);
    const a=solveProblem({problem:p,policy:crystal.selectedPolicy}); const b=solveProblem({problem:renamed,policy:crystal.selectedPolicy});
    if(!a.ok||!b.ok) return fail('robustness-solve-failed');
    rows.push({originalWork:totalWork(a),renamedWork:totalWork(b),workDelta:Math.abs(totalWork(a)-totalWork(b)),bothVerified:Boolean(a.verifier?.valid&&b.verifier?.valid)});
  }
  const pass=rows.every(r=>r.bothVerified && r.workDelta===0);
  return envelope({ok:true,status:'OMEGA_ROBUSTNESS_EVALUATED',version:OMEGA_PRIVATE_LAB_PROTOCOL_VERSION,passed:pass,rows,truthBoundary:'This robustness check covers identifier renaming only, not arbitrary adversarial distribution shift.'});
}

export function adjudicateAmortization({discoveryWork=0,evaluationReceipts=[]}={}){
  const d=Number(discoveryWork); if(!Number.isFinite(d)||d<0||!Array.isArray(evaluationReceipts)||!evaluationReceipts.length) return fail('valid-discovery-work-and-receipts-required');
  let baseline=0,transfer=0,count=0;
  const trajectory=[];
  for(const receipt of evaluationReceipts){ if(!receipt||!Number.isFinite(receipt.coldWork)||!Number.isFinite(receipt.transferWork)) return fail('invalid-evaluation-receipt'); baseline+=receipt.coldWork;transfer+=receipt.transferWork;count+=receipt.targetTaskCount??0; trajectory.push({tasks:count,baselineWork:baseline,transferExecutionWork:transfer,totalTransferWork:d+transfer,netSavings:baseline-(d+transfer)}); }
  const final=trajectory.at(-1);
  return envelope({ok:true,status:'OMEGA_AMORTIZATION_ADJUDICATED',version:OMEGA_PRIVATE_LAB_PROTOCOL_VERSION,discoveryWork:d,trajectory,breakEvenReached:trajectory.some(x=>x.netSavings>0),final,truthBoundary:'Positive amortization means repeated reuse repaid measured discovery work in this declared operation-count model. It is not a hardware energy or dollar cost claim.'});
}
