const VALID_EFFORTS=['low','medium','high','xhigh','max'];

export function chooseSolEffort({stakes='normal',complexity='normal',toolDepth='normal',residualHardness='normal'}={}){
  if(stakes==='high'||residualHardness==='very_high')return 'max';
  if(complexity==='very_high'||toolDepth==='very_high'||residualHardness==='high')return 'xhigh';
  if(complexity==='high'||toolDepth==='high')return 'high';
  if(complexity==='low'&&stakes!=='high')return 'low';
  return 'medium';
}

export function vectorizeJevQuestions(questions=[]){
  if(!Array.isArray(questions)||!questions.length)throw new Error('jev-questions-required');
  const out=[];
  const seen=new Set();
  for(const q of questions){
    if(!q||typeof q!=='object'||!['Choice','Score','Noul'].includes(q.type)||typeof q.id!=='string'||!q.id)throw new Error('typed-jev-question-required');
    if(seen.has(q.id))continue;
    seen.add(q.id);out.push(structuredClone(q));
  }
  return out;
}

export function selectProcessorPlan(task={}){
  const reasons=[];
  const plan=[];

  if(task.exact===true || (['E0','E1','E2','E3','E4'].includes(task.equivalenceClass)&&task.proofVerified===true&&task.dependenciesCurrent===true)){
    return {lane:'EXACT_COMPILED',plan:[{processor:'CODE_OR_E0_E4',authority:'BY_CONSTRUCTION'}],reasons:['VALID_EXACT_OR_E0_E4_PATH'],crownRequired:false};
  }

  if(task.boundedDecision===true && Number.isFinite(task.sharedStateTokens) && task.sharedStateTokens<=32000 && Array.isArray(task.typedQuestions) && task.typedQuestions.length){
    plan.push({processor:'JEV',mode:'MULTI_QUESTION_SHARED_STATE',questions:vectorizeJevQuestions(task.typedQuestions),authority:task.jevCertified===true?'CERTIFIED_BOUNDED':'SHADOW_ONLY'});
    reasons.push('BOUNDED_TYPED_SHARED_STATE_FITS_JEV');
    if(task.jevCertified===true && task.requiresOpenEndedProse!==true && task.requiredQuality!=='Q_FRONTIER'){
      return {lane:'JEV_CERTIFIED',plan,reasons,crownRequired:false};
    }
  }

  const directOpusCheaper = Number.isFinite(task.estimatedDirectOpusUsd) && Number.isFinite(task.estimatedPreworkUsd) && task.estimatedPreworkUsd>=task.estimatedDirectOpusUsd;
  if(directOpusCheaper && task.requiredQuality==='Q_FRONTIER'){
    return {lane:'DIRECT_CROWN',plan:[...plan,{processor:'OPUS_5_5',mode:'DIRECT_CROWN',authority:'CURRENT_CROWN_REQUIRED'}],reasons:[...reasons,'PREWORK_NOT_ECONOMIC'],crownRequired:true};
  }

  if(task.sourceHeavy===true || task.inputTokens>=120000 || task.multimodal===true){
    plan.push({processor:'MIMO_V2_6_FLASH',mode:'INGEST_COMPRESS_STRUCTURE',authority:'PROPOSAL_ONLY'});
    reasons.push('CHEAP_1M_MULTIMODAL_BANDWIDTH_ADVANTAGE');
  }

  if(task.independentChallenge===true || task.errorCorrelationRisk==='high' || task.recurringAgentLoop===true){
    plan.push({processor:'DEEPSEEK_V4_1_FLASH',mode:'DIVERSE_COUNTEREXAMPLE_OR_PERSISTENT_BRANCH',authority:'PROPOSAL_ONLY'});
    reasons.push('INDEPENDENT_SPARSE_CED_BRANCH');
  }

  if(task.longHorizonToolLoop===true || task.browserOrComputerUse===true || task.needThirdLineage===true){
    plan.push({processor:'GLM_5_3_FLASH',mode:'AGENTIC_LONG_CONTEXT_DIVERSITY_BRANCH',authority:'PROPOSAL_ONLY'});
    reasons.push('HYBRID_SPARSE_LINEAR_AGENTIC_BRANCH');
  }

  if(task.wellScopedFeatureOrDocument===true || task.anthropicLineageCheck===true){
    plan.push({processor:'CLAUDE_SONNET_5_5',mode:'MID_TIER_ANTHROPIC_SPECIALIST',authority:'PROPOSAL_ONLY'});
    reasons.push('ANTHROPIC_MID_TIER_SPECIALIST_MAY_SHRINK_OPUS_REWRITE_SURFACE');
  }

  if(task.needsConstructiveAnswer!==false){
    const effort=chooseSolEffort(task);
    plan.push({processor:'GPT_6_1_SOL',mode:'PRIMARY_BUILDER',reasoningEffort:effort,authority:'PROPOSAL_ONLY'});
    reasons.push('PRIMARY_CONSTRUCTIVE_WORK');
  }

  if(task.solResidualUnresolved===true && task.solEffortAttempted==='max' && task.expectedErrorCost==='high'){
    plan.push({processor:'GPT_6_1_SOL_PRO',mode:'HARD_RESIDUAL_ONLY',authority:'PROPOSAL_ONLY'});
    reasons.push('SOL_MAX_LEFT_HIGH_COST_RESIDUAL');
  }

  const frontier=task.requiredQuality==='Q_FRONTIER'||task.highStakes===true||task.irreducibleNovelty===true||task.finalSemanticAuthorityRequired===true;
  if(frontier){
    plan.push({processor:'CLAUDE_OPUS_5_5',mode:'CROWN_DELTA_REVIEW',outputProtocol:['ACCEPT','PATCH','REWRITE','UNRESOLVED'],authority:'CURRENT_CROWN_REQUIRED'});
    reasons.push('IRREDUCIBLE_OR_HIGH_STAKES_SEMANTICS');
  }

  return {
    lane:frontier?'FRONTIER_VM_COMPOSITE':'PREPARATION_ONLY',
    plan,
    reasons,
    crownRequired:frontier,
    antiWaste:{
      stopCheapPreworkWhen:'MARGINAL_INFORMATION_GAIN_NO_LONGER_JUSTIFIES_COST_OR_PREWORK_APPROACHES_DIRECT_CROWN',
      neverUseSolProBefore:'SOL_MAX_OR_EQUIVALENT_HARD_RESIDUAL_EVIDENCE',
      neverUseJevAsOpenEndedAuthority:true
    }
  };
}

export function processorRolesFromConfig(config){
  if(config?.schemaVersion!=='uberbond.openrouter.processor-fabric.v5')throw new Error('processor-fabric-v5-required');
  const p=config.processors??{};
  for(const id of ['jev','mimo','deepseek','glmFlash','sonnet','sol','solPro','opus'])if(!p[id])throw new Error('missing-processor:'+id);
  return {
    control:p.jev.model,
    bandwidth:p.mimo.model,
    divergent:p.deepseek.model,
    agenticDiversity:p.glmFlash.model,
    anthropicMidTier:p.sonnet.model,
    builder:p.sol.model,
    hardResidual:p.solPro.model,
    crown:p.opus.model
  };
}
