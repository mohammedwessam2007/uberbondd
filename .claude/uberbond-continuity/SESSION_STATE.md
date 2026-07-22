# UBERBOND PR#4 REPAIR — SESSION STATE (FINAL, this session)

Last updated: 2026-07-21

## Outcome

Branch `claude/uberbond-pr4-max-score-2vmv60`, local only (not pushed, per explicit instruction),
now sits on top of the accepted P2.1 base (`a905c907...`) with 15 repair commits on top, ending at
`f39e634d19b118b4e02f46ec7acbe6689d843eff`. `lite/` tree hash is byte-identical to the accepted
base at every commit (`caeb6a6d545d18e30a8f4b3442b2b664da1aaac4`).

## Fixed and genuinely proven this session

P0-01 (ancestry), P0-03 (real cancellation), P0-04 (lease epoch + heartbeat), P0-05 (terminal
timeout policy — intentionally reverses a pre-existing test that asserted the opposite), P0-06
(generic store CAS bypass), P0-07 (follow-up stop for every reply class), P1-10 (real verified-
payment count), P1-12 (bounded HTTP), P1-13 (remaining-budget stage timeouts), plus an independent
capability/import-graph scan (`CAPABILITY_GRAPH_SCAN.md`).

281/281 deterministic tests pass (`npm run check`). Real isolated-PostgreSQL race suite (via
`embedded-postgres`, not PGlite/mocked) 5/5 pass, including a genuine `SIGKILL` crash-recovery
test. `npm audit`: 0 vulnerabilities.

## Genuinely NOT done — do not claim otherwise in any future session

- **P0-02 (GitHub CI red)**: Blocked. Check-run metadata read (both jobs failed ~3s, no runner,
  on the wrong-ancestry head `41bd12e`); log content itself 404'd. Root cause still unknown.
  Requires pushing a corrected head to get real evidence — not authorized this session.
- **P0-08 (real Gmail execution not wired)**: Not attempted. Confirmed via capability scan:
  `scripts/run-autonomy-cycle.mjs` never constructs a `mailboxReader` or `accounts`.
- **P1-09 (OAuth refresh token persistence)**: Not attempted. No `inboundAccounts` repository
  exists to persist to. Tied to P0-08.
- **P1-11 (full privacy architecture)**: Partial only. Digest is a hand-built count-only allowlist
  (no runtime unknown-key validator); `redactText` strips emails/URLs/tokens but not names/
  phones/addresses/Unicode. The spec's fuller design (encrypted work items, keyed-hash dedupe,
  retention TTL) needs the same missing account/work-item infrastructure as P0-08/P1-09.
- Browser test suite (`npm run test:browser`): fails in this sandbox due to a missing Playwright
  headless-shell executable path — pre-existing, unrelated to P2.2, not a regression I introduced.

## Next exact action for a future session

1. Build the missing `inboundAccounts` protected-collection repository (owner approval, encrypted
   token CAS keyed by version, keyed-hash message dedupe, retention TTL) — this single piece
   unblocks P0-08, P1-09, and most of P1-11 together.
2. Wire `createGmailInboundReader` + the new account repository into a real
   `createInboundOnlyRuntime` factory, called from `scripts/run-autonomy-cycle.mjs`, gated by both
   `INBOUND_ENABLED` and `INBOUND_GMAIL_READ_ENABLED` exactly `true`.
3. If/when the owner explicitly authorizes publication: push this branch, open/update PR #4,
   retrieve the new CI run's actual logs, and close P0-02 with real green/red evidence.
4. Fill in the remaining individually-Not-Run hostile-matrix sub-scenarios (see
   `UBERBOND_PR4_HOSTILE_TEST_MATRIX_UPDATED.xlsx`, Test Matrix sheet, Status=Not Run rows).

## Recovery state saved: yes

`.claude/uberbond-continuity/{SESSION_STATE,DECISIONS,COMMAND_LOG,TEST_LOG,NEXT_SESSION_PROMPT,
P2_2_ARCHITECTURE_MAP,CAPABILITY_GRAPH_SCAN}.md`, all committed locally.
