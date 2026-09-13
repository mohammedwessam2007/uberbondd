import crypto from 'node:crypto';

export const ECONOMIC_REPAIR_JOB_VERSION = 'uberbond.economic-repair-job.v1';
const ALLOWED = new Set(['INTERNAL_SOLVABLE','PROVIDER_OR_RAIL','EVIDENCE_REQUIRED','UNKNOWN']);
const FORBIDDEN = new Set(['AUTHORITY_REQUIRED','PROHIBITED_OR_IMPOSSIBLE']);
const text = (v, fallback='') => String(v ?? '').trim() || fallback;
const uniq = values => [...new Set((Array.isArray(values)?values:[]).map(v=>text(v)).filter(Boolean))];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function wallFailureClass(blockerClass){
  return ({
    INTERNAL_SOLVABLE:'IMPLEMENTATION_DEFECT',
    PROVIDER_OR_RAIL:'PROVIDER_FAILURE',
    EVIDENCE_REQUIRED:'MISSING_EVIDENCE',
    UNKNOWN:'UNKNOWN'
  })[blockerClass] || 'UNKNOWN';
}

export function compileEconomicRepairProblem(task={}){
  const blockerClass=text(task.blockerClass || task.class).toUpperCase();
  if(FORBIDDEN.has(blockerClass)) return {ok:false,status:'REPAIR_REFUSED',reasonCodes:['authority-or-prohibited-blocker'],blockerClass};
  if(!ALLOWED.has(blockerClass)) return {ok:false,status:'REPAIR_REFUSED',reasonCodes:['unsupported-blocker-class'],blockerClass};
  const stage=text(task.stage,'UNKNOWN').toUpperCase();
  const actions=uniq(task.actions || (task.action ? [task.action] : []));
  const substitutes=uniq(task.substituteRailIds);
  const problem={
    objective:`Remove ${blockerClass} blocker at economic stage ${stage} for ${text(task.attemptId || task.pathId,'unknown-path')}`,
    successCriteria:[
      `${stage} is independently verified no longer blocked`,
      'no founder authority is widened',
      'no prohibited mechanism is introduced',
      'result is re-evaluated by the wealth/inevitability loop'
    ],
    hardConstraints:['no-authority-bypass','no-prohibited-action','zero-unapproved-spend','preserve-evidence-truth'],
    assumptions:[],
    unknowns:blockerClass==='UNKNOWN' ? [`root cause of ${stage} blocker`] : [],
    requiredCapabilities:[],
    requiredCapabilityAtomIds:[],
    ownerReservedAuthority:['founder-only-actions-remain-founder-only'],
    riskBudget:3,
    maxSpendCents:0,
    maxFounderMinutes:0,
    evidenceRefs:uniq(task.evidenceRefs)
  };
  const candidateMechanisms=[...actions,...substitutes.map(id=>`switch-to-substitute-rail:${id}`)];
  if(!candidateMechanisms.length){
    candidateMechanisms.push(
      blockerClass==='EVIDENCE_REQUIRED' ? `collect-observed-${stage.toLowerCase()}-evidence` :
      blockerClass==='PROVIDER_OR_RAIL' ? `discover-independent-${stage.toLowerCase()}-rail` :
      blockerClass==='INTERNAL_SOLVABLE' ? `repair-${stage.toLowerCase()}-implementation` :
      `instrument-and-classify-${stage.toLowerCase()}`
    );
  }
  const candidates=candidateMechanisms.slice(0,12).map((mechanism,index)=>({
    id:`repair-${stage.toLowerCase()}-${index+1}`,
    family:`economic-${blockerClass.toLowerCase()}-${stage.toLowerCase()}`,
    mechanism,
    requiredCapabilities:[],
    requiredCapabilityAtomIds:[],
    assumptions:[],
    constraintViolations:[],
    evidenceRefs:uniq(task.evidenceRefs),
    reversible:true,
    successProbability:0,
    expectedContributionCents:0,
    costCents:0,
    founderMinutes:0,
    risk:2,
    evidenceStrength:0,
    novelty:2,
    robustness:4
  }));
  const failure={
    failureClass:wallFailureClass(blockerClass),
    candidateId:null,
    failedSignature:null,
    evidenceRefs:uniq(task.evidenceRefs),
    missingCapabilities:[],
    missingCapabilityAtomIds:[],
    safeToRetrySameMechanism:false
  };
  return {ok:true,status:'REPAIR_PROBLEM_READY',blockerClass,stage,problem,candidates,failure,attemptId:text(task.attemptId || task.pathId,'unknown-path')};
}

