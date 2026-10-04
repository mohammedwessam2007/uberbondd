# Frozen Prospect Canary Reconciliation — 2026-10-04

Status: **CURRENT ADDITIVE TRUTH RECEIPT**. This supersedes any Oct 4 statement that no prospect effect was attempted after the owner exact-effect UI became live. It does not erase earlier zero-effect receipts; those remain true for their own observation windows.

## Incident

One owner-authorized frozen effect for the exact digest below crossed the SMTP provider-call boundary once:

- authorized digest: `65b86bf22f1060ee307020ac8f304e55f788ccd88cba10d37108bae35c804347`
- sender: `nadia.chen@cedarpointdomains.com`
- recipient: `partnerships@intelo.ai`
- observed persistence error: `2026-10-04T12:11:57Z`
- provider dispatch invocation count: **1**
- automatic retries: **0**
- follow-ups: **0**
- bulk sends: **0**
- effect cap remaining: **0**
- reservation: left active/dispatching for reconciliation

The SMTP provider's acceptance result and provider reference were not durably persisted because the post-dispatch `outbound_events` insert failed with PostgreSQL error `42703`: column `provider_event_id` did not exist. Render's stack trace places the failure in `PostgresStore.add` called by the frozen-effect post-provider ledger transaction.

## Truth boundary

The exact customer-delivery count is **UNKNOWN_0_OR_1**.

Do not rewrite this as either `0` or `1` without independent provider/recipient evidence. The provider call happened once, but the result that would distinguish SMTP `250` acceptance from uncertainty/rejection was lost when the transaction rolled back. No application log from that attempt preserved a provider reference or Message-ID.

Therefore:

- provider calls: `1`
- SMTP acceptance: `UNKNOWN`
- provider reference: `NOT_PERSISTED`
- Message-ID: `NOT_PERSISTED`
- customer delivery: `UNKNOWN_0_OR_1`
- cleared revenue: `0`
- spend directly attributable to this attempt: no direct spend receipt recorded
- retry authority: `NONE`
- required action on this historical effect: **RECONCILE, NEVER REPLAY**

## Root cause

The canonical Postgres store already mapped `outboundEvents.providerEventId` to the SQL column `provider_event_id`, while historical migration `004_unattended_send_safety.sql` did not create that column. The generic insert therefore referenced a column absent from the live table.

## Repair

PR **#1219** repaired the failure class without touching global outbound mode:

- additive idempotent migration creates `outbound_events.provider_event_id` and an index;
- frozen effects receive a deterministic Message-ID before provider dispatch;
- a minimal provider-result reconciliation log is emitted immediately after provider return without message body, subject, credentials, recipient or sender address;
- provider receipt + zero remaining effect cap are committed in an independent checkpoint transaction before secondary ledgers;
- a secondary-ledger failure now returns explicit reconciliation-required state instead of erasing the provider result;
- replay remains refused because any execution checkpoint consumes the one-use effect cap;
- a focused regression deliberately makes the outbound-event ledger fail after simulated provider acceptance and verifies receipt survival + replay refusal.

Merged main: `8d3607d3c1466ffdfc3faf360dd59c6d04d0ba4f`.

Render deployment: `dep-db14p949v7es73dulpfg`, **LIVE**, finished `2026-10-04T12:56:12.710127Z` on exact SHA `8d3607d3c1466ffdfc3faf360dd59c6d04d0ba4f`.

The production build succeeded, web and worker restarted on PostgreSQL, and `OMNIA V9 outbound integration mode: off` remained unchanged. No execution request was made during repair/deploy.

## Canon correction

Any newer recovery surface must preserve all of these simultaneously:

1. Earlier zero-effect receipts remain valid for the windows they observed.
2. After the owner exact-effect UI became live, one exact frozen prospect provider call was attempted.
3. Its delivery state cannot be reconstructed from current internal evidence.
4. The attempt must never be retried merely to discover what happened.
5. Campaign activation remains `NOT_ACTIVATED`; bulk outbound remains off; no live G-SPOT dispatcher was bound by this repair.
6. Future exact effects now have stronger post-provider crash durability, but capability still does not create authority.
