# Winnr Startup Fleet: Final Integration PHOENIX Handoff — 2026-10-13

PHOENIX checkpoint: `UBERBOND-WINNR-FLEET-FINAL-INTEGRATION-20261013-BLOCKED-NETWORK-AND-PRODUCTION-KEY`

Branch: `claude/winnr-fleet-integration-2026-10-13` (pushed). Branch HEAD at the time of the receipt: `4ea739b`.
Base before this session's changes: `9cf5783`. `origin/main` is `298bd58`, which is an ancestor of this branch; no
newer commit on `main` touches the Winnr modules.

## Verdict

**Not complete. The 50/50 SMTP and 50/50 IMAP authentications are not verified, and this runtime cannot verify them.**
All reachable work is done. The blocker is network policy in this sandbox plus the production key living only in
Render. Every Startup sender is paused and not outbound-eligible.

## Exact scoreboard (nonsecret; from `winnr/receipts/FLEET_INTEGRATION_RECEIPT_20261013.json`)

| Measure | Result | Evidence class |
|---|---|---|
| Startup mailboxes discovered (provider, complete listing) | **50 / 50** active | Authenticated provider read, `has_more=false`, schema check passed |
| Startup domains discovered and DNS-healthy | **10 / 10** (registrar external, DNS winnr_20, 0 pre-warmed tags) | Provider read |
| Pilot mailboxes preserved | **3 / 3** active; pilot domain **1 / 1** unchanged | Provider re-read vs write-once baseline |
| Credentials securely exported (Startup domains only) | **50 / 50** rows, 0 skipped, pilot rows 0 | Winnr documented `POST /export`, CSV downloaded to private workdir |
| CSV rows cross-checked to provider record (domain, active, host, port, username) | **50 / 50**, 0 mismatches | Provider read vs CSV |
| Domains reconciled and registered as customer-owned | **10 / 10** `CUSTOMER_OWNED_WINNR_DNS`, `OWNER_CONFIRMED` (owner-attested), 0 pre-warmed registrations | Registry plan applied to staging store |
| Accounts encrypted and imported into **staging** store | **50 / 50** SMTP + **50 / 50** IMAP | Staging key only, `productionCompatible: false` |
| Accounts encrypted and imported into **production** store | **0 / 50** | Blocked: `TOKEN_ENCRYPTION_KEY` not present here |
| SMTP authentication passed | **0 / 50** | See network-diagnostic; all failed at connect |
| SMTP network-policy / transport blocks | **50 / 50** (`CONNECT_TIMEOUT` at CONNECT stage) | Probe re-run with fixed classifier |
| SMTP AUTH rejections (wrong password) | **0** | Not reached |
| IMAP authentication passed (LOGIN accepted) | **0 / 50** | Probe re-run |
| IMAP network-policy / transport blocks | **50 / 50** (IPv4 `ETIMEDOUT`, IPv6 `ENOTFOUND`) | Probe re-run |
| IMAP LOGIN rejections (wrong password) | **0** | Not reached |
| Untested accounts | **0** (every account has a recorded attempt; none was skipped) | Reconciliation |
| Senders paused pending eligibility | **50 / 50** | Reconciliation |
| Outbound-eligible accounts | **0 / 50** (no campaign authority granted) | Reconciliation |
| Messages sent | **0** | Every probe path: no MAIL FROM, RCPT TO, DATA, no LOGIN-then-fetch |
| Additional purchases | **$0** | |
| Paid warming enabled | **0** | |
| DNS modifications | **0** | |
| Production deployments | **0** | |
| Merges to main | **0** | |

Network diagnostic (TCP reachability from this sandbox, no credentials, no bytes written):

- `api.winnr.app:443` (control): **TCP connected**
- `inbound.winnr.app:465`: **connect timed out** (10 s)
- `inbound.winnr.app:587`: **connect timed out**
- `inbound.winnr.app:993`: **connect timed out**

This matches the sandbox egress README (non-443 ports unsupported through the proxy) and a direct TLS probe to 465 that
dropped silently. The 443 control shows the block is port-specific. It is not a general outage.

## Test results (exact)

- **Winnr, SMTP, IMAP, fleet and dependent suites (24 files, all modules that import a changed file):** 201 tests,
  **198 pass, 0 fail, 3 skipped**. The 3 skips are the Postgres fleet-store tests, which skip with an explicit message
  unless `OMNIA_V9_TEST_DATABASE_URL` is set.
