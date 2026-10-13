# Winnr 50-Mailbox Production Import Runbook

Truth class: `CODE_AND_SYNTHETIC_TESTS_ONLY`. This runbook describes how to plan, execute, verify and roll back the import. It is not evidence that the import has been run against production, that any mailbox authenticates, or that any sender is deliverable.

Code: `src/winnr-production-import.mjs`. Dry-run planner: no planning entry point is committed. Step 1 cannot be run from the repository until the owner approves one. Tests: `tests/winnr-production-import.test.mjs`, `tests/winnr-production-import-hardening.test.mjs`, `tests/winnr-production-import-plan.test.mjs`.

## What the import does

It writes 50 Startup mailboxes (10 customer-owned domains, 5 roles each) into the PostgreSQL store as SMTP senders and IMAP forwarding accounts. Every SMTP sender is paused under `WINNR_PRODUCTION_IMPORT_HOLD`. Every IMAP account is disconnected. Nothing imported is selectable for outbound mail until a separate, later step lifts a hold. The three pilot mailboxes are snapshotted before the write and must be byte-identical after it. Pilot domains are never imported as cold senders.

It sends no mail, makes no SMTP or IMAP connection, and makes no provider call. Live authentication is a separate gated step.

## Inputs (keep every input outside the repository)

| Input | Source | Notes |
|---|---|---|
| Credential export (CSV) | Authorised provider export | Contains passwords. Mode 0600. Never commit. |
| Expected inventory JSON | Environment secret | `startupDomains` (10) and `pilotDomains` (1+). Domain names are business data. |
| Provider inventory | Provider read before the export | Domains and mailbox records, including each mailbox's SMTP and IMAP host and port. |
| Approval gate | Owner | See the gate fields below. |
| `TOKEN_ENCRYPTION_KEY` | Production environment | Never copy the key from staging. |

Gate fields: `mode: "PRODUCTION_IMPORT"`, `confirmation: "IMPORT-50-WINNR-STARTUP"`, `approvalRef`, `reviewedCommit` (40 lowercase hex), `expiresAt` (ISO 8601 with offset), `expectedAccountCount: 50`, `routeAuthorized: true`, `termsCompatible: true`, `encryptionKeyCheck` (16 hex from `winnrProductionKeyCheck(productionKey)`).

Inventory JSON for the dry run: `csvText`, `expectedInventoryText`, `providerDomains`, `providerMailboxes`, `workspaceId`, `routeEvidenceRef`, `storeBackend: "postgres"`, `expectedPilotMailboxCount` (the approved pilot identity count), `executionGate`.

## Step 1: dry-run plan (no writes)

```
# No committed command. See the note above Step 1: a planning entry point needs owner approval first.
```

Exit 0 with `status: PRODUCTION_IMPORT_PLAN_READY` means the inputs are consistent. The printed receipt holds only counts, fixed reason codes, `sourceHash16` and `destinationHash16`. Both hashes are keyed with the production key, so they cannot be recomputed from public inputs. Save the receipt. Do not save the inventory in the repository.

Exit 1 prints one or more reason codes and nothing else. Exit 2 means the inventory path, file or JSON was refused. The script refuses any path inside the repository.

Common refusals:

| Code | Meaning |
|---|---|
| `PRODUCTION_KEY_ENV_MISSING` / `PRODUCTION_KEY_ENV_INVALID` | `TOKEN_ENCRYPTION_KEY` is absent or not 64 hex characters. The value is never echoed. |
| `ENCRYPTION_KEY_CHECK_REQUIRED` | The gate has no `encryptionKeyCheck`. The production runner requires it. |
| `encryption-key-check-mismatch` | The key does not match the approved key. Stop and find out which key was used. |
| `PILOT_MAILBOX_COUNT_REQUIRED` | `expectedPilotMailboxCount` is missing. |
| `pilot-mailbox-count-mismatch` | The provider reports a different number of pilot identities than approved. |
| `mailbox-count-not-N`, `unexpected-domain`, `unexpected-role`, `duplicate-address-in-export`, `pilot-domain-present` | The export does not match the 10 x 5 Startup shape, or it contains a pilot row. |
| `smtp-port-not-implicit-tls`, `imap-port-not-implicit-tls` | Only 465 (SMTP) and 993 (IMAP) are accepted. 25, 587 and 143 are refused. |
| `smtp-host-provider-mismatch`, `imap-host-provider-mismatch`, `smtp-port-provider-mismatch`, `imap-port-provider-mismatch` | The export disagrees with the provider's own record for that address. |
| `imap-username-not-address` | The IMAP login is not the mailbox address. |
| `plan-ciphertext-not-sealed-under-key` | A planned credential does not open under the supplied key. |

## Step 2: execute (authorised runner only)

