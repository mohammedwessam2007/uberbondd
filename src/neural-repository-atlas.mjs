import crypto from 'node:crypto';

export const NEURAL_REPOSITORY_ATLAS_VERSION='uberbond.neural-repository-atlas.v2';
export const NEURAL_REPOSITORY_TARGET=1_000_000;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

export const NEURAL_QUERY_FAMILIES=Object.freeze({
models:['topic:llm','topic:transformer','large language model','mixture of experts','state space model','vision language model','world model ai'],
training:['distributed training llm','pretraining llm','fine tuning llm','reinforcement learning llm','preference optimization','distillation llm','synthetic data training'],
inference:['llm inference','model serving','speculative decoding','quantization llm','distributed inference','flash attention','kv cache optimization'],
agents:['topic:ai-agent','agent framework','multi agent','agent orchestration','computer use agent','coding agent','browser agent','autonomous agent'],
memory:['agent memory','long term memory llm','context engineering','context compression','persistent memory ai','failure memory agent','episodic memory ai'],
retrieval:['topic:rag','retrieval augmented generation','vector search','semantic search','reranker','knowledge graph rag','hybrid search ai'],
reasoning:['llm evaluation','reasoning benchmark','formal reasoning ai','theorem proving ai','verifier model','reward model','process reward model','test time compute'],
multimodal:['multimodal agent','speech recognition ai','audio language model','video understanding ai','document intelligence','vision language model'],
robotics:['robot learning','embodied ai','vision language action','world model robotics','autonomous navigation ai','robotics foundation model'],
code:['code generation llm','program synthesis','code agent','automated debugging','repository intelligence','code search ai','software engineering agent'],
science:['scientific machine learning','ai for science','protein language model','drug discovery ai','neural operator','materials discovery ai','physics informed neural network'],
optimization:['bayesian optimization','evolutionary optimization','neural architecture search','monte carlo tree search ai','constraint optimization ai'],
compute:['distributed machine learning','model parallelism','tensor parallelism','gpu scheduler ai','compute orchestration ai','inference scheduler'],
data:['knowledge graph ai','data extraction llm','web crawler ai','synthetic data llm','entity resolution ai','document parsing ai'],
reliability:['llm observability','agent observability','model monitoring','evaluation harness ai','workflow replay ai','agent tracing','llm testing'],
protocols:['model context protocol','mcp server','agent protocol','a2a agent','tool calling llm','agent sdk','agent interoperability'],
automation:['browser automation ai','web agent','workflow automation ai','desktop agent','gui agent','computer use ai'],
commerce:['sales agent ai','revenue intelligence ai','lead generation ai','customer support agent ai','commerce agent ai','payments agent'],
math:['neural theorem prover','symbolic regression ai','automated mathematics','formal verification ai','neuro symbolic ai','proof assistant ai'],
efficiency:['model compression','quantization neural network','sparse neural network','low rank adaptation','efficient transformer','mixture of experts routing'],
forecasting:['time series foundation model','probabilistic forecasting ai','causal forecasting ai','scenario simulation ai','decision intelligence'],
personal:['personal ai assistant','personal knowledge graph','second brain ai','life planning ai','recommendation agent','digital twin ai','personalization llm'],
learning:['adaptive learning ai','intelligent tutoring system','curriculum learning agent','spaced repetition ai','knowledge tracing'],
causal:['causal inference machine learning','causal discovery ai','structural causal model','counterfactual reasoning ai'],
simulation:['agent based simulation ai','digital twin simulation','multi agent simulation','synthetic environment ai'],
security:['agent security','llm security','prompt injection defense','sandbox ai agent','capability security'],
privacy:['privacy preserving machine learning','federated learning','confidential ai','differential privacy ai'],
interpretability:['mechanistic interpretability','llm interpretability','activation steering','sparse autoencoder interpretability'],
health:['clinical ai open source','medical llm','health agent ai','biomedical knowledge graph'],
creativity:['generative design ai','music generation ai','creative coding ai','story generation llm']
});

