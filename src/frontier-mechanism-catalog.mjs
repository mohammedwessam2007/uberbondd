import { normalizeFrontierIntelligenceRecord, compileFrontierReproductionExperiment } from './frontier-intelligence-foundry.mjs';

export const FRONTIER_MECHANISM_CATALOG_VERSION = 'uberbond.frontier-mechanism-catalog.v1';

const SEEDS = Object.freeze([
  {
    name: 'Searchable episodic history', sourceUrl: 'https://openai.com/index/gpt-6-astra/', sourceClass: 'OFFICIAL_DOC', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.99, generatingOrAssistingModel: 'GPT-6 ASTRA', mechanismFamily: 'memory',
    mechanism: 'Preserve durable mission notes while making earlier context windows searchable instead of relying only on repeated lossy summarization.',
    observableClaim: 'Searchable historical context should reduce forgotten requirements, repeated failures, and recovery cost across long missions.',
    evidenceRefs: ['frontier-report:astra-searchable-context'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED',
    capabilityAtoms: [{ id: 'memory:searchable-episodic-history', family: 'memory', verb: 'retrieve', noun: 'episodic-history', description: 'Retrieve cited prior mission events after context rollover.', inputs: ['query','mission-id','event-history'], outputs: ['evidence-pack'] }]
  },
  {
    name: 'Structured persistent mission state', sourceUrl: 'https://openai.com/index/gpt-6-astra/', sourceClass: 'OFFICIAL_DOC', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.99, generatingOrAssistingModel: 'GPT-6 ASTRA', mechanismFamily: 'context-control',
    mechanism: 'Externalize goals, requirements, decisions, hypotheses, failures, verified facts, and open tasks into versioned structured state that survives model/context resets.',
    observableClaim: 'Typed task state should improve interruption recovery and reduce repeated work without storing hidden chain-of-thought.',
    evidenceRefs: ['frontier-report:astra-persistent-notes'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  },
  {
    name: 'Verification before commit', sourceUrl: 'https://openai.com/index/gpt-6-astra/', sourceClass: 'OFFICIAL_DOC', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.98, generatingOrAssistingModel: 'GPT-6 ASTRA', mechanismFamily: 'verification',
    mechanism: 'Require task-specific verifiers before accepting completion, including tests, browser checks, source validation, schema validation, and ledger reconciliation.',
    observableClaim: 'A mandatory verifier gate should reduce false accepts on plausible-looking but incorrect outputs.',
    evidenceRefs: ['frontier-report:astra-verification'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  },
  {
    name: 'Bounded specialist fan-out and evidence-aware synthesis', sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence', sourceClass: 'OFFICIAL_DOC', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.98, generatingOrAssistingModel: 'CLAUDE FABLE 5.1', mechanismFamily: 'orchestration',
    mechanism: 'Decompose work into independent specialist tasks, execute bounded parallel workers, then synthesize evidence while explicitly detecting conflicts and duplicated effort.',
    observableClaim: 'Adaptive multi-agent composition should improve large-task completion when decomposition value exceeds coordination cost.',
    evidenceRefs: ['frontier-report:fable-multiagent'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  },
  {
    name: 'Dynamic reasoning budget allocator', sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/choosing-a-model', sourceClass: 'OFFICIAL_DOC', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.98, generatingOrAssistingModel: 'CLAUDE FABLE 5.1', mechanismFamily: 'metacognition',
    mechanism: 'Allocate additional reasoning/tool/verification budget only when difficulty, uncertainty, stakes, or prior failures justify the marginal compute.',
    observableClaim: 'Dynamic effort should outperform fixed-low and approach fixed-high quality at lower cost per completed task.',
    evidenceRefs: ['frontier-report:fable-adaptive-thinking','frontier-report:astra-effort'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  },
  {
    name: 'Advisor escalation', sourceUrl: 'https://docs.anthropic.com/', sourceClass: 'OFFICIAL_DOC', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.97, generatingOrAssistingModel: 'CLAUDE FRONTIER FAMILY', mechanismFamily: 'model-routing',
    mechanism: 'Let a cheaper executor request a stronger strategic advisor only when uncertainty or blockage crosses a threshold.',
    observableClaim: 'Triggered escalation should improve solved-task economics relative to always-strong, always-cheap, or always-advisor baselines.',
    evidenceRefs: ['frontier-report:advisor-pattern'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  },
  {
    name: 'Deferred tool loading and programmatic batching', sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence', sourceClass: 'OFFICIAL_DOC', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.98, generatingOrAssistingModel: 'CLAUDE FABLE 5.1', mechanismFamily: 'tool-use',
    mechanism: 'Retrieve only mission-relevant tool definitions, batch independent calls programmatically, and inject filtered results rather than the whole tool universe.',
    observableClaim: 'Deferred loading should preserve tool-selection quality while reducing context cost and irrelevant-result contamination as registries grow.',
    evidenceRefs: ['frontier-report:fable-deferred-tools'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  },
  {
    name: 'Failure-reflection memory', sourceUrl: 'https://arxiv.org/abs/2303.11366', sourceClass: 'PAPER', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.99, generatingOrAssistingModel: 'MODEL_AGNOSTIC_ELITE_INTELLIGENCE', mechanismFamily: 'learning',
    mechanism: 'Convert observed failures into scoped, evidence-linked, expiring lessons with a validation test rather than vague self-reflection.',
    observableClaim: 'Structured failure memory should improve repeated task families without accumulating harmful stale rules.',
    evidenceRefs: ['frontier-report:reflexion'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  },
  {
    name: 'Plan act observe adjust', sourceUrl: 'https://arxiv.org/abs/2210.03629', sourceClass: 'PAPER', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.99, generatingOrAssistingModel: 'MODEL_AGNOSTIC_ELITE_INTELLIGENCE', mechanismFamily: 'planning',
    mechanism: 'Interleave planning and environment action so each observation updates world state and can trigger replanning before the next action.',
    observableClaim: 'Iterative replanning should beat fixed upfront plans on tasks where critical information arrives only after action.',
    evidenceRefs: ['frontier-report:react'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  },
  {
    name: 'Uncertainty-triggered branch search and refinement', sourceUrl: 'https://arxiv.org/abs/2305.10601', sourceClass: 'PAPER', publicSource: true,
    provenanceTier: 'P0', provenanceConfidence: 0.99, generatingOrAssistingModel: 'MODEL_AGNOSTIC_ELITE_INTELLIGENCE', mechanismFamily: 'deliberation',
    mechanism: 'Accept a high-confidence first solution, but when confidence is insufficient explore diverse branches, rank them, and iteratively refine only while expected improvement remains positive.',
    observableClaim: 'Selective branching should capture difficult-task gains while avoiding the cost explosion of branching on easy tasks.',
    evidenceRefs: ['frontier-report:tree-of-thoughts','frontier-report:self-refine'], licenseStatus: 'UNKNOWN', reproducibility: 'REPRODUCTION_REQUIRED'
  }
]);

export function frontierMechanismSeeds() {
  const records = [];
  for (const seed of SEEDS) {
    const normalized = normalizeFrontierIntelligenceRecord({ ...seed, observedAt: '2026-09-14T00:00:00.000Z' });
    if (!normalized.ok) throw new Error(`invalid frontier mechanism seed: ${seed.name}: ${(normalized.reasonCodes || []).join(',')}`);
    records.push({ ...normalized.record, capabilityAtoms: seed.capabilityAtoms || [] });
  }
  return records;
}

export function frontierMechanismExperimentBacklog() {
  return frontierMechanismSeeds().map(record => compileFrontierReproductionExperiment(record).experiment);
}

export function frontierMechanismCoverage() {
  const records = frontierMechanismSeeds();
  const families = [...new Set(records.map(record => record.mechanismFamily))].sort();
  return {
    version: FRONTIER_MECHANISM_CATALOG_VERSION,
    seedCount: records.length,
    familyCount: families.length,
    families,
    status: 'SEED_HYPOTHESES_NOT_BENCHMARKED',
    truthBoundary: 'THESE ARE EVIDENCE-BACKED REPRODUCTION HYPOTHESES, NOT CLAIMS THAT UBERBOND ALREADY OUTPERFORMS THE DONOR SYSTEMS.'
  };
}
