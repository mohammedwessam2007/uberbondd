# Winnr SMTP readiness truth — LIVE 2026-10-04

Status: **LIVE VERIFIED TRANSPORT TRUTH / ZERO MESSAGE EFFECTS**

## Executable source

- PR: #1229
- Main / deployed SHA: `328abd702d5a41668ff1e43bd89232a671b7b607`
- Render deploy: `dep-db174degekts73ch3pqg`
- Render service: `uberbond-control-plane`
- Deploy status: LIVE

## What was corrected

PR #1225 introduced a useful zero-message SMTP readiness probe, but a later independent audit found two truth defects. PR #1229 repaired them:

1. account evaluation is now separate from actual provider contact;
2. local credential/config refusal records exactly zero provider calls;
3. unexpected provider crossing remains unknown instead of being guessed;
4. successful NOOP transport readiness no longer manufactures a positive sender-health row;
5. only a protective pause created by the readiness probe may auto-clear;
6. placement/manual/bounce/complaint holds remain sovereign.

## Live startup receipt

At `2026-10-04T15:36:24.791Z` Render emitted:

- status: `WINNR_SMTP_AUTH_NOOP_PARTIAL`
- total Winnr SMTP accounts: 3
- evaluated / checked: 2
- provider-contacted: 2
- ready: 1
- failed: 1
- skipped protective: 1
- configured quarantine ordinals: `[3]`
- exact provider calls: 2
- provider-call accounting complete: true
- provider-call unknown accounts: 0
- messages sent: 0
- `MAIL FROM` issued: false
- recipients issued: 0
- `DATA` issued: false
- reputation observed: false
- inbox placement observed: false
- legal authority granted: false
- prospect send authority granted: false
- automatic retry authorized: false

Per-account truth:

- ordinal 1: `READY`, `SMTP_AUTH_NOOP_CONFIRMED`, provider contacted exactly once;
- ordinal 2: `UNCERTAIN`, `SMTP_AUTH_NOOP_FAILED`, provider contacted exactly once and remains protectively paused;
- ordinal 3: `SKIPPED_PROTECTIVE_HOLD`, configured placement quarantine, provider calls 0.

The probe path is TLS → EHLO → AUTH → NOOP → QUIT only. It does not execute `MAIL FROM`, `RCPT TO`, `DATA`, a seed message, or a prospect message.

## Adjacent runtime truth

- Winnr IMAP remains current healthy on all three accounts: 3/3 `UBERIMAP_FETCH_CONFIRMED`.
- Historic reply-canary messages are not present in the current recent lookup window; that does not downgrade transport health.
- OMNIA V9 outbound integration mode remains `off`.
- Money Queue remains 4 prospects / 1 ranked / 1 independently verified route.
- Payment rails remain not LIVE_READY and provider-witnessed cleared revenue remains 0.
- Historical Intelo customer-message effect remains `CUSTOMER_MESSAGE_EFFECT_UNKNOWN`; `prospectMessagePerformed` remains null; automatic retry remains false.
- No retry, follow-up, bulk send, campaign activation, payment movement, spend, DNS mutation, or legal-authority widening occurred in this repair/deploy.

## Remaining sender-readiness provenance gap

`REVENUE_TERMINAL_READINESS` still reports the currently ranked prospect `senderHealthy:true` from the legacy sender-health ledger. The selected Powerhouse sender currently corresponds to a Winnr route whose transport receipt is fresh/READY, so this does not currently contradict the route's live transport observation. However the provenance is still weaker than the intended architecture: a Winnr sender should not be considered terminally healthy solely because an old non-paused sender-health row exists.

Next software hardening should require both:

1. existing non-paused / non-quarantined sender-health state; and
2. a fresh exact-slot Winnr SMTP NOOP receipt whose slot digest matches the selected sender and whose provider-contact evidence is complete and confirmed.

This must be a narrowing gate only. It must never create legal authority, recipient permission, send authority, or a customer effect.

## Backup

The immediately preceding commercial frontier is preserved at:

- branch `backup/revenue-frontier-2026-10-04-1753`
- SHA `cd545ddc2cb5fdffe2133f281fccd5f45836a809`
- receipt `docs/receipts/REVENUE_FRONTIER_BACKUP_2026-10-04_1753.md`

Truth boundary: this receipt proves the live readiness observations above and the absence of message commands in this readiness probe. It does not prove inbox placement, sender reputation, legal authority, buyer permission, provider acceptance of a prospect message, customer delivery, reply, payment, or revenue.
