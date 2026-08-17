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
  { id: 'omnia-v9-kernel', name: 'OMNIA V9 formal authorization kernel', status: 'MISSING',
    dependencies: [], testRefs: [],
    productionReadiness: 'MISSING ON THIS BRANCH ONLY. Real and independently test-verified (500/459/41-skipped/0-failed) on the unmerged claude/from-v9-complete-build-2026-08-10 branch (PR #24). Not merged; not on main.',
    notes: 'See docs/PROMETHEUS_BRANCH_RECONCILIATION.md.' },
  { id: 'canon-v3-acquisition-cycle', name: 'Canon/V3 durable staged-job acquisition cycle', status: 'MISSING',
    dependencies: ['durable-queue'], testRefs: [],
    productionReadiness: 'MISSING ON THIS BRANCH ONLY. Real and independently test-verified (317/317) on the unmerged claude/canon-v3-commercial-activation branch (PR #7). Not merged; not on main.',
    notes: 'See docs/PROMETHEUS_BRANCH_RECONCILIATION.md.' },
  { id: 'planetary-signal-adapters', name: 'Social/platform signal adapters (YouTube/TikTok/X/etc.)', status: 'RESEARCH_ONLY',
    dependencies: ['market-signal'], testRefs: [],
    productionReadiness: 'No credentials, no compliant access path this session. Deliberately not built as stubs yet -- see docs/PROMETHEUS_SCOPED_VERDICT.md kill list.', notes: '' },
  { id: 'gmail-integration', name: 'Gmail OAuth send/receive integration', status: 'RESEARCH_ONLY',
    dependencies: [], testRefs: [], productionReadiness: 'OAuth config fields exist; no evidence of a connected account in this data.', notes: 'src/config.mjs google.*' }
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
