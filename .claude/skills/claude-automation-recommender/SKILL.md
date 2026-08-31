---
name: claude-automation-recommender
description: Analyze the UberBond codebase and recommend Claude Code automations (hooks, subagents, skills, plugins, MCP servers). Read-only. Recommendations remain subordinate to UberBond canon, capability dedupe, authority and external-effect gates.
tools: Read, Glob, Grep, Bash
---

# Claude Automation Recommender — UberBond integration

Source: Anthropic `claude-plugins-official`, plugin `claude-code-setup`, pinned at `ed404106fcd80ba98ecb7c851e531dcb626d13b7`.
License: Apache-2.0.

**This skill is read-only.** It analyzes the codebase and outputs recommendations. It does not create or modify files. UberBond applies `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md` and `src/external-capability-control-plane.mjs` before adopting any recommendation.

## Output Guidelines

- Recommend 1-2 of each type by default. Do not overwhelm.
- If asked for a specific type, focus on that type and provide more options.
- Go beyond the static reference lists when current evidence warrants it.
- Dedupe every recommendation against UberBond's existing capabilities before calling it a gap.
- Never infer that a recommended automation gains authority merely because Claude can install or call it.

## Automation Types

| Type | Best For |
|---|---|
| MCP Servers | External integrations and live documentation/tools |
| Skills | Packaged expertise and repeatable workflows |
| Hooks | Automatic reactions to tool/session events |
| Subagents | Specialized parallel reviewers/analyzers |
| Plugins | Bundles of related Claude Code automations |

## Phase 1: Codebase analysis

Gather project context without mutation:

```bash
ls -la package.json pyproject.toml Cargo.toml go.mod pom.xml 2>/dev/null
cat package.json 2>/dev/null | head -80
ls -la .claude/ CLAUDE.md .mcp.json 2>/dev/null
ls -la src/ tests/ scripts/ docs/ 2>/dev/null
```

Before recommending anything for UberBond specifically, also read:

- `AGENTS.md`
- `UBERBOND_CANON.md`
- `UBERBOND_BOOTSTRAP.json`
- `docs/UBERBOND_MASTER_MEMORY.md`
- `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md`
- `artifacts/external-skill-plugin-registry.json`
- `artifacts/system-readiness.json`

Capture language/runtime, frontend/backend, database, external APIs, tests, CI/CD, documentation, existing Claude config, MCP servers, existing skills, provider adapters and canonical modules.

## Phase 2: Generate recommendations

### MCP servers

Read [references/mcp-servers.md](references/mcp-servers.md). Common signals include live docs, browser/UI work, databases, GitHub, cloud, observability and team systems. In UberBond, a new MCP is an external capability supplier, never a new truth store or authority source.

### Skills

Read [references/skills-reference.md](references/skills-reference.md). Prefer project-specific skills when a repeatable workflow can be encoded compactly. Side-effecting skills should be user-only or authority-gated.

### Hooks

Read [references/hooks-patterns.md](references/hooks-patterns.md). Favor hooks that preserve invariants, catch errors or automate safe verification. Never use a hook to bypass UberBond's consequence controls or silently perform external effects.

### Subagents

Read [references/subagent-templates.md](references/subagent-templates.md). Specialized read-only reviewers are usually safer than generic swarms. Workers remain replaceable suppliers beneath canonical state.

### Plugins

Read [references/plugins-reference.md](references/plugins-reference.md). Prefer official/current sources and the smallest bundle that closes a real gap. A plugin recommendation is not approval.

## Phase 3: UberBond recommendation report

For every recommendation state:

1. detected codebase signal;
2. exact missing capability;
3. existing UberBond modules/skills searched;
4. recommended automation and source;
5. why composition of existing capability is insufficient;
6. expected founder-minute/economic benefit;
7. data scope;
8. external-effect/authority surface;
9. installation class: method / project skill / optional runtime / adapter / reference-only;
10. verification and rollback plan.

Only recommend the top 1-2 highest-leverage items per category unless explicitly asked for more.

## Decision framework

Recommend MCP servers when a bounded external service/tool integration is needed. Recommend skills for repeated expertise/workflows. Recommend hooks for reliable automatic local checks and protections. Recommend subagents for specialized parallel analysis. Recommend plugins when a maintained bundle is materially better than a narrow native skill.

## Placement reference

Project skills:

```text
.claude/skills/<name>/SKILL.md
```

Subagents:

```text
.claude/agents/<name>.md
```

Hooks/settings:

```text
.claude/settings.json
```

Shared MCPs:

```text
.mcp.json
```

## UberBond hard constraints

- No second workflow engine, CRM, payment ledger, company memory or distribution truth system merely because a plugin exists.
- Do not recommend auto-edits to `.env`, credentials, lock files or protected paths without a justified mission.
- No recommendation can create customer-contact, spend, provider-call, deployment, DNS, credential, KYC, payment or production-mutation authority.
- Current repository truth and durable external evidence outrank plugin recommendations.
- Prefer the smallest reversible integration and hostile-test it before broad use.
