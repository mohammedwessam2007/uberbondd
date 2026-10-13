# Winnr post-50/50 authentication: PHOENIX checkpoint (2026-10-13)

Truth class: **REPOSITORY_CHECKPOINT / CODE_READINESS_WITH_FIXTURE_PROOF**. This file separates three things that the
mission asked to keep apart: verified external evidence, code that is written and tested, and effects that have not
happened. Nothing below claims a production deployment or a production import, because neither has occurred.

## 1. Verified external evidence (independently checked)

| Item | Value | How verified |
|---|---|---|
| Authentication run | `38414405557`, workflow "Winnr authentication probe (gated)", conclusion `success` | `actions_get` |
| Authentication commit | `9bd655f85b849fabcb6a331d91e45dfb797ee28b` | `git cat-file`, `git log` |
| Reviewed pin | parent `3a5159503fe476c7a481389557e1c744d1f01217`, an ancestor of the authentication commit | `git merge-base --is-ancestor` |
| Activation change | only `.github/workflows/winnr-auth-probe.yml` changed (rename from `winnr/gated`, pin set) | `git show --stat` |
| Jobs | `preflight` success, `probe` success (approval gate passed, guard passed, export and probe steps passed) | `actions_list` jobs |
| Public receipt | artifact `winnr-auth-probe-receipt` (id 11823747832, 831 bytes), digest `sha256:97907eeb6e7cd26b7adeba9afe47b4ee6d3d53edcdd4818280125e8ccb6073d4` | downloaded and read |
| Receipt result | `AUTHENTICATED_ALL`, `ok: true`, SMTP accepted **50/50**, IMAP accepted **50/50**, probed 50, probe exceptions 0 | receipt JSON |
| Send-safety fields | `messagesSent: 0`, `mailFromIssued: false`, `recipientsIssued: 0`, `dataIssued: false`, `identityFieldsPublished: false` | receipt JSON |
| Preserved copy | `winnr/receipts/AUTH_PROBE_RECEIPT_38414405557.json` (passes `assertPublicSafe`) | committed in this checkpoint |

**Limit of this evidence.** The receipt proves 50 SMTP and 50 IMAP authentications in aggregate. Per-address results
were deliberately kept in the runner's private detail file and were never uploaded, so no public record ties a specific
address to a specific acceptance. The 50 identities are reconciled by count, by the provider snapshot, and by the staging
store, not by a per-address public receipt. Authentication acceptance is not deliverability, reputation, or permission to
contact anyone.

## 2. What was built and verified in this checkpoint (uncommitted until the commits listed in section 6)

Track A, production-compatible import (`src/winnr-production-import.mjs`):
- Plan, execute, verify and rollback. Plan refuses unless the execution gate matches (mode, confirmation string, approval
  reference, a 40-hex reviewed commit, unexpired, exactly 50), the key label is the production label, the store backend is
  Postgres, and the inventory, CSV, provider and duplicate-address gates pass.
- Execute runs in one `store.transaction`. Every planned SMTP sender is held on every run (including senders already
  present), every IMAP account ends disconnected, the lease is written in the same transaction, and verification runs
  **before commit**. Any mismatch throws and rolls the whole batch back. A post-commit read-back is a second, independent
  check. The previous pause reason is kept in `previousPauseReason`.
- A staging-ciphertext guard refuses if any existing account cannot be decrypted with the supplied key. A credential that
  differs from the plan refuses the whole batch. Rollback keeps every sender paused under its own reason, disconnects IMAP
  accounts, and never deletes a credential.
- `src/uberfleet.mjs`: sender selection now fails closed unless the provider is exactly `smtp-relay`. Every current caller
  passes that value explicitly, so no existing send path changes.
- `src/winnr-smtp-readiness.mjs`: the probe decides from a fresh read before it clears or sets a pause. A rollback hold
  written while a probe is in flight is no longer overwritten. A mutation check against the committed code fails the race
  test, and the fixed code passes it.
- `server.mjs`: the sealed bootstrap auto-run on boot is now **opt-in** (`WINNR_SEALED_BOOTSTRAP_AUTORUN=1`). It can send
  real canary mail, so an unattended boot must not start it.
- `src/winnr-runtime-bootstrap.mjs`: IMAP counts as confirmed only on `UBERIMAP_FETCH_CONFIRMED`, not on any `ok: true`.

