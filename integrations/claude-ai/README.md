# UberMind Ω20 for claude.ai and the Claude apps (Claude Pro)

| File | Use |
|---|---|
| `dist/ubermind-lean.zip` | Upload in Settings → Capabilities → Skills (code execution must be on). |
| `PROJECT_INSTRUCTIONS.md` | Paste into the UberBond Project's custom instructions. |
| `ubermind-lean/SKILL.md` | Source of the skill. It is derived from `.claude/skills/ubermind-lean/SKILL.md`, which stays the authority in Claude Code. |

Rebuild and validate the package (no network, no provider calls):

```bash
node scripts/ubermind-claude-ai-skill-pack.mjs integrations/claude-ai/dist
node --test tests/ubermind-claude-ai-skill-pack.test.mjs
```

What this does not do: install anything into an account, switch models in chat, run parallel subagents in claude.ai, or read the usage meter. Usage savings remain `UNKNOWN` until a matched before/after `/usage` reading exists.
