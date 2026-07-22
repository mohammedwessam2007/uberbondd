# NEXT SESSION / NEXT ACTION

This session completed and committed (locally, branch `claude/uberbond-pr4-max-score-2vmv60`,
head `f39e634` plus two follow-up continuity-only commits): P0-01, P0-03, P0-04, P0-05, P0-06,
P0-07, P1-10, P1-12, P1-13, and an independent capability/import-graph scan. 281/281 deterministic
tests pass; real isolated-PostgreSQL race suite 5/5 pass; `npm audit` clean; `lite/` byte-identical
to accepted base at every commit. See SESSION_STATE.md and IMPLEMENTATION_REPORT.md (in the
exported review pack) for full detail.

## Immediate next action for a future session

1. Build `src/inbound-accounts.mjs` + a new protected `inboundAccounts` collection: owner-approval
   status, provider, email, `tokenVersion`, encrypted tokens (reuse `src/crypto.mjs`'s
   `encryptJson`/`decryptJson`, same pattern already used for `sealInboundTokens`/
   `openInboundTokens` in `src/gmail-inbound.mjs`), `active` flag. Add it to
   `PROTECTED_COLLECTIONS` in `src/store.mjs` alongside `autonomyCycleRuns`. Add a migration for
   the PostgreSQL table. Add dedicated `createInboundAccount`/`listApprovedActiveInboundAccounts`/
   `replaceInboundAccountTokenCAS({accountId, expectedVersion, encryptedToken, expiresAt})`
   methods on both backends, following the exact pattern of `createAutonomyCycleRun`/
   `patchAutonomyCycleRun` already in `src/store.mjs`.
2. Update `src/gmail-inbound.mjs`'s `inboundGet`/`inboundAccessToken` to persist a refreshed token
   through the new CAS method instead of just returning it unused (it already returns
   `tokenRefreshed: true/false` on the result — this session added that flag but nothing consumes
   it yet).
3. Build `createInboundOnlyRuntime`/`createInboundRuntime` in a new small factory module (per the
   patch guide's Phase F pseudocode), composing config + the new account repository +
   `createGmailInboundReader`, gated by `config.inbound.enabled === true &&
   config.inbound.gmailReadEnabled === true`. Wire it into `scripts/run-autonomy-cycle.mjs`
   (currently calls `runAutonomyCycle` with no `mailboxReader`/`accounts` at all — confirmed gap).
4. Once the account repository exists, revisit `classifyAndSuppressStage` in
   `src/autonomy-cycle.mjs`: replace the current `store.add('replies', {..., from: redactText(...),
   subject: redactText(...), ...})` pattern with a protected `inboundWorkItems` collection storing
   only `messageKey: hmac(gmailId)`, `accountKey: hmac(accountId)`, an encrypted provider
   reference, classification code, confidence bucket, and an `expiresAt` TTL — never raw/redacted
   subject or from text in a generally-readable collection. This closes the rest of P1-11.
5. Only after an explicit owner decision to publish: push this branch, open/update PR #4, then
   retrieve the new CI run's logs (the current CI-01/02/03 rows are Blocked specifically because
   this session was not authorized to push).
6. Do NOT start the Phase 5 revenue-pilot worktree until the items above are addressed — the
   original mission's own ordering gates it on the P2.2 package being "frozen," and P0-08/P1-09/
   P1-11 are not yet in a frozen state.
