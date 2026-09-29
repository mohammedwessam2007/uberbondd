# UberBond Orchestration Capability Canon

## Purpose

UberBond treats orchestration itself as an evolvable capability.

The current reference pack is:

1. **Fable Orchestrator** — `codejunkie99/fable-orchestrator`, pinned at `3b653701d48095a488c350f7a9d5b1fca4d37183`, MIT.
2. **Metaswarm** — `dsifry/metaswarm`, pinned at `33d39f776f7fe29098dcf048955756a237e8cb40`, MIT.
3. **Superpowers** — `obra/superpowers`, pinned at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`, MIT.

These are suppliers and mechanism donors beneath UberBond canon. None is a replacement company brain, policy authority, payment truth system, memory authority, or consequence gate.

North star: `risk-adjusted cleared contribution profit / founder minute`.

## Why this exists

Fable contributes a particularly useful split:

`planner/adjudicator -> bounded task graph -> runtime validation -> implementation workers -> evidence -> final adjudication`

Its strongest mechanisms are:

- planning and adjudication separated from implementation;
- compact fact packets rather than hidden workspace assumptions;
- explicit callable-worker menus rather than guessed model availability;
- bounded DAG nodes with role, ownership, dependencies, output, verification and stop conditions;
- safe parallel dispatch when dependencies permit;
- final integration and verification owned by the runtime rather than trusted to workers;
- no credentials in orchestration packets;
- orchestration never widens authorization.

Metaswarm donates complementary mechanisms:

- recursive orchestration for genuinely large epics;
- independent design and adversarial review gates;
- IMPLEMENT -> VALIDATE -> ADVERSARIAL REVIEW -> COMMIT work-unit lifecycle;
- persistent task/knowledge state that survives context loss;
- selective knowledge priming;
- PR lifecycle shepherding;
- cross-model review;
- post-merge learning and reflection.

Superpowers donates complementary discipline:

- explicit brainstorming/specification before architectural work;
- worktree isolation;
- bite-sized plans;
- test-driven development;
- systematic debugging;
- behavioral verification before completion claims;
- parallel-agent dispatch when tasks are independent;
- two-stage spec-compliance and code-quality review;
- reusable skill-writing and skill-testing methodology.

UberBond composes these mechanisms rather than installing three overlapping sovereign workflow systems.

## Constitutional rules

1. **Capability never creates authority.** An orchestrator may decide how authorized work is decomposed; it may not create permission to send, spend, deploy, change credentials/DNS, move money, access private sessions, contact customers, or mutate production.
2. **Current repository/external evidence outranks orchestration prose.** A planner cannot overwrite current code truth with a narrative.
3. **Discovered does not mean callable.** Worker/provider/model availability must be proven from the live runtime before dispatch.
4. **Worker output is evidence, not truth.** The integrator independently inspects artifacts and runs proportionate verification.
5. **No hidden reasoning transport.** Exchange decisions, task packets, evidence, diffs, results and blockers. Do not require chain-of-thought from any model.
6. **No secrets in packets.** Credentials, auth cookies, private tokens, raw payment secrets and unnecessary private customer data stay outside orchestration payloads.
7. **Smallest sufficient graph wins.** One worker is better than a swarm when delegation does not improve expected outcome per founder minute.
8. **Recursion is bounded.** Recursive orchestration requires explicit depth/iteration/compute caps and a circuit breaker.
9. **Parallelism follows dependency truth.** Only independent ready nodes run concurrently.
10. **The orchestrator is replaceable.** Fable, Metaswarm, Superpowers, future Claude/Codex mechanisms and UberBond-native planners compete under evidence.

## UberBond operating modes

### DIRECT

Use one capable worker or Mission Control directly when the task is small, low-coupling and easily verified.

### FABLE_GRAPH

Use for multi-part work where planning quality and clean ownership matter. Required node fields:

- `id`
- `purpose`
- `dependencies`
- `workerRequirement`
- `ownedFilesOrResponsibility`
- `inputs`
- `expectedOutput`
- `verification`
- `stopCondition`
- `authorityCeiling`

### SWARM

Use only when the task contains enough independent or specialist work to justify parallelism. Add:

- independent design/review roles;
- work-unit state;
- cross-model or independent review where useful;
- integration gates;
- iteration cap;
- durable checkpoint/recovery.

### RECURSIVE_SWARM

Use only for genuinely large epics. Every child orchestrator inherits or tightens parent constraints. No child may widen authority, data scope, spend, consequence class or external-effect permissions.

## ChatGPT / Company Brain role

GPT-5.6 Sol / Mission Control may:

- compile the objective and acceptance criteria;
- gather current repository/business evidence;
- choose DIRECT/FABLE_GRAPH/SWARM/RECURSIVE_SWARM by expected value rather than spectacle;
- emit bounded Claude Code relay tasks;
- compare worker receipts against current main and canon;
- adjudicate conflicts;
- choose the next dependency-satisfied task;
- run the Fable N+1 supplier tournament.

ChatGPT must not claim that a local Fable 5.1 runtime executed unless a real runtime receipt proves it.

## Claude Code / Software Factory role

Claude Code may:

- consume the same graph contract;
- use its own verified subagent/worktree capabilities when available;
- invoke a locally configured Fable supplier only when the model/provider is genuinely callable and packet boundaries are satisfied;
- implement bounded nodes;
- run tests and hostile verification;
- return exact diffs, commands, counts, blockers and external-effect receipts;
- use the project skill at `.claude/skills/uberbond-orchestrator/SKILL.md`.

Claude Code does not gain commercial authority by using an orchestration plugin.

## OpenAI / Codex role

OpenAI coding runtimes may use the project-local skill under `.codex/skills/uberbond-orchestrator/` where the harness supports project skills. A host may additionally install the upstream Fable skill into its user-level Codex skill directory after current dependency/security review.

Project canon remains authoritative over user-level plugins.

## Fable runtime boundary

The upstream Fable helper shells out to a locally authenticated Claude Code CLI, uses no session persistence, accepts a compact packet, and intentionally supplies no tools to the planner. UberBond may use that runtime only when:

- the Claude CLI is present;
- the intended planner identity is observable;
- the callable implementation-worker menu is verified from the current runtime;
- no sensitive data is included;
- no raw provider override silently crosses provider boundaries;
- the result is treated as an orchestration proposal until validated by the UberBond runtime.

If these conditions are not met, use the provider-neutral FABLE_GRAPH method without claiming a Fable 5.1 execution.

## Fable N+1 frontier

Fable is a benchmark, not a ceiling.

UberBond continuously searches public software/skill ecosystems for orchestration candidates using Gamechanger Mesh, Find Skills, GitHub discovery, official plugin marketplaces and Capability Genome research.

Standing search themes include:

- agent orchestration and DAG planning;
- Claude Code / Codex / Gemini multi-agent skills;
- recursive swarms and worktree coordination;
- planner/worker separation;
- independent verification and adversarial review;
- task-state durability and context recovery;
- model/provider routing with observable identity;
- TDD/debugging/verification skills;
- skill learning and self-reflection;
- low-context, low-cost orchestration.

Every candidate is scored against the current baseline on:

1. planner/worker separation;
2. bounded DAG quality;
3. callable-worker validation;
4. ownership/dependency discipline;
5. safe parallelism;
6. independent behavioral verification;
7. adversarial/cross-model review;
8. durable task/context recovery;
9. provider/model neutrality and identity observability;
10. authority preservation;
11. secret/data boundary;
12. rollback/replaceability;
13. maintenance/dependency burden;
14. measured founder-minute and economic benefit.

A challenger may be:

- `REJECT`
- `WATCH`
- `REFERENCE_DONOR`
- `COMPOSE_MECHANISMS`
- `PROJECT_SKILL_CANDIDATE`
- `OPTIONAL_RUNTIME_CANDIDATE`
- `PROMOTION_CANDIDATE`

No popularity, star count, README claim, benchmark screenshot or model self-report can promote a supplier by itself.

## Promotion law

`discover -> provenance/license -> security/effect review -> mechanism extraction -> dedupe -> baseline comparison -> sandbox -> hostile tests -> held-out task -> cost/founder-minute comparison -> review -> promote/compose/reject -> monitor -> replace/revoke`

Prefer absorbing a superior mechanism into UberBond's provider-neutral orchestration contract over making a large external framework mandatory.

## Current first verdict

- **Fable Orchestrator:** `PROJECT_SKILL + OPTIONAL_LOCAL_RUNTIME_DONOR`. Adopt the planner/adjudicator split and bounded graph contract immediately; live Fable invocation remains runtime-evidence gated.
- **Metaswarm:** `CANONICAL_METHOD / REFERENCE_DONOR`. Adopt recursive orchestration, independent review gates, durable task state and selective knowledge priming mechanisms. Do not wholesale-install its full workflow stack into UberBond without a separate benchmark proving lower founder minutes and no duplicate truth system.
- **Superpowers:** `CANONICAL_METHOD / REFERENCE_DONOR`. Adopt its TDD, systematic debugging, behavioral verification, worktree and subagent-review disciplines where they strengthen existing UberBond engineering law. Runtime installation remains optional and harness-specific.

The desired long-term state is not "UberBond uses Fable." It is:

> UberBond continuously owns the strongest evidence-backed orchestration method available, and can replace today's planner, worker graph, review method or runtime without replacing the company.


## 2026-09-29 APEX reasoning + Jev integration

The canonical parent layer for high-value reasoning missions is now the **APEX Reasoning Hypercompiler** described in `docs/APEX_JEV_REASONING_HYPERCOMPILER_2026-09-29.md` and implemented by `src/apex-reasoning-hypercompiler.mjs`.

This does not replace the orchestration modes above. It selects and bounds the reasoning topology that may instantiate them.

For high-value cognitive work:

`mission -> APEX topology compilation -> Frontier Cognitive Fabric / council -> Noetic semantic compilation -> Jev/System-One shadow/reflex -> deterministic crystallization -> reality -> decompile on drift`

Permanent rules:

- APEX optimization is quality-first. Cost, latency and founder minutes may break ties only inside a verified frontier-quality band.
- A cheap model, router, Jev score, majority vote, benchmark rank or provider brand may not silently lower the semantic reasoning floor for a consequential APEX task.
- Councils preserve sealed independent first passes; critique and adjudication use identity-blind model-facing packets while runtime provenance remains exact.
- Test-time compute expands with unresolved uncertainty/novelty/stakes and contracts after verification instead of using a fixed ceremonial swarm.
- The unit of competition is the **reasoning architecture**, not merely the model. Complete inference graphs compete on sealed task-class holdouts.
- The offline `Reasoning Architecture Lab` may mutate topology, perspectives, prompts, context, tools, verification, stop rules and reflex boundaries, but it may not mutate authority or activate its own winner.
- Architecture search keeps a quality-diversity archive so one early local optimum cannot erase distinct high-performing reasoning families.
- Specialist agents should persist large structured work as immutable artifacts and return compact references when that reduces coordinator information loss; the coordinator still owns integration.
- Context-management operations may remove material from working context only after durable externalization. Working-context discard is not durable deletion.
- Long-running APEX work may steer or cancel obsolete independent branches and must not let a straggler block unrelated evidence.
- Replacement reasoning architectures should enter bounded canary / side-by-side comparison with rollback evidence before displacing an incumbent.
- Jev remains a replaceable System-One supplier beneath frontier-authored semantic policy. It gains no consequence authority.
- Repeated verified semantic structure should move down the Noetic/crystallization ladder; material drift moves it back upward.
- Public-frontier completeness is a dated research claim only. Global '#1' status requires matched empirical evidence and cannot be self-awarded.

The desired long-term state is therefore stronger than "UberBond uses the best model":

> UberBond owns a provider-neutral compiler that continuously discovers which bounded reasoning architecture produces the strongest verified cognition for each task class, preserves frontier quality where it matters, and progressively crystallizes mastered cognition without transferring authority away from Mohamed or reality.


## 2026-09-29 sealed architecture tournament bridge

APEX architecture search now enters UberBond's existing Nullstar Omega sealed-evidence system through `src/apex-sealed-tournament.mjs`.

Canonical flow:

`precommitted Nullstar holdout -> frozen architecture identity -> exact runs -> salted digest scoring -> aggregate sealed trial receipt -> matched-ceiling APEX Arena -> independent replication candidate -> separately governed promotion`

Permanent rules:

- The holdout commitment binds suite version, corpus digest, manifest digest and task count before evaluation.
- Raw holdouts remain outside the repository; optimizer/candidate pre-evaluation access and plaintext-answer exposure must be false in the commitment.
- The optimizer-facing receipt receives aggregate outcomes, not sealed prompts or plaintext answers.
- Every architecture carries a frozen digest/revision/source/time identity; public baselines additionally require reproduction evidence.
- Runs predating architecture freeze or holdout commitment, and future-dated evidence, are refused.
- A complete run is required for every sealed manifest task; partial cherry-picked coverage is refused.
- `CORRECT`, `INCORRECT` and `ABSTAINED` remain distinct.
- Architecture trials carry measured economics plus independent process evidence.
- Competing trials bind to the same suite version, corpus digest, manifest digest, holdout commitment and task class.
- Competitors run under common cost, founder-minute and latency ceilings.
- A challenger cannot advance beyond **replication candidate** unless its 95% success interval clearly exceeds the incumbent and its false-positive upper bound is not worse.
- `PUBLIC_FRONTIER` mode requires a declared minimum set of reproducible public baselines and may only produce a **public-reviewed-set leader replication candidate**.
- `globalRankAuthority = NONE`; `percentileAuthority = REVIEWED_SET_ONLY`.
- Statistical separation never creates production authority.
- Historical/pretraining leakage, external commitment custody and reproduction fidelity cannot be proven by the local harness alone and remain explicit truth boundaries.
- The bridge reuses Nullstar and the APEX Arena rather than creating a parallel benchmark truth system.

Full contract: `docs/APEX_SEALED_TOURNAMENT_2026-09-29.md`.


## 2026-09-29 Frontier Quality Compression fresh-campaign law

UberBond's cognition-economics frontier now has a pre-execution campaign layer in `src/apex-fresh-campaign.mjs`.

Canonical chain:

`freeze architecture graph -> external fresh holdout commitment -> exact live model/reasoning/transport/pricing proof -> separately authorized execution -> sealed APEX tournament -> independent replication -> governed promotion`

Permanent laws:

- **Frontier quality is lexicographically prior to cost.** Cheap-but-worse is not Frontier Quality Compression.
- The unit of competition is the complete computation graph, not a model's sticker price.
- Architecture identity binds topology, context policy, verifier policy, prompt contract, execution mode, Jev boundary, model counts, reasoning settings, transport class and pricing mode.
- Raw holdouts and plaintext answers remain outside optimizer-visible repository state.
- Architectures freeze before holdout commitment.
- Holdouts must be generated fresh for the campaign; previously evaluated items, derivations from evaluated items and legacy evidence cannot be relabeled as fresh.
- Per-architecture spend ceilings and a total campaign spend ceiling are mandatory.
- Pricing evidence is exact-mode evidence. Interactive pricing cannot settle a Batch claim for the same model.
- Discovery-only model candidates cannot become callable by registry inclusion.
- Readiness planning has zero provider-call, spend and execution authority.
- A sealed winner remains a replication candidate, not a production king or global-rank claim.

Wave 1 is staged at `config/apex-frontier-quality-compression-campaign.json` with a hard total spend ceiling of **$10**, four frozen candidate architecture families and a strict `maxQualityDelta = 0` frontier floor.

The candidate registry has expanded to 20 current discovery candidates while preserving discovery/transport/callability separation. Six 2026-09-29 efficiency-frontier discoveries are deliberately discovery-only until exact runtime admission: MiMo-V2.6-Pro, MiMo-V2.6-Flash, Qwen3.8 Flash, MiniMax M2.5, GLM-5.3-Flash and Doubao Seed 2.1 Lite.

Full contract: `docs/APEX_FRONTIER_QUALITY_COMPRESSION_CAMPAIGN_2026-09-29.md`.
