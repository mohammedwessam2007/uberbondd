const NODES = [
  ['world-sensing','SENSORIUM','World Sensing / Public Intelligence','VERIFIED_CURRENT'],
  ['truth-evidence','EVIDENCE_TRUTH','Truth & Evidence Kernel','VERIFIED_CURRENT'],
  ['gamechanger','INTELLIGENCE','Gamechanger Intelligence Mesh','VERIFIED_CURRENT'],
  ['context-spine','CONTEXT_MEMORY','Frontier Context Spine','VERIFIED_CURRENT'],
  ['genesis','IMAGINATION','Perpetual Frontier GENESIS','VERIFIED_CURRENT'],
  ['genesis-evolution','EVOLUTION','Genesis Evolution Engine','VERIFIED_CURRENT'],
  ['genesis-scientist','SCIENCE','Genesis Scientist / Prediction Society','VERIFIED_CURRENT'],
  ['genesis-ontology','ONTOLOGY','Genesis Ontology','VERIFIED_CURRENT'],
  ['genesis-metabolism','METABOLISM','Genesis Metabolism','VERIFIED_CURRENT'],
  ['business-genome','MECHANISM_MEMORY','Business Genome','CHAT_SPEC_GOAL'],
  ['idea-generator','IMAGINATION','Mechanism Lab / Idea Generator','CHAT_SPEC_GOAL'],
  ['opportunity-factory','OPPORTUNITY','Opportunity Factory','CHAT_SPEC_GOAL'],
  ['event-horizon','ECONOMIC_ALLOCATOR','Event Horizon','VERIFIED_CURRENT'],
  ['capability-genome','CAPABILITY_MARKET','World Capability Genome','VERIFIED_CURRENT'],
  ['saas-cannibal','CAPABILITY_ECONOMICS','SaaS Cannibal','CHAT_SPEC_GOAL'],
  ['open-model-universe','MODEL_MARKET','Open Model Universe','VERIFIED_CURRENT'],
  ['world-brain','COGNITIVE_SPINE','Prometheus / World Brain / Cognitive Bus','CHAT_SPEC_GOAL'],
  ['agent-mesh','COORDINATION','Agent Mesh / Trinity Coordination','VERIFIED_CURRENT'],
  ['avengers','SPECIALIST_ORCHESTRATION','Avengers Arsenal','VERIFIED_CURRENT'],
  ['max-council','ADVERSARIAL_COUNCIL','Frontier MAX Council','VERIFIED_CURRENT'],
  ['wallbreaker','PROBLEM_SOLVING','Wallbreaker','VERIFIED_CURRENT'],
  ['self-maintainer','ENGINEERING','Trusted Self-Maintainer','DRAFT_BRANCH'],
  ['omnia','CONSTITUTIONAL_RUNTIME','OMNIA Constitutional Lineage','VERIFIED_CURRENT'],
  ['kilimanjaro','ARCHITECTURE_GOVERNANCE','Kilimanjaro Architecture Closure Law','HISTORICAL_DONOR'],
  ['distribution-os','DISTRIBUTION','Distribution OS / Lead Intelligence','VERIFIED_CURRENT'],
  ['payment-reconciliation','MONEY_TRUTH','Payment / Reconciliation','VERIFIED_CURRENT'],
  ['fulfilment-qa','DELIVERY','Fulfilment / QA / Acceptance','VERIFIED_CURRENT'],
  ['retention-learning','RETENTION','Retention / Renewal / Expansion Learning','CHAT_SPEC_GOAL'],
  ['economic-memory','LEARNING','Economic Memory / Trusted Learning','CHAT_SPEC_GOAL']
].map(([id,kind,label,truthClass])=>({id,kind,label,truthClass}));

