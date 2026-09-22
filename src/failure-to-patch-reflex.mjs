import crypto from 'node:crypto';
import { compileConstraintMutationPlan } from './constraint-mutation-engine.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FAILURE_TO_PATCH_REFLEX_VERSION='uberbond.failure-to-patch-reflex.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>text(x,1000)).filter(Boolean))];
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

const RECIPES=Object.freeze([
  {
    id:'restore-required-verification',
    match:r=>/^candidate-required-verification-missing(?::|$)/i.test(r),
    repairMode:'REGENERATE_PROPOSAL',
    sourceHints:['worker proposal compiler','candidate verification manifest'],
    regressionTests:['re-run the exact task-owned acceptance command that was omitted','re-run candidate admission hostile tests'],
    rationale:'The candidate omitted a verification command already owned by the task contract.'
  },
  {
    id:'rebind-exact-base',
    match:r=>/^candidate-base-revision-mismatch$/i.test(r),
    repairMode:'REGENERATE_PROPOSAL',
    sourceHints:['candidate base-revision binding'],
    regressionTests:['assert candidate baseRevision equals exact current task base','assert stale-base proposal is rejected'],
    rationale:'A stale proposal must be regenerated on the exact base rather than patched onto the wrong tree.'
  },
  {
    id:'rebind-task-identity',
    match:r=>/^candidate-task-identity-mismatch$/i.test(r),
    repairMode:'REGENERATE_PROPOSAL',
    sourceHints:['candidate task identity binding'],
    regressionTests:['assert candidate taskId equals task taskId','assert foreign-task proposal is rejected'],
    rationale:'A candidate for another task is not repairable by treating identity drift as implementation content.'
  },
  {
    id:'narrow-consequence-authority',
    match:r=>/^(candidate-local-preparation-only|candidate-business-effect-authority-must-be-none)$/i.test(r),
    repairMode:'REGENERATE_PROPOSAL',
    sourceHints:['candidate consequence-class compiler','candidate authority envelope'],
    regressionTests:['assert consequenceClass remains LOCAL_PREPARATION','assert businessEffectAuthority remains NONE'],
    rationale:'Authority drift must be removed at proposal generation; it is never repaired by widening permission.'
  },
  {
    id:'repair-malformed-change-set',
    match:r=>/^(valid-agent-code-change-set-required|worker-decision-missing|worker-decision-invalid)$/i.test(r),
    repairMode:'REGENERATE_PROPOSAL',
    sourceHints:['AgentCodeChangeSet serializer','worker structured-output contract'],
    regressionTests:['validate AgentCodeChangeSet schema','run malformed-output hostile fixtures'],
    rationale:'Malformed worker output should be regenerated against the typed contract before any sandbox write.'
  }
]);

function matchRecipe(reasonCodes){
  const reasons=uniq(reasonCodes);
  const matched=[];
  const unknown=[];
  for(const reason of reasons){
    const recipe=RECIPES.find(row=>row.match(reason));
    if(recipe) matched.push({reason,recipe});
    else unknown.push(reason);
  }
  if(unknown.length||matched.length===0) return {ok:false,unknown,matched};
  const ids=[...new Set(matched.map(x=>x.recipe.id))];
  if(ids.length!==1) return {ok:false,unknown:[],matched,conflictingRecipeIds:ids};
  return {ok:true,recipe:matched[0].recipe,reasons:matched.map(x=>x.reason)};
}

