import crypto from 'node:crypto';
import { compileSemanticProgram, executeSemanticProgram } from './noetic-autocompiler.mjs';
import { recordSemanticShadowObservation } from './semantic-shadow-ledger.mjs';

export const SYSTEM_ONE_ROUTING_SHADOW_VERSION='uberbond.system-one-routing-shadow.v1';
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

export function compileMechanismRoutingProgram({taskClass='GENERAL'}={}){
  return compileSemanticProgram({
    programId:`uberbond.mechanism-routing.${String(taskClass).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,60)||'general'}.v1`,
    purpose:'Shadow-evaluate the minimum sufficient cognitive mechanism without changing canonical routing.',
    instructions:[
      {
        id:'deterministicSufficient',
        op:'NOUL',
        question:'Can deterministic code resolve this task correctly without semantic or generative model judgement?',
        escalateBelow:0.80
      },
      {
        id:'minimumMechanism',
        op:'CHOICE',
        question:'Which mechanism is the minimum sufficient next cognitive step?',
        criteria:{
          deterministic:'Use deterministic code or an existing exact rule.',
          systemOne:'Use a typed System-One semantic judgement.',
          frontier:'Use deep generative frontier-model reasoning.'
        },
        escalateBelow:0.75
      },
      {
        id:'cognitiveValue',
        op:'SCORE',
        question:'How valuable is spending additional expensive cognition on this task?',
        criteria:['negligible','low','medium','high','critical'],
        escalateBelow:0.65
      }
    ]
  });
}

export async function shadowRouteMechanism({
  task,
  taskClass='GENERAL',
  canonicalRoute=null,
  decisionAdapter,
  runtimeRoot,
  providerCallAuthorized=false,
  spendCeilingUsd=0.001,
  dataClass='UNCLASSIFIED',
  execute=false
}={}){
  const program=compileMechanismRoutingProgram({taskClass});
  if(!program.ok)return program;
  const state={
    taskClass:String(taskClass||'GENERAL').toUpperCase(),
    task:task&&typeof task==='object'?task:{summary:String(task||'').slice(0,2000)},
    canonicalRoute:canonicalRoute&&typeof canonicalRoute==='object'?canonicalRoute:null,
    shadowOnly:true,
    consequenceAuthority:'NONE'
  };
  const result=await executeSemanticProgram({
    program:program.program,
    state,
    decisionAdapter,
    mode:execute?'SHADOW':'PLAN_ONLY',
    providerCallAuthorized:execute&&providerCallAuthorized,
    dataClass,
    spendCeilingUsd
  });
  if(!result?.ok||!execute)return{...result,shadowOnly:true,routingAuthority:'NONE'};
  const receipt=recordSemanticShadowObservation({
    runtimeRoot,
    programId:result.programId,
    programDigest:result.programDigest,
    stateDigest:result.stateDigest||digest(state),
    registers:result.registers,
    escalations:result.escalations,
    providerEvidence:result.providerEvidence,
    taskClass
  });
  return{
    ...result,
    shadowOnly:true,
    routingAuthority:'NONE',
    canonicalRouteChanged:false,
    shadowRecommendation:result.registers?.minimumMechanism?.value||null,
    observationId:receipt.observationId
  };
}
