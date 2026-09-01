# UberBond Capability Genome Canon

Status: foundation integrated; measured public repository-candidate harvest proven; measured skill-body import proven; first measured body-to-capability normalization proven; dedupe, security admission, promotion and continuous world-refresh runtime not proven

Version: 1.0.0-foundation

Date: 2026-09-01

## Purpose

The Capability Genome is UberBond's governed supplier market for discovering, identifying, evaluating, selecting, executing, replacing, internalizing, and revoking useful capabilities from the worldwide agent/software ecosystem.

It optimizes:

`risk-adjusted cleared contribution profit / founder minute`

It does not optimize installed skill count. Repository, package, plugin, MCP server, API, CLI, workflow, framework primitive, Docker service, hosted service, and model-native behavior are all supplier forms. The unit of reasoning is the smallest useful **capability atom**, not the repository label.

## Truth boundary

Current measured state comes from `npm run capabilities:genome:doctor` and the bounded summary emitted by `npm run brain`.

- The ten registered source definitions are discovery policy, not imported records.
- The eight existing external-capability registry entries are measured supplier seeds, not active world-corpus records and not functioning host runtimes.
- SkillsMP's 2,872,898 files and GitSkills' 3,797,117 occurrences are non-comparable creator/research claims. They are not added into an UberBond corpus count.
- World Harvest v1 executed three actual connected public GitHub repository searches and recorded a bounded sample of **30 distinct public repository metadata candidates** in `artifacts/capability-genome/pilot/world-repository-candidates-2026-08-31.json`.
- The measured pilot was produced by `capability-genome-harvest-1.0.0`; the current hardened executor is `capability-genome-harvest-1.0.1`. Historical receipts retain the version that actually produced them.
- Those 30 records are repository-level discovery candidates only. Body import and normalization are separately measured layers and are counted separately from them.
- Body Import v1 read **2 pinned public SKILL.md bodies** at immutable commits and recorded them in `artifacts/capability-genome/pilot/world-skill-bodies-2026-08-31.json` under `SOURCE_PINNED_REFERENCE_ONLY`. The bytes are not copied into this repository.
- Normalization v1 turned those 2 bodies into **2 canonical capability records** at `NORMALIZED`, in `artifacts/capability-genome/pilot/normalized-capability-records-2026-09-01.json`, reproducible with `npm run capabilities:genome:normalize -- --execute`.
- Current measured ladder: **30 repository candidates, 2 imported bodies, 2 normalized capability records, 0 deduped, 0 security-reviewed, 0 eligible, 0 approved, 0 active**. Each of those is a separate counter and none of them implies the next.
- Of the 2 normalized records, **1 matched no atom in the 25-atom taxonomy at all** and **1 claims a single atom**. Both carry `license: UNKNOWN`. One screened `STATIC_CLEAR` and one screened `REVIEW`.
- The measured runs used 3 repository-search calls, 10 body-read calls and 2 normalization re-read calls against public GitHub. They used no credentials, private sessions, CAPTCHA bypass, purchases, messaging, deployment, or customer systems.
- No capability is approved, active, benchmarked, security-clean, or commercially proven merely because its repository was observed.
- `npm run capabilities:genome:harvest` is plan-only by default. Public GitHub execution requires explicit host opt-in plus an external corpus directory, and scaled corpus bodies are refused inside the Git repository.
- Continuous world refresh, million-scale dedupe, the 50K tournament, security sandboxing at scale, and approved supplier promotion remain unfinished.

## Architecture

```text
permitted source registries and APIs
  -> bounded incremental discovery / measured repository harvest
  -> immutable artifact identity + provenance envelope
  -> typed canonical capability + capability atoms
  -> layered family dedupe
  -> license + instruction/code/dependency/behavior immune system
  -> authority admission
  -> progressive full-body retrieval
  -> compatibility-aware minimum bundle
  -> capability x model x task route
  -> isolated benchmark and hostile holdout
  -> approval / activation
  -> bounded mission receipt
  -> real outcome attribution
  -> retain / degrade / replace / revoke / distill
```

Large raw records, bodies, embeddings, sandbox traces, and runtime telemetry do not belong in repository canon. The repository keeps schemas, policies, small indexes, digests, source definitions, and durable decision receipts. A scaled deployment should place normalized metadata and graph edges in Postgres, bodies and raw evidence in immutable object storage, vector/lexical indexes in rebuildable search infrastructure, short-lived retrievals in cache, and signed promotion/revocation receipts in an append-only evidence log.

## Canonical components

