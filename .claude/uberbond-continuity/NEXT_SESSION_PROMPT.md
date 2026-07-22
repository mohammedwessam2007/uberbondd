# NEXT SESSION / NEXT ACTION

**2026-07-22 update:** the P0-08/P1-09/P1-11 cluster described below as "immediate next action"
has now been completed and committed (locally, branch `claude/uberbond-pr4-max-score-2vmv60`,
final local repair head `8682e1a0d09905355ccd86b5f2d5ac886a85ec99`). See
`UBERBOND_P2_2_PR4_FINAL_LOCAL_REVIEW_PACK.zip`'s `IMPLEMENTATION_REPORT.md` and
`PRIVACY_THREAT_EVIDENCE_REPORT.md` for full detail on what was built (protected
`inboundAccounts`/`inboundWorkItems` collections, `src/inbound-runtime.mjs` factory, refreshed-
token CAS persistence, `assertExactDigestKeys`) and what genuinely remains open. The original
"Immediate next action" list (items 1-4 below) is preserved as history, not as a live TODO.

---

This session completed and committed (locally, branch `claude/uberbond-pr4-max-score-2vmv60`,
head `f39e634` plus two follow-up continuity-only commits): P0-01, P0-03, P0-04, P0-05, P0-06,
P0-07, P1-10, P1-12, P1-13, and an independent capability/import-graph scan. 281/281 deterministic
tests pass; real isolated-PostgreSQL race suite 5/5 pass; `npm audit` clean; `lite/` byte-identical
to accepted base at every commit. See SESSION_STATE.md and IMPLEMENTATION_REPORT.md (in the
exported review pack) for full detail.

## Immediate next action for a future session (historical — completed 2026-07-22, see update above)

1. ~~Build `src/inbound-accounts.mjs` + a new protected `inboundAccounts` collection~~ — done:
   `migrations/010_inbound_accounts.sql`, `src/store.mjs` (`PROTECTED_COLLECTIONS`,
   `createInboundAccount`/`listApprovedActiveInboundAccounts`/`replaceInboundAccountTokenCAS`/
   `readInboundAccount`/`disableInboundAccount`, both backends).
2. ~~Update `src/gmail-inbound.mjs`'s `inboundGet`/`inboundAccessToken` to persist a refreshed
   token~~ — done: `persistRefreshedToken` helper, 8 hostile tests in
   `tests/gmail-inbound-token-persistence.test.mjs` including concurrent-refresh CAS race.
3. ~~Build `createInboundOnlyRuntime`~~ — done: `src/inbound-runtime.mjs`, wired into
   `scripts/run-autonomy-cycle.mjs`, proven end-to-end with fake HTTP in
   `tests/inbound-runtime.test.mjs`.
4. ~~Revisit `classifyAndSuppressStage`~~ — done: protected `inboundWorkItems` collection
   (`migrations/011_inbound_work_items.sql`), keyed-hash dedupe, encrypted provider ref,
   `assertExactDigestKeys` runtime validator. The hostile privacy-corpus test in
   `tests/inbound-privacy.test.mjs` also caught and fixed a second real leak (plaintext
   `{accountId, refId}` in the checkpointed `poll-inbound` stage result).
5. Only after an explicit owner decision to publish: push this branch, open/update PR #4, then
   retrieve the new CI run's logs (the current CI-01/02/03 rows are Blocked specifically because
   this session was not authorized to push). **Still open** — no session has been authorized to
   push.
6. Do NOT start the Phase 5 revenue-pilot worktree until: (a) an owner-facing HTTP/UI surface to
   actually approve an inbound account exists (the repository/factory are real and tested, but
   there is no route or admin control to create/approve one outside test fixtures — flagged as
   out of scope for the 2026-07-22 session), and (b) the CI push above happens. The original
   mission's own ordering gates Phase 5 on the P2.2 package being "frozen."