- **Postgres fleet-store tests, against a disposable embedded PostgreSQL** (`scripts/with-real-postgres.mjs`, not
  production): **3 / 3 pass** (pause-first staging, key-compatibility refusal, readiness probe pause on a real store).
- **Deterministic suite** (`npm run test:deterministic`, run earlier in this session on the branch as it stood then):
  9,925 tests, 9,813 pass, **57 fail**, exit 1. The 57 failing test names are **identical** to those on the pre-change
  base `9cf5783` (verified by running the 30 owning files on both). Owning files are Opus, Crown, JEV, Haiku canary,
  reachability and canon-freshness tests. **None import a changed module.** Reachability ratchet: 3 failures, also on
  base. These are pre-existing and out of scope. The deterministic suite was not re-run after the last three commits.
- Negative-control tests added this session and passing: read-only token refused for export; pilot domain refused in a
  Startup export; duplicate address refused; provider 401 classified as token problem and not retried; 429 classified
  rate-limited and not retried; interrupted import leaves the sender paused; wrong key refused before any store write;
  corrupted ciphertext counted undecryptable; mixed key/store environments refused (verified live on the runner).

## Commits on this branch (this session)

- `ffc018b` (inherited) → `fd0fd5a` (read-only observation) → `9cf5783` (domain-column mismatch refusal, slot holds)
- `3ea2887` ownership classification from provider record; proxy-injected auth mode; slot-keyed quarantine; bootstrap
  ordinal-skip refusal
- `fc13a49` closed-vocabulary SMTP error classes; IMAP cause from family reasons; control plane; export guards
- `5d02418` pause-first staging (interrupted-import defect fixed); environment guard; bearer auth option; runbook
- `4ea739b` bounded checkpointed IMAP probing; write-once pilot baseline; provider-failure classification from receipt;
  Postgres fleet-store test

## Defects found and fixed (provable, with tests)

1. **Ownership bug (mission-named):** the registry plan hard-coded every domain as `PROVIDER_CONTROL_CONFIRMED` /
   `winnr-prewarmed`. Fixed: classification from the provider record; Startup domains are customer-owned.
2. **Positional mailbox selection:** placement quarantine and bootstrap skip used list position. Fixed: explicit slots;
   ordinal input refused.
3. **Generic SMTP error class:** every connect timeout surfaced as `Error`, hiding the cause. Fixed: closed vocabulary.
4. **IMAP connect failure misreported as TLS:** the aggregate error code hid the per-family cause. Fixed.
5. **Interrupted-import window:** the import wrote an account as live before pausing it. A crash between the two left an
   unprobed sender selectable. Fixed: pause first; a test simulates the interruption.
6. **Provider 401 classified as unclassified** because the adapter reports the provider's error code, not the HTTP
   status. Fixed: read the HTTP status from the receipt.
7. **Re-baselining the pilot:** re-running the read phase overwrote the pilot baseline. Fixed: write-once baseline.
8. **Readiness receipt would count a timeout as a non-network error:** the stored readiness receipt predates the
   classifier; it has been re-run with the fixed classifier and is reconciled from the new result.

## Negative evidence and declined options (do not re-adopt)

