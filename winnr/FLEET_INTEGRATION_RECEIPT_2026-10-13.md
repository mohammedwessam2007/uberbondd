# Winnr Fleet Integration Receipt — 2026-10-13

Status: **BLOCKED_EXTERNAL — no live Winnr action performed.**

This receipt records what could and could not be verified from the execution environment on 2026-10-13. It contains no credentials, no mailbox addresses and no provider identifiers.

## Live counts

| Step | Target | Success | Failure | Notes |
|---|---|---|---|---|
| Credential export via Winnr API | 50 Startup mailboxes / 10 domains | 0 | 0 | Not attempted. No Winnr token in the environment; `api.winnr.app` CONNECT refused by the sandbox proxy (403). |
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
- **Positional quarantine.** `applyWinnrPlacementQuarantine` refuses unless exactly three Winnr accounts exist, so it fails closed at 53 accounts. The readiness probe's `WINNR_PLACEMENT_QUARANTINE_ORDINALS` skip is positional over accounts sorted by a hash-derived id, so with a 53-account fleet it can skip a Startup account instead of the pilot. Pilot safety still holds through the durable slot-keyed sender pause on the quarantined pilot mailbox, which the probe honours. Recommended: key the skip by slot before the live run.
- **Docs are older than the request.** `winnr/CURRENT_STATE.md` and `winnr/NEXT_STEPS.md` (2026-10-04) say the $69 Startup route was unpurchased. The owner says 50 Startup mailboxes are active now. That is not verifiable from this environment and has not been assumed.

## Truth boundary

Nothing here proves provider entitlement, export success, credential validity, SMTP/IMAP authentication, placement, deliverability, customer demand or cleared revenue. Those remain unobserved.
