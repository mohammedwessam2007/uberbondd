import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_SOURCE_COVERAGE_VERSION = 'uberbond.frontier-source-coverage-1.0.0';

export const FRONTIER_SOURCE_REGISTRY = Object.freeze([
  {
    id: 'source.user-fable-operator-article-20260903',
    kind: 'USER_SUPPLIED_TEXT',
    title: 'User-supplied article on frontier long-horizon model operation',
    locator: 'conversation:2026-09-03',
    claimBoundary: 'SOURCE_DESCRIBES_FEATURES; UBERBOND_DOES_NOT_TREAT_VENDOR_CLAIMS_AS_RUNTIME_PROOF'
  },
  {
    id: 'source.automation-masterclass-x',
    kind: 'PUBLIC_WEB_SOURCE',
    title: 'AI automation masterclass source shared by owner',
    locator: 'https://x.com/1006_amit7481/status/2095014617412165952/video/1?s=61',
    claimBoundary: 'SOURCE_REFERENCE_ONLY; CONNECTOR_OR_FEATURE_AVAILABILITY_DOES_NOT_CREATE_AUTHORITY'
  },
  {
    id: 'source.automation-masterclass-youtube-mirror',
    kind: 'PUBLIC_WEB_MIRROR',
    title: 'Claude FULL COURSE 1 HOUR (Build & Automate Anything)',
    locator: 'https://www.youtube.com/watch?v=KrKhfm2Xuho',
    claimBoundary: 'PUBLIC_MIRROR_USED_FOR_CHAPTER_COVERAGE; DEMONSTRATION_IS_NOT_UBERBOND_IMPLEMENTATION_PROOF'
  }
]);

