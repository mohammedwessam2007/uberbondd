import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileRealityBridgeShellFromPacket } from './moonshot-physical-reality-bridge.mjs';

export const MOONSHOT_BATCH_REALITY_PROGRAM_VERSION='uberbond.moonshot-batch-reality-program.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail=(status,reasons,extra={})=>envelope({
  ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});
const text=(v,max=1000)=>{
  const s=String(v??'').trim();
  return s&&s.length<=max?s:null;
};

function internalProgram(packet){
  return {
    stableId:packet.stableId,
    ordinal:packet.ordinal,
    literalTitle:packet.literalTitle,
    parentRealityState:packet.parentRealityState||'IMAGINED',
    frontierClass:'INTERNAL_EXECUTION',
    realizationSurface:packet.realizationSurface,
    ideaKind:packet.ideaKind,
    verifiedDescendants:Array.isArray(packet.verifiedDescendants)?packet.verifiedDescendants:[],
    programState:'DRAFT_RESEARCH_PROGRAM__ATOMIZATION_REQUIRED',
    claimState:'EVIDENCE_GRADE_ATOMIZATION_REQUIRED',
    hypothesis:null,
    rivalHypothesis:null,
    falsifier:null,
    baseline:null,
    heldOutDesign:null,
    measurement:null,
    requiredAncestors:Array.isArray(packet.requiredAncestorIds)?packet.requiredAncestorIds:[],
    readyAncestors:Array.isArray(packet.readyAncestorIds)?packet.readyAncestorIds:[],
    executionAuthority:'NONE',
    nextAction:'ATOMIZE_LITERAL_SOURCE_INTO_FALSIFIABLE_CLAIMS_THEN_COMPILE_ZERO_EFFECT_OR_BOUNDED_EXPERIMENT',
    truthBoundary:'THIS_SHELL_DOES_NOT_INVENT_A_CLAIM_THE_LITERAL_SOURCE_DID_NOT_STATE__DOMAIN_SPECIFIC_ATOMIZATION_IS_REQUIRED'
  };
}

function externalProgram(packet){
  const shell=compileRealityBridgeShellFromPacket(packet);
  if(!shell.ok) return shell;
  return {
    stableId:packet.stableId,
    ordinal:packet.ordinal,
    literalTitle:packet.literalTitle,
    parentRealityState:packet.parentRealityState||'IMAGINED',
    frontierClass:'EXTERNAL_REALITY',
    realizationSurface:packet.realizationSurface,
    ideaKind:packet.ideaKind,
    verifiedDescendants:Array.isArray(packet.verifiedDescendants)?packet.verifiedDescendants:[],
    programState:'EXTERNAL_REALITY_BRIDGE_SHELL_READY',
    adapterClass:shell.adapterClass,
    measurementSpecificationState:shell.measurementSpecificationState,
    interventionSpecificationState:shell.interventionSpecificationState,
    authorityState:shell.authorityState,
    consentState:shell.consentState,
    specialistProtocolState:shell.specialistProtocolState,
    riskState:shell.riskState,
    proofRouting:shell.proofRouting,
    executionAuthority:'NONE',
    nextAction:shell.nextAction,
    truthBoundary:shell.truthBoundary
  };
}

