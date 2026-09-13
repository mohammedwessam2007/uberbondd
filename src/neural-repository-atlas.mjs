import crypto from 'node:crypto';

export const NEURAL_REPOSITORY_ATLAS_VERSION = 'uberbond.neural-repository-atlas.v3';
export const NEURAL_REPOSITORY_TARGET = 1_000_000;
export const NEURAL_FINAL_CAPABILITY_TARGET = 1_000_000;
export const NEURAL_ACTIVE_CORTEX_MAX = 64;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const NEURAL_QUERY_FAMILIES = Object.freeze({
  models: ['topic:llm','topic:transformer','large language model','mixture of experts','state space model','vision language model','world model ai','foundation model'],
  training: ['distributed training llm','pretraining llm','fine tuning llm','reinforcement learning llm','preference optimization','distillation llm','synthetic data training','continual learning ai'],
  inference: ['llm inference','model serving','speculative decoding','quantization llm','distributed inference','flash attention','kv cache optimization','inference engine ai'],
  agents: ['topic:ai-agent','agent framework','multi agent','agent orchestration','computer use agent','coding agent','browser agent','autonomous agent','tool using agent'],
  planning: ['ai planning','hierarchical planning ai','task planner agent','goal decomposition agent','workflow planner ai','decision planning ai','tree search agent'],
  memory: ['agent memory','long term memory llm','context engineering','context compression','persistent memory ai','failure memory agent','episodic memory ai','semantic memory ai','working memory llm'],
  retrieval: ['topic:rag','retrieval augmented generation','vector search','semantic search','reranker','knowledge graph rag','hybrid search ai','dense retrieval','late interaction retrieval'],
  knowledge: ['knowledge graph ai','ontology ai','semantic web ai','entity linking ai','entity resolution ai','knowledge base llm','graph reasoning ai'],
  reasoning: ['reasoning benchmark','formal reasoning ai','chain of thought evaluation','verifier model','process reward model','test time compute','reasoning agent','reasoning framework'],
  metacognition: ['metacognition ai','self reflection agent','self critique llm','deliberation agent','reflection memory agent','reasoning trace evaluator','uncertainty aware agent'],
  verification: ['llm verifier','formal verification ai','proof checker ai','answer verification llm','self verification agent','fact verification ai','consistency checker llm'],
  theorem: ['theorem proving ai','neural theorem prover','proof assistant ai','automated theorem proving','lean ai','coq ai','isabelle ai','formal mathematics ai'],
  math: ['symbolic regression ai','automated mathematics','neuro symbolic ai','computer algebra ai','math reasoning llm','mathematical discovery ai','constraint solving ai'],
  causal: ['causal inference machine learning','causal discovery ai','structural causal model','counterfactual reasoning ai','causal representation learning','causal graph ai','treatment effect machine learning'],
  probabilistic: ['probabilistic programming','bayesian inference ai','uncertainty quantification machine learning','calibration neural network','probabilistic graphical model','bayesian deep learning'],
  forecasting: ['time series foundation model','probabilistic forecasting ai','causal forecasting ai','scenario simulation ai','decision intelligence','demand forecasting ai','forecast ensemble ai'],
  simulation: ['agent based simulation ai','digital twin simulation','multi agent simulation','synthetic environment ai','world simulation model','monte carlo simulation ai','counterfactual simulator'],
  optimization: ['bayesian optimization','evolutionary optimization','neural architecture search','monte carlo tree search ai','constraint optimization ai','operations research ai','black box optimization'],
  search: ['best first search ai','tree search ai','beam search framework','heuristic search ai','semantic search agent','search planning ai','program search'],
  code: ['code generation llm','program synthesis','code agent','automated debugging','repository intelligence','code search ai','software engineering agent','static analysis ai','program repair ai'],
  science: ['scientific machine learning','ai for science','neural operator','materials discovery ai','physics informed neural network','scientific discovery agent','research agent ai','automated scientist'],
  biology: ['protein language model','drug discovery ai','genomics machine learning','bioinformatics ai','molecular generation ai','protein design ai','biomedical knowledge graph'],
  health: ['clinical ai open source','medical llm','health agent ai','medical reasoning ai','clinical decision support ai','radiology ai open source','digital health assistant'],
  multimodal: ['multimodal agent','vision language model','multimodal llm','multimodal reasoning','multimodal retrieval','image text model','audio visual model'],
  vision: ['computer vision framework','visual reasoning ai','image understanding llm','object detection ai','segmentation foundation model','ocr ai','visual question answering'],
  audio: ['speech recognition ai','audio language model','speech synthesis ai','speaker diarization ai','voice agent','audio understanding ai','speech enhancement ai'],
  video: ['video understanding ai','video language model','video reasoning ai','video generation framework','video retrieval ai','temporal video model'],
  documents: ['document intelligence','document parsing ai','pdf understanding ai','layout model ai','document qa ai','table extraction ai','document agent'],
  robotics: ['robot learning','embodied ai','vision language action','world model robotics','autonomous navigation ai','robotics foundation model','robot planning ai','manipulation learning'],
  control: ['model predictive control ai','reinforcement learning control','adaptive control machine learning','autonomous control ai','control policy learning'],
  navigation: ['autonomous navigation ai','slam machine learning','path planning robotics','robot navigation foundation model','spatial reasoning ai'],
  reinforcement: ['reinforcement learning framework','offline reinforcement learning','multi agent reinforcement learning','hierarchical reinforcement learning','rlhf framework','reward learning ai'],
  self_improvement: ['self improving agent','recursive self improvement ai','automated prompt optimization','agent evolution','self training llm','automated curriculum agent','test time learning'],
  evaluation: ['llm evaluation','reasoning benchmark','agent benchmark','evaluation harness ai','model grading ai','llm judge framework','benchmark contamination detection'],
  reliability: ['llm observability','agent observability','model monitoring','workflow replay ai','agent tracing','llm testing','hallucination detection','reliability engineering ai'],
  security: ['agent security','llm security','prompt injection defense','sandbox ai agent','capability security','ai red teaming','tool security agent','model supply chain security'],
  privacy: ['privacy preserving machine learning','federated learning','confidential ai','differential privacy ai','private inference ai','secure aggregation machine learning'],
  interpretability: ['mechanistic interpretability','llm interpretability','activation steering','sparse autoencoder interpretability','feature attribution neural network','circuit discovery ai','representation probing'],
  alignment: ['ai alignment research','constitutional ai open source','preference learning ai','reward modeling llm','safety fine tuning','behavioral alignment eval'],
  protocols: ['model context protocol','mcp server','agent protocol','a2a agent','tool calling llm','agent sdk','agent interoperability','function calling framework'],
  tools: ['ai tool use','tool calling agent','function calling agent','plugin framework ai','mcp tools','agent tools library','computer tool use'],
  browser: ['browser automation ai','web agent','browser agent','computer use ai','web navigation agent','browser use framework','web task agent'],
  desktop: ['desktop agent','gui agent','computer use agent','ui automation ai','screen understanding agent','desktop automation llm'],
  workflow: ['workflow automation ai','business process automation ai','job orchestration ai','event driven agent','agent workflow engine','durable execution agent'],
  multiagent: ['multi agent framework','agent society','agent swarm','agent debate','agent collaboration','agent delegation','agent coordination','multi agent planning'],
  debate: ['ai debate','multi agent debate','deliberative agent','critic agent','adversarial reasoning agent','panel of agents'],
  negotiation: ['negotiation agent ai','multi agent negotiation','auction agent ai','mechanism design ai','bargaining agent'],
  creativity: ['generative design ai','music generation ai','creative coding ai','story generation llm','idea generation ai','design agent','creative agent framework'],
  design: ['generative design','ui design ai','architecture design ai','product design agent','design optimization ai','cad generative ai'],
  education: ['adaptive learning ai','intelligent tutoring system','curriculum learning agent','spaced repetition ai','knowledge tracing','learning analytics ai','study assistant ai'],
  personal: ['personal ai assistant','personal knowledge graph','second brain ai','life planning ai','recommendation agent','digital twin ai','personalization llm','personal memory ai','lifelogging ai'],
  recommendation: ['recommender system','personalization ai','contextual recommendation','ranking model recommendation','bandit recommendation','preference modeling ai'],
  hci: ['human ai interaction','mixed initiative ai','adaptive interface ai','conversational interface','human in the loop ai','augmented cognition'],
  bci: ['brain computer interface open source','eeg machine learning','neural signal decoding','neurotechnology open source','brain decoding ai','biosignal foundation model'],
  compute: ['distributed machine learning','model parallelism','tensor parallelism','gpu scheduler ai','compute orchestration ai','inference scheduler','distributed tensor runtime'],
  efficiency: ['model compression','quantization neural network','sparse neural network','low rank adaptation','efficient transformer','mixture of experts routing','token pruning llm','context compression'],
  serving: ['model serving framework','llm gateway','model router','inference api server','batch inference framework','autoscaling inference'],
  data: ['data extraction llm','web crawler ai','synthetic data llm','entity resolution ai','dataset curation ai','data labeling ai','data quality machine learning'],
  embeddings: ['embedding model','text embeddings','multimodal embeddings','embedding server','representation learning framework','metric learning ai'],
  graph: ['graph neural network','graph machine learning','knowledge graph reasoning','graph retrieval ai','graph agent','graph database ai'],
  databases: ['vector database','semantic database','graph database ai','memory database agent','embedding database','hybrid search database'],
  compression: ['semantic compression ai','context compression llm','memory compression agent','lossless prompt compression','token compression llm','summary memory agent'],
  distributed_cognition: ['distributed agent system','collective intelligence ai','swarm intelligence','federated agents','distributed reasoning','collaborative intelligence'],
  language: ['machine translation llm','multilingual language model','cross lingual retrieval','arabic llm open source','speech translation ai','language identification ai'],
  research: ['deep research agent','literature review ai','research assistant agent','paper retrieval ai','citation graph ai','scientific search engine ai','evidence synthesis ai'],
  provenance: ['data provenance ai','model provenance','citation verification ai','evidence graph','lineage tracking ai','reproducible ai pipeline'],
  calibration: ['uncertainty calibration llm','confidence estimation ai','selective prediction','conformal prediction ai','uncertainty aware llm','risk calibration model']
});