export const FRONTIER_FEATURE_COVERAGE = Object.freeze([
  // Frontier operator / Fable-style operating mechanics.
  ['operator.plan-mode', 'FRONTIER_OPERATOR', 'Inspect and plan before high-risk mutation while keeping route selection flexible.'],
  ['operator.goal-engine', 'FRONTIER_OPERATOR', 'Testable completion condition that repeats bounded work until proof or a real blocker.'],
  ['operator.persistent-loop', 'FRONTIER_OPERATOR', 'Scheduled repeated checks with bounded lifetime, state, budget and stop conditions.'],
  ['operator.task-dashboard', 'FRONTIER_OPERATOR', 'Expose worker status, dependency, blocking reason, ownership and completion receipts.'],
  ['operator.context-meter', 'FRONTIER_OPERATOR', 'Measure working-context consumption and trigger targeted retrieval or checkpointing.'],
  ['operator.leader-seat', 'FRONTIER_OPERATOR', 'Reserve strongest reasoning for architecture, prioritization, recovery and judgment.'],
  ['operator.worker-mesh', 'FRONTIER_OPERATOR', 'Delegate bounded independent implementation/research/operations lanes to cheaper suppliers.'],
  ['operator.independent-verifier', 'FRONTIER_OPERATOR', 'Fresh verifier treats worker completion claims as untrusted until independently checked.'],
  ['operator.adversarial-reviewer', 'FRONTIER_OPERATOR', 'Separate adversary searches for regressions, hidden assumptions and unsafe shortcuts.'],
  ['operator.judge', 'FRONTIER_OPERATOR', 'Resolve disputed evidence or tradeoffs only after independent evidence collection.'],
  ['operator.worker-spec-compiler', 'FRONTIER_OPERATOR', 'Compile canonical worker role, permissions, lane ownership, turn limits and acceptance criteria to provider-specific agents.'],
  ['operator.scoped-instruction-compiler', 'FRONTIER_OPERATOR', 'Keep global instructions small and retrieve occasional procedures/path-scoped rules only when relevant.'],
  ['operator.outcome-constraints-reason-proof', 'FRONTIER_OPERATOR', 'Mission briefs encode destination, boundaries, business reason and observable proof while leaving route selection open.'],
  ['operator.long-horizon-ledger', 'FRONTIER_OPERATOR', 'Persist decisions, experiments, failed strategies and next actions outside a model context window.'],
  ['operator.checkpoint-resume', 'FRONTIER_OPERATOR', 'Resume missions after model/session/provider loss from durable exact-revision checkpoints.'],
  ['operator.root-cause-mode', 'FRONTIER_OPERATOR', 'Escalate recurrent failures from surface patching to causal reproduction and regression proof.'],
  ['operator.adaptive-effort', 'FRONTIER_OPERATOR', 'Route effort from deterministic execution through frontier reasoning according to risk and difficulty.'],
  ['operator.artifact-first-completion', 'FRONTIER_OPERATOR', 'Return usable artifacts and receipts rather than explanatory prose as the primary deliverable.'],
  ['operator.visual-verification', 'FRONTIER_OPERATOR', 'Use screenshots/interfaces/documents as evidence in implementation and verification loops.'],
  ['operator.research-swarm', 'FRONTIER_OPERATOR', 'Parallel primary-source research lanes followed by skeptical review and synthesis.'],
  ['operator.business-operations-worker', 'FRONTIER_OPERATOR', 'Reconcile data, investigate anomalies, prepare reports and clear bounded operational backlogs.'],
  ['operator.reference-driven-product-work', 'FRONTIER_OPERATOR', 'Build against reference assets, inspect live output and iterate on observable gaps.'],
  ['operator.compounding-knowledge', 'FRONTIER_OPERATOR', 'Convert verified mission residue into reusable institutional memory for future workers.'],
  ['operator.cost-aware-leadership', 'FRONTIER_OPERATOR', 'Use expensive reasoning for high-leverage decisions and cheaper suppliers for bounded labor.'],

  // Automation masterclass coverage.
  ['automation.interface-cockpit', 'AUTOMATION_COURSE', 'Unified owner surface for launching, inspecting and governing automations and artifacts.'],
  ['automation.landing-page-generator', 'AUTOMATION_COURSE', 'Generate and verify responsive landing-page artifacts and bounded conversion flows.'],
  ['automation.project-memory', 'AUTOMATION_COURSE', 'Project-scoped reusable context compiled into durable UberBond mission/company memory.'],
  ['automation.seo-content-pipeline', 'AUTOMATION_COURSE', 'Research, generate, audit and measure search-oriented content workflows.'],
  ['automation.social-content-pipeline', 'AUTOMATION_COURSE', 'Prepare channel-specific social artifacts behind appropriate channel authority gates.'],
  ['automation.mini-app-generator', 'AUTOMATION_COURSE', 'Build bounded interactive mini-apps from goals, constraints and observable acceptance conditions.'],
  ['automation.connector-fabric', 'AUTOMATION_COURSE', 'Normalize connectors into governed adapters subordinate to Capability Genome and OMNIA.'],
  ['automation.twitter-workflow', 'AUTOMATION_COURSE', 'Channel-specific content preparation and authorized publishing workflow for X/Twitter-like surfaces.'],
  ['automation.livestream-repurposing', 'AUTOMATION_COURSE', 'Transform live/video material into reusable summaries, clips, posts and knowledge artifacts.'],
  ['automation.note-system', 'AUTOMATION_COURSE', 'Capture, structure, link and retrieve durable operational notes and decisions.'],
  ['automation.gamified-productivity-app', 'AUTOMATION_COURSE', 'Generate motivational/productivity mini-apps and feedback surfaces as reusable artifact capability.'],
  ['automation.youtube-packaging', 'AUTOMATION_COURSE', 'Generate and evaluate video titles, descriptions, packaging hypotheses and related content artifacts.'],
  ['automation.browser-computer-use', 'AUTOMATION_COURSE', 'Vision-guided browser/computer operation behind permissions, evidence and external-effect controls.'],
  ['automation.browser-email-ops', 'AUTOMATION_COURSE', 'Browser-assisted email workflows subordinate to message authorization, suppression and provider policy.'],
  ['automation.browser-commerce-ops', 'AUTOMATION_COURSE', 'Browser-assisted shopping/commerce research and preparation; purchases still require explicit spending authority.'],
  ['automation.hands-free-blog-pipeline', 'AUTOMATION_COURSE', 'Run research-to-draft-to-QA-to-publish-preparation pipelines with bounded publication authority.'],
  ['automation.code-agent-bridge', 'AUTOMATION_COURSE', 'Compile software missions into provider-specific coding-agent work with exact-head evidence.'],
  ['automation.alternate-code-surface-bridge', 'AUTOMATION_COURSE', 'Treat alternate coding environments/agents as replaceable software-factory suppliers.'],
  ['automation.skill-runtime', 'AUTOMATION_COURSE', 'Retrieve, screen and activate task-specific reusable skills through Capability Genome.'],
  ['automation.artifact-builder', 'AUTOMATION_COURSE', 'Create documents, reports, interfaces and other deliverables with artifact-level verification.'],
  ['automation.data-analysis', 'AUTOMATION_COURSE', 'Analyze structured/semi-structured data and emit validated decision artifacts.'],
  ['automation.spreadsheet-reconstruction', 'AUTOMATION_COURSE', 'Inspect, repair, transform and reconstruct spreadsheet-like operational artifacts.'],
  ['automation.gmail-adapter', 'AUTOMATION_COURSE', 'Email connector capability separated from authority to send, archive, label or modify messages.'],
  ['automation.calendar-adapter', 'AUTOMATION_COURSE', 'Calendar connector capability separated from authority to create/update/delete invitations.'],
  ['automation.drive-adapter', 'AUTOMATION_COURSE', 'Cloud-document connector for governed retrieval and modification of company artifacts.'],
  ['automation.payment-adapter', 'AUTOMATION_COURSE', 'Payment-provider connector that can never supersede canonical Payment Truth or spending authority.'],
  ['automation.workflow-adapter', 'AUTOMATION_COURSE', 'External automation/orchestration platforms treated as replaceable suppliers behind UberBond contracts.'],
  ['automation.recurring-task-engine', 'AUTOMATION_COURSE', 'Compile recurring chat-style automation into durable scheduler/loop missions with checkpoints.'],
  ['automation.research-to-artifact', 'AUTOMATION_COURSE', 'Convert research inputs into concrete memos, pages, apps, documents or reports with source evidence.'],

  // Open model / future intelligence supply coverage.
  ['model.open-model-foundry', 'OPEN_MODEL', 'Discover, normalize, benchmark and route open-weight and closed model suppliers.'],
  ['model.hardware-fit', 'OPEN_MODEL', 'Measure model/quantization fit against available VRAM, throughput, latency and infrastructure cost.'],
  ['model.hosted-open-weight-routing', 'OPEN_MODEL', 'Use hosted open-weight endpoints as replaceable suppliers when they outperform alternatives economically.'],
  ['model.local-runtime-routing', 'OPEN_MODEL', 'Use local inference when hardware, privacy, latency and economics justify it.'],
  ['model.task-specific-tournament', 'OPEN_MODEL', 'Benchmark models on UberBond task classes and private/rotating holdouts instead of public benchmark prestige.'],
  ['model.specialization-path', 'OPEN_MODEL', 'Evaluate retrieval, adapters, LoRA, distillation and lawful task-specific tuning.'],
  ['model.specialist-worker-distillation', 'OPEN_MODEL', 'Create narrowly optimized UberBond workers from rights-cleared evidence and verified task traces.'],
  ['model.frontier-feature-extraction', 'OPEN_MODEL', 'When a new model introduces useful product behavior, extract the behavior into provider-neutral institutional machinery where feasible.'],
  ['model.future-provider-socket', 'OPEN_MODEL', 'Allow future model families not yet invented to enter the same governed benchmark and routing market.']
].map(([id, family, description]) => Object.freeze({ id, family, description })));