export function compileAllMoonshotExecutionPrograms({
  closureState
}={}){
  const packets=Array.isArray(closureState?.packets)?closureState.packets:[];
  const closure=closureState?.closure||{};
  const reasons=[];
  if(packets.length!==890) reasons.push('exact-890-closure-packets-required');
  if(Number(closure.internalSharedBlockerCount)!==0) reasons.push('internal-shared-blockers-must-be-zero');
  if(Number(closure.ancestorFrontierCount)!==0) reasons.push('ancestor-frontier-must-be-zero');
  if(reasons.length) return fail('MOONSHOT_BATCH_PROGRAM_INVALID',reasons);

  const programs=[];
  for(const packet of packets){
    if(!text(packet?.stableId,200)||!Number.isSafeInteger(Number(packet?.ordinal))||!text(packet?.literalTitle,500)){
      return fail('MOONSHOT_BATCH_PROGRAM_INVALID',[`invalid-packet:${packet?.stableId||'unknown'}`]);
    }
    if(packet.frontierClass==='INTERNAL_EXECUTION'){
      programs.push(internalProgram(packet));
    }else if(packet.frontierClass==='EXTERNAL_REALITY'){
      const external=externalProgram(packet);
      if(!external.ok && external.status) return external;
      programs.push(external);
    }else{
      return fail('MOONSHOT_BATCH_PROGRAM_INVALID',[`unknown-frontier-class:${packet.stableId}`]);
    }
  }

  programs.sort((a,b)=>a.ordinal-b.ordinal);
  const ids=programs.map(p=>p.stableId);
  const ordinals=programs.map(p=>p.ordinal);
  if(new Set(ids).size!==890||!ordinals.every((v,i)=>v===i+1)){
    return fail('MOONSHOT_BATCH_PROGRAM_INTEGRITY_FAILURE',['exact-unique-contiguous-890-programs-required']);
  }

  const internalPrograms=programs.filter(p=>p.frontierClass==='INTERNAL_EXECUTION');
  const externalPrograms=programs.filter(p=>p.frontierClass==='EXTERNAL_REALITY');
  const adapterCounts={};
  const consentRequired=[];
  const specialistProtocolRequired=[];
  const authorityRequired=[];
  for(const p of externalPrograms){
    adapterCounts[p.adapterClass]=(adapterCounts[p.adapterClass]||0)+1;
    if(p.consentState==='RECORDED_CONSENT_REQUIRED') consentRequired.push(p.stableId);
    if(p.specialistProtocolState==='DOMAIN_SPECIALIST_PROTOCOL_REQUIRED') specialistProtocolRequired.push(p.stableId);
    if(p.authorityState==='EXPLICIT_AUTHORITY_REQUIRED_BEFORE_EFFECTFUL_EXECUTION') authorityRequired.push(p.stableId);
  }

  return envelope({
    ok:true,
    status:'MOONSHOT_890_EXECUTION_PROGRAM_LAYER_READY',
    programCount:programs.length,
    internalProgramCount:internalPrograms.length,
    externalProgramCount:externalPrograms.length,
    adapterCounts,
    consentRequiredCount:consentRequired.length,
    specialistProtocolRequiredCount:specialistProtocolRequired.length,
    authorityRequiredCount:authorityRequired.length,
    programs,
    law:'EVERY_MOONSHOT_HAS_ONE_EXECUTION_PROGRAM_SHELL__SHELLS_PRESERVE_UNKNOWN_DOMAIN_DETAILS_INSTEAD_OF_HALLUCINATING_THEM',
    completionBoundary:'PROGRAM_LAYER_COMPLETE_DOES_NOT_MEAN_EXPERIMENTS_RUN_OR_PARENTS_REALIZED'
  });
}

export function selectNextExecutableProgram({
  programs=[],
  excludeStableIds=[]
}={}){
  if(!Array.isArray(programs)||!Array.isArray(excludeStableIds)){
    return fail('MOONSHOT_PROGRAM_SELECTION_INVALID',['programs-and-exclusions-required']);
  }
  const excluded=new Set(excludeStableIds.map(String));
  const internal=programs
    .filter(p=>p.frontierClass==='INTERNAL_EXECUTION'&&!excluded.has(p.stableId))
    .sort((a,b)=>{
      const aState=a.parentRealityState==='IMAGINED'?1:0;
      const bState=b.parentRealityState==='IMAGINED'?1:0;
      return aState-bState||a.ordinal-b.ordinal;
    });
  const selected=internal[0]||null;
  return envelope({
    ok:Boolean(selected),
    status:selected?'NEXT_INTERNAL_MOONSHOT_PROGRAM_SELECTED':'NO_UNEXCLUDED_INTERNAL_PROGRAM',
    selected,
    executionAuthority:'NONE',
    law:'SELECTION_CHOOSES_WHAT_TO_ATOMIZE_NEXT__IT_DOES_NOT_CREATE_CLAIMS_EVIDENCE_OR_EXTERNAL_AUTHORITY'
  });
}