export const NEURAL_FAMILY_WEIGHTS = Object.freeze({
  reasoning: 1.0, planning: 1.0, memory: 1.0, metacognition: 1.0, verification: 1.0,
  retrieval: 0.98, knowledge: 0.98, causal: 0.98, theorem: 0.97, code: 0.97,
  research: 0.97, agents: 0.96, multiagent: 0.95, self_improvement: 0.95, evaluation: 0.95,
  reliability: 0.95, security: 0.95, probabilistic: 0.94, forecasting: 0.94, simulation: 0.94,
  optimization: 0.94, models: 0.93, inference: 0.92, efficiency: 0.92, compute: 0.9,
  personal: 0.98, education: 0.9, hci: 0.9, multimodal: 0.9, tools: 0.92,
  protocols: 0.92, browser: 0.88, desktop: 0.86, science: 0.92, graph: 0.92,
  provenance: 0.95, calibration: 0.95
});

export const DEFAULT_STAR_BANDS = Object.freeze([[0,2],[3,9],[10,49],[50,199],[200,999],[1000,4999],[5000,null]]);

export function compileNeuralAtlasPlan({ target = NEURAL_REPOSITORY_TARGET, starBands = DEFAULT_STAR_BANDS, pushedAfter = null } = {}) {
  const queries = [];
  for (const [family, seeds] of Object.entries(NEURAL_QUERY_FAMILIES)) {
    for (const seed of seeds) {
      for (const band of starBands) {
        const lo = Math.max(0, Math.floor(Number(band?.[0]) || 0));
        const hi = band?.[1] == null ? null : Math.max(lo, Math.floor(Number(band[1]) || lo));
        const stars = hi == null ? `stars:>=${lo}` : `stars:${lo}..${hi}`;
        queries.push({ family, familyWeight: NEURAL_FAMILY_WEIGHTS[family] ?? 0.8, seed, starBand: [lo, hi], query: `${seed} ${stars}${pushedAfter ? ` pushed:>=${pushedAfter}` : ''}` });
      }
    }
  }
  return {
    ok: true,
    status: 'NEURAL_ATLAS_DISCOVERY_PLAN_COMPILED',
    target,
    finalCapabilityTarget: NEURAL_FINAL_CAPABILITY_TARGET,
    activeCortexMaximum: NEURAL_ACTIVE_CORTEX_MAX,
    familyCount: Object.keys(NEURAL_QUERY_FAMILIES).length,
    queryCount: queries.length,
    queries,
    refinementLaw: 'IF_A_QUERY_REPORTS_MORE_THAN_1000_RESULTS_SPLIT_BY_CREATION_TIME_THEN_SIZE_RANGE; SATURATED_LEAVES_REMAIN_EXPLICITLY_UNRESOLVED',
    law: 'DISCOVER_BROADLY__RETAIN_THE_BEST_1000000_DEDUPED_NEURAL_CAPABILITY_RECORDS_WHEN_EVIDENCE_EXISTS__NEVER_COMPRESS_THE_FINAL_LIBRARY_TO_50000__ACTIVATE_ONLY_A_MINIMUM_SUFFICIENT_VERIFIED_CORTEX_BUNDLE'
  };
}

