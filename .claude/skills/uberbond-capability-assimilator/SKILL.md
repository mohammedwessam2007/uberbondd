---
name: uberbond-capability-assimilator
description: Use when an UberBond task may benefit from an external agent skill, Claude Code plugin, orchestration framework, MCP server, model gateway, memory system, context compressor, security agent, or research tool. Discovers and selects the smallest approved capability without duplicating UberBond or widening authority.
---

# UberBond Capability Assimilator

Read first:

- `AGENTS.md`
- `UBERBOND_CANON.md`
- `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md`
- `docs/ORCHESTRATION_CAPABILITY_CANON.md`
- `artifacts/external-skill-plugin-registry.json`

## Trigger

Use this skill when:

- a task exposes a missing capability;
- a specialized external skill/plugin might reduce founder minutes;
- a worker is about to install or invoke an external runtime;
- a new public agent tool/repository is proposed;
- a Claude Code automation recommendation appears;
- complex work may benefit from planner/worker separation, bounded DAGs, worktree swarms, adversarial review, or cross-model verification;
- repeated owner corrections suggest a skill improvement;
- large tool outputs create context/cost pressure;
- security verification or broader public-web research is needed.

## Decision sequence

1. State the exact missing capability.
2. Search current UberBond modules/skills first. If already covered, compose the existing capability and stop.
3. Check `artifacts/external-skill-plugin-registry.json` for an approved supplier.
4. If the gap is orchestration, run the provider-neutral protocol in `.claude/skills/uberbond-orchestrator/SKILL.md` and compare the current Fable/Metaswarm/Superpowers reference pack through `src/orchestration-frontier.mjs` before adding another workflow framework.
5. If no suitable supplier exists, use Find Skills / Gamechanger Mesh / current web or repository research to generate candidates.
6. For every candidate record: source, exact ref/version where practical, license, capability, overlap, data scope, external-effect surface, authority, sandbox needs, rollback path, expected benefit, and kill condition.
7. Choose the smallest useful integration class:
   - `CANONICAL_METHOD`
   - `PROJECT_SKILL`
   - `OPTIONAL_RUNTIME`
   - `EXTERNAL_ADAPTER`
   - `REFERENCE_ONLY`
   - `PROJECT_SKILL_AND_OPTIONAL_RUNTIME`
8. Install project-locally/reversibly where possible. Never commit credentials, cookies, private tokens, or raw private customer data.
9. Verify the capability on a bounded task before trusting it broadly.
10. Preserve original authoritative evidence when memory/compression tools are involved.
11. Record durable lessons/receipts and revoke the supplier if it becomes unsafe, stale, redundant, expensive, or inferior.

## Approved supplier behaviors

### Find Skills
Use for candidate discovery only. Popularity is not approval.

### Claude Code Setup
Use as a read-only automation auditor. Reconcile all recommendations against UberBond before adoption.

### Task Observer
Capture corrections, repeated manual work and skill gaps. Produce proposed improvements. Do not silently mutate canon or skills.

### Claude-Mem
Use as subordinate local/session memory. Repository brain and durable evidence always win conflicts.

### Headroom
Use to compress large working context/tool outputs when originals remain recoverable. Never destroy proof to save tokens.

### OmniRoute
Use only as an optional model/provider routing supplier. Preserve model/provider identity and never let fallback widen authority or weaken evidence requirements.

### Strix
Use only on UberBond-owned or explicitly authorized targets, defaulting to local/test/preview. No unrelated third-party scanning or destructive exploitation.

### Agent Reach
Use only for lawful public/authorized research surfaces. No CAPTCHA bypass, access-control evasion, private-cookie harvesting, private-contact inference, or prohibited scraping.

### Fable Orchestrator
Use as the current orchestration-planning baseline and optional local planner runtime.

The project-native method is always distinct from live Fable execution:

- provider-neutral `FABLE_GRAPH` may be used through the UberBond orchestrator skill;
- a real Fable planner may be invoked only when its local runtime actually exists, planner identity is observable, and the callable worker menu has been verified live;
- Fable plans/adjudicates; it does not gain implementation or business authority;
- no secrets belong in its compact task packet;
- upstream user-specific paths and model assumptions are never copied blindly.

### Metaswarm
Use as a method/reference donor for recursive orchestration, independent adversarial review, durable task state, selective knowledge priming and PR lifecycle mechanisms.

Do not wholesale-install it as a second canonical task/memory system without a separate benchmark proving the integration is simpler and economically better than the existing Agent Mesh / Relay / repository brain.

### Superpowers
Use as a method/reference donor for TDD, systematic debugging, behavioral verification, worktrees, planning and subagent review.

Prefer falsifiable behavior tests over string-presence or ceremonial test coverage. Existing UberBond test, Mutation War, authority and truth laws remain controlling.

## Fable N+1 orchestration search

Orchestration suppliers are never permanent gods.

When orchestration materially affects a task or a new candidate appears:

1. call/read `buildOrchestratorDiscoveryPlan()` and the current Gamechanger orchestration-search lane;
2. record source/ref/license and claimed mechanisms;
3. dedupe against Fable, Metaswarm, Superpowers, Agent Mesh, Relay Bus, Wallbreaker and current project skills;
4. score the candidate with `scoreOrchestrationCandidate()` / `buildOrchestrationFrontierTournament()`;
5. reject unbounded recursion, silent credential access, authority expansion and unreviewed licenses;
6. benchmark promising challengers on bounded held-out tasks;
7. compose superior mechanisms before adopting another large runtime;
8. promote only when verification/reliability/cost/founder-minute evidence beats the current baseline;
9. keep rollback/revocation explicit.

Gamechanger Mesh should continuously search for new Claude Code, Codex, Gemini, agent-DAG, swarm, worktree, task-state, TDD and verification systems so discovery does not depend on Mohamed noticing a repository first.

## Skill-improvement loop

`work -> observation -> candidate lesson -> evidence/counterexample -> proposed skill diff -> review/tests -> merge -> version`

Treat owner corrections as strong local evidence, then classify them before generalizing:

- task-specific correction;
- owner preference;
- UberBond project invariant;
- safety/authority rule;
- general reusable technique.

## Output contract

When this skill materially affects a mission, leave a compact receipt containing:

- selected capability/supplier;
- why existing UberBond coverage was insufficient;
- version/ref/source;
- license;
- data/effect/authority boundary;
- what was installed, adapted, composed, or merely referenced;
- verification performed;
- measured or expected founder-minute benefit;
- rollback/revocation instruction;
- unresolved external gates.

Never report installation or execution that did not actually occur.