export const DEFAULT_STAR_BANDS=Object.freeze([[0,2],[3,9],[10,49],[50,199],[200,999],[1000,4999],[5000,null]]);
export function compileNeuralAtlasPlan({target=NEURAL_REPOSITORY_TARGET,starBands=DEFAULT_STAR_BANDS,pushedAfter=null}={}){
 const queries=[];
 for(const [family,seeds] of Object.entries(NEURAL_QUERY_FAMILIES)) for(const seed of seeds) for(const band of starBands){
  const lo=Math.max(0,Math.floor(Number(band?.[0])||0));
  const hi=band?.[1]==null?null:Math.max(lo,Math.floor(Number(band[1])||lo));
  const stars=hi==null?`stars:>=${lo}`:`stars:${lo}..${hi}`;
  queries.push({family,seed,starBand:[lo,hi],query:`${seed} ${stars}${pushedAfter?` pushed:>=${pushedAfter}`:''}`});
 }
 return {ok:true,status:'NEURAL_ATLAS_DISCOVERY_PLAN_COMPILED',target,familyCount:Object.keys(NEURAL_QUERY_FAMILIES).length,queryCount:queries.length,queries,refinementLaw:'IF_A_QUERY_REPORTS_MORE_THAN_1000_RESULTS_SPLIT_BY_TIME_LANGUAGE_TOPIC_OR_CREATION_RANGE_BEFORE_CLAIMING_COVERAGE',law:'INDEX_1000000_COMPRESS_TO_50000_SERIOUS_SUPPLIERS_AND_ACTIVATE_ONLY_MINIMUM_SUFFICIENT_VERIFIED_WINNERS'};
}

export function scoreNeuralRepository(r={}){
 const stars=Number(r.stargazers_count??r.stars??0)||0,forks=Number(r.forks_count??r.forks??0)||0;
 const archived=r.archived===true,license=String(r.license?.spdx_id??r.licenseSpdx??'');
 const pushed=Date.parse(r.pushed_at??r.pushedAt??'')||0,age=pushed?Math.max(0,(Date.now()-pushed)/86400000):3650;
 const freshness=Math.max(0,1-age/1095);
 return Number((Math.log10(1+stars)*12+Math.log10(1+forks)*8+freshness*20+(license&&license!=='NOASSERTION'?8:0)-(archived?100:0)).toFixed(4));
}

export function buildNeuralRepositoryTournament({repositories=[],target=NEURAL_REPOSITORY_TARGET}={}){
 const byId=new Map();
 for(const r of repositories){
  const fullName=String(r.full_name??r.repositoryFullName??'').trim(); if(!/^[^/\s]+\/[^/\s]+$/.test(fullName)||r.private===true)continue;
  const c={repositoryFullName:fullName,sourceUrl:String(r.html_url??r.sourceUrl??`https://github.com/${fullName}`),stars:Number(r.stargazers_count??r.stars??0)||0,licenseSpdx:String(r.license?.spdx_id??r.licenseSpdx??'')||null,archived:r.archived===true,pushedAt:r.pushed_at??r.pushedAt??null,uberBondPrior:scoreNeuralRepository(r),trustState:'UNTRUSTED_REPOSITORY_CANDIDATE',promotionAuthority:'NONE'};
  const key=fullName.toLowerCase(),old=byId.get(key); if(!old||c.uberBondPrior>old.uberBondPrior)byId.set(key,c);
 }
 const ranked=[...byId.values()].sort((a,b)=>b.uberBondPrior-a.uberBondPrior||b.stars-a.stars||a.repositoryFullName.localeCompare(b.repositoryFullName));
 const selected=ranked.slice(0,target).map((x,i)=>({...x,atlasRank:i+1}));
 const manifest={schema:'uberbond.neural-repository-atlas.manifest.v2',version:NEURAL_REPOSITORY_ATLAS_VERSION,requestedTarget:target,distinctCandidates:ranked.length,selectedCandidates:selected.length,targetSatisfied:selected.length>=target,truthBoundary:'DISCOVERY_ONLY_NOT_IMPORTED_NOT_APPROVED_NOT_ACTIVE',selectionDigest:digest(selected.map(x=>[x.repositoryFullName,x.uberBondPrior]))};
 return {ok:true,status:manifest.targetSatisfied?'NEURAL_ATLAS_TARGET_SATISFIED':'NEURAL_ATLAS_MORE_DISCOVERY_REQUIRED',manifest,selected};
}