| Concern | Durable implementation |
|---|---|
| Capability schema and atoms | `src/capability-genome-schema.mjs`, `schemas/capability-genome.schema.json`, `artifacts/capability-genome/capability-atoms.json` |
| Source registry and adapters | `artifacts/capability-genome/source-registry.json`, `src/capability-genome-discovery.mjs` |
| World repository harvest | `src/capability-genome-harvest.mjs`, `scripts/capability-genome-harvest.mjs`, measured pilot under `artifacts/capability-genome/pilot/` |
| Skill-body read and import | `src/capability-genome-body-fetch.mjs`, `src/capability-genome-body-import.mjs` |
| Body-to-capability normalization | `src/capability-genome-body-normalize.mjs`, `scripts/capability-genome-normalize-bodies.mjs`, `artifacts/capability-genome/atom-evidence-terms.json`, `artifacts/capability-genome/reviewed-unmapped-needs.json` |
| Provenance | `normalizeDiscoveryArtifact` and `buildCapabilityProvenance` |
| Identity and dedupe | `canonicalCapabilityIdentity`, `dedupeCapabilities` |
| Security/license admission | `src/capability-genome-admission.mjs` |
| Retrieval/composition/economics | `src/capability-genome-runtime.mjs` |
| Tournament and benchmark | `evaluateBenchmark`, `capabilityFitness` |
| Model-aware routing | `routeCapabilityModel` |
| Acquisition and receipts | `acquireCapability`, `capabilityExecutionReceipt` |
| Lifecycle/revocation | `transitionCapability`, `revokeCapability` |
| Health and brain state | `src/capability-genome-doctor.mjs`, `scripts/capability-genome-doctor.mjs` |
| Existing seed suppliers | `artifacts/external-skill-plugin-registry.json`, `src/external-capability-control-plane.mjs` |
| Scheduler seam | `prometheus.capability_genome.plan` in `src/job-handlers.mjs` and `src/scheduler.mjs` |
| Host/runtime truth | `npm run capabilities:doctor` |

The prior eight-supplier pack remains authoritative for those suppliers. The Genome wraps it as a seed supplier registry; it does not duplicate or promote Claude-Mem, Headroom, OmniRoute, Strix, Agent Reach, Find Skills, Task Observer, or Claude Code Setup.

## World-harvest law

Public repository metadata is the cheapest discovery layer, not a capability object. The harvest pipeline must preserve separate counters for repository candidates, imported skill/artifact bodies, normalized capability records, approved capabilities, and active capabilities.

GitHub repository search has a practical 1,000-result observable window per query. UberBond therefore partitions searches by bounded date windows and must refine any partition whose reported total exceeds the observable cap or whose API marks results incomplete. It must never call a capped result set complete.

The executor is read-only and counts every provider call. A provider-call ceiling returns partial progress. HTTP 403/429 returns `HARVEST_RATE_LIMITED_NO_BLIND_RETRY`. It does not rotate identities or accounts to defeat limits. Partial partitions are checkpointed before stopping so already-read repositories remain resumable evidence rather than disappearing.

Scaled corpus persistence must live outside Git. `writeMeasuredCorpusBatch` refuses repository-local storage by default and writes immutable manifest plus JSONL candidate records to an explicitly supplied external corpus directory.

## Normalization law

A skill body is a third party's prose about itself. Normalization records what it claims in typed form; it never converts a claim into a capability UberBond can act on.

Four things a body may never decide:

1. **Which atoms exist.** Atom IDs come from `capability-atoms.json`, and a phrase reaches one only through the reviewed table in `artifacts/capability-genome/atom-evidence-terms.json`. Every phrase there is at least two words, enforced in code, because a single common verb would mint atoms out of ordinary vocabulary. Prose matching nothing stays unmapped. Zero matched atoms is a result, not a failure.
2. **Its own blast radius.** `sideEffectClass` is read from the taxonomy entry for the matched atom. A body claiming `messaging.send-authorized-email` cannot present itself to admission as `NONE`.
3. **Its license.** Only an explicit SPDX identifier is recognised. A pointer such as "Complete terms in LICENSE.txt" resolves to `UNKNOWN`, which `evaluateLicense` maps to reference-only — blocking exactly the copying a wrong guess would clear.
4. **Its promotion state.** A record is built at `DISCOVERED` and walked to `NORMALIZED` through `transitionCapability`, so the state has a real history entry. The corpus builder refuses any record not sitting at `NORMALIZED`.

Security evidence from normalization is `STATIC` and nothing else. `admitCapability` requires `STATIC`, `SEMANTIC` and `SANDBOX`, so a single regex pass cannot make a body eligible. Screening is bound to the exact content hash it ran against; a quarantined body is still recorded, because knowing a dangerous skill exists is worth more than pretending it does not.

Declared unmapped needs are prose and stay prose. Prose cannot be selected on, so a gap can never be mistaken for a retrievable capability. A declared need that names an existing atom is refused as a skipped mapping.

A normalized record is a typed description of an untrusted public document. It is not deduped, security-reviewed, eligible, approved, active, installed, or economically proven.

## Identity and dedupe law

Canonical identity keeps origin/alias identity separate from immutable content/revision identity. Dedupe proceeds from strongest deterministic evidence to weaker inferred evidence:

1. canonical and alias identity;
2. content hash;
3. package identity;
4. verified fork/lineage root;
5. instruction/code/manifest similarity;
6. capability-atom signature;
7. dependency graph overlap;
8. observed behavior/output similarity.

