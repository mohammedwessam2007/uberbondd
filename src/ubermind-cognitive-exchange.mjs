import { compileFrontierCognitivePlan } from './frontier-cognitive-fabric.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERMIND_COGNITIVE_EXCHANGE_VERSION='uberbond.ubermind-cognitive-exchange.v1';
const ROLES=Object.freeze(['explorer','researcher','specialist','skeptic','falsifier','synthesizer','planner','judge']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const finite=(v,a=0,b=1)=>{const n=Number(v);return Number.isFinite(n)&&n>=a&&n<=b?n:null;};
const text=(v,m=4000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERMIND_BLOCKED',reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

/**
 * Decides how much cognition a mission deserves before choosing suppliers.
 * Reversibility lowers the need for deep deliberation; consequence, uncertainty
 * and founder importance increase it. This prevents "more agents" becoming the
 * objective while leaving actual model selection to Frontier Cognitive Fabric.
 */
export function chooseCognitionTopology({consequence=0,uncertainty=0,reversibility=1,founderImportance=0}={}){
  const c=finite(consequence),u=finite(uncertainty),r=finite(reversibility),f=finite(founderImportance);
  if([c,u,r,f].some(v=>v==null))return fail(['bounded-cognition-stakes-required']);
  const irreversibility=1-r;
  const score=0.32*c+0.27*u+0.23*irreversibility+0.18*f;
  let reasoningTier='FAST',roles=['planner'];
  if(score>=0.25){reasoningTier='STANDARD';roles=['researcher','planner'];}
  if(score>=0.50){reasoningTier='DEEP';roles=['researcher','specialist','skeptic','planner'];}
  if(score>=0.72){reasoningTier='COUNCIL_MAX';roles=['explorer','researcher','specialist','skeptic','falsifier','synthesizer','planner','judge'];}
  return {ok:true,status:'COGNITION_TOPOLOGY_SELECTED',score:Number(score.toFixed(6)),reasoningTier,roles,minimumUsefulRoleCount:roles.length,law:'COGNITION_DEPTH_SCALES_WITH_CONSEQUENCE_UNCERTAINTY_IRREVERSIBILITY_AND_FOUNDER_IMPORTANCE; AGENT_COUNT_IS_NOT_AN_OBJECTIVE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

/**
 * Creates an exchange packet and, when exact runtime evidence is supplied,
 * delegates supplier selection/council construction to the existing Frontier
 * Cognitive Fabric. It never invents profiles, callability or provider rights.
 */
export function compileUberMindExchange({mission={},stakes={},frontier={}}={}){
  const objective=text(mission?.objective,5000),missionId=text(mission?.missionId,160),taskId=text(mission?.taskId,160);
  if(!objective||!missionId||!taskId)return fail(['mission-id-task-id-objective-required']);
  const topology=chooseCognitionTopology(stakes);if(!topology.ok)return topology;
  const task={
    missionId,taskId,objective,
    taskClass:text(mission?.taskClass,160)||'general',role:text(mission?.role,80)||'general',
    dataClass:text(mission?.dataClass,80)||'INTERNAL_NON_SECRET',reasoningTier:topology.reasoningTier,
    requiredTags:Array.isArray(mission?.requiredTags)?mission.requiredTags:[],contextTokenBudget:Number(mission?.contextTokenBudget||32000),
    minCouncilSize:Number(mission?.minCouncilSize||2),maxCouncilSize:Number(mission?.maxCouncilSize||3)
  };
  const hasRuntimeEvidence=Array.isArray(frontier?.profiles)&&frontier.profiles.length>0;
  if(!hasRuntimeEvidence){
    return {ok:true,status:'UBERMIND_TOPOLOGY_READY_RUNTIME_EVIDENCE_REQUIRED',topology,task,roles:topology.roles,runtimePlan:null,truthBoundary:'NO MODEL OR PROVIDER IS INVENTED; SUPPLIER EXECUTION REQUIRES FRONTIER PROFILE + CALLABILITY + PRICING + BENCHMARK EVIDENCE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  }
  const runtimePlan=compileFrontierCognitivePlan({...frontier,task});
  return {ok:runtimePlan.ok===true,status:runtimePlan.ok?'UBERMIND_EXCHANGE_READY':'UBERMIND_RUNTIME_BLOCKED',topology,task,roles:topology.roles,runtimePlan,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...(runtimePlan.ok?{}:{reasonCodes:runtimePlan.reasonCodes||['frontier-runtime-plan-blocked']})};
}

export const UBERMIND_ROLE_VOCABULARY=ROLES;