Track B, reply radar (`src/uberimap.mjs`, `src/pipeline.mjs`, `src/store.mjs`, migration `20261013_unlinked_replies.sql`):
- Ascending UID pagination from the cursor, with a strict `uid > cursor` filter. UIDVALIDITY is read at SELECT. A changed
  validity records nothing and resets the cursor.
- IMAP responses are framed by declared literal length. A message body cannot complete a command or inject a response.
  A UID whose body cannot be read ends the batch as a partial result. After three failed attempts it is quarantined
  deliberately, so one unreadable message cannot block a mailbox.
- Per-account isolation. The cursor moves only to the last recorded UID, and account writes patch cursor fields only.
- Dedupe on `mid:<Message-ID>` when a Message-ID exists, which is stable across UIDVALIDITY resets and forwarding slots.
- Unlinked replies are stored (bounded 500-character preview) in `unlinkedReplies`, which is now a registered Postgres
  collection with an additive migration. The audit-log fallback is removed.
- A delivery notice requires an exact `mailer-daemon@` or `postmaster@` sender, and on IMAP a `multipart/report` structure.
  Bounce or complaint wording without a verified notice becomes `manual_review`, with no suppression, no terminal status
  and no sender charge. Automatic-reply wording requires an `Auto-Submitted` header.
- The hard-bounce charge goes to the sending mailbox (`linkedMessage.inbox`), not to the IMAP mailbox that received the
  notice.
- A reply recorded by an earlier run whose side effects did not finish is finished on the next poll, using a completion
  marker written last.
- Credentials containing CR, LF or NUL are refused before any LOGIN line is built.

Track C, revenue chain (`src/revenue-dry-run.mjs`, `src/payments.mjs`, `src/payment-renewal-truth.mjs`,
`src/commercial-outcome.mjs`, `src/revenue.mjs`):
- `runRevenueDryRun` is pure. It takes caller-supplied `SIMULATED_FIXTURE` data, has no store parameter, performs no I/O,
  and labels every result SIMULATED. It runs eight stages and reports `DRY_RUN_PASSED` only when every invariant holds
  (no cleared or proven status, zero cleared cash, no sent campaign at approval, fixture provenance throughout).
- Sandbox or test environments and test-mode witnesses are refused for proof and never summed. This now applies to refund
  events too, and a test-mode refund cannot attach to a live order.
- Important limit: the "real permitted source evidence" stage is a permitted-source **reference fixture**. No live
  research was performed in this checkpoint.

## 3. Verification (exact commands, this tree)

- All touched and Winnr-related suites: 603 tests, 595 pass, 7 skipped (Postgres-gated), and 1 failure. That failure is the
  reachability classification check, which fails only on the five `ubermind-*` modules that already failed before this
  work. It is not caused by any new module.
- Postgres-backed suites, run on the embedded PostgreSQL wrapper (`node scripts/with-real-postgres.mjs`):
  `tests/unlinked-replies-postgres.test.mjs` and `tests/winnr-postgres-fleet-store.test.mjs`, 4 of 4 pass. This includes the
  new migration applied to a real database.
- Full deterministic suite: 10,180 tests, 10,063 pass, 58 fail. The pre-build baseline was 57 failing subtests. One
  additional failure is `tests/claude-mcp.test.mjs` ("real MCP process polls, claims, and submits"). It passes 9 of 9 when
  run alone on three separate runs, so I classify it as a timing flake under full-suite load, not a regression. The other
  57 are the known set (Crown, JEV, canon and reachability ratchets, plus the revenue-singularity evidence bridge).
- Mutation checks: the readiness race test fails on the committed readiness code and passes on the fix. The reply tests
  reproduce the old behaviour (see the regression list in `tests/winnr-reply-radar.test.mjs`, appended section).

## 4. Adversarial review (five independent reviewers, read-only, with experiments)

The reviewers reproduced several HIGH and CRITICAL defects. Status after this checkpoint:

