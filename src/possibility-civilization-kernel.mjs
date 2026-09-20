import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const POSSIBILITY_CIVILIZATION_KERNEL_VERSION='uberbond.possibility-civilization-kernel.v1';

export const POSSIBILITY_TRUTH_STATES=Object.freeze([
  'OBSERVED','REPRODUCED','STRONGLY_SUPPORTED','SUPPORTED_INFERENCE',
  'SIMULATED','HYPOTHESIS','UNKNOWN'
]);

const TRUTH_WEIGHT=Object.freeze({
  OBSERVED:1,
  REPRODUCED:0.95,
  STRONGLY_SUPPORTED:0.85,
  SUPPORTED_INFERENCE:0.65,
  SIMULATED:0.35,
  HYPOTHESIS:0.15,
  UNKNOWN:0
});

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail=(status,reasons,extra={})=>envelope({
  ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});
const text=(v,max=400)=>{
  const s=String(v??'').trim();
  return s&&s.length<=max?s:null;
};
const bounded=(v,min=0,max=1)=>{
  const n=Number(v);
  return Number.isFinite(n)&&n>=min&&n<=max?n:null;
};

function normalizeFuture(raw,index){
  const id=text(raw?.id,200);
  const value=bounded(raw?.value,0,100);
  const reachability=bounded(raw?.reachability,0,1);
  const agency=bounded(raw?.agency,0,1);
  const reversibility=bounded(raw?.reversibility,0,1);
  const truthState=String(raw?.truthState||'UNKNOWN').toUpperCase();
  const consent=raw?.consent===true;
  if(!id||value==null||reachability==null||agency==null||reversibility==null||
     !POSSIBILITY_TRUTH_STATES.includes(truthState)) return null;
  return {
    id,value,reachability,agency,reversibility,truthState,consent,
    protected:raw?.protected===true,
    tags:Array.isArray(raw?.tags)?[...new Set(raw.tags.map(String).filter(Boolean))].slice(0,32):[],
    index
  };
}

export function enforceHumanAuthorityKernel({
  capabilityBefore=[],
  capabilityAfter=[],
  authorityBefore=[],
  authorityAfter=[],
  explicitAuthorityGrants=[]
}={}){
  const capBefore=new Set((Array.isArray(capabilityBefore)?capabilityBefore:[]).map(String));
  const capAfter=new Set((Array.isArray(capabilityAfter)?capabilityAfter:[]).map(String));
  const authBefore=new Set((Array.isArray(authorityBefore)?authorityBefore:[]).map(String));
  const authAfter=new Set((Array.isArray(authorityAfter)?authorityAfter:[]).map(String));
  const grants=new Set((Array.isArray(explicitAuthorityGrants)?explicitAuthorityGrants:[]).map(String));
  const capabilityAdded=[...capAfter].filter(x=>!capBefore.has(x)).sort();
  const authorityAdded=[...authAfter].filter(x=>!authBefore.has(x)).sort();
  const unauthorized=authorityAdded.filter(x=>!grants.has(x));
  return envelope({
    ok:unauthorized.length===0,
    status:unauthorized.length?'HUMAN_AUTHORITY_KERNEL_REFUSED':'HUMAN_AUTHORITY_KERNEL_SATISFIED',
    capabilityAdded,authorityAdded,unauthorizedAuthorityAdded:unauthorized,
    capabilityGrowthPermitted:capabilityAdded.length>=0,
    authorityGrowthPermitted:authorityAdded.length===0||unauthorized.length===0,
    law:'CAPABILITY_MAY_SCALE_WITHOUT_AUTHORITY_SCALING_AUTOMATICALLY',
    truthBoundary:'EXPLICIT_AUTHORITY_GRANT_IS_REQUIRED_FOR_EACH_NEW_AUTHORITY_SCOPE'
  });
}

