# UberBond Claude Code Project Memory

@AGENTS.md
@UBERBOND_CANON.md
@docs/UBERBOND_MASTER_MEMORY.md
@docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md
@docs/prompts/CLAUDE_OPUS_MAX_SOFTWARE_FACTORY.md
@docs/memory/CLAUDE_CODE_RESUME_2026-08-30.md

## Mandatory startup

Before the first substantive tool call or plan:

1. Refresh current `main` and never trust a remembered SHA.
2. Invoke/read `.claude/skills/task-observer/SKILL.md` and execute its Session Start Protocol using the stable repository `skill-observations/` workspace.
3. Run `npm run brain` and read the repository brain packet.
4. Run `npm run capabilities:doctor`; distinguish project-native skills from host runtimes that are merely absent/unconfigured.
5. Read `UBERBOND_BOOTSTRAP.json` and every `canonPointers` path.
6. Inspect open/recent PRs, branches, issues and recent commits before writing.
7. Read current state/readiness and dedupe against canonical modules.
8. Apply `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md` plus `src/external-capability-control-plane.mjs` before installing or invoking external skills/plugins/runtimes.

At material commit/PR/deploy/deliverable boundaries, flush any genuinely useful Task Observer observations. Do not invent observations to satisfy a quota.

## Integrated external capability pack

The owner has asked UberBond to integrate and use the following capability sources through one governed control plane:

- **Find Skills**: project skill at `.claude/skills/find-skills/` for candidate discovery.
- **Claude Code Setup**: project-local read-only automation recommender at `.claude/skills/claude-automation-recommender/`.
- **Task Observer**: project-local continuous skill-learning observer at `.claude/skills/task-observer/` with durable `skill-observations/` state.
- **Claude-Mem**: approved host runtime for subordinate session memory when actually installed/configured.
- **Headroom**: approved host runtime for reversible context compression/retrieval when authoritative originals remain available.
- **OmniRoute**: approved isolated host runtime for model/provider routing experiments beneath UberBond model admission policy.
- **Strix**: project skill at `.claude/skills/penetration-testing-with-strix/` plus optional host runtime, limited to owned/authorized targets.
- **Agent Reach**: project skill at `.claude/skills/agent-reach/` plus optional host runtime, limited by default to public/authorized read-only research.

Machine-readable registry: `artifacts/external-skill-plugin-registry.json`.
Deterministic policy: `src/external-capability-control-plane.mjs`.
Host health: `npm run capabilities:doctor`.
Host package plan: `npm run capabilities:bootstrap`.
Explicit host package installation: `npm run capabilities:bootstrap:apply`.

Use the smallest capability that improves the current mission. Do not run every tool merely because it exists.

## Claude-specific routing law

- Missing specialized skill -> check UberBond first, then **Find Skills**.
- Need to optimize the Claude setup -> **Claude automation recommender**, read-only first.
- Repeated correction/manual friction -> **Task Observer**, recommendation-only.
- Long-session recall -> **Claude-Mem**, subordinate to repo memory.
- Large tool/log/context pressure -> **Headroom**, only with originals preserved.
- Provider/model resilience/cost-routing problem -> **OmniRoute** with observable provider/model identity.
- Security verification -> **Strix** only for owned local/test/preview by default; production needs explicit authority.
- Public market/buyer/software research -> **Agent Reach** when it adds coverage and the source is public/authorized; no private-session or bypass behavior.

### Automatic model-failover law

Once OmniRoute and one or more provider/model connections are legitimately configured on the host, model failover is pre-authorized and should not ask the owner for another approval merely because a model/provider reaches a usage limit, quota, rate limit, temporary outage, capacity ceiling, or becomes unavailable.

Treat quota exhaustion as a routing signal, not a mission blocker. Automatically continue through the best available configured model/provider that satisfies the task's capability, cost, privacy, evidence, and policy requirements. Cross-provider and cross-model-family fallback is allowed. Preserve the actual provider/model identity in receipts so UberBond knows what really executed.

This is permission to **route around an exhausted lane**, not permission to evade or bypass the exhausted provider's limits, create unauthorized accounts, rotate identities to defeat quotas, violate provider terms, or conceal the provider/model used. If every legitimately configured provider/model is exhausted or unavailable, report that external capacity blocker instead of fabricating access.

## Installation posture

Project-native skills are part of the repository. Host runtimes remain a separate measured layer because their processes, package managers, Docker, Python, provider keys and services exist outside git.

A real host may run `npm run capabilities:bootstrap:apply` when host package mutation is intended. That script installs packages only: it does not configure LLM/provider credentials, start OmniRoute, run Strix scans, enable Agent Reach `--system`/private channels, spend money or contact anyone.

Never claim a host runtime is installed/configured/healthy until `npm run capabilities:doctor` plus runtime-specific evidence proves it.

## Truth hierarchy

`current repository/executable truth -> durable external provider/customer evidence -> repository canon/master memory/handoffs -> approved working summaries -> plugin/session memory`

Capability never creates authority. A plugin recommendation, memory summary, security score, model route, web result or skill output is not cleared payment, customer acceptance, legal clearance, consent, provider success, demand or renewal.
