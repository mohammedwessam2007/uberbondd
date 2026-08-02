# UberBond Revenue Engine — Claude Code entry point

## Operating mode
- Live outbound is disabled: `OUTBOUND_ENABLED=false`, `OUTBOUND_DRY_RUN=true` (see `README.md`). Never claim to have sent a real email, made a payment, or taken any other external-world action unless a tool result proves it.
- `lite/` is a separate deployable (its own `package.json`/migrations) — keep it intact and independent of the main app.
- Apex operating tooling (agents, skills, hooks, rules, settings, statusline) lives under `.claude/`; its library, scripts, and tests live under `tools/elite-duo-apex/`. Sonnet only.

## Architecture entry points
- `server.mjs` — web process. `worker.mjs` — background worker process. `src/` — core modules (queue, discovery, send-safety, revenue, payments, pipeline). `migrations/` — Postgres schema.

## Build & test
- `npm ci`; `npm run check` (syntax check + deterministic tests); `npm test` (deterministic + browser); `npm run db:migrate`.

## Protected paths (do not modify without explicit approval)
`lite/`, `src/`, `server.mjs`, `worker.mjs`, `migrations/`, `package.json`, production/deployment configuration, database state, outbound systems.

## Approval required before
push, merge, deploy, publish, credential changes, purchases, DNS changes, KYC actions, any production data mutation.

## Load on demand, not eagerly
- Apex rules: `.claude/rules/elite-duo-apex/` (11 load every session; 5 are path-scoped and load only for matching files).
- Retired full apex kernel, kept as reference only, not auto-loaded: `.claude/CLAUDE.apex.proposed.md`.
- Apex skills/agents/validator: `.claude/skills/`, `.claude/agents/`, `tools/elite-duo-apex/scripts/validate_repo_deployment.py`.

Put path-specific requirements in `.claude/rules/`, procedures in skills, and learned details in auto memory.
