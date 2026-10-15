# Winnr Fleet Integration Receipt — 2026-10-13

Status: **BLOCKED_EXTERNAL — no live Winnr action performed.**

This receipt records what could and could not be verified from the execution environment on 2026-10-13. It contains no credentials, no mailbox addresses and no provider identifiers.

## Read-only observation via the Winnr MCP connector (2026-10-13)

The `org-connector-mcp.winnr.app` connector became available in this session. Only read tools are exposed; the connector's API token has `read` permission only. Observed counts, no mutations:

- Account plan `startup`; email users **50 of 50** used; domains **10 of 20** used; pre-warmed addresses **3** (trialing); Stripe subscription `active`.
- Domains: the pilot `cedarpointdomains.com` (pre-warmed, 3 mailboxes) plus **10 Startup domains**, all status `complete`, DNS health `healthy`.
- Mailboxes: **50 Startup mailboxes**, 5 per domain, all `active`, created 2026-10-13 00:49–00:56 UTC; plus the **3 pilot mailboxes**, all `active`, created 2026-10-02 (unchanged).
- Export tool `winnr_export_email_users` is **not** available in this session. The connector states export needs write scope, so credential export is blocked on token scope, not on network.
- Export must select the 10 Startup domains explicitly by name. Do not use all-domains export, which would pull the pilot's credentials into the import.

This resolves the earlier "Startup unpurchased" concern (see Code gaps below): the live account shows the Startup plan and 50 active mailboxes.

## Live counts

| Step | Target | Success | Failure | Notes |
|---|---|---|---|---|
| Credential export via Winnr API | 50 Startup mailboxes / 10 domains | 0 | 0 | Not attempted. Blocked: the connector token is read-only and the export tool is not in this session. The environment has no `WINNR_API_TOKEN`; `api.winnr.app` CONNECT is refused by the sandbox proxy (403). |
| Encrypted import into UberBond | 50 | 0 | 0 | Not attempted. Requires the export and the production `TOKEN_ENCRYPTION_KEY`. |
| SMTP auth verification (no send) | 50 | 0 | 0 | Not attempted. |
| IMAP auth verification (read-only) | 50 | 0 | 0 | Not attempted. |
| Pilot mailboxes (3) | 3 | — | — | Untouched. Not re-observed live from this environment. |
| Messages sent | — | 0 | — | |
| DNS changes, purchases, paid warming, deploys, merges | — | 0 | — | |

## What was verified locally

- Recovered the existing modules: `src/uberwinnr-adapter.mjs`, `src/uberwinnr-credential-import.mjs`, `src/uberwinnr-postpurchase.mjs`, `src/uberfleet.mjs`, `src/uberimap.mjs`, `src/winnr-smtp-readiness.mjs`, `src/winnr-placement-quarantine.mjs`.
- Winnr, fleet and IMAP suites: **97/97 passing** after the changes below.

## Code changes in this session

1. `src/winnr-smtp-readiness.mjs` — `providerCallCount` coerced `null` to `0` through `Number(null)`, so an unexpected probe throw was reported as a confirmed zero provider-call count instead of unknown. Now only a real integer counts as known. Fixes `tests/winnr-smtp-readiness.test.mjs` (1 failure → 0).
2. `src/uberwinnr-postpurchase.mjs` — the single-domain plan refuses any export that has more than one domain, so a 10-domain export could not be registered. Added `compileWinnrPostPurchaseFleetPlan` and `applyWinnrPostPurchaseFleetPlan`, which reuse the same single-domain plan per domain. The single-domain behaviour and its refusal are unchanged.
3. `tests/uberwinnr-fleet-plan.test.mjs` — new, 6 tests: 50 mailboxes across 10 synthetic domains, no password in plan output, per-domain link identity, the single-domain refusal preserved, empty-export refusal, idempotent apply, and refusal of an unvalidated plan.

## Required owner inputs (set in the environment settings, never in chat)

1. **Network:** add `api.winnr.app` to the environment's allowed domains.
2. **Winnr token:** a Read + Write Winnr API token with export permission, as environment variable `WINNR_API_TOKEN` (`WINNR_API_KEY` also accepted by `src/config.mjs`). The earlier read-only token returned 403 on export.
3. **Authorization flags** for this run, set explicitly by the owner: `WINNR_ACCOUNT_AUTHORIZED=true`, `WINNR_TERMS_COMPATIBLE=true`, `WINNR_TERMS_EVIDENCE_REF=<owner evidence reference>`. The adapter refuses export and route work without these.
4. **Encryption key:** the import must use the **production** `TOKEN_ENCRYPTION_KEY`, because the three existing pilot rows are decrypted with it. A key generated in this sandbox would produce rows that production cannot read. Either provide the production key through the environment's secret entry, or run the encrypted import where production already holds the key. This is the owner's security decision.

