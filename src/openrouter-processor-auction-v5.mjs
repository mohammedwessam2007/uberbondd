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
    if(!q||typeof q!=='object'||!['choice','score','noul'].includes(q.type)||typeof q.id!=='string'||!q.id)throw new Error('typed-jev-question-required');
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


const usdPerToken=(perMillion,tokens)=>perMillion*tokens/1_000_000;

export function estimateDirectOpusUsd({freshInputTokens=0,cachedInputTokens=0,outputTokens=0}={}){
  return usdPerToken(4,freshInputTokens)+usdPerToken(.2,cachedInputTokens)+usdPerToken(20,outputTokens);
}

export function estimateSolThenOpusAcceptUsd({inputTokens=0,builderOutputTokens=0,crownAcceptTokens=6,crownCachedPrefixTokens=0}={}){
  // Sol constructs the full candidate. Opus sees original input + candidate and emits only ACCEPT.
  return usdPerToken(2,inputTokens)+usdPerToken(10,builderOutputTokens)+
    usdPerToken(4,inputTokens+builderOutputTokens)+usdPerToken(.2,crownCachedPrefixTokens)+usdPerToken(20,crownAcceptTokens);
}

export function estimateCompressedFrontierUsd({
  originalInputTokens=0,compressedEvidenceTokens=0,builderOutputTokens=0,redTeamOutputTokens=0,
  crownAcceptTokens=6,crownCachedPrefixTokens=0
}={}){
  // MiMo ingests original material. Sol sees only evidence capsule. DeepSeek audits the candidate.
  // Opus sees evidence capsule + candidate + audit, not an untraceable summary; this estimator is
  // valid as a quality-preserving candidate only when exact source anchors remain retrievable.
  const mimo=usdPerToken(.14,originalInputTokens)+usdPerToken(.28,compressedEvidenceTokens);
  const sol=usdPerToken(2,compressedEvidenceTokens)+usdPerToken(10,builderOutputTokens);
  const deepseek=usdPerToken(.13,compressedEvidenceTokens+builderOutputTokens)+usdPerToken(.52,redTeamOutputTokens);
  const opusInput=compressedEvidenceTokens+builderOutputTokens+redTeamOutputTokens;
  const opus=usdPerToken(4,opusInput)+usdPerToken(.2,crownCachedPrefixTokens)+usdPerToken(20,crownAcceptTokens);
  return mimo+sol+deepseek+opus;
}

export function chooseFreshFrontierPath({
  inputTokens,expectedOutputTokens,compressedEvidenceTokens=null,redTeamOutputTokens=300,crownAcceptTokens=6,
  crownCachedPrefixTokens=0,compressionLosslessContract=false,sourceAnchorsRetained=false
}={}){
  if(!Number.isFinite(inputTokens)||inputTokens<0||!Number.isFinite(expectedOutputTokens)||expectedOutputTokens<0)throw new Error('fresh-path-token-estimates-required');
  const direct=estimateDirectOpusUsd({freshInputTokens:inputTokens,outputTokens:expectedOutputTokens,cachedInputTokens:crownCachedPrefixTokens});
  const sol=estimateSolThenOpusAcceptUsd({inputTokens,builderOutputTokens:expectedOutputTokens,crownAcceptTokens,crownCachedPrefixTokens});
  const candidates=[{path:'DIRECT_OPUS',usd:direct},{path:'SOL_THEN_OPUS_ACCEPT',usd:sol}];
  if(Number.isFinite(compressedEvidenceTokens)&&compressedEvidenceTokens>=0&&compressionLosslessContract===true&&sourceAnchorsRetained===true){
    candidates.push({path:'MIMO_COMPRESS_SOL_DEEPSEEK_OPUS',usd:estimateCompressedFrontierUsd({
      originalInputTokens:inputTokens,compressedEvidenceTokens,builderOutputTokens:expectedOutputTokens,
      redTeamOutputTokens,crownAcceptTokens,crownCachedPrefixTokens
    })});
  }
  candidates.sort((a,b)=>a.usd-b.usd);
  return {
    selected:candidates[0],
    candidates,
    qualityBoundary:'COST_CHOICE_ONLY__FINAL_OPUS_AUTHORITY_OR_VALID_E0_E4_STILL_REQUIRED',
    compressionEligible:compressionLosslessContract===true&&sourceAnchorsRetained===true
  };
}

export function buildGenericJevControlQuestions(){
  return {
    task_shape:{type:'choice',instructions:'Which execution shape best fits the task in state.task?',criteria:{
      short_direct:'Compact request with little source material or preprocessing value',
      source_heavy:'Large source or document set where compression and evidence extraction can reduce downstream context',
      coding:'Software implementation, debugging, code review, or repository work',
      research:'Evidence gathering, comparison, synthesis, or source-sensitive analysis',
      agentic_tool:'Long-horizon workflow that requires tools, browser/computer use, or repeated external actions',
      other:'None of the above dominates'
    }},
    source_compression_value:{type:'score',instructions:'How much can cheap preprocessing reduce expensive downstream context while preserving exact source anchors?',criteria:[
      'Little or no useful reduction',
      'Moderate reduction',
      'Large reduction with exact evidence anchors retained'
    ]},
    independent_challenge:{type:'noul',instructions:'Would an independent model lineage materially improve error detection for this task?'},
    hard_reasoning:{type:'score',instructions:'How difficult is the unresolved reasoning after exact/code/retrieval work is removed?',criteria:[
      'Routine bounded reasoning',
      'Substantial multi-step reasoning',
      'Exceptional hard residual likely to need maximum-effort reasoning'
    ]},
    crown_necessity:{type:'noul',instructions:'Does the task contain material open-ended semantics that cannot be closed by exact code or an already certified bounded circuit?'}
  };
}
