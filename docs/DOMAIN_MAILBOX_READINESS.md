# Domain and Mailbox Readiness

This mission's Wave 1 requirements are satisfied by the system built two
waves ago tonight — full detail, live DNS proof, and the honest per-item
current-state map live in **`docs/UBERBOND_DOMAIN_MAILBOX_READINESS.md`**
(not duplicated here). This file records only what changed in *this* wave's
reconciliation pass.

## Field-completeness reconciliation against this mission's exact schema

| This mission's field | Status before this wave | Change this wave |
|---|---|---|
| `SendingMailbox.dailyCap` | Present (`currentDailyCap`, `plannedDailyCap`) | No change |
| `SendingMailbox.hourlyCap` | **Missing** | Added: `currentHourlyCap`, real-provider-value-only (never derived/guessed from the daily cap — stays `null`/UNKNOWN until a provider actually reports one) |
| `SendingMailbox.warm-up age` | **Missing as a persisted/derived field** | Added: `warmupAgeDays`, computed at read time from the real recorded `warmupStartTime`, never stored redundantly |
| Every other `SendingDomain`/`SendingMailbox` field this mission lists | Already present | No change — see the field lists in `src/sending-domain-registry.mjs` / `src/sending-mailbox-registry.mjs` |

`EmailProvider`, `DNSSnapshot`, `WarmupPlan`, `WarmupEvent`,
`MailboxHealthSnapshot`, `ProviderReceipt`, `DeliverabilityIncident`,
`OutreachAuthorization`: all mapped onto existing implementations rather
than duplicated — see `docs/INSTANTLY_RECONCILIATION.md`'s entity table.

## Secret-storage guarantee (unchanged, re-verified this wave)

`src/sending-mailbox-registry.mjs#detectSecretFields` and every event
recorder in that module reject outright (not silently strip) any field
whose name matches password/token/apiKey/refreshToken/clientSecret/
privateKey/smtpPassword patterns, including nested objects.
`logSendingMailboxEvent` throws rather than persist one, as defense in
depth. Both properties are covered by dedicated hostile tests, re-run this
wave: 590/590 passing.

## Real vs claimed, tonight

Zero domains registered, zero mailboxes registered, zero provider
credentials configured (`instantly`/`googleWorkspace`/`microsoft365` all
`configured: false` in `src/config.mjs`). Everything in this file describes
tested, real, *ready* code — not live state. See
`docs/OUTREACH_ACTIVATION_CARD.md` for the exact next owner action.