function bounded(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }

export function scoreNeuralRepository(repository = {}, { family = null, now = new Date() } = {}) {
  const stars = Math.max(0, Number(repository.stargazers_count ?? repository.stargazersCount ?? repository.stars ?? 0) || 0);
  const forks = Math.max(0, Number(repository.forks_count ?? repository.forksCount ?? repository.forks ?? 0) || 0);
  const archived = repository.archived === true;
  const fork = repository.fork === true;
  const license = String(repository.license?.spdx_id ?? repository.licenseSpdx ?? '').toUpperCase();
  const pushed = Date.parse(repository.pushed_at ?? repository.pushedAt ?? '') || 0;
  const ageDays = pushed ? Math.max(0, (new Date(now).getTime() - pushed) / 86_400_000) : 3650;
  const freshness = Math.exp(-ageDays / 1095);
  const adoption = bounded((Math.log10(1 + stars) + 0.5 * Math.log10(1 + forks)) / 6);
  const familyWeight = NEURAL_FAMILY_WEIGHTS[family] ?? 0.8;
  const descriptive = [repository.name, repository.repositoryFullName, repository.full_name, repository.description, ...(repository.topics || [])].filter(Boolean).join(' ').toLowerCase();
  const neuralMarkers = ['agent','reason','memory','retrieval','model','learning','knowledge','graph','search','planning','verification','science','causal','forecast','simulation','multimodal','vision','speech','tool','personal','assistant','intelligence','neural','llm'];
  const semantic = bounded(neuralMarkers.filter(term => descriptive.includes(term)).length / 8);
  const interoperabilityMarkers = ['mcp','api','sdk','cli','server','tool','plugin','openai','anthropic','ollama','huggingface'];
  const interoperability = bounded(interoperabilityMarkers.filter(term => descriptive.includes(term)).length / 4);
  const licensePrior = license && !['NOASSERTION','OTHER',''].includes(license) ? 1 : 0;
  const score = bounded(familyWeight * 0.30 + semantic * 0.20 + adoption * 0.15 + freshness * 0.15 + interoperability * 0.10 + licensePrior * 0.05 + (repository.defaultBranch ? 0.05 : 0) - (archived ? 0.65 : 0) - (fork ? 0.03 : 0));
  return Number((score * 100).toFixed(4));
}

