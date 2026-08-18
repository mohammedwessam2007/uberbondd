# Claude / UberBond Handoff — 2026-08-19 Outreach OS Reconciliation Wave

## What this wave was

A direct continuation of the same session, same branch
(`claude/uberbond-overnight-shift-o73nrs`), following a user claim that a
historical "Instantly parity" implementation existed and should be
recovered rather than rebuilt from zero. Two bounded search passes (this
wave + the immediately prior turn) across all 4 UberBond-related repos on
the account, every branch, full git history, dangling objects, and
GitHub-wide PR/commit/code search found **no such artifact anywhere**. See
`docs/INSTANTLY_RECONCILIATION.md` for the full account and classification.

## What actually happened instead

The domain/mailbox readiness system built two waves ago tonight (before
this reconciliation mission started) already satisfies most of this
mission's Wave 1-4 asks. This wave: (1) closed the historical search
honestly, (2) did real code-level reconnaissance of the existing base
UberBond pipeline (Gmail send, discovery, contacts, copy/dossier,
suppression, revenue) rather than trusting old reports, (3) extended the
existing SendingMailbox record with two genuinely missing fields
(`currentHourlyCap`, `warmupAgeDays`), (4) wrote the 10 required docs with
honest per-capability status, (5) re-ran the full test suite.

## For the next session/owner

- **Everything is exactly where the previous handoff left it** for the
  economic-spine/Prometheus work — unaffected by this wave.
- **Domain/mailbox/warm-up**: real, tested, `BLOCKED_OWNER_AUTHORIZATION`
  (no domain/mailbox registered) as of this wave's real invocation of
  `evaluateLiveActivation()`. See `docs/OUTREACH_ACTIVATION_CARD.md`.
- **Do not** re-attempt the historical-artifact search without new
  information (a specific repo name, a specific device the zips might be
  on) — it has been run exhaustively twice.
- **Next real engineering wave**, if the owner doesn't supply a domain/
  provider first: the Instantly provider adapter (fastest real
  integration — API-key auth, no OAuth), *once a real API key exists*.
  Do not build it against zero credentials.
- **Test count**: 590/590 passing, 0 syntax errors, 0 audit
  vulnerabilities, `lite/` unchanged — verify with `npm run check` before
  trusting any older report, including this one.