export function buildFrontierSourceCoverageReceipt() {
  const ids = FRONTIER_FEATURE_COVERAGE.map(item => item.id);
  const unique = new Set(ids);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  return {
    ok: duplicateIds.length === 0,
    status: duplicateIds.length === 0 ? 'FRONTIER_SOURCE_COVERAGE_COMPLETE' : 'FRONTIER_SOURCE_COVERAGE_INVALID',
    version: FRONTIER_SOURCE_COVERAGE_VERSION,
    sources: FRONTIER_SOURCE_REGISTRY.map(source => ({ ...source })),
    capabilities: FRONTIER_FEATURE_COVERAGE.map(item => ({
      ...item,
      discoveryState: 'DISCOVERED_IDEA_ONLY',
      promotionState: 'NOT_EVALUATED',
      executionAuthority: 'NONE',
      authoritySource: 'NONE',
      commercialTruthAuthority: 'NONE'
    })),
    duplicateIds,
    counts: {
      total: FRONTIER_FEATURE_COVERAGE.length,
      frontierOperator: FRONTIER_FEATURE_COVERAGE.filter(item => item.family === 'FRONTIER_OPERATOR').length,
      automationCourse: FRONTIER_FEATURE_COVERAGE.filter(item => item.family === 'AUTOMATION_COURSE').length,
      openModel: FRONTIER_FEATURE_COVERAGE.filter(item => item.family === 'OPEN_MODEL').length
    },
    invariants: [
      'source-coverage-preserves-distinct-useful-ideas-before-semantic-dedupe',
      'semantic-dedupe-may-compose-capabilities-but-must-not-erase-observable-functionality',
      'connector-capability-never-implies-side-effect-authority',
      'browser-commerce-capability-never-implies-purchase-authority',
      'publishing-capability-never-implies-message-or-publication-authority',
      'vendor-feature-claim-is-not-runtime-proof',
      'public-course-example-is-not-commercial-proof',
      'all-harvested-capabilities-enter-genome-as-unpromoted-candidates'
    ],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}
