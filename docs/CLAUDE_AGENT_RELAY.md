# UberBond Claude Agent Relay

This packet defines the safe handoff boundary for Claude Code and Claude Cowork.
It does not claim either tool is connected to UberBond.

## Claude Code review lane

Use Claude Code for repository-scoped review and repair only after receiving the
current checkout. The review must preserve `lite/` and must not send messages,
call providers, spend money, change credentials, change DNS, deploy, merge, or
modify production without explicit owner authorization.

Review in this order:

1. Read project instructions, canonical handoff, current worktree, schema, routes,
   workers, tests, and protected paths.
2. Check workspace isolation, authorization, idempotency, suppression, evidence
   expiry, stale recovery, cost ceilings, and receipt completeness.
3. Run build, typecheck, rendered HTML validation, and hostile denial/replay tests.
4. Return exact findings with severity, file, line, reproduction, smallest patch,
   regression test, and rollback note.

## Claude Cowork research lane

Use Cowork for dated research, source comparison, offer discovery, and document
reconciliation. Require primary or official sources where possible. Every finding
must be labeled documented capability, independently tested behavior, measured
outcome, inference, or unknown. Do not scrape private/protected content or copy
competitor code, datasets, designs, or proprietary workflows.

## Return contract

Return: outcome, changed artifacts, tests actually run, truth table, external
effect ledger, benchmark pulse, unresolved risks, next highest-leverage wave, and
PROCEED / REPAIR / STOP decision.
