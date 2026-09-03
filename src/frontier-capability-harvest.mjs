import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_CAPABILITY_HARVEST_VERSION = 'uberbond.frontier-capability-harvest-1.0.0';

const SOURCE_FABLE_ARTICLE = 'USER_SUPPLIED_FABLE_OPERATOR_ARTICLE_2026-09-03';
const SOURCE_AUTOMATION_COURSE = 'PUBLIC_JULIAN_GOLDIE_CLAUDE_AUTOMATION_COURSE_2026';
const SOURCE_OPEN_MODEL_EXPANSION = 'UBERBOND_OPEN_MODEL_EXPANSION_2026-09-03';

function clone(value) { return structuredClone(value); }
function zero(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

export const FRONTIER_CAPABILITY_SEEDS = Object.freeze([
  { id: 'operator.goal-engine', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Persistent testable mission goals with explicit proof, resource bounds and failure conditions.' },
  { id: 'operator.persistent-loop', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Durable scheduled mission loops with stop conditions, budgets and checkpointed state.' },
  { id: 'operator.leader-worker-verifier', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Leader, worker, verifier, adversary and judge roles with independent evidence gates.' },
  { id: 'operator.long-horizon-ledger', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Externalized mission state for long runs, recovery, checkpointing and model replacement.' },
  { id: 'operator.root-cause-mode', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Escalation from symptom patches to causal diagnosis, reproduction and regression proof.' },
  { id: 'operator.adaptive-effort', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Task effort routing from deterministic execution through frontier reasoning.' },
  { id: 'operator.artifact-first-completion', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Completion prefers concrete artifacts, commits, records, screenshots and receipts over prose claims.' },
  { id: 'operator.visual-verification', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Reference-versus-current visual inspection loop for interfaces and generated artifacts.' },
  { id: 'operator.compounding-knowledge', family: 'FRONTIER_OPERATOR', source: SOURCE_FABLE_ARTICLE, description: 'Extract reusable mission knowledge into persistent company memory after verification.' },

  { id: 'automation.project-memory', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Project-scoped durable context and reusable operating instructions.' },
  { id: 'automation.connector-fabric', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Governed connector adapters for external applications and services.' },
  { id: 'automation.landing-page-generator', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Artifact-first generation and validation of focused web experiences.' },
  { id: 'automation.mini-app-generator', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Generate bounded interactive applications from task contracts and verify the result.' },
  { id: 'automation.content-pipeline', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Research, drafting, review, packaging and distribution workflow composition.' },
  { id: 'automation.seo-workflow', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Search-oriented content research, generation, QA and result measurement.' },
  { id: 'automation.social-workflow', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Social-content planning and preparation behind channel-specific authority gates.' },
  { id: 'automation.browser-computer-use', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Vision-guided browser and computer interaction as a permissioned capability.' },
  { id: 'automation.code-agent-bridge', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Connect governed missions to coding-agent execution and exact-head evidence.' },
  { id: 'automation.skill-runtime', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Retrieve and activate task-specific reusable skills through Capability Genome admission.' },
  { id: 'automation.artifact-builder', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Generate documents, interfaces and other deliverables with evidence-backed completion.' },
  { id: 'automation.data-shaping', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Transform structured and semi-structured data into validated task artifacts.' },
  { id: 'automation.recurring-task-engine', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Persistent recurring jobs compiled into OMNIA loop contracts rather than chat reminders.' },
  { id: 'automation.email-calendar-drive', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Governed email, calendar and cloud-document operations through explicit connector authority.' },
  { id: 'automation.payment-connector', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Payment-provider connector capability kept subordinate to canonical Payment Truth.' },
  { id: 'automation.spreadsheet-reconstruction', family: 'AUTOMATION_COURSE', source: SOURCE_AUTOMATION_COURSE, description: 'Inspect, transform and reconstruct spreadsheet-like operational artifacts with validation.' },

  { id: 'model.open-model-foundry', family: 'OPEN_MODEL', source: SOURCE_OPEN_MODEL_EXPANSION, description: 'Discover, normalize, benchmark, compare and route open and closed model suppliers.' },
  { id: 'model.hardware-fit', family: 'OPEN_MODEL', source: SOURCE_OPEN_MODEL_EXPANSION, description: 'Match model and quantization choices against available hardware, latency and runtime cost.' },
  { id: 'model.specialization-path', family: 'OPEN_MODEL', source: SOURCE_OPEN_MODEL_EXPANSION, description: 'Evaluate lawful retrieval, adapters, distillation or task tuning for specialized UberBond workers.' }
]);

export function planFrontierCapabilityHarvest({ includeFamilies = null } = {}) {
  const allowedFamilies = includeFamilies == null
    ? null
    : new Set(Array.isArray(includeFamilies) ? includeFamilies.map(value => String(value).trim().toUpperCase()).filter(Boolean) : []);
  if (allowedFamilies && allowedFamilies.size === 0) {
    return zero({ ok: false, status: 'FRONTIER_HARVEST_INVALID', reasonCodes: ['nonempty-family-filter-required'] });
  }
  const seeds = FRONTIER_CAPABILITY_SEEDS
    .filter(seed => !allowedFamilies || allowedFamilies.has(seed.family))
    .map(seed => ({
      ...seed,
      discoveryState: 'DISCOVERED_IDEA_ONLY',
      promotionState: 'NOT_EVALUATED',
      executionAuthority: 'NONE',
      claimClass: 'SOURCE_DERIVED_CAPABILITY_HYPOTHESIS'
    }));

  return zero({
    ok: true,
    status: 'FRONTIER_CAPABILITY_HARVEST_PLAN',
    version: FRONTIER_CAPABILITY_HARVEST_VERSION,
    seeds,
    counts: {
      total: seeds.length,
      frontierOperator: seeds.filter(seed => seed.family === 'FRONTIER_OPERATOR').length,
      automationCourse: seeds.filter(seed => seed.family === 'AUTOMATION_COURSE').length,
      openModel: seeds.filter(seed => seed.family === 'OPEN_MODEL').length
    },
    laws: [
      'source-feature-is-not-implementation-proof',
      'open-weight-is-not-free-runtime',
      'connector-availability-is-not-authority',
      'course-example-is-not-commercial-proof',
      'genome-admission-required-before-active-use',
      'model-or-skill-capability-never-expands-mission-authority',
      'external-effect-capabilities-remain-inert-without-matching-omnia-authorization'
    ]
  });
}