## Code gaps still open before the live run

- **Export response contract is unverified.** The adapter's `exportMailboxes` posts to `/export`, which may be asynchronous (`/jobs`). Its response shape and how the CSV is delivered have not been observed. The importer expects Winnr's generic credential CSV. Do not write the runner against a guessed shape; capture one real response first.
- **No fleet runner exists yet.** `runWinnrRuntimeBootstrap` is single-domain and sends canary emails through `dispatchSmtpFleetAccount`. It must not be used for this run. The no-send path is `runWinnrSmtpReadinessProbe` (EHLO/AUTH/NOOP/QUIT only, verified in `src/ubersmtp-submission-adapter.mjs`), and IMAP is checked with `pollImapForwardingAccount`.
- **Positional quarantine (fixed in code, operator step required).** The readiness probe now refuses ordinal-only holds once more than three Winnr accounts exist (`ordinal-quarantine-requires-slot-keys`), and accepts `WINNR_PLACEMENT_QUARANTINE_SLOTS` for explicit slot holds. Before the live run, unset `WINNR_PLACEMENT_QUARANTINE_ORDINALS` and set `WINNR_PLACEMENT_QUARANTINE_SLOTS` to the exact `winnr:<address>` slot of the quarantined pilot mailbox, after confirming it from the store. The durable senderHealth pause on that mailbox still applies independently.
- **Docs are older than the live account.** `winnr/CURRENT_STATE.md` and `winnr/NEXT_STEPS.md` (2026-10-04) say the $69 Startup route was unpurchased. The read-only connector now shows the Startup plan and 50 active mailboxes, so those two files should be updated in a later docs change.
- **Required owner action for export.** Reconnect the Winnr connector with write scope (https://app.winnr.app/mcp), or provide a Read + Write token as described above. Either path must still satisfy the authorization flags and the production encryption key requirement.

## Truth boundary

Nothing here proves provider entitlement, export success, credential validity, SMTP/IMAP authentication, placement, deliverability, customer demand or cleared revenue. Those remain unobserved.

## Adversarial review of ffc018b (workflow wf_f8338dfe-1ad)

Nine agents: three lenses (identity, credential safety, regression), each finding verified by a refuter. Six candidates, two refuted, four confirmed (three distinct issues).

| Finding | Severity | Status |
|---|---|---|
| CSV `domain` column could bind an address to a domain it does not belong to (`uberwinnr-credential-import.mjs`). Pre-existing; reachable on the live single-domain import path. | high | **Fixed.** The address is authoritative. A disagreeing domain column is refused (`domain-column-address-mismatch`) in both the importer and the registry plan. Tests added. |
| Positional readiness quarantine holds hash-ordered accounts at fleet size. | medium | **Fixed** as above (refuse ordinal-only holds at fleet size; slot-keyed holds). Tests added. |
| Shared registries read the oldest 1000 events of a type before filtering by mailbox or domain (`sending-mailbox-registry.mjs`, `sending-domain-registry.mjs`, `store.mjs`). Identity guards go blind past 1000 events. Pre-existing. The test fake ignores `limit`/`orderBy`, so tests cannot catch it. | high (latent) | **Open.** Not triggered at current volume, but it must be fixed before `sending_mailbox_event` or `sending_domain_event` approaches 1000 rows. Fix in shared store and registries with entity-keyed reads, plus a fake that honours `limit` and `orderBy`. |
| Fleet plan has no exclusion for pilot identities. | medium | **Refuted.** The fleet apply writes no accounts, and no production caller exists. Export selection still must be explicit (see above). |
| `exactProviderCalls` in `uberfleet.mjs` still coerces `null` to `0` for a non-shipped transport. | medium (latent) | **Refuted as reachable.** The shipped adapter never returns null. Left unchanged to avoid touching shared code. |

Outstanding before the live fleet run: the open registry item above should be scheduled, and the export must select the 10 Startup domains explicitly. Nothing in this review was merged or deployed.
