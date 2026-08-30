# Claude Code External Capability Pack — UberBond

This is an execution packet for a **real Claude Code runtime**. It does not claim the packages are installed merely because this file exists.

Read first:

- `CLAUDE.md`
- `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md`
- `artifacts/external-skill-plugin-registry.json`

## 1. Built-in UberBond project skill

Already committed in this repository:

`.claude/skills/uberbond-capability-assimilator/SKILL.md`

Claude Code should discover this project-level skill when working in the repository.

## 2. Claude Code Setup — Anthropic official

Current official plugin page/repository identifies this as a read-only codebase automation recommender.

Inside Claude Code:

```text
/plugin install claude-code-setup@claude-plugins-official
```

If the official marketplace is not already present:

```text
/plugin marketplace add anthropics/claude-plugins-official
/plugin marketplace update claude-plugins-official
/plugin install claude-code-setup@claude-plugins-official
```

Run it as an auditor, then reconcile recommendations against UberBond canon before installing anything else.

## 3. Find Skills — Vercel Labs

Project/user installation through the open Skills CLI:

```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

Use it only when a genuine capability gap appears. Every discovered skill remains a candidate until UberBond's acquisition review clears it.

## 4. Task Observer

Upstream installation guidance supports a project-level Claude Code skill at:

```text
.claude/skills/task-observer/
```

Preserve `SKILL.md` together with its `references/` directory. Treat its output as proposed skill improvements, never silent canonical mutation. Preserve CC BY 4.0 attribution when adapting or redistributing the skill.

Preferred rollout: project-local first. Observation outputs must not contain secrets, credentials, raw private customer payloads, or unnecessary PII.

## 5. Claude-Mem

Upstream currently documents either:

```bash
npx claude-mem install
```

or, inside Claude Code:

```text
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

Use it only as subordinate session memory. It must never outrank `npm run brain`, current `main`, Master Memory, current state/readiness, durable handoffs, or external receipts.

Before using sensitive work, inspect the current upstream data-retention/local-worker configuration and keep secrets outside committed memory.

## 6. Headroom

For a lightweight MCP-style integration, upstream currently documents:

```bash
pip install "headroom-ai[mcp]"
headroom mcp install
```

For automatic proxy compression, upstream documents a local proxy such as:

```bash
headroom proxy --port 8787
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude
```

UberBond default: **MCP/on-demand or bounded local proxy evaluation**, not mandatory global interception. Preserve authoritative originals and retrieval paths. Compare exact task quality/cost against an uncompressed baseline before broad use.

## 7. OmniRoute

Upstream currently documents installation such as:

```bash
npm install -g omniroute
omniroute
```

or a Docker deployment.

UberBond default: **isolated evaluation only**. Do not make OmniRoute the company policy brain. Keep provider/model identity visible, keep credentials outside the repository, and never allow fallback/routing to weaken authority, privacy, evidence or capability requirements.

No provider advertised as "free" is encoded as durable UberBond economics without current provider evidence.

## 8. Strix

Strix publishes agent skills and a local security runtime. Its agent guide currently exposes:

```bash
npx skills add usestrix/strix
```

Use Strix only on UberBond-owned or explicitly authorized targets. Default to local/test/preview scope. No unrelated third-party scanning, persistence, credential theft, destructive exploitation, or uncontrolled live attack activity.

Recommended first use: scan a local/test UberBond surface, verify findings, fix one proven vulnerability, then re-run to validate the remediation.

## 9. Agent Reach

Upstream currently documents skill installation such as:

```bash
npx skills add Panniantong/Agent-Reach@agent-reach
```

and a CLI installer path.

UberBond default: **public/authorized research only**. Enable read/search routes one platform at a time after checking current platform/tool policy and access behavior. Do not use login cookies/private sessions, CAPTCHA bypass, fingerprint spoofing, access-block evasion, private-contact inference, or prohibited scraping.

Use it as a Prometheus/world-sensing supplier for public buyer language, software scouting, competitor research, public market signals and opportunity evidence.

## 10. Recommended activation order

1. Load UberBond's project-local capability assimilator.
2. Install/use Claude Code Setup as a read-only audit.
3. Add Find Skills for candidate discovery.
4. Add Task Observer for skill-improvement observations.
5. Add Claude-Mem if it measurably improves long-session continuity without conflicting with repository memory.
6. Add Headroom if context/token savings preserve exactness and retrieval.
7. Evaluate OmniRoute in isolation if routing/fallback/cost resilience solves a real problem.
8. Add Strix for bounded owned-target security verification.
9. Add Agent Reach platform-by-platform for policy-cleared public research.

## Verification receipt expected from Claude

After a real setup session, Claude must record:

- exact Claude Code version;
- exact installed plugin/skill/runtime versions or refs;
- which are enabled vs merely installed;
- health/doctor outputs where available;
- any hooks/MCP servers added;
- any filesystem/background services created;
- data-retention locations;
- external network/provider effects;
- spend (expected zero unless separately authorized);
- conflicts with existing UberBond modules;
- rollback/uninstall commands;
- measured context/time/cost benefit where possible.

Do not mark this pack `INSTALLED` until those receipts exist from the actual Claude runtime.
