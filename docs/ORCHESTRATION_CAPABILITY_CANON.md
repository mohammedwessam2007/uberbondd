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