Fixed in this checkpoint, with regression tests:
- A probe clearing a rollback hold (CRITICAL). Fixed by fresh-read decisions.
- A present identical sender left unheld, and verification after commit (CRITICAL). Fixed: hold on every run, pre-commit verify.
- A present IMAP account left connected (HIGH). Fixed.
- The sealed bootstrap starting on every unattended boot (CRITICAL). Fixed: opt-in.
- Bounce charged to the IMAP mailbox instead of the sending mailbox (HIGH). Fixed.
- A human reply's "undeliverable" wording scheduling an automatic follow-up (CRITICAL). Fixed: `manual_review`.
- An opt-out lost when a store write failed mid-way (CRITICAL). Fixed: completion marker and replay.
- Duplicate ingestion after a UIDVALIDITY reset (HIGH). Fixed: Message-ID dedupe.
- Forged IMAP completion inside a message body (HIGH). Fixed: literal-aware framing.
- A missing literal silently skipped (HIGH). Fixed: partial batch and quarantine.
- A poll loop stopped by one account (HIGH). Fixed: per-account isolation.
- Cursor overwriting a concurrent hold or disconnect (HIGH). Fixed: cursor-only patches.
- Test-mode refund attaching to a live order (HIGH). Fixed.
- Test-mode refund events not refused (HIGH). Fixed.
- Full third-party bodies retained for unlinked mail (MEDIUM). Fixed: 500-character preview.
- A mailbox address written to the audit log (LOW). Fixed for the new entries: the account id is logged.
- CR or LF in IMAP credentials (LOW). Fixed: refused.

Open, not fixed in this checkpoint (must be decided or built before any live use):
- **RFC 3464 bounces without a top-level In-Reply-To** are parked as unlinked and do not suppress (HIGH). A real bounce
  may not suppress its prospect. Needs parsing of the `message/rfc822` part for the original Message-ID and the
  `Final-Recipient`. This is the next engineering item.
- **No owner-visible queue for unlinked replies** (HIGH). They are stored, but nothing routes them to a person yet.
- **Bootstrap canary sends have no pause or reservation check** (CRITICAL, operator-invoked). `dispatchSmtpFleetAccount`
  sends without consulting sender health. The boot-time auto-run is now off, but the operator path remains and must only
  run with explicit authorization.
- **Operator resume clears any pause**, including hard protective pauses (HIGH, pre-existing, `server-core.mjs`).
- **Sender-health writes lack a shared lock with `recordOutboundEvent`** (HIGH, inferred, not reproduced on Postgres).
- **Hard-bounce double counting after a replay** is possible. It is conservative (over-counts), never under-counts.
- **Gmail path** still drops unlinked replies (MEDIUM, pre-existing) and lacks structural DSN checks.
- **Raw dispatch error text** reaches bootstrap and sealed-bootstrap settings (MEDIUM, pre-existing).
- **AI fallback** may send a reply body to an external model when a provider is configured and deterministic confidence is
  below 0.8 (owner decision, see blocker 2).
- The `environment` marker is advisory. Lemon Squeezy events carry only `testMode`, which remains the authoritative flag.
- `pollReplies` processes one batch of at most 100 per account per cycle. It does not drain a backlog within one cycle.

## 5. Owner-only blockers (three at most)

1. **Production import execution.** Needs a trusted runtime that holds the production `TOKEN_ENCRYPTION_KEY` and
   `DATABASE_URL`, a fresh Winnr export produced inside that runtime (plaintext stays there), and an explicit execution
   gate: `mode PRODUCTION_IMPORT`, the confirmation string, an approval reference, the reviewed commit, and an expiry.
   Expected evidence: a receipt with 50 held SMTP senders, 50 disconnected IMAP accounts, and a verification that passes
   before commit. Staging ciphertext must not be copied into production; the guard refuses it.
2. **Reply-path policy decisions.** (a) Whether unlinked third-party mail may be retained, and for how long (currently a
   500-character preview with no retention job). (b) Whether reply bodies may go to an external AI model when one is
   configured. (c) The owner queue design for unlinked replies. None of these is an engineering gap; each is a decision.
3. **Live commercial authority.** The canon still records `PROSPECT_SEND_FROZEN`, `BLOCKED_IDENTITY`, the legal footer and
   sender authority, and no cold outreach authorised (`docs/handoffs/OUTREACH_COMMERCIAL_CURRENT.md`). No email has been
   sent, and none may be sent until the owner authorises it.

## 6. Commits (this checkpoint)

See `git log` on `claude/winnr-fleet-integration-2026-10-13` for the commit list. Each commit groups one track so it can
be reviewed separately. Nothing is merged to main and nothing is deployed.

## 7. Next highest-value internal work

1. Structural DSN parsing (`message/rfc822` original Message-ID, `Final-Recipient`), with a fixture that has no top-level
   In-Reply-To. This closes the bounce-linkage gap.
2. Owner-visible unlinked-reply queue, read-only first.
3. Route bootstrap canary sends through a pause and reservation check.
4. Postgres transaction test for `executeWinnrProductionImport` on the embedded database.
5. Shared-lock write path for sender health.