- **Declined: blind TLS tunnel** on the separate `origin/ops/*` lineage (commit `e35e9ec9`, "fixed-host blind TLS tunnel
  for remaining owner canaries"). It relays SMTP TLS through a hard-coded Supabase TCP egress cell to get around the
  port restriction. That is tunneling to evade a network policy, which this mission forbids. It is **not** ported, not
  enabled and not referenced by any code on this branch.
- **Not reconciled by merge:** the `origin/ops/*` lineage is not an ancestor of `main` and carries older Winnr readiness
  code. It re-introduces the `Number(null) → 0` provider-call defect (fixed here) and lacks the fleet-size ordinal refusal
  and slot-keyed holds. Nothing from it was merged, cherry-picked or overwritten.
- **Render runtime has no in-repo probe route.** `server.mjs` and `src/` expose no Winnr probe, SMTP or IMAP route, and
  `render.yaml` sets `autoDeployTrigger: off`. Running the probes there needs a deploy or a one-off job from this branch.
- **OVH candidate:** `docs/OUTREACH_PROVIDER_REALITY_2026-09-27.md` records an existing OVH server as control-plane
  compute, with outbound SMTP state **not observed** and not countable as an authorized sender. I have no access to it.

## Known gaps (not yet proven)

- Live production-store import (`--key-source=env --store-backend=postgres`) has not run. It is covered by a
  disposable-Postgres test only. The production key is not present here, so the key-compatibility guard has not run
  against the real pilot ciphertext.
- The IMAP checkpoint/resume glue (`imap-checkpoint.json`) has not run live. Its pure selector is tested. The first live
  run will probe every account, because no checkpoint existed.
- Credential revocation at Winnr is an owner action in the dashboard. This branch calls no revocation endpoint.
- Startup ownership is owner-attested (GoDaddy, per the mission text). Winnr's record shows registrar `external` and Winnr
  DNS; it does not show the GoDaddy account. That is recorded as attested, not independently verified.
- The `read` phase has not been re-run after the baseline change. The current snapshot is the 12:37 read.

## Owner action — the single unavoidable step

Authentication cannot be verified from this sandbox. The only path to 50/50 is a runtime that holds the production key
and has outbound 465, 587 and 993. The smallest approval that unblocks it:

1. **Approve one Render one-off job, not a deploy of `uberbond-web`.** It runs the tested runner from branch commit
   `4ea739b` (or its successor named in the approval) with these phases in this order:
   `network-diagnostic` → stop if 465/993 are blocked → `read,export,validate,register,import,probe-smtp,probe-imap,reconcile,pilot-check`.
   The job must run with `TOKEN_ENCRYPTION_KEY` and `DATABASE_URL` already held by Render, `NODE_ENV=production`, and
   `WINNR_API_TOKEN` added to that job only. Nothing sends mail. Every account stays paused until its probe passes.
2. **Supply `WINNR_API_TOKEN`** (a `wnr_` token with read and write) as a secret on that job. Do not paste it in chat.

What happens afterward: the job writes 50 paused SMTP and 50 IMAP account records to production, runs no-send
authentication checks, and writes a nonsecret reconciliation. Winnr authentications are then either 50/50 or each
failure is classified. If Render also blocks 465 and 993, the result is a network-policy finding for the owner. Nothing
is then deployed.

This needs a separate, explicit go-ahead. It is not authorized by this handoff.

## Commands

```bash
# Sandbox recovery (no network needed for tests)
cd /home/user/uberbondd && git checkout claude/winnr-fleet-integration-2026-10-13 && npm ci
node --test $(ls tests/uberwinnr-*.test.mjs tests/winnr-*.test.mjs tests/ubersmtp*.test.mjs tests/*smtp*.test.mjs tests/uberfleet*.test.mjs tests/uberimap*.test.mjs | grep -v postgres)
node scripts/with-real-postgres.mjs node --test tests/winnr-postgres-fleet-store.test.mjs

# Trusted-runtime procedure: see winnr/TRUSTED_RUNTIME_IMPORT_RUNBOOK.md
```

## Safety constraints kept

- No send, no purchase, no paid warming, no DNS change, no deployment, no merge.
- Every SMTP sender paused: `winnr-smtp-auth-noop-probe-failed` on all 50. Outbound eligibility is 0 by construction
  (`campaignAuthorityGranted` is false in every path).
- Secrets only in `/tmp/claude-0/…/scratchpad/fleet-run` (mode 0600, outside the repo). Staging key there is isolated and
  **not production-compatible**. The committed receipt was scanned: no addresses, domain names, URLs or secret values.

## Rollback

- Sandbox: delete the scratch workdir. Nothing outside it changed.
- Production (if ever run): pause the 50 SMTP slots with reason `winnr-fleet-rollback`. Do not delete rows. Pilot rows
  are separate and must not be touched.
- Git: revert the five branch commits above in reverse order. `main` is untouched.

## Links to prior receipts

- `winnr/FLEET_INTEGRATION_RECEIPT_2026-10-13.md` (read-only observation, previous session)
- `winnr/receipts/FLEET_INTEGRATION_RECEIPT_20261013.json` (this run, nonsecret)
- `winnr/TRUSTED_RUNTIME_IMPORT_RUNBOOK.md` (procedure, not executed)
- `docs/OUTREACH_PROVIDER_REALITY_2026-09-27.md` (OVH candidate and port-25 notes)
