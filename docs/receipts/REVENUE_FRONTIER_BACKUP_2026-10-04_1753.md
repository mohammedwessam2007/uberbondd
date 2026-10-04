# UberBond Revenue frontier backup — 2026-10-04 17:53 +03:00

Status: **DURABLE RESTORE POINT / NO NEW COMMERCIAL EFFECT**

## Restore point

- Backup branch: `backup/revenue-frontier-2026-10-04-1753`
- Exact backed-up main: `cd545ddc2cb5fdffe2133f281fccd5f45836a809`
- Main lineage at backup: PR #1228 (`Pin Oct 4 live uncertain-effect and transport frontier`)
- Current verified executable lineage recorded by PR #1228: `7913a0be4d3fa5655c2b1b9bcabc29f721dfe9e9`
- Existing Render service remained the production runtime; this backup operation changed no Render state.

The backup branch is intentionally a restore point. It must not be deleted merely because its tree later becomes a subset of a newer main.

## Commercial truth preserved

- Revenue Singularity/G-SPOT software remains consequence-gated.
- Global outbound / OMNIA outbound mode remains off.
- No live G-SPOT dispatcher is bound.
- Material human replies remain manual Mohamed.
- Money Queue has four durable prospects with one ranked; Powerhouse remains the leading current opportunity.
- Powerhouse preflight remains blocked on identity/footer/legal authority and signed-unsubscribe preparation rather than lead quality or message generation.
- Payment rails are not LIVE_READY; provider-witnessed cleared revenue remains zero.
- Winnr IMAP is 3/3 transport healthy.
- SMTP startup evidence before this corrective branch: ordinal 1 READY, ordinal 2 failed/UNCERTAIN and protectively paused, ordinal 3 placement-quarantined.
- Historical Intelo customer-message effect remains `UNKNOWN_0_OR_1`, cap remaining 0, automatic retry/follow-up forbidden. Nothing in this backup upgrades provider acceptance or customer delivery.

## Why the corrective branch exists

PR #1225 introduced a useful zero-message SMTP readiness probe (`TLS -> EHLO -> AUTH -> NOOP -> QUIT`) but an independent audit found two truth defects:

1. local credential/config refusal could be conflated with a provider call / provider-call count could be used as a proxy for whether an account was evaluated;
2. a successful transport probe could create a positive `senderHealth` row, conflating authenticated SMTP reachability with reputation/placement/health evidence.

The corrective branch `fix/winnr-smtp-readiness-truth-current-20261004` is limited to repairing those truth boundaries plus tests. It creates no `MAIL FROM`, `RCPT TO`, `DATA`, seed, prospect message, campaign activation, payment movement, spend, legal authority, or send authorization.

## Restore procedure

If the correction or later parallel work regresses the frontier:

1. inspect `backup/revenue-frontier-2026-10-04-1753` at `cd545ddc2cb5fdffe2133f281fccd5f45836a809`;
2. read the newest issue #1188 frontier and `docs/handoffs/REVENUE_SINGULARITY_CURRENT_2026-10-04.md`;
3. read `docs/receipts/REVENUE_SINGULARITY_UNCERTAIN_EFFECT_LIVE_2026-10-04.md`;
4. preserve the historical Intelo uncertainty and no-replay invariant;
5. reconcile forward rather than resetting or deleting newer evidence.

Truth boundary: this receipt proves a durable Git restore point and records the reason for the correction. It does not prove sales, provider delivery, buyer response, payment, or legal authority.