export function measurePossibilitySet({futures=[]}={}){
  if(!Array.isArray(futures)||futures.length>10000) return fail('POSSIBILITY_SET_INVALID',['bounded-futures-required']);
  const normalized=futures.map(normalizeFuture);
  if(normalized.some(x=>!x)) return fail('POSSIBILITY_SET_INVALID',['every-future-needs-id-value-reachability-agency-reversibility-truth-state']);
  const ids=normalized.map(x=>x.id);
  if(new Set(ids).size!==ids.length) return fail('POSSIBILITY_SET_INVALID',['future-ids-must-be-unique']);

  let weightedReachableValue=0;
  let robustReachableValue=0;
  let reachableCount=0;
  let protectedReachableCount=0;
  for(const f of normalized){
    const truth=TRUTH_WEIGHT[f.truthState];
    const weighted=f.value*f.reachability*truth;
    const robust=weighted*f.agency*f.reversibility;
    weightedReachableValue+=weighted;
    robustReachableValue+=robust;
    if(f.reachability>=0.5){reachableCount+=1;if(f.protected) protectedReachableCount+=1;}
  }
  return envelope({
    ok:true,status:'POSSIBILITY_SET_MEASURED',
    futureCount:normalized.length,
    reachableCount,
    protectedReachableCount,
    weightedReachableValue:Number(weightedReachableValue.toFixed(6)),
    robustReachableValue:Number(robustReachableValue.toFixed(6)),
    futures:normalized,
    metricLaw:'VALUE_X_REACHABILITY_X_TRUTH_X_AGENCY_X_REVERSIBILITY',
    truthBoundary:'THIS_IS_A_DECISION_METRIC_OVER_DECLARED_FUTURES__NOT_A_COMPLETE_MEASURE_OF_HUMAN_VALUE'
  });
}

export function evaluateSovereignFutureKernel({before=[],after=[]}={}){
  const b=measurePossibilitySet({futures:before});
  const a=measurePossibilitySet({futures:after});
  if(!b.ok||!a.ok) return !b.ok?b:a;
  const beforeMap=new Map(b.futures.map(f=>[f.id,f]));
  const afterMap=new Map(a.futures.map(f=>[f.id,f]));
  const involuntaryClosures=[];
  const agencyLosses=[];
  for(const old of b.futures){
    const next=afterMap.get(old.id);
    if(!next){
      if(old.reachability>=0.5&&old.value>0&&!old.consent) involuntaryClosures.push(old.id);
      continue;
    }
    if(old.reachability>=0.5&&next.reachability<0.5&&!next.consent) involuntaryClosures.push(old.id);
    if(next.agency+1e-12<old.agency&&!next.consent) agencyLosses.push(old.id);
  }
  return envelope({
    ok:involuntaryClosures.length===0&&agencyLosses.length===0,
    status:involuntaryClosures.length||agencyLosses.length
      ?'SOVEREIGN_FUTURE_KERNEL_REFUSED'
      :'SOVEREIGN_FUTURE_KERNEL_SATISFIED',
    involuntaryClosures,agencyLosses,
    before:b,after:a,
    law:'FUTURE_BUILDING_EXPANDS_HUMAN_POSSIBILITIES_AND_MUST_NOT_NARROW_THEM_WITHOUT_CONSENT'
  });
}

export function evaluateCivilizationalInvariant({before=[],after=[]}={}){
  const sovereign=evaluateSovereignFutureKernel({before,after});
  if(!sovereign.ok){
    return envelope({
      ok:false,status:'CIVILIZATIONAL_INVARIANT_VIOLATED',
      reasonCodes:['unconsented-loss-of-valuable-future-choice'],
      sovereign
    });
  }
  const delta=sovereign.after.robustReachableValue-sovereign.before.robustReachableValue;
  return envelope({
    ok:true,
    status:delta>=0?'CIVILIZATIONAL_PROGRESS_ADMISSIBLE':'CIVILIZATIONAL_PROGRESS_NOT_ESTABLISHED',
    deltaRobustReachableValue:Number(delta.toFixed(6)),
    chooserCapacityPreserved:true,
    law:'NO_CAPABILITY_GROWTH_COUNTS_AS_PROGRESS_IF_IT_DESTROYS_CAPACITY_TO_CHOOSE_AMONG_VALUABLE_FUTURES'
  });
}

export function evaluatePossibilityConstitution({
  beforeFutures=[],
  afterFutures=[],
  capabilityBefore=[],
  capabilityAfter=[],
  authorityBefore=[],
  authorityAfter=[],
  explicitAuthorityGrants=[]
}={}){
  const authority=enforceHumanAuthorityKernel({
    capabilityBefore,capabilityAfter,authorityBefore,authorityAfter,explicitAuthorityGrants
  });
  const invariant=evaluateCivilizationalInvariant({before:beforeFutures,after:afterFutures});
  const pass=authority.ok&&invariant.ok&&invariant.status==='CIVILIZATIONAL_PROGRESS_ADMISSIBLE';
  return envelope({
    ok:pass,
    status:pass?'POSSIBILITY_CONSTITUTION_SATISFIED':'POSSIBILITY_CONSTITUTION_REFUSED',
    authority,invariant,
    optimizationTarget:'MAXIMIZE_VALUABLE_REACHABLE_FUTURES_SUBJECT_TO_TRUTH_AGENCY_REVERSIBILITY_AND_HUMAN_AUTHORITY',
    law:'TRUTH_AGENCY_REVERSIBILITY_AND_HUMAN_AUTHORITY_ARE_CONSTRAINTS_NOT_TRADEABLE_DECORATIONS'
  });
}

