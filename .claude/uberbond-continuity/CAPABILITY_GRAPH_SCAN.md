# P2.2 CAPABILITY/IMPORT GRAPH — INDEPENDENT SCAN

Performed by direct `grep`/manual trace from the actual production entry point
(`scripts/run-autonomy-cycle.mjs`), not by trusting `tests/p2-2-capabilities.test.mjs` alone
(those tests are also part of what's under review, so they don't count as independent evidence
by themselves — this scan corroborates them with a separate method).

## Traced static import graph

```
scripts/run-autonomy-cycle.mjs
  -> node:crypto
  -> src/config.mjs          -> node:path
  -> src/store.mjs           -> node:crypto, node:fs/promises, node:path, pg, src/utils.mjs, src/security.mjs
  -> src/autonomy-cycle.mjs  -> node:crypto, src/store.mjs (ConflictError only), src/inbound-classify.mjs

src/inbound-classify.mjs     -> (no imports at all -- pure functions)
src/utils.mjs                -> node:crypto
src/security.mjs             -> node:dns/promises, node:net, node:crypto

src/gmail-inbound.mjs        -> src/crypto.mjs   (NOT statically imported by autonomy-cycle.mjs or
                                                   the entry point -- only reachable if a caller
                                                   explicitly constructs and injects a reader)
src/crypto.mjs                -> node:crypto
```

## Result

- `autonomy-cycle.mjs` never imports `gmail.mjs`, `job-handlers.mjs`, `queue.mjs`, `scheduler.mjs`,
  `pipeline.mjs`, `revenue.mjs`, `send-safety.mjs`, or `unsubscribe.mjs` — confirmed by grep across
  every file in the traced graph; the only textual matches for those module names anywhere in the
  graph are comments stating the prohibition, not actual `import` statements.
- Grep for send-capable symbols (`send`, `sendEmail`, `.draft(`, `.reply(`, `.forward(`, `.modify(`,
  `.trash(`, `.label(`, `outbound.process`, `followups.process`, `reserveOutboundSend`,
  `markOutboundReservation`, `recordOutboundEvent`, `beginOutboundDispatch`,
  `finalizeOutboundDispatch`) across the entire traced graph: zero matches outside comments.
- `store.mjs` (imported for its data-access methods) does define outbound-related *data* methods
  (`reserveOutboundSend`, etc., used elsewhere by the outbound worker) as part of the general Store
  class, but nothing in the P2.2 call path (`runAutonomyCycle` and its three stage handlers) ever
  calls any of them — confirmed by grep for those method names inside
  `src/autonomy-cycle.mjs`/`src/inbound-classify.mjs`: zero calls.
- `src/gmail-inbound.mjs` explicitly never imports `./gmail.mjs` and its `createGmailInboundReader`/
  `createTestGmailInboundReader` factories return frozen objects with no `sendEmail` key (structural,
  not just absent-at-runtime — attempting to assign one throws `TypeError`, proven by an existing
  test).

## Confirmed gap (P0-08, not yet fixed by this repair pass)

`scripts/run-autonomy-cycle.mjs` calls `runAutonomyCycle({ store, cfg: config, runKey, leaseOwner })`
with **no `mailboxReader` and no `accounts`** — there is no inbound-account repository, no owner-
approval mechanism, and no factory composing `createGmailInboundReader` with real credentials
anywhere in the production code path. This is safe (the stage simply reports `blocked` if inbound
is enabled but unconfigured, or `skipped` if disabled — never crashes, never sends) but it does mean
P0-08 ("real Gmail execution is not wired") remains genuinely open. Building the missing
`inboundAccounts` repository + factory is a real, separate piece of infrastructure (ties directly
into P1-09, refreshed-token persistence, which has nowhere to persist to without it) — flagged as
not attempted in this session's final report rather than rushed.