const EDGES = [
  ['world-sensing','truth-evidence','FEEDS'],['world-sensing','gamechanger','FEEDS'],['truth-evidence','gamechanger','SUPPLIES'],['truth-evidence','context-spine','SUPPLIES'],['gamechanger','context-spine','FEEDS'],['gamechanger','genesis','FEEDS'],['gamechanger','business-genome','ATOMIZES_FOR'],['genesis','context-spine','FEEDS'],['genesis','genesis-evolution','FEEDS'],['genesis','genesis-ontology','FEEDS'],['genesis','genesis-metabolism','FEEDS'],['genesis','idea-generator','FEEDS'],['genesis','opportunity-factory','RESURRECTS_FOR'],['business-genome','idea-generator','SUPPLIES'],['idea-generator','opportunity-factory','RECOMBINES_FOR'],['genesis-evolution','opportunity-factory','FEEDS'],['genesis-scientist','event-horizon','PROVES_FOR'],['genesis-ontology','world-brain','SUPPLIES'],['genesis-metabolism','economic-memory','FEEDS'],['opportunity-factory','event-horizon','FEEDS'],['event-horizon','capability-genome','REQUIRES'],['event-horizon','distribution-os','ALLOCATES'],['capability-genome','saas-cannibal','FEEDS'],['saas-cannibal','capability-genome','FEEDBACK_TO'],['capability-genome','avengers','SUPPLIES'],['open-model-universe','avengers','SUPPLIES'],['context-spine','world-brain','SUPPLIES'],['context-spine','agent-mesh','SUPPLIES'],['world-brain','agent-mesh','ALLOCATES'],['world-brain','avengers','ALLOCATES'],['agent-mesh','avengers','EXECUTES_FOR'],['agent-mesh','max-council','SUPPLIES'],['avengers','max-council','SUPPLIES'],['world-brain','max-council','FEEDS'],['max-council','wallbreaker','ESCALATES_TO'],['wallbreaker','max-council','FEEDBACK_TO'],['max-council','self-maintainer','PROMOTES'],['self-maintainer','truth-evidence','PROVES_FOR'],['self-maintainer','genesis-scientist','PROVES_FOR'],['self-maintainer','economic-memory','FEEDS'],['distribution-os','payment-reconciliation','FEEDS'],['payment-reconciliation','truth-evidence','PROVES_FOR'],['payment-reconciliation','fulfilment-qa','FEEDS'],['fulfilment-qa','truth-evidence','PROVES_FOR'],['fulfilment-qa','retention-learning','FEEDS'],['retention-learning','economic-memory','FEEDS'],['truth-evidence','economic-memory','FEEDS'],['economic-memory','context-spine','FEEDBACK_TO'],['economic-memory','gamechanger','FEEDBACK_TO'],['economic-memory','genesis','FEEDBACK_TO'],['economic-memory','business-genome','FEEDBACK_TO'],['economic-memory','opportunity-factory','FEEDBACK_TO'],['economic-memory','event-horizon','FEEDBACK_TO'],['economic-memory','capability-genome','FEEDBACK_TO'],['economic-memory','open-model-universe','FEEDBACK_TO'],['economic-memory','world-brain','FEEDBACK_TO'],['economic-memory','omnia','PROVES_FOR'],['omnia','distribution-os','GOVERNS'],['omnia','payment-reconciliation','GOVERNS'],['omnia','self-maintainer','CONSTRAINS'],['omnia','max-council','CONSTRAINS'],['kilimanjaro','world-brain','CONSTRAINS'],['kilimanjaro','self-maintainer','CONSTRAINS'],['kilimanjaro','event-horizon','CONSTRAINS'],['max-council','kilimanjaro','PROVES_FOR'],['self-maintainer','kilimanjaro','PROVES_FOR']
].map(([from,to,type])=>({from,to,type}));

const MODELS = [
  ['openai-gpt-6-astra','GPT-6 Astra','openai','gpt-6-astra'],
  ['anthropic-claude-fable-5-1','Claude Fable 5.1','anthropic','claude-fable-5-1'],
  ['openai-gpt-5-6-sol','GPT-5.6 Sol','openai','gpt-5.6-sol'],
  ['google-gemini-3-8-flash','Gemini 3.8 Flash','google','gemini-3.8-flash'],
  ['xai-grok-4-6','Grok 4.6','xai','grok-4.6'],
  ['deepseek-v4-pro','DeepSeek V4 Pro','deepseek','deepseek-v4-pro'],
  ['moonshot-kimi-k3','Kimi K3','moonshot','kimi-k3']
].map(([id,label,provider,model])=>({id,label,provider,model,configured:false}));

