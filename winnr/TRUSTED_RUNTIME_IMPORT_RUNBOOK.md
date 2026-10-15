# Winnr Startup Fleet: Trusted-Runtime Import Runbook

Status: **PROCEDURE, NOT YET EXECUTED IN A PRODUCTION RUNTIME.** Written 2026-10-13 from branch
`claude/winnr-fleet-integration-2026-10-13`. Contains no secret values. Use it only in a runtime that already holds the
protected production key (`TOKEN_ENCRYPTION_KEY`) and the production PostgreSQL store (`DATABASE_URL`).

## Why a separate runtime

- The sandbox that produced the receipts has no `TOKEN_ENCRYPTION_KEY`. Its credentials were encrypted with a
  staging key that production cannot read. Those ciphertexts must never be written to production.
- The sandbox egress proxy refuses SMTP (465, 587) and IMAP (993) connections. Authentication probes on those ports
  must run from a runtime with direct egress to `inbound.winnr.app`.

## Preconditions (check each one; stop on any failure)

1. `TOKEN_ENCRYPTION_KEY` is present and is 64 hex characters. Do not print it. Check presence and length only.
2. `DATABASE_URL` points at the production store, and `DATABASE_SSL=true` if required by that database.
3. Winnr credential: either the proxy-injected mode (sandbox only), or `WINNR_API_TOKEN` (a `wnr_` token with
   `read` and `write`) in the runtime secret store, used with `--auth-mode=bearer`.
4. The runtime reaches `api.winnr.app:443` and `inbound.winnr.app:465,587,993`. Run the network diagnostic first.
5. The Winnr account is still Startup with 50 of 50 mailboxes in use, and the pilot is intact (see the pilot check).
6. Campaign authority is **not** granted by this procedure. Outbound eligibility stays false.

## Steps

```bash
# 0. Network reachability (no credentials, no bytes written, pilot untouched)
node scripts/winnr-fleet-integration.mjs --workdir=<private dir outside repo> \
  --key-source=env --store-backend=postgres --auth-mode=bearer --phases=network-diagnostic

# 1. Provider read: complete listings, schema check, pilot snapshot
node scripts/winnr-fleet-integration.mjs ... --phases=read

# 2. Startup-only export (write-scoped token required; pilot domain excluded by name)
node scripts/winnr-fleet-integration.mjs ... --phases=export,validate

# 3. Ownership-classified registry plan, then encrypted staging of accounts.
#    Accounts are paused under the probe reason before they are stored, so an interruption cannot leave a live sender.
node scripts/winnr-fleet-integration.mjs ... --phases=register,import

# 4. No-send authentication probes (SMTP AUTH+NOOP, IMAP LOGIN+LOGOUT only)
node scripts/winnr-fleet-integration.mjs ... --phases=probe-smtp,probe-imap

# 5. Reconciliation and pilot check
node scripts/winnr-fleet-integration.mjs ... --phases=reconcile,pilot-check
```

`...` stands for `--workdir=<private dir outside repo> --key-source=env --store-backend=postgres --auth-mode=bearer`
with `--store-dir` not needed for PostgreSQL. The runner refuses `--key-source=env` with a JSON store, and refuses
`--key-source=staging-file` with PostgreSQL. It also refuses staging keys when `NODE_ENV=production`.

## Checks before accepting the result

- `import` returns `IMPORT_READY` with 50 prepared. A `IMPORT_REFUSED` with `existing-store-ciphertext-not-readable-with-key`
  means the production store already holds ciphertext from a different key. Stop and escalate. Do not force it.
- `probe-smtp` and `probe-imap` report classes per account. A `NETWORK_BLOCKED` count is a network result and is not
  an authentication failure. `AUTH_REJECTED` means the stored password was refused. Do not describe either as readiness.
- `reconcile` reports `outboundEligible: 0` until a separate campaign authority is granted.
- `pilot-check` reports `pilotMailboxesPreserved: 3`.

## Rotation and revocation

- Rotation: re-export the 10 Startup domains and re-run `register,import,probe-smtp,probe-imap`. Accounts are keyed by
  stable id, so the upsert replaces the stored tokens. Each SMTP sender is re-paused until its probe passes.
- Revocation of a credential at Winnr is an owner action in the Winnr dashboard. This procedure does not call any
  revocation endpoint and does not claim the old password is invalid.
- Quarantining one sender: set `WINNR_PLACEMENT_QUARANTINE_SLOTS=winnr:<address>` and run the placement quarantine
  with explicit slots. Ordinal quarantine is retired and is refused.

## Rollback

- The import writes only `accounts` and `senderHealth` rows for the 50 Startup slots. The supported rollback is to pause
  those 50 SMTP slots with `setSenderPaused(slot, true, 'winnr-fleet-rollback')`. Pausing alone makes a sender
  unselectable. This runner has no account-deletion step, and the store's delete semantics have not been verified
  for this procedure, so do not delete rows as part of a rollback without a separate, reviewed step.
  The pilot rows have different ids and slots and must not be touched.
- Registry events are append-only. Roll back by pausing the mailboxes. Do not delete events.

## Truth boundary

This runbook changes no provider state. It sends no message. A successful probe proves only that the server accepted
the login or AUTH command at that moment. It proves nothing about deliverability, reputation, placement, legal
permission to contact anyone, or revenue.