export function compileFailureToPatchReflex({
  taskId,
  baseRevision,
  relayStatus='CANDIDATE_REJECTED',
  reasonCodes=[],
  evidenceRefs=[],
  priorAttempts=[]
}={}){
  const id=text(taskId,200),base=text(baseRevision,80)?.toLowerCase(),status=text(relayStatus,120)?.toUpperCase();
  const reasons=uniq(reasonCodes);
  if(!id||!base||!/^[a-f0-9]{40}$/.test(base)) return envelope({ok:false,status:'FAILURE_REFLEX_BLOCKED',reasonCodes:['task-id-and-exact-base-required']});
  if(!['CANDIDATE_REJECTED','WORKER_REPAIR_REQUIRED'].includes(status)) return envelope({ok:false,status:'FAILURE_REFLEX_BLOCKED',reasonCodes:['repairable-self-maintainer-status-required']});
  if(!reasons.length) return envelope({ok:false,status:'FAILURE_REFLEX_BLOCKED',reasonCodes:['failure-reason-required']});
  if(!Array.isArray(priorAttempts)||priorAttempts.length>100) return envelope({ok:false,status:'FAILURE_REFLEX_BLOCKED',reasonCodes:['bounded-prior-attempts-required']});

  const signature=digest({status,reasons:[...reasons].sort()}).slice(0,32);
  const match=matchRecipe(reasons);
  const currentAttempt={
    objectiveId:id,
    mechanismId:match.ok?`failure-reflex:${match.recipe.id}`:'failure-reflex:unknown',
    providerId:'uberbond-self-maintainer',
    evidenceRefs:uniq(evidenceRefs),
    failure:{
      failureClass:match.ok?'IMPLEMENTATION_DEFECT':'UNKNOWN',
      implementationError:match.ok,
      failedSignature:signature,
      outcomeUncertain:false
    }
  };
  const history=priorAttempts.map(row=>({
    objectiveId:id,
    mechanismId:text(row?.mechanismId,200)||currentAttempt.mechanismId,
    providerId:text(row?.providerId,200)||'uberbond-self-maintainer',
    evidenceRefs:uniq(row?.evidenceRefs),
    failure:{
      failureClass:text(row?.failureClass,80)||'IMPLEMENTATION_DEFECT',
      implementationError:true,
      failedSignature:text(row?.failedSignature,128)||signature,
      outcomeUncertain:row?.outcomeUncertain===true
    }
  }));
  const mutation=compileConstraintMutationPlan({currentAttempt,history});
  if(!mutation.ok) return envelope({ok:false,status:'FAILURE_REFLEX_BLOCKED',reasonCodes:mutation.reasonCodes||['constraint-mutation-failed']});

  if(!match.ok){
    return envelope({
      ok:true,
      status:'FAILURE_REFLEX_ESCALATION_REQUIRED',
      taskId:id,
      baseRevision:base,
      failureSignature:signature,
      unknownReasonCodes:match.unknown||[],
      conflictingRecipeIds:match.conflictingRecipeIds||[],
      autoPatchEligible:false,
      handoffTarget:'EXISTING_SELF_MAINTAINER_OR_STRONGER_COGNITION',
      mutationPlan:mutation,
      truthBoundary:'UNKNOWN_OR_MIXED_FAILURE_SIGNATURES_NEVER_TRIGGER_AN_AUTOMATIC_PATCH_PROPOSAL.'
    });
  }

  const extractedVerification=reasons
    .map(r=>/^candidate-required-verification-missing:(.+)$/i.exec(r)?.[1])
    .filter(Boolean);
  const requiredTests=uniq([...match.recipe.regressionTests,...extractedVerification]);
  return envelope({
    ok:true,
    status:'FAILURE_REFLEX_PROPOSAL_READY',
    version:FAILURE_TO_PATCH_REFLEX_VERSION,
    taskId:id,
    baseRevision:base,
    failureSignature:signature,
    recognizedReasonCodes:match.reasons,
    recipeId:match.recipe.id,
    repairMode:match.recipe.repairMode,
    autoApply:false,
    autoMerge:false,
    patchAuthority:'NONE',
    handoffTarget:'UBERBOND_SELF_MAINTAINER',
    proposal:{
      objective:`Repair known self-maintainer failure pattern ${match.recipe.id} without widening consequence authority.`,
      rationale:match.recipe.rationale,
      sourceHints:match.recipe.sourceHints,
      requiredTests,
      constraints:{
        exactBaseRevision:base,
        maxFilesTouched:3,
        maxChangedLines:250,
        localPreparationOnly:true,
        networkDuringPatch:false,
        providerCredentialsMounted:false,
        businessEffectAuthority:'NONE'
      }
    },
    mutationPlan:mutation,
    truthBoundary:'THIS_IS_A_BOUNDED_REPAIR_PROPOSAL_FOR_THE_EXISTING_ISOLATED_SELF_MAINTAINER__IT_IS_NOT_A_PATCH_EXECUTION_VERIFICATION_PROMOTION_OR_SUCCESS_RECEIPT.'
  });
}

export function evaluateFailureReflexReplay({cases=[]}={}){
  if(!Array.isArray(cases)||cases.length<1||cases.length>200) return envelope({ok:false,status:'FAILURE_REFLEX_REPLAY_BLOCKED',reasonCodes:['bounded-replay-cases-required']});
  let known=0,correctKnown=0,unknown=0,falseAutomatic=0;
  const rows=[];
  for(const row of cases){
    const result=compileFailureToPatchReflex({
      taskId:row.taskId||'replay-task',
      baseRevision:row.baseRevision||'a'.repeat(40),
      relayStatus:row.relayStatus||'CANDIDATE_REJECTED',
      reasonCodes:row.reasonCodes||[],
      evidenceRefs:row.evidenceRefs||[]
    });
    const expected=String(row.expectedRecipeId||'ESCALATE');
    const observed=result.status==='FAILURE_REFLEX_PROPOSAL_READY'?result.recipeId:'ESCALATE';
    if(expected==='ESCALATE') unknown++; else known++;
    if(expected===observed&&expected!=='ESCALATE') correctKnown++;
    if(expected==='ESCALATE'&&observed!=='ESCALATE') falseAutomatic++;
    rows.push({id:text(row.id,120)||null,expected,observed,ok:expected===observed});
  }
  return envelope({
    ok:true,
    status:'FAILURE_REFLEX_REPLAY_MEASURED',
    caseCount:cases.length,
    knownCaseCount:known,
    unknownCaseCount:unknown,
    knownPatternAccuracy:known?correctKnown/known:null,
    falseAutomaticProposalCount:falseAutomatic,
    frontierEscalationsAvoided:correctKnown,
    rows,
    falsifierTriggered:falseAutomatic>0,
    truthBoundary:'A_FIXED_REPLAY_MEASURES_PATTERN_ROUTING_ONLY__IT_DOES_NOT_PROVE_REAL_PATCH_ACCEPTANCE_REGRESSION_RATE_OR_FRONTIER_SAVINGS.'
  });
}