export function measurePossibilityNorthStar({before=[],after=[]}={}){
  const b=measurePossibilitySet({futures:before});
  const a=measurePossibilitySet({futures:after});
  if(!b.ok||!a.ok) return !b.ok?b:a;
  const gained=a.futures.filter(f=>{
    const old=b.futures.find(x=>x.id===f.id);
    return f.reachability>=0.5&&(!old||old.reachability<0.5);
  }).map(f=>f.id);
  const lost=b.futures.filter(f=>{
    const next=a.futures.find(x=>x.id===f.id);
    return f.reachability>=0.5&&(!next||next.reachability<0.5);
  }).map(f=>f.id);
  return envelope({
    ok:true,status:'POSSIBILITY_NORTH_STAR_MEASURED',
    before:{reachableCount:b.reachableCount,robustReachableValue:b.robustReachableValue},
    after:{reachableCount:a.reachableCount,robustReachableValue:a.robustReachableValue},
    delta:{
      reachableCount:a.reachableCount-b.reachableCount,
      robustReachableValue:Number((a.robustReachableValue-b.robustReachableValue).toFixed(6))
    },
    gainedFutureIds:gained.sort(),
    lostFutureIds:lost.sort(),
    northStarQuestion:'HOW_MUCH_MORE_OF_THE_VALUABLE_POSSIBLE_HAS_BECOME_REACHABLE',
    truthBoundary:'A_POSITIVE_DELTA_IS_ONLY_AS_GOOD_AS_THE_DECLARED_FUTURE_SET_AND_ITS_EVIDENCE'
  });
}

export function evaluateMythicCivilizationCycle({
  stageEvidence={},
  beforeFutures=[],
  afterFutures=[],
  constitutionInput={}
}={}){
  const stages=[
    'PERCEIVE_REALITY','MAP_UNKNOWN','INVENT_CONCEPTS','INVENT_MATHEMATICS',
    'INVENT_SCIENCES','DISCOVER_PHENOMENA','DISCOVER_PRIMITIVES','CREATE_CAPABILITIES',
    'CREATE_TECHNOLOGIES','CREATE_SUBSTRATES','CREATE_POSSIBILITY_SPACES',
    'CREATE_CIVILIZATION_STATES','OBSERVE_NEW_STATES','EXPAND_UNKNOWN_AGAIN'
  ];
  const stageStatus=stages.map(stage=>({
    stage,
    evidenceRefs:Array.isArray(stageEvidence?.[stage])?stageEvidence[stage].map(String).filter(Boolean):[],
    evidenced:Array.isArray(stageEvidence?.[stage])&&stageEvidence[stage].length>0
  }));
  const constitution=evaluatePossibilityConstitution({
    beforeFutures,afterFutures,...constitutionInput
  });
  const northStar=measurePossibilityNorthStar({before:beforeFutures,after:afterFutures});
  const evidencedCount=stageStatus.filter(x=>x.evidenced).length;
  return envelope({
    ok:true,
    status:constitution.ok&&evidencedCount===stages.length
      ?'MYTHIC_CIVILIZATION_CYCLE_EVIDENCE_COMPLETE_FOR_DECLARED_CYCLE'
      :'MYTHIC_CIVILIZATION_CYCLE_INCOMPLETE',
    stageStatus,evidencedStageCount:evidencedCount,totalStageCount:stages.length,
    constitution,northStar,
    executionAuthority:'NONE',
    law:'THE_MYTHIC_LOOP_ADVANCES_ONLY_WHEN_EACH_STAGE_HAS_EVIDENCE_AND_THE_RESULT_EXPANDS_POSSIBILITY_WITHOUT_BYPASSING_HUMAN_AUTHORITY',
    truthBoundary:'ONE_EVIDENCED_CYCLE_WOULD_NOT_PROVE_A_SELF_SUSTAINING_CIVILIZATION_OR_GENERAL_INVENTION_ENGINE'
  });
}