function dispatchFor(compiled, wallPlan){
  const selected=wallPlan?.selected?.candidate || null;
  if(!selected) return {
    type:'prometheus.agent.task',
    payload:{
      objective:`Find a materially different repair for ${compiled.stage} without widening authority`,
      originAgent:'GPT',
      targetAgent:'CLAUDE_CODE',
      evidenceRefs:compiled.problem.evidenceRefs.length?compiled.problem.evidenceRefs:[`repair:${compiled.attemptId}`],
      requiredOutputs:['repair candidate','evidence','verification result'],
      acceptanceTests:['no authority widening','no spend','materially different mechanism']
    }
  };
  if(compiled.blockerClass==='INTERNAL_SOLVABLE') return {
    type:'prometheus.upgrade.propose',
    payload:{
      problem:compiled.problem.objective,
      evidenceRefs:compiled.problem.evidenceRefs.length?compiled.problem.evidenceRefs:[`repair:${compiled.attemptId}`],
      acceptanceCriteria:compiled.problem.successCriteria,
      rollbackPlan:'revert the bounded repair if verification fails'
    }
  };
  if(compiled.blockerClass==='PROVIDER_OR_RAIL') return {
    type:'prometheus.capability_gap.recompute',
    payload:{reason:`economic-${compiled.stage.toLowerCase()}-provider-or-rail-blocker`,selectedMechanism:selected.mechanism}
  };
  return {
    type:'prometheus.agent.task',
    payload:{
      objective:compiled.blockerClass==='EVIDENCE_REQUIRED'
        ? `Collect the smallest reversible observed evidence needed to verify ${compiled.stage}`
        : `Instrument and classify the unknown ${compiled.stage} blocker`,
      originAgent:'GPT',
      targetAgent:'CLAUDE_CODE',
      evidenceRefs:compiled.problem.evidenceRefs.length?compiled.problem.evidenceRefs:[`repair:${compiled.attemptId}`],
      requiredOutputs:['observed evidence','classification','next bounded action'],
      acceptanceTests:['observed evidence only','no authority widening','no unapproved spend']
    }
  };
}

export async function runEconomicRepairJob({tasks=[],wallbreakerPlanner,enqueueJob,maxRepairs=8,genome=null}={}){
  if(typeof wallbreakerPlanner!=='function') return {ok:false,status:'ECONOMIC_REPAIR_REFUSED',reasonCodes:['wallbreaker-planner-required'],externalEffectAuthority:'NONE'};
  if(typeof enqueueJob!=='function') return {ok:false,status:'ECONOMIC_REPAIR_REFUSED',reasonCodes:['durable-enqueue-required'],externalEffectAuthority:'NONE'};
  const normalized=(Array.isArray(tasks)?tasks:[]).map(compileEconomicRepairProblem);
  const refused=normalized.filter(x=>!x.ok);
  const ready=normalized.filter(x=>x.ok).slice(0,Math.max(1,Math.floor(Number(maxRepairs)||8)));
  const dispatches=[];
  for(const compiled of ready){
    const wallPlan=wallbreakerPlanner({
      problem:compiled.problem,
      candidates:compiled.candidates,
      failures:[compiled.failure],
      genome
    });
    const dispatch=dispatchFor(compiled,wallPlan);
    const idempotencyKey=`economic-repair:${digest({attemptId:compiled.attemptId,stage:compiled.stage,type:dispatch.type,payload:dispatch.payload}).slice(0,24)}`;
    const queued=await enqueueJob(dispatch.type,dispatch.payload,{idempotencyKey});
    dispatches.push({attemptId:compiled.attemptId,stage:compiled.stage,blockerClass:compiled.blockerClass,wallbreakerStatus:wallPlan?.status||null,jobType:dispatch.type,idempotencyKey,queueReceipt:queued?.id||queued?.jobId||null});
  }
  return {
    ok:true,
    version:ECONOMIC_REPAIR_JOB_VERSION,
    status:dispatches.length?'ECONOMIC_REPAIR_DISPATCHED':'NO_AUTONOMOUS_REPAIRS_DISPATCHED',
    requestedTaskCount:Array.isArray(tasks)?tasks.length:0,
    compiledRepairCount:ready.length,
    refusedTaskCount:refused.length,
    dispatchCount:dispatches.length,
    dispatches,
    refused:refused.map(x=>({blockerClass:x.blockerClass,reasonCodes:x.reasonCodes})),
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    capitalDeploymentAuthority:'NONE',
    truthBoundary:'REPAIR_DISPATCHES_ARE_BOUNDED_INTERNAL_JOBS; AUTHORITY_AND_PROHIBITED_BLOCKERS_ARE_REFUSED; DOWNSTREAM_CONSEQUENCE_GATES_STILL_GOVERN_ALL_REAL_WORLD_EFFECTS'
  };
}