A claimed fork field alone is not evidence. Semantic similarity alone is a substitute hypothesis, not authoritative lineage.

## Immune-system law

Community artifacts are untrusted data. A candidate cannot become eligible without independent `STATIC`, `SEMANTIC`, and `SANDBOX` evidence linked to the exact immutable artifact. Important candidates additionally require dependency/SBOM review, vulnerability evidence, network-denied behavior observation, secret canaries where safe, syscall/process observation where available, and hostile cross-tool/memory/retrieval fixtures.

A clean scanner is one signal. Registry presence, stars, signatures, maintainer identity, SLSA provenance, and benchmark scores do not prove safety. Scanners that may execute an MCP configuration must themselves run in isolation.

Unknown, conflicting, or low-confidence license evidence blocks automatic copying or vendoring. Pattern learning, external invocation, vendoring, modification, and native clean-room reimplementation are separate integration decisions. Preserve declared, detected, and concluded license truth independently.

## Authority law

Capability never creates authority. Admission must independently resolve:

- identity and mission;
- input data class;
- target class;
- side-effect class;
- credential and network requirements;
- spend ceiling;
- messaging, customer-system, deployment, production, security-test, and money authority;
- provider and model configuration;
- exact revocation state.

Dangerous side effects require explicit matching permissions. Public discovery never authorizes CAPTCHA bypass, private sessions, cookie harvesting, contact inference, provider-limit evasion, unauthorized security testing, customer mutation, messaging, deployment, or money movement.

## Retrieval and composition law

Do not inject the world catalog into a model context. Retrieve progressively:

`mission -> required atoms -> cheap metadata/hash/lexical filter -> semantic/graph retrieval -> full-body retrieval -> policy gate -> deep rerank -> compatibility-aware minimum bundle`

Full bodies remain untrusted evidence. Selection considers `requires`, `conflicts`, `supersedes`, `substitutes`, redundancy, context burden, dependency burden, cost, latency, security, reliability, and observed outcomes. Revoked records are never selectable.

## Benchmark and promotion law

Promotion follows:

`DISCOVERED -> NORMALIZED -> DEDUPED -> SECURITY_REVIEWED -> ELIGIBLE -> SANDBOXED -> BENCHMARKED -> APPROVED -> ACTIVE`

Exceptional exits are `DEGRADED`, `REPLACED`, `REVOKED`, and `ARCHIVED`. Illegal jumps fail closed.

Important tests compare no skill, current UberBond, candidates, and compositions. They capture task success, quality, reliability, retries, determinism, latency, token/provider/infrastructure cost, founder intervention, recovery, side effects, and capability × model × task behavior. Private rotating holdouts, time splits, canaries, retrieved-content logs, leak checks, and stale-benchmark expiry protect the gate. Security failures dominate benchmark wins.

Benchmarks are not customer demand, cleared payment, accepted delivery, renewal, or contribution profit.

## Economic fitness and learning

Fitness is an evidence-weighted prior over expected contribution, success, reliability, repeatability, founder-minute reduction, leverage, portability, reversibility, security downside, failure, cost, maintenance, context, dependencies, lock-in, license risk, and blast radius. Unknowns remain unknown. The implementation labels every score `ESTIMATED_PRIOR_NOT_REVENUE`.

Every consequential run records mission, capability revision, model, provider, permission decision, input class, effects, cost, duration, result, evidence, founder intervention, and any separate economic-outcome reference. Attribution links do not establish sole causation.

Self-improvement is:

`observation -> hypothesis -> candidate patch -> isolated trials -> hidden regression -> approval -> versioned production -> measured outcome -> retain or rollback`

No execution trace or plugin memory may silently rewrite an active capability.

## Automatic acquisition boundary

Automatic promotion may eventually be enabled only for an explicitly pre-authorized class such as project-local, read-only, no-credential, no-network, no-external-side-effect, permissively licensed, immutable, independently scanned, hostile-sandboxed, and hidden-regression-clean capabilities. The current implementation can now perform bounded public repository-metadata discovery and persist measured corpus batches externally; it still does not auto-install, vendor, execute, or promote world artifacts.

## 24/7 boundary

UberBond already has scheduler, queue, bounded job handlers, agent-mesh routing, retries, idempotency, receipts, and effect controls. The Genome has a daily zero-effect discovery-plan job behind the existing `autopilot && prometheus.schedulingEnabled` gate. World Harvest v1 adds a separately guarded read-only executor, but **continuous execution is not activated by this commit**. A durable external corpus store, scheduled authorized adapter execution, body extraction, sandbox fleet, provider configuration, and elapsed unattended evidence remain required before claiming continuous world refresh or 24/7 capability autonomy.

Capability work must return to the commercial frontier after its foundation earns utility. The next harvest milestone is real immutable body acquisition and normalization for a bounded subset, followed by layered dedupe and security admission, not catalog-size theater.
