// Machine-readable representation of what UberBond can actually do on THIS
// branch right now. A static, hand-maintained registry rather than a
// runtime scanner -- deliberately so, because inferring "capability" from
// file presence alone would be exactly the kind of confident-looking lie
// this whole session has tried to avoid (a file existing is not the same
// as it being tested, and tested is not the same as live-proven).
//
// Entries reflecting work that is real and tested but NOT on this branch
// (the OMNIA V9 kernel, the Canon/V3 acquisition cycle -- see
// docs/PROMETHEUS_BRANCH_RECONCILIATION.md) are marked MISSING here, with
// an explicit note pointing at where the real, verified implementation
// actually lives. MISSING-here does not mean nonexistent-anywhere.

export const CAPABILITY_GRAPH_POLICY_VERSION = 'capability-graph-1.0.0';

export const CAPABILITY_STATUSES = Object.freeze([
  'IMPLEMENTED', 'TEST_VERIFIED', 'LIVE_UNPROVEN', 'PARTIAL', 'RESEARCH_ONLY', 'MISSING'
]);

// id, name, status, dependencies (other capability ids), testRefs (files),
// productionReadiness (free-text honest assessment), notes.
const REGISTRY = Object.freeze([
  { id: 'evidence-capture', name: 'Website evidence capture (Playwright crawl)', status: 'TEST_VERIFIED',
    dependencies: [], testRefs: ['tests/browser.test.mjs'],
    productionReadiness: 'Live-capable; container Chromium/Playwright version drift disclosed in docs/OVERNIGHT_HANDOFF.md.',
    notes: 'src/browser-crawler.mjs' },
  { id: 'deterministic-audit', name: 'Deterministic audit rule engine (26 checks)', status: 'TEST_VERIFIED',
    dependencies: ['evidence-capture'], testRefs: ['tests/core.test.mjs'],
    productionReadiness: 'Production-shaped; no external calls.', notes: 'src/audit-rules.mjs' },
  { id: 'prospect-scoring', name: 'Prospect scoring (scoreProspect)', status: 'TEST_VERIFIED',
    dependencies: ['deterministic-audit'], testRefs: ['tests/core.test.mjs'],
    productionReadiness: 'Production-shaped.', notes: 'src/audit-rules.mjs' },
  { id: 'json-store', name: 'JsonStore (transactions, idempotency, caps)', status: 'TEST_VERIFIED',
    dependencies: [], testRefs: ['tests/store.test.mjs'], productionReadiness: 'Dev/small-scale backend, by design.', notes: 'src/store.mjs' },
  { id: 'postgres-store', name: 'PostgresStore (transactions, idempotency, caps)', status: 'TEST_VERIFIED',
    dependencies: [], testRefs: ['tests/postgres-schema.test.mjs', 'tests/postgres-store-live.test.mjs'],
    productionReadiness: 'Live-proven this wave against a real local PostgreSQL 16 server (19/19), closing a gap disclosed across three prior waves.',
    notes: 'src/store.mjs' },
  { id: 'durable-queue', name: 'DurableQueue (leases, retries, stale recovery, dead-letter)', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/queue.test.mjs'],
    productionReadiness: 'Audited turn 6: 7/10 mission "task universe" properties present; missing cancellation, dependency edges, cost accounting.',
    notes: 'src/queue.mjs' },
  { id: 'deliverability-guard', name: 'Deliverability Guard (outbound admission gate)', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/deliverability-guard.test.mjs', 'tests/pipeline-deliverability-guard.test.mjs'],
    productionReadiness: 'Never live-sent; structurally dry-run/disabled by every session boundary.',
    notes: 'src/deliverability-guard.mjs. Smaller-scope alternative to the unmerged OMNIA V9 kernel -- see docs/PROMETHEUS_BRANCH_RECONCILIATION.md.' },
  { id: 'reservation-recovery', name: 'Outbound reservation recovery sweep', status: 'TEST_VERIFIED',
    dependencies: ['deliverability-guard'], testRefs: ['tests/reservation-recovery.test.mjs'],
    productionReadiness: 'Dry-run-capable; never auto-retries an uncertain external outcome.', notes: 'src/reservation-recovery.mjs' },
  { id: 'payment-truth', name: 'Payment truth classifier (Lemon Squeezy)', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/payment-truth.test.mjs'],
    productionReadiness: 'Webhook path coded and tested; zero real transactions have occurred.', notes: 'src/payments.mjs, src/revenue.mjs' },
  { id: 'offer-compiler', name: 'Offer compiler (5 products)', status: 'TEST_VERIFIED',
    dependencies: ['prospect-scoring'], testRefs: ['tests/offer-compiler.test.mjs'],
    productionReadiness: 'Pure/read-only; safe by construction.', notes: 'src/offer-compiler.mjs' },
  { id: 'founder-command-center', name: 'Founder command center', status: 'TEST_VERIFIED',
    dependencies: ['offer-compiler', 'payment-truth'], testRefs: ['tests/founder-command-center.test.mjs'],
    productionReadiness: 'Read-only report; safe by construction.', notes: 'src/founder-command-center.mjs' },
  { id: 'opportunity-registry', name: 'Opportunity Registry (Business Genome + scoring tournament)', status: 'TEST_VERIFIED',
    dependencies: [], testRefs: ['tests/opportunity-registry.test.mjs'],
    productionReadiness: 'Pure/no I/O; usefulness depends entirely on real candidates being fed in over time.', notes: 'src/opportunity-registry.mjs' },
  { id: 'market-signal', name: 'Universal Market Signal kernel', status: 'TEST_VERIFIED',
    dependencies: [], testRefs: ['tests/market-signal.test.mjs'],
    productionReadiness: 'Pure/no I/O; caller-supplied candidates only. No platform adapter or scraper is implied.',
    notes: 'src/market-signal.mjs' },
  { id: 'market-signal-registry', name: 'Bounded MarketSignal ingestion registry', status: 'TEST_VERIFIED',
    dependencies: ['market-signal', 'json-store'], testRefs: ['tests/market-signal-registry.test.mjs'],
    productionReadiness: 'Local-only bounded ingestion over caller-supplied candidates; dedupe, contradiction flags, freshness, caps, and optional audit receipts tested. No network adapter is configured.',
    notes: 'src/market-signal-registry.mjs' },
  { id: 'genome-extraction', name: 'Signal-to-BusinessGenome extraction bridge', status: 'TEST_VERIFIED',
    dependencies: ['market-signal', 'opportunity-registry'], testRefs: ['tests/genome-extraction.test.mjs'],
    productionReadiness: 'Pure/no I/O; converts already-accepted signals (from either surviving ingestion pipeline\'s accepted-signal shape) into a scoreOpportunity-ready candidate, keeping the weakest evidence tier honest. No job-handler wiring yet -- a caller composes it directly.',
    notes: 'src/genome-extraction.mjs. Kept from this session\'s side of Pair 1 (see docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md) -- the only bridge from a normalized signal into opportunity-registry.mjs.' },
  { id: 'commercial-memory', name: 'Hypothesis-level commercial memory and contradiction detection', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/commercial-memory.test.mjs'],
    productionReadiness: 'Durable hypothesis memory, scoped query, and hypothesis-level contradiction detection. The contradiction scan is cron-scheduled and read-only. No allocator, promotion, or spend authority.',
    notes: 'src/commercial-memory.mjs. Kept from this session\'s side of Pair 5 (see docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md) -- production-wired via prometheus.commercial_memory.contradiction_scan, no equivalent on the other side.' },
  { id: 'prometheus-economic-spine', name: 'Prometheus signal-to-offer economic spine', status: 'TEST_VERIFIED',
    dependencies: ['market-signal-registry', 'opportunity-registry', 'offer-compiler'],
    testRefs: ['tests/prometheus-economic-spine.test.mjs'],
    productionReadiness: 'Local-only composition of canonical signal, genome, opportunity score, offer, and dry-run experiment packet. No commercial claim or external effect.',
    notes: 'src/prometheus-economic-spine.mjs' },
  { id: 'commercial-experiment-compiler', name: 'Bounded commercial experiment compiler', status: 'TEST_VERIFIED',
    dependencies: ['prometheus-economic-spine'], testRefs: ['tests/commercial-experiment.test.mjs'],
    productionReadiness: 'Preparation-only probe contract with explicit metrics, kill conditions, budget uncertainty, owner authority, and promotion non-advancement.',
    notes: 'src/commercial-experiment.mjs' },
  { id: 'distribution-channel-registry', name: 'Distribution channel registry and fail-closed allocator', status: 'TEST_VERIFIED',
    dependencies: ['commercial-experiment-compiler'], testRefs: ['tests/distribution-channel.test.mjs'],
    productionReadiness: 'Ranks only channels with verified cleared-payment outcomes; returns DO_NOT_DISTRIBUTE without that evidence and never sends or spends.',
    notes: 'src/distribution-channel.mjs' },
  { id: 'commercial-outcome-lineage', name: 'Commercial outcome lineage and payment-proof gate', status: 'TEST_VERIFIED',
    dependencies: ['payment-truth', 'opportunity-registry'], testRefs: ['tests/commercial-outcome.test.mjs'],
    productionReadiness: 'Normalizes outcome lineage through auditLog; cleared-payment status requires the existing payment classifier plus provider event proof. No parallel revenue ledger.',
    notes: 'src/commercial-outcome.mjs' },
  { id: 'commercial-learning-memory', name: 'Commercial outcome learning and economic memory', status: 'TEST_VERIFIED',
    dependencies: ['commercial-outcome-lineage'], testRefs: ['tests/commercial-learning.test.mjs'],
    productionReadiness: 'Aggregates only normalized payment-proof receipts from auditLog; observations, contradictions, missing margin, and refund uncertainty remain explicit. No allocator, promotion, or spend authority.',
    notes: 'src/commercial-learning.mjs' },
  { id: 'task-universe-engine', name: 'Task Universe Engine contracts', status: 'TEST_VERIFIED',
    dependencies: ['durable-queue', 'commercial-learning-memory'], testRefs: ['tests/task-universe.test.mjs'],
    productionReadiness: 'Blueprint, trigger, policy, dependency, bounded instance, evaluator, receipt, and learning primitives are local-only and deterministic. They do not create a second task store or enqueue work automatically.',
    notes: 'src/task-universe.mjs' },
  { id: 'self-upgrade-pipeline', name: 'Evidence-gated self-upgrade and engineering handoff', status: 'TEST_VERIFIED',
    dependencies: ['task-universe-engine', 'commercial-learning-memory'], testRefs: ['tests/self-upgrade.test.mjs'],
    productionReadiness: 'Creates review-required proposals, bounded engineering packets, and shadow-only gate evaluations. It never runs agents, mutates repositories, promotes, deploys, spends, or grants external authority.',
    notes: 'src/self-upgrade.mjs' },
  { id: 'prometheus-control-tower', name: 'Truthful Prometheus control tower and morning brief', status: 'TEST_VERIFIED',
    dependencies: ['founder-command-center', 'commercial-learning-memory', 'self-upgrade-pipeline'], testRefs: ['tests/prometheus-control-tower.test.mjs'],
    productionReadiness: 'Read-only aggregation plus an optional local audit receipt. It reports unknowns explicitly and cannot claim revenue, agent execution, deployment, or autonomous spend.',
    notes: 'src/prometheus-control-tower.mjs' },
  { id: 'agent-relay-bus', name: 'Bounded multi-agent relay and dispute packets', status: 'TEST_VERIFIED',
    dependencies: ['task-universe-engine', 'self-upgrade-pipeline'], testRefs: ['tests/agent-relay.test.mjs'],
    productionReadiness: 'Prepares evidence-linked GPT/Claude-style task and dispute packets with budgets and a three-round ceiling. No worker connection or agent execution is implied.',
    notes: 'src/agent-relay.mjs' },
  { id: 'mechanism-recombination-lab', name: 'Evidence-linked business mechanism atom lab', status: 'TEST_VERIFIED',
    dependencies: ['opportunity-registry', 'market-signal-registry'], testRefs: ['tests/mechanism-lab.test.mjs'],
    productionReadiness: 'Extracts caller-supplied structured genome fields and generates bounded unproven combinations. It does not scrape, copy, price, promote, or claim demand.',
    notes: 'src/mechanism-lab.mjs' },
  { id: 'business-model-fitness', name: 'Business-model fitness and death-detector review', status: 'TEST_VERIFIED',
    dependencies: ['commercial-learning-memory'], testRefs: ['tests/business-model-fitness.test.mjs'],
    productionReadiness: 'Uses measured local outcome summaries to recommend owner review; insufficient evidence stays HOLD_FOR_EVIDENCE and no model is automatically killed or funded.',
    notes: 'src/business-model-fitness.mjs' },
  { id: 'adapter-contracts', name: 'Lawful provider/source adapter manifests and dry-runs', status: 'TEST_VERIFIED',
    dependencies: ['market-signal-registry'], testRefs: ['tests/adapter-capital.test.mjs'],
    productionReadiness: 'Manifest and dry-run contracts are present, but authentication, terms acceptance, live access, and network calls remain external proof gates. Credentials are not stored.',
    notes: 'src/adapter-contracts.mjs' },
  { id: 'capital-allocation-planner', name: 'Proof-gated capital allocation planner', status: 'TEST_VERIFIED',
    dependencies: ['business-model-fitness', 'commercial-learning-memory'], testRefs: ['tests/adapter-capital.test.mjs'],
    productionReadiness: 'Ranks only caller-supplied candidates with enough cleared-payment and margin proof; produces an owner-review plan with actual spend fixed at zero.',
    notes: 'src/capital-allocator.mjs' },
  { id: 'agent-readiness-checks', name: 'Agent-readiness / structured-data findings', status: 'TEST_VERIFIED',
    dependencies: ['deterministic-audit'], testRefs: ['tests/core.test.mjs'], productionReadiness: 'Production-shaped.', notes: 'src/audit-rules.mjs' },
  { id: 'mcp-bridge', name: 'Claude Code <-> UberBond MCP bridge', status: 'LIVE_UNPROVEN',
    dependencies: [], testRefs: ['tests/claude-mcp.test.mjs'],
    productionReadiness: 'Live-tested locally this session via mcp__uberbond__* tools; not a production-facing surface.', notes: 'scripts/uberbond-mcp.mjs' },
  { id: 'ai-enhanced-findings', name: 'AI-enhanced audit issues (LLM-proposed)', status: 'PARTIAL',
    dependencies: ['deterministic-audit'], testRefs: [], productionReadiness: 'Best-effort, try/catch-wrapped, never the primary path.', notes: 'src/ai.mjs' },
  { id: 'discovery-prospecting', name: 'Discovery / prospecting (Overpass-based)', status: 'PARTIAL',
    dependencies: ['json-store'], testRefs: ['tests/discovery.test.mjs'], productionReadiness: 'Config exists; unclear how much has run against real data.', notes: 'src/discovery.mjs' },
  { id: 'live-outbound-send', name: 'Live outbound email sending', status: 'MISSING',
    dependencies: ['deliverability-guard'], testRefs: [],
    productionReadiness: 'Structurally disabled by every session boundary to date; never attempted.', notes: 'By design, not an oversight.' },
  { id: 'real-checkout', name: 'Configured, working payment checkout', status: 'MISSING',
    dependencies: ['payment-truth'], testRefs: [],
    productionReadiness: 'Checkout URLs empty in current config -- the actual #1 blocker to a first real dollar.', notes: 'Owner action, not an engineering gap.' },
  { id: 'omnia-v9-kernel', name: 'OMNIA V9 formal authorization kernel', status: 'TEST_VERIFIED',
    dependencies: [], testRefs: ['tests/omnia-v9*.test.mjs (36 files, excl. omnia-v9-integration-pipeline.test.mjs)'],
    productionReadiness: 'Recovered onto this branch from the historical Instantly-parity archive (traced lineage: claude/from-v9-complete-build-2026-08-10, PR #24, plus ~3 days of never-pushed work). Kernel + integrations + Cedar policy + migrations + artifacts are present and test-verified on this branch. Only the non-authoritative shadow observer (observeOutboundFinalAdmission) is wired into the live src/pipeline.mjs send path; the AUTHORITATIVE outbound-consequence-gate.mjs + GmailEffectAdapter live-send wiring is deliberately NOT wired in this wave -- see docs/INSTANTLY_RECONCILIATION.md Sub-wave B.',
    notes: 'src/omnia-v9/**, src/omnia-v9/integrations/**. See docs/INSTANTLY_RECONCILIATION.md and docs/PROMETHEUS_BRANCH_RECONCILIATION.md.' },
  { id: 'canon-v3-acquisition-cycle', name: 'Canon/V3 durable staged-job acquisition cycle', status: 'MISSING',
    dependencies: ['durable-queue'], testRefs: [],
    productionReadiness: 'MISSING ON THIS BRANCH ONLY. Real and independently test-verified (317/317) on the unmerged claude/canon-v3-commercial-activation branch (PR #7). Not merged; not on main.',
    notes: 'See docs/PROMETHEUS_BRANCH_RECONCILIATION.md.' },
  { id: 'planetary-signal-adapters', name: 'Social/platform signal adapters (YouTube/TikTok/X/etc.)', status: 'RESEARCH_ONLY',
    dependencies: ['market-signal'], testRefs: [],
    productionReadiness: 'No credentials, no compliant access path this session. Deliberately not built as stubs yet -- see docs/PROMETHEUS_SCOPED_VERDICT.md kill list.', notes: '' },
  { id: 'gmail-integration', name: 'Gmail OAuth send/receive integration', status: 'RESEARCH_ONLY',
    dependencies: [], testRefs: [], productionReadiness: 'OAuth config fields exist; no evidence of a connected account in this data.', notes: 'src/config.mjs google.*' },
  { id: 'sending-domain-registry', name: 'Canonical SendingDomain registry', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'Append-only-receipt-over-auditLog registry, pure state fold, no network call. Real and usable the moment a real domain is registered; zero domains registered on this branch.',
    notes: 'src/sending-domain-registry.mjs' },
  { id: 'sending-mailbox-registry', name: 'Canonical SendingMailbox registry', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'Same pattern as the domain registry; structurally rejects any secret-shaped field at intake rather than storing and redacting it.',
    notes: 'src/sending-mailbox-registry.mjs' },
  { id: 'dns-verification', name: 'Read-only DNS verification (MX/SPF/DKIM/DMARC)', status: 'TEST_VERIFIED',
    dependencies: [], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'LIVE-CAPABLE: uses real node:dns/promises by default (confirmed functioning in this environment this wave); resolver is injectable so automated tests stay network-free. Never guesses a DKIM selector or SPF include -- reports BLOCKED when the provider contract is not supplied.',
    notes: 'src/dns-verification.mjs' },
  { id: 'provider-adapter-contract', name: 'Outreach-provider adapter contract (Instantly/Google Workspace/Microsoft 365)', status: 'PARTIAL',
    dependencies: [], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'The capability interface and an unconfigured fixture adapter (reports PROVIDER_AUTH_REQUIRED for every capability) are real and tested. No real HTTP client for any provider is implemented -- zero provider credentials are configured on this branch, and building an unverified live client would itself be a fabrication risk.',
    notes: 'src/provider-adapter-contract.mjs' },
  { id: 'warmup-orchestrator', name: 'Native provider warm-up orchestration', status: 'TEST_VERIFIED',
    dependencies: ['provider-adapter-contract', 'sending-domain-registry', 'sending-mailbox-registry'], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'Decision logic only calls a provider adapter\'s own capabilities and folds its real response; with the unconfigured fixture adapter (the only one wired up), every call reports WARMUP_BLOCKED / PROVIDER_AUTH_REQUIRED, honestly.',
    notes: 'src/warmup-orchestrator.mjs' },
  { id: 'domain-mailbox-circuit-breaker', name: 'Automatic domain/mailbox circuit breakers', status: 'TEST_VERIFIED',
    dependencies: ['sending-domain-registry', 'sending-mailbox-registry'], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'Pure decision function; pause is persisted by the caller through the registries. Covers every trigger condition the mission specified.',
    notes: 'src/domain-mailbox-circuit-breaker.mjs' },
  { id: 'live-activation-gate', name: 'Live warm-up activation rule (9-state decision)', status: 'TEST_VERIFIED',
    dependencies: ['provider-adapter-contract', 'warmup-orchestrator', 'dns-verification'], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'Deterministically returns BLOCKED_PROVIDER_AUTH today (no provider configured) -- proven by test, not asserted. Never simulates activation or fabricates a receipt.',
    notes: 'src/live-activation-gate.mjs' },
  { id: 'domain-mailbox-gate', name: 'Domain/mailbox deny-only pre-check (composes with Deliverability Guard/V9)', status: 'TEST_VERIFIED',
    dependencies: ['sending-domain-registry', 'sending-mailbox-registry', 'deliverability-guard'], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'Can only DENY or REVIEW_REQUIRED; its pass state is explicitly named NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE, never ALLOW, so it cannot be mistaken for final authorization. Not yet wired into Pipeline.maybeSend (no live send path exists for domain/mailbox-based outreach yet).',
    notes: 'src/domain-mailbox-gate.mjs' },
  { id: 'domain-mailbox-control-center', name: 'Beginner Domain and Mailbox Readiness dashboard + operator action card', status: 'TEST_VERIFIED',
    dependencies: ['sending-domain-registry', 'sending-mailbox-registry'], testRefs: ['tests/domain-mailbox-readiness.test.mjs'],
    productionReadiness: 'Read-only; never reports a green check without a backing recorded event.',
    notes: 'src/domain-mailbox-control-center.mjs' },
  { id: 'outreach-governance', name: 'Outreach governance policy layer (Cedar-backed)', status: 'TEST_VERIFIED',
    dependencies: [], testRefs: ['tests/outreach-workbench.test.mjs', 'tests/outreach-operator.test.mjs', 'tests/outreach-automation.test.mjs'],
    productionReadiness: 'Recovered from the historical Instantly-parity archive (docs/INSTANTLY_RECONCILIATION.md). Self-contained policy/authorization logic layered on omnia-v9 canonical primitives; no network calls, no provider wiring.',
    notes: 'src/outreach-governance.mjs' },
  { id: 'outreach-workbench', name: 'Outreach campaign workbench (drafting, sequencing, review)', status: 'TEST_VERIFIED',
    dependencies: ['outreach-governance', 'json-store'], testRefs: ['tests/outreach-workbench.test.mjs'],
    productionReadiness: 'Recovered from the historical archive. Operates on store collections only (replyDrafts, automationPlans); not wired into any live send path -- src/pipeline.mjs only consults the omnia-v9 shadow observer, not this module.',
    notes: 'src/outreach-workbench.mjs' },
  { id: 'outreach-automation', name: 'Outreach automation plans/runs engine', status: 'TEST_VERIFIED',
    dependencies: ['outreach-governance', 'json-store'], testRefs: ['tests/outreach-automation.test.mjs'],
    productionReadiness: 'Recovered from the historical archive. Plans and records automation runs against store data; not wired to job-handlers.mjs or worker.mjs on this branch, so nothing runs automatically yet.',
    notes: 'src/outreach-automation.mjs' },
  { id: 'outreach-operator', name: 'Outreach operator visibility/control surface', status: 'TEST_VERIFIED',
    dependencies: ['outreach-governance', 'json-store'], testRefs: ['tests/outreach-operator.test.mjs'],
    productionReadiness: 'Recovered from the historical archive. Read/summarize-only over store data; not exposed through any server.mjs route yet.',
    notes: 'src/outreach-operator.mjs' },
  { id: 'outreach-provider-events', name: 'Outreach provider webhook/event ingestion model', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/outreach-provider-events.test.mjs'],
    productionReadiness: 'Recovered from the historical archive. Pure event-normalization logic against the store; no live webhook endpoint receives real provider traffic on this branch (webhookSecret config field is recovered but not consulted by any route).',
    notes: 'src/outreach-provider-events.mjs' },
  { id: 'outreach-upgrades', name: 'Outreach self-upgrade proposal generation', status: 'TEST_VERIFIED',
    dependencies: ['outreach-governance'], testRefs: ['tests/outreach-upgrades.test.mjs'],
    productionReadiness: 'Recovered from the historical archive. Produces owner-review proposals only; applies nothing automatically.',
    notes: 'src/outreach-upgrades.mjs' },
  { id: 'opportunity-factory', name: 'Opportunity factory (job/prospect seed generation)', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/opportunity-factory.test.mjs'],
    productionReadiness: 'Recovered from the historical archive along with its owner-authored data/opportunity-factory/seed-register.json seed data (includes a real prior-contact suppression tombstone). Dry-run script only (scripts/opportunity-factory-dry-run.mjs); no scheduled job runs it.',
    notes: 'src/opportunity-factory.mjs' },
  { id: 'lead-generation', name: 'Lead generation pipeline', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/lead-generation.test.mjs', 'tests/lead-generation-benchmark.test.mjs'],
    productionReadiness: 'Recovered from the historical archive. Operates on synthetic/caller-supplied candidate data in tests; no live external lead-source credentials are configured on this branch.',
    notes: 'src/lead-generation.mjs, src/lead-generation-benchmark.mjs' },
  { id: 'lead-intelligence-v3', name: 'Lead intelligence enrichment/signal scoring (v3)', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/lead-intelligence-v3.test.mjs'],
    productionReadiness: 'Recovered from the historical archive. Pure scoring/enrichment logic over store-held signals; no external enrichment provider is wired in.',
    notes: 'src/lead-intelligence-v3.mjs' },
  { id: 'lead-operations', name: 'Lead operations task queue/state management', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/lead-operations.test.mjs'],
    productionReadiness: 'Recovered from the historical archive. Manages leadTasks store collection; no worker/job-handler currently drains this queue on this branch.',
    notes: 'src/lead-operations.mjs' },
  { id: 'prospect-import-v2', name: 'Prospect import with evidence-bound normalization', status: 'TEST_VERIFIED',
    dependencies: ['json-store'], testRefs: ['tests/prospect-import.test.mjs'],
    productionReadiness: 'Recovered superset of the prior prospect-import.mjs (adds normalizeImportedContact/normalizeImportedEvidence); core importProspects logic unchanged and backward-compatible.',
    notes: 'src/prospect-import.mjs' },
  { id: 'cloud-agent-relay', name: 'Governed ChatGPT <-> UberBond <-> Claude Code cloud relay', status: 'TEST_VERIFIED',
    dependencies: ['agent-relay-bus', 'durable-queue', 'json-store'], testRefs: ['tests/cloud-agent-relay.test.mjs', 'tests/claude-mcp.test.mjs', 'tests/postgres-store-live.test.mjs'],
    productionReadiness: 'Merged from PR #28 (agent/cloud-agent-relay) and audited this wave. Real proof obtained: (1) a real local HTTP server + a real local MCP process driven over actual stdio JSON-RPC completed init -> tool-list -> poll -> claim -> submit -> rejected-replay, with the bearer token scanned absent from all captured process output; (2) claimJobsByType/excludeTypes concurrency proven against a real embedded PostgreSQL 18 server (FOR UPDATE SKIP LOCKED, two workers racing for one relay task, target-agent isolation). Two real defects found and fixed during this audit: a double-escaped secret-value regex that never matched real "Bearer <token>" strings, and an unanchored "sk-" OpenAI-key pattern that false-positived on ordinary ids like "task-<timestamp>" (both have regression tests). A rate limiter was added (was previously absent) bounding relay routes to config.agentRelay.rateLimitPerMinute per caller IP. NOT LIVE: no deployed reachable URL exists (root vercel.json is absent -- only lite/vercel.json -- so this long-running server.mjs/worker.mjs pair cannot deploy to the current Vercel project as configured), no real UBERBOND_AGENT_RELAY_TOKEN has been generated/set anywhere, and no ChatGPT/OpenAI connector or API credential is configured in this environment. GitHub Actions CI on PR #28 is BLOCKED, not green: both jobs complete in ~3 seconds (too fast for npm ci + npm run check, which takes ~2 minutes locally) and job log downloads return HTTP 404 -- consistent with a runner-allocation/billing failure, not a real test failure, but not independently resolvable from this session.',
    notes: 'src/cloud-agent-relay.mjs, server.mjs (/api/agent-relay/*), scripts/uberbond-mcp.mjs (uberbond_relay_poll/claim/submit). See docs/CHATGPT_CLAUDE_CLOUD_RELAY.md and docs/ARGUS_RELAY_TRUTH.md.' },
  { id: 'commercial-opportunity-catalog', name: 'Evidence-labeled commercial opportunity catalog (237 records)', status: 'TEST_VERIFIED',
    dependencies: ['task-universe-engine'], testRefs: ['tests/commercial-opportunity-catalog.test.mjs'],
    productionReadiness: 'Merged from PR #27. 3 immediate finalists carry dated public buyer-signal evidence; 234 records are explicitly HYPOTHESIS/RESEARCH_ONLY -- no buyer, payment, retention, or profitability proof exists for those. LOCAL_PREPARATION_ONLY; zero provider calls.',
    notes: 'src/commercial-opportunity-catalog.mjs' },
  { id: 'thread-opportunity-universe', name: 'Thread-explicit opportunity universe compiler', status: 'TEST_VERIFIED',
    dependencies: ['commercial-opportunity-catalog'], testRefs: ['tests/commercial-opportunity-catalog.test.mjs'],
    productionReadiness: 'Merged from PR #27. Deterministic compilation from the parent Task Universe module; feeds commercial-opportunity-catalog.',
    notes: 'src/thread-opportunity-universe.mjs' }
]);

