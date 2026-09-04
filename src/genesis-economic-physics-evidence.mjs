export const GENESIS_ECONOMIC_PHYSICS_EVIDENCE = Object.freeze({
  106: ['Deadweight-Loss Telescope','IMPLEMENTED_PRIMITIVE','Estimates unrealized structured surplus while refusing welfare or causal proof.'],
  107: ['Transaction-Cost Atlas','IMPLEMENTED_PRIMITIVE','Maps money, time, failure and coordination burden across transaction stages.'],
  108: ['Trust Friction Scanner','IMPLEMENTED_PRIMITIVE','Scores evidence, reversibility, reputation, stakes and ambiguity as an explicit trust-friction heuristic.'],
  109: ['Coordination Entropy Map','IMPLEMENTED_PRIMITIVE','Measures normalized handoff-network entropy as a coordination complexity proxy.'],
  110: ['Margin Migration Radar','IMPLEMENTED_PRIMITIVE','Tracks contribution and margin movement across supplied verified periods.'],
  111: ['Invisible Subsidy Detector','IMPLEMENTED_PRIMITIVE','Exposes hidden founder labor and market-cost subsidy assumptions.'],
  112: ['Incentive Fracture Mapper','IMPLEMENTED_PRIMITIVE','Finds metric, reward and externality divergence without inferring actor intent.'],
  113: ['Value-Leakage Tomography','IMPLEMENTED_PRIMITIVE','Maps structured value loss between ordered economic stages.'],
  114: ['Market-Boundary Detector','IMPLEMENTED_PRIMITIVE','Measures buyer/seller graph connectivity while refusing legal market-definition claims.'],
  115: ['Economic Phase-Change Detector','IMPLEMENTED_PRIMITIVE','Flags threshold-crossing regime changes in numeric economic series.'],
  119: ['Symbiosis Compiler','IMPLEMENTED_PRIMITIVE','Finds reciprocal provide/need structures as non-commercial complementarity hypotheses.'],
  120: ['Ecosystem Keystone Finder','IMPLEMENTED_PRIMITIVE','Ranks graph nodes by bounded topological centrality.'],
  121: ['Category Genesis Engine','PARTIAL_PRIMITIVE','Creates evidence-referenced category candidates from pain, mechanism and buyer; establishment still requires market evidence.'],
  126: ['Frontier Residue Miner','IMPLEMENTED_PRIMITIVE','Extracts reusable capabilities and artifacts from negative primary outcomes.'],
  127: ['Negative-Result Arbitrage','IMPLEMENTED_PRIMITIVE','Ranks negative results by replication confidence, avoided waste and cross-domain transfer as learning priority.'],
  196: ['Preference Formation Engine','PARTIAL_PRIMITIVE','Updates explicitly supplied preference dimensions from evidence-weighted touches without private psychology inference.'],
  197: ['Non-Consumption Telescope','IMPLEMENTED_PRIMITIVE','Ranks supplied segments by need, access difficulty, population and low adoption without demand claims.'],
  198: ['Market Creation Simulator','PARTIAL_PRIMITIVE','Produces explicitly synthetic adoption scenarios from friction/value counterfactuals.'],
  199: ['Problem Formation Engine','IMPLEMENTED_PRIMITIVE','Aggregates supplied problem severity, frequency and workaround-cost signals.'],
  200: ['Pain-to-Budget Transition Detector','IMPLEMENTED_PRIMITIVE','Classifies pain, workaround, budget and authority signals without claiming verified budget.'],
  201: ['Demand Phase-Change Detector','PARTIAL_PRIMITIVE','Detects phase shifts in supplied independent buyer, budget and paid-commitment signals; real demand still needs external evidence.'],
  202: ['Category Vocabulary Generator','IMPLEMENTED_PRIMITIVE','Generates candidate buyer/mechanism/outcome labels without claiming established buyer language.'],
  203: ['Buyer Mental-Model Genome','PARTIAL_PRIMITIVE','Compiles explicitly supplied beliefs, rules, proof preferences and risks as a research hypothesis only.'],
  206: ['Universal Surplus Graph','IMPLEMENTED_PRIMITIVE','Builds directed supplied-surplus graphs with truth dependent on verified input values.'],
  207: ['Friction Conservation Analysis','IMPLEMENTED_PRIMITIVE','Compares total measured friction across before/after stage boundaries.'],
  208: ['Constraint Shadow Pricing','IMPLEMENTED_PRIMITIVE','Calculates a local objective delta per relaxation unit as a counterfactual shadow-price estimate.'],
  209: ['Bottleneck Centrality','IMPLEMENTED_PRIMITIVE','Ranks flow-over-capacity graph nodes as bottleneck heuristics.'],
  210: ['Scarcity Migration Engine','IMPLEMENTED_PRIMITIVE','Tracks the highest supplied scarcity score across periods and detects migration.'],
  211: ['Abundance Consequence Engine','PARTIAL_PRIMITIVE','Detects supplied resource abundance/scarcity changes while refusing causal consequence claims.'],
  212: ['Zero-Marginal-Cost Shockwave','IMPLEMENTED_PRIMITIVE','Propagates a marginal-cost reduction mechanically across supplied dependency cost shares.'],
  213: ['Value-Chain Phase Mapper','IMPLEMENTED_PRIMITIVE','Classifies supplied stages as value creation, transfer or destruction from explicit value/cost inputs.'],
  214: ['Hidden Complement Detector','IMPLEMENTED_PRIMITIVE','Finds structural require/enable complements without bundling or cross-sell proof.'],
  215: ['Constraint Inversion','IMPLEMENTED_PRIMITIVE','Creates an explicit inverted-constraint counterfactual with falsification questions.']
});

export function normalizeGenesisEvidencePack(pack, { sources, tests, runtimeReceipts = [] } = {}) {
  return Object.fromEntries(Object.entries(pack).map(([id, [name, maturity, note]]) => [Number(id), {
    name,
    maturity,
    sources: [...sources],
    tests: [...tests],
    runtimeReceipts: [...runtimeReceipts],
    note
  }]));
}