function receipt(label,state='UNAVAILABLE',summary=null){
  return {label,state,freshness:state==='AVAILABLE'?'FRESH':'UNKNOWN',timestamp:state==='AVAILABLE'?new Date().toISOString():null,summary};
}

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','private, no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.end(JSON.stringify(body));
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('allow','GET');
    return send(res,405,{ok:false,status:'METHOD_NOT_ALLOWED'});
  }
  const now=new Date().toISOString();
  const receipts={
    commandCenterSnapshot:receipt('Command Center source snapshot','AVAILABLE',{status:'DEPLOYED_SOURCE_SNAPSHOT',businessEffectAuthority:'NONE'}),
    featureGenome:receipt('Feature Genome'),
    featureAtomAtlas:receipt('Feature Atom Atlas'),
    synapticMap:receipt('Synaptic Map'),
    genesisEvolution:receipt('GENESIS Evolution'),
    genesisReactivation:receipt('GENESIS Reactivation'),
    frontierModels:receipt('Frontier Model Doctor','UNAVAILABLE',{callableCandidateCount:0,businessEffectAuthority:'NONE'}),
    computeSovereignty:receipt('Compute Sovereignty'),
    selfMaintainer:receipt('Self-Maintainer')
  };
  const values=Object.values(receipts);
  return send(res,200,{
    ok:true,
    schemaVersion:'uberbond.command-center-lite.v1',
    truthState:'SOURCE_SNAPSHOT',
    generatedAt:now,
    businessEffectAuthority:'NONE',
    runtime:{
      platform:'VERCEL_PRIVATE_LITE',
      environment:process.env.VERCEL_ENV||'UNKNOWN',
      sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||null,
      sourceBranch:process.env.VERCEL_GIT_COMMIT_REF||null,
      deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null
    },
    cognitive:{graph:{ok:true,status:'COGNITIVE_GRAPH_SOURCE_SNAPSHOT',nodes:NODES,edges:EDGES,nodeCount:NODES.length,edgeCount:EDGES.length,businessEffectAuthority:'NONE'}},
    frontierModelRegistry:{truthClass:'PUBLIC_OFFICIAL_SOURCE_CANDIDATE_CATALOG_NOT_RUNTIME_PROOF',candidates:MODELS,businessEffectAuthority:'NONE'},
    genesisImplementationLedger:{
      ideaCount:275,
      maturityCounts:{OBSERVED_INTERNAL_RUNTIME_RECEIPT:20,SOURCE_AND_TEST_PRESENT:255},
      implementationStatusCounts:{IMPLEMENTED_PRIMITIVE:201,PARTIAL_PRIMITIVE:74},
      truthClass:'SOURCE_CHECKPOINT_NOT_LIVE_RUNTIME_PROOF'
    },
    receipts,
    observability:{
      observedReceiptCount:values.filter(x=>x.state==='AVAILABLE').length,
      unavailableReceiptCount:values.filter(x=>x.state==='UNAVAILABLE').length,
      staleReceiptCount:values.filter(x=>x.state==='STALE').length,
      invalidReceiptCount:values.filter(x=>x.state==='INVALID').length
    },
    synapticPreview:null,
    truthBoundary:'THIS PRIVATE-LITE SURFACE VISUALIZES THE COGNITIVE GRAPH AND CANDIDATE MODEL CATALOG BOUND TO THE DEPLOYED SOURCE REVISION. WHOLE-BRAIN RUNTIME RECEIPTS THAT ARE NOT PHYSICALLY PRESENT IN THIS LITE DEPLOYMENT ARE SHOWN AS UNAVAILABLE, NEVER INVENTED. MODEL CATALOG PRESENCE IS NOT CALLABILITY. GENESIS COUNTS ARE A SOURCE CHECKPOINT, NOT LIVE EXECUTION. ZERO CUSTOMER, PAYMENT, DELIVERY, SPEND OR EXTERNAL-EFFECT TRUTH IS CREATED BY THIS DASHBOARD.'
  });
}