The plan is process-local. `executeWinnrProductionImport` accepts only a plan that `planWinnrProductionImport` issued in the same process. A plan saved from Step 1 cannot be replayed by another process. The runner must plan and execute in one process, with the same approved gate and the same key.

Expected receipt on first run: `PRODUCTION_IMPORT_EXECUTED`, with `writtenRows: 50`, `pauseWrites: 50`, `smtpAccountWrites: 50`, `imapAccountWrites: 50`, `eligibleAfterImport: 0`, `pilotSnapshotChanged: 0`, and a `destinationHash16` equal to the plan's.

Expected receipt on re-run: `PRODUCTION_IMPORT_ALREADY_PRESENT`, with zero account writes. Holds are re-asserted on every run, so `pauseWrites` is 50 again.

Execution order inside the single transaction:

1. Acquire the lease (`winnrProductionImportLease`).
2. Refuse staging or unreadable ciphertext, duplicate store rows, and a pilot identity count that differs from the approval.
3. Snapshot the pilot rows.
4. Write every hold first, then create the accounts.
5. Verify holds, identities, pilot snapshot, and zero eligible senders on Startup domains. Any failure rolls back the whole batch.
6. Release the lease and commit.

After commit, the read-back repeats the same checks. A failure there is reported as `PRODUCTION_IMPORT_POST_VERIFY_FAILED` and no receipt is stored. Treat that as an incident.

## Step 3: verify

- The receipt has `eligibleAfterImport: 0`, `pilotSnapshotChanged: 0` and `destinationHash16` equal to the plan's.
- `selectFleetMailbox` returns `UBERFLEET_NO_ELIGIBLE_MAILBOX` for the imported senders. The import checks this itself before commit.
- Do not lift any hold in this step. Lifting holds is a separate, later, owner-approved action.

## Rollback

`rollbackWinnrProductionImport` with the same plan, in the same process. It keeps every imported SMTP sender paused under `WINNR_PRODUCTION_IMPORT_ROLLED_BACK`, disconnects every IMAP account, and deletes nothing. Credentials are not rewritten. It is safe to run twice. It is not blocked by an expired approval, because holding senders is the fail-safe direction.

## Interruption, retry and concurrency

- A failure at any write rolls back the lease, the holds and the accounts together. The import tests inject failures at 1, 2, 50, 51, 100 and 150 writes and assert that no planned sender is selectable afterwards.
- A retry after any failure completes the import. A retry after success changes no account.
- Two runs against one PostgreSQL store are serialised by the store's transaction lock. The second run waits, then completes as `PRODUCTION_IMPORT_ALREADY_PRESENT`.
- Two calls on the same store object in one process are refused with `IMPORT_ALREADY_RUNNING`. Rollback is refused the same way while an import is in flight.
- A fresh lease written by another owner, and not released, refuses with `IMPORT_ALREADY_RUNNING`. The import itself never leaves an unreleased lease behind, so this refusal is a guard, not the normal concurrency path.

## Controls mapped to the code

| Control | Where |
|---|---|
| Exactly 50 identities, 10 Startup domains, pilot domains excluded | `planWinnrProductionImport`, `gateCsvInventory`, `gateProviderInventory`, `gateCsvAgainstProvider` |
| Per-row host, port, implicit TLS and IMAP login | `routeFactReasons`, `tlsRouteVerified` |
| Key provenance and sealing | `winnrProductionKeyCheck`, `encryption-key-check-mismatch`, `plan-ciphertext-not-sealed-under-key` |
| Holds before accounts; pre-commit and post-commit checks | `executeImportOnce` (pass 1 and pass 2), `verifyHeldState`, `verifyImportScope` |
| Pilot snapshot, count and no-change check | `pilotSnapshot`, `PILOT_ROWS_CHANGED`, `PILOT_MAILBOX_COUNT_MISMATCH` |
| Zero eligible senders | `eligibleCount` (uses `selectFleetMailbox`), `ELIGIBLE_SENDER_AFTER_IMPORT` |
| Staging ciphertext refusal | `verifyStoreKeyCompatibility`, `STAGING_OR_UNREADABLE_CIPHERTEXT_PRESENT` |
| Identity-based slots | `ACCOUNT_IDENTITY_MISMATCH`, `ACCOUNT_IDENTITY_COLLISION` |
| Receipts: counts, fixed codes, keyed 16-hex digests | `buildPublicReceipt`, `keyedDigest16`, `assertPublicSafe` |

## Not covered by this import

- Live SMTP or IMAP authentication, provider entitlement, DNS, warming, or deliverability. No network call is made.
- Whether staging ciphertext exists in tables other than `accounts`.
- Pilot accounts sealed under a key other than production. Such accounts make the import refuse. This is deliberate.

## External gates

Provider export authorisation, custody of the production key, owner approval of the gate, and an execution window. None of these is supplied by code.
