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

export function estimateJevControlUsd({sharedStateTokens=0,inputUsdPerMillion=.042}={}){
  if(!Number.isFinite(sharedStateTokens)||sharedStateTokens<0)throw new Error('jev-shared-state-tokens-required');
  if(!Number.isFinite(inputUsdPerMillion)||inputUsdPerMillion<0)throw new Error('jev-input-tariff-required');
  return usdPerToken(inputUsdPerMillion,sharedStateTokens);
}

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

export function estimateFusedMimoFrontierUsd({
  originalInputTokens=0,compressedEvidenceTokens=0,candidateOutputTokens=0,redTeamOutputTokens=0,
  crownAcceptTokens=6,crownCachedPrefixTokens=0,includeIndependentCritic=true
}={}){
  // One MiMo pass ingests the original source and emits BOTH:
  // 1) the exact-anchored evidence capsule and 2) the complete candidate.
  // This removes the separate Sol-builder call. Final semantic authority remains Opus.
  // JEV may suppress the optional independent critic when its value-of-information is low;
  // it may NOT suppress the Crown for fresh frontier semantics.
  const mimoOutput=compressedEvidenceTokens+candidateOutputTokens;
  const mimo=usdPerToken(.14,originalInputTokens)+usdPerToken(.28,mimoOutput);
  const criticInput=compressedEvidenceTokens+candidateOutputTokens;
  const deepseek=includeIndependentCritic
    ? usdPerToken(.13,criticInput)+usdPerToken(.52,redTeamOutputTokens)
    : 0;
  const opusInput=compressedEvidenceTokens+candidateOutputTokens+(includeIndependentCritic?redTeamOutputTokens:0);
  const opus=usdPerToken(4,opusInput)+usdPerToken(.2,crownCachedPrefixTokens)+usdPerToken(20,crownAcceptTokens);
  return mimo+deepseek+opus;
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
    candidates.push({path:'MIMO_FUSED_EVIDENCE_CANDIDATE_DEEPSEEK_OPUS',usd:estimateFusedMimoFrontierUsd({
      originalInputTokens:inputTokens,compressedEvidenceTokens,candidateOutputTokens:expectedOutputTokens,
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


function routeCost(route,inputTokens,outputTokens){
  if(!route||!Number.isFinite(route.inputUsdPerMillion)||!Number.isFinite(route.outputUsdPerMillion))return Infinity;
  return usdPerToken(route.inputUsdPerMillion,inputTokens)+usdPerToken(route.outputUsdPerMillion,outputTokens);
}

export function estimateWriterThenCrownAcceptUsd({
  writerRoute,crownRoute,inputTokens=0,candidateOutputTokens=0,crownAcceptTokens=6,
  writerCachedInputTokens=0,crownCachedInputTokens=0
}={}){
  if(!writerRoute||!crownRoute)return Infinity;
  const writer=estimateRouteWithCacheUsd({
    route:writerRoute,inputTokens,cachedInputTokens:writerCachedInputTokens,outputTokens:candidateOutputTokens
  });
  const crown=estimateRouteWithCacheUsd({
    route:crownRoute,inputTokens:inputTokens+candidateOutputTokens,
    cachedInputTokens:crownCachedInputTokens,outputTokens:crownAcceptTokens
  });
  return writer+crown;
}

export function cheapestPossibleWriterLowerBound({
  writerRoutes=[],crownRoute,inputTokens=0,candidateOutputTokens=0,crownAcceptTokens=6,
  cachedInputByModel={},crownCachedInputTokens=0
}={}){
  const rows=writerRoutes.filter(Boolean).map(route=>({
    model:route.model,
    usd:estimateWriterThenCrownAcceptUsd({
      writerRoute:route,crownRoute,inputTokens,candidateOutputTokens,crownAcceptTokens,
      writerCachedInputTokens:Number(cachedInputByModel?.[route.model]??0),crownCachedInputTokens
    })
  })).sort((a,b)=>a.usd-b.usd);
  return rows[0]??null;
}

function jevChoice(answers,key){return answers?.[key]?.choice??null;}
function jevScore(answers,key){const x=Number(answers?.[key]?.score);return Number.isFinite(x)?x:null;}
function jevNoul(answers,key){const x=Number(answers?.[key]?.noul);return Number.isFinite(x)?x:null;}

export function chooseAdaptiveCandidateWriter({
  jevAnswers={},availableRoutes={},crownRoute,inputTokens=0,candidateOutputTokens=0,crownAcceptTokens=6,
  cachedInputByModel={},crownCachedInputTokens=0
}={}){
  const shape=jevChoice(jevAnswers,'task_shape')??'other';
  const hard=jevScore(jevAnswers,'hard_reasoning')??1;
  const routes={
    mimo:availableRoutes.mimo??null,
    deepseek:availableRoutes.deepseek??null,
    sol:availableRoutes.sol??null
  };
  const eligible=[];
  if(hard>=2){
    if(routes.sol)eligible.push({id:'sol',route:routes.sol,reason:'JEV_HARD_RESIDUAL'});
  }else if(shape==='coding'){
    if(routes.deepseek)eligible.push({id:'deepseek',route:routes.deepseek,reason:'CODING_DIVERGENT_CED_PRIOR'});
    if(routes.sol)eligible.push({id:'sol',route:routes.sol,reason:'STRONG_BUILDER_FALLBACK'});
  }else if(shape==='source_heavy'||shape==='research'){
    if(routes.mimo)eligible.push({id:'mimo',route:routes.mimo,reason:'CHEAP_LONG_CONTEXT_BANDWIDTH'});
    if(routes.deepseek)eligible.push({id:'deepseek',route:routes.deepseek,reason:'CHEAP_DIVERGENT_LONG_CONTEXT'});
    if(routes.sol)eligible.push({id:'sol',route:routes.sol,reason:'STRONG_BUILDER_FALLBACK'});
  }else if(shape==='agentic_tool'){
    // TypingMind gateway v1 has tools disabled, so do not pretend GLM/other tool agents
    // can execute here. Sol remains the safest text-only candidate writer.
    if(routes.sol)eligible.push({id:'sol',route:routes.sol,reason:'TOOLS_DISABLED_TEXT_ONLY_GATEWAY'});
  }else{
    if(hard<=0&&routes.mimo)eligible.push({id:'mimo',route:routes.mimo,reason:'ROUTINE_CHEAP_DRAFT'});
    if(hard<=1&&routes.deepseek)eligible.push({id:'deepseek',route:routes.deepseek,reason:'ROUTINE_DIVERGENT_DRAFT'});
    if(routes.sol)eligible.push({id:'sol',route:routes.sol,reason:'STRONG_BUILDER_FALLBACK'});
  }
  const priced=eligible.map(row=>({
    ...row,
    usd:estimateWriterThenCrownAcceptUsd({
      writerRoute:row.route,crownRoute,inputTokens,candidateOutputTokens,crownAcceptTokens,
      writerCachedInputTokens:Number(cachedInputByModel?.[row.route.model]??0),crownCachedInputTokens
    })
  })).sort((a,b)=>a.usd-b.usd);
  if(!priced.length)return {selected:null,eligible:[],shape,hard,independentChallenge:jevNoul(jevAnswers,'independent_challenge')};
  return {
    selected:priced[0],
    eligible:priced,
    shape,hard,
    independentChallenge:jevNoul(jevAnswers,'independent_challenge'),
    crownNecessity:jevNoul(jevAnswers,'crown_necessity')
  };
}

export function shouldRunIndependentCritic({jevAnswers={},selectedWriterModel,deepseekModel='deepseek/deepseek-v4.1-flash'}={}){
  const value=jevNoul(jevAnswers,'independent_challenge');
  return Number.isFinite(value)&&value>=0.75&&selectedWriterModel!==deepseekModel;
}

export function exactCriticPolicy({
  independentChallenge=false,errorCorrelationRisk='normal',highStakes=false,writerModel=null,
  criticModel='deepseek/deepseek-v4.1-flash'
}={}){
  if(writerModel&&writerModel===criticModel)return {run:false,reason:'SAME_LINEAGE_NO_INDEPENDENCE_GAIN'};
  if(highStakes===true)return {run:true,reason:'HIGH_STAKES_SECOND_LINEAGE'};
  if(errorCorrelationRisk==='high')return {run:true,reason:'HIGH_ERROR_CORRELATION_RISK'};
  if(independentChallenge===true)return {run:true,reason:'EXPLICIT_INDEPENDENT_CHALLENGE'};
  return {run:false,reason:'EXACT_METADATA_SAYS_OPTIONAL_CRITIC_NOT_REQUIRED'};
}


export function estimateIndependentCriticSurchargeUsd({
  criticRoute,crownRoute,inputTokens=0,candidateOutputTokens=0,criticOutputTokens=600
}={}){
  if(!criticRoute||!crownRoute)return Infinity;
  return routeCost(criticRoute,inputTokens+candidateOutputTokens,criticOutputTokens)+
    usdPerToken(crownRoute.inputUsdPerMillion,criticOutputTokens);
}


export function estimateRouteWithCacheUsd({route,inputTokens=0,cachedInputTokens=0,outputTokens=0}={}){
  if(!route||!Number.isFinite(route.inputUsdPerMillion)||!Number.isFinite(route.outputUsdPerMillion))return Infinity;
  const cached=Math.max(0,Math.min(Number(cachedInputTokens)||0,inputTokens));
  const fresh=Math.max(0,inputTokens-cached);
  return usdPerToken(route.inputUsdPerMillion,fresh)+
    usdPerToken(route.cacheReadUsdPerMillion??route.inputUsdPerMillion,cached)+
    usdPerToken(route.outputUsdPerMillion,outputTokens);
}

export function estimateDirectCrownUsd({crownRoute,inputTokens=0,cachedInputTokens=0,outputTokens=0}={}){
  return estimateRouteWithCacheUsd({route:crownRoute,inputTokens,cachedInputTokens,outputTokens});
}

export function chooseCheapestFusedSourceWorker({
  workerRoutes=[],originalInputTokens=0,compressedEvidenceTokens=0,candidateOutputTokens=0
}={}){
  const outputTokens=compressedEvidenceTokens+candidateOutputTokens;
  const rows=workerRoutes.filter(Boolean).map(route=>({
    model:route.model,
    usd:estimateRouteWithCacheUsd({route,inputTokens:originalInputTokens,outputTokens})
  })).sort((a,b)=>a.usd-b.usd);
  return rows[0]??null;
}