export function buildNeuralRepositoryTournament({ repositories = [], target = NEURAL_REPOSITORY_TARGET, now = new Date() } = {}) {
  const byId = new Map();
  for (const repository of repositories) {
    const fullName = String(repository.full_name ?? repository.repositoryFullName ?? '').trim();
    if (!/^[^/\s]+\/[^/\s]+$/.test(fullName) || repository.private === true) continue;
    const family = String(repository.family ?? repository.discoveryFamily ?? '').trim() || null;
    const candidate = {
      repositoryFullName: fullName,
      sourceUrl: String(repository.html_url ?? repository.sourceUrl ?? `https://github.com/${fullName}`),
      description: String(repository.description ?? '').slice(0, 1000) || null,
      topics: [...new Set(Array.isArray(repository.topics) ? repository.topics.map(String).filter(Boolean).slice(0, 32) : [])],
      language: String(repository.language ?? '').slice(0, 80) || null,
      stars: Number(repository.stargazers_count ?? repository.stargazersCount ?? repository.stars ?? 0) || 0,
      forks: Number(repository.forks_count ?? repository.forksCount ?? repository.forks ?? 0) || 0,
      licenseSpdx: String(repository.license?.spdx_id ?? repository.licenseSpdx ?? '') || null,
      archived: repository.archived === true,
      fork: repository.fork === true,
      pushedAt: repository.pushed_at ?? repository.pushedAt ?? null,
      family,
      uberBondPrior: scoreNeuralRepository(repository, { family, now }),
      trustState: 'UNTRUSTED_REPOSITORY_CANDIDATE',
      promotionAuthority: 'NONE'
    };
    const key = fullName.toLowerCase();
    const previous = byId.get(key);
    if (!previous || candidate.uberBondPrior > previous.uberBondPrior) byId.set(key, candidate);
  }
  const ranked = [...byId.values()].sort((a, b) => b.uberBondPrior - a.uberBondPrior || b.stars - a.stars || a.repositoryFullName.localeCompare(b.repositoryFullName));
  const selected = ranked.slice(0, target).map((item, index) => ({ ...item, atlasRank: index + 1 }));
  const manifest = {
    schema: 'uberbond.neural-repository-atlas.manifest.v3',
    version: NEURAL_REPOSITORY_ATLAS_VERSION,
    requestedTarget: target,
    finalCapabilityTarget: NEURAL_FINAL_CAPABILITY_TARGET,
    distinctCandidates: ranked.length,
    selectedCandidates: selected.length,
    targetSatisfied: selected.length >= target,
    truthBoundary: 'REPOSITORY_DISCOVERY_ONLY_NOT_A_FINAL_NEURAL_CAPABILITY_NOT_IMPORTED_NOT_SECURITY_REVIEWED_NOT_APPROVED_NOT_ACTIVE',
    selectionDigest: digest(selected.map(item => [item.repositoryFullName, item.uberBondPrior]))
  };
  return { ok: true, status: manifest.targetSatisfied ? 'NEURAL_ATLAS_REPOSITORY_TARGET_SATISFIED' : 'NEURAL_ATLAS_MORE_DISCOVERY_REQUIRED', manifest, selected };
}

export function neuralAtlasCoverage() {
  return Object.freeze(Object.entries(NEURAL_QUERY_FAMILIES).map(([family, seeds]) => ({ family, seedCount: seeds.length, familyWeight: NEURAL_FAMILY_WEIGHTS[family] ?? 0.8, seedDigest: digest(seeds) })));
}