const BY_ID = new Map(REGISTRY.map(entry => [entry.id, entry]));

export function listCapabilities({ status } = {}) {
  return status ? REGISTRY.filter(entry => entry.status === status) : REGISTRY.slice();
}

export function getCapability(id) {
  return BY_ID.get(id) || null;
}

// The set of capability ids considered "already built" for build-distance
// purposes -- deliberately excludes RESEARCH_ONLY, PARTIAL, and MISSING
// (including the two stranded-but-real lineages, since they are not
// available on THIS branch to actually reuse without the integration work
// docs/PROMETHEUS_CANONICAL_INTEGRATION_PLAN.md describes).
export function existingCapabilityIds() {
  return REGISTRY.filter(entry => ['IMPLEMENTED', 'TEST_VERIFIED', 'LIVE_UNPROVEN'].includes(entry.status)).map(entry => entry.id);
}

export function capabilityGraphSummary() {
  const counts = Object.fromEntries(CAPABILITY_STATUSES.map(status => [status, 0]));
  for (const entry of REGISTRY) counts[entry.status] = (counts[entry.status] || 0) + 1;
  return { policyVersion: CAPABILITY_GRAPH_POLICY_VERSION, total: REGISTRY.length, counts };
}

// Validates that every dependency id actually exists in the registry --
// catches a stale/renamed reference rather than silently returning
// undefined at query time.
export function validateCapabilityGraph() {
  const problems = [];
  for (const entry of REGISTRY) {
    for (const dep of entry.dependencies) {
      if (!BY_ID.has(dep)) problems.push(`${entry.id} depends on unknown capability "${dep}"`);
    }
  }
  const ids = REGISTRY.map(entry => entry.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const id of duplicates) problems.push(`duplicate capability id "${id}"`);
  return { ok: problems.length === 0, problems };
}
