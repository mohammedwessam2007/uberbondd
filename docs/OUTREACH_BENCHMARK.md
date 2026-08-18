# Outreach Benchmark

Per this mission's explicit instruction: no weighted internal score, no
claim of overall superiority. Capability-by-capability, sourced from each
provider's own public documentation/marketing pages (fetched 2026-08-19),
classified using this mission's required taxonomy:
`DOCUMENTED_CAPABILITY | IMPLEMENTED_LOCAL | LIVE_VERIFIED |
INDEPENDENTLY_TESTED | INFERENCE | UNKNOWN | NOT_AVAILABLE`.

## Warm-up

- **Instantly** (documented): warm-up activates automatically on connecting
  a mailbox, runs across a large network of accounts to simulate real
  conversations, included free on every paid tier. [Instantly features
  guide](https://instantly.ai/blog/instantly-features/) — `DOCUMENTED_CAPABILITY`.
- **UberBond**: real orchestration/circuit-breaker/policy code exists and
  is `INDEPENDENTLY_TESTED` (71+ hostile tests). Actual warm-up execution
  is `NOT_AVAILABLE` tonight — no provider is connected, so the only wired
  adapter deterministically reports `WARMUP_BLOCKED`. **UberBond does not
  have and does not claim a network of accounts to warm through** — it
  depends entirely on a connected provider's own native mechanism.

## Unified inbox

- **Instantly**: Unibox aggregates email/SMS/call replies into one
  interface, integrated with its CRM. [Same source] — `DOCUMENTED_CAPABILITY`.
- **UberBond**: reply storage + polling is `IMPLEMENTED_LOCAL`; a
  Unibox-equivalent classification/aggregation UI is `NOT_AVAILABLE`.

## Enrichment

- **Apollo**: waterfall enrichment checks connected data sources in a
  defined order until an email/phone is found, synchronous demographic
  response + async webhook for final waterfall results. [Apollo waterfall
  docs](https://docs.apollo.io/docs/enrich-phone-and-email-using-data-waterfall) — `DOCUMENTED_CAPABILITY`.
- **Clay**: waterfall chains 150+ providers, stops at first confident
  result, claims 80-95% find rates vs. 50-60% single-source.
  [Clay waterfall guide](https://www.clay.com/guides/waterfall-enrichment) — `DOCUMENTED_CAPABILITY`.
- **UberBond**: single-provider (Hunter.io) email discovery/verification is
  `IMPLEMENTED_LOCAL`. Multi-provider waterfall is `NOT_AVAILABLE`.

## Sequences / sending limits

- **HubSpot**: enforces daily sequence-send caps by connected provider
  (Gmail/Office 365), bulk enrollment capped at 3 emails/minute, tracks a
  sender score from bounce/reply rate. [HubSpot sending limits](https://knowledge.hubspot.com/connected-email/set-daily-send-limits-for-connected-email-accounts) — `DOCUMENTED_CAPABILITY`.
- **UberBond**: volume-quota enforcement, sender-health pausing, and
  bounce/complaint-triggered circuit breakers are `IMPLEMENTED_LOCAL` and
  `INDEPENDENTLY_TESTED` (pre-dating this mission — `src/send-safety.mjs`,
  `src/deliverability-guard.mjs`). Sequence *branching* is `NOT_AVAILABLE`.

## Where UberBond genuinely differs, capability-for-capability (not a score)

| Dimension | UberBond | Instantly/Apollo/Clay/HubSpot (documented) |
|---|---|---|
| Evidence quality | Every message ties to a specific, real, crawled site issue (`src/audit-rules.mjs`); genome/opportunity scoring explicitly tracks claim-type (`VERIFIED_FACT` vs `HYPOTHESIS` vs `SYNTHETIC_TEST_FIXTURE`) and never promotes weak evidence | Not documented as a comparable per-message evidence-provenance system; these platforms document data sourcing/waterfall confidence, not per-claim evidence tracking |
| Safety / fail-closed design | Circuit breakers, deny-only gates, payment-truth gating, structural secret rejection at intake, V9/OMNIA composition — all `INDEPENDENTLY_TESTED` | Documented sending limits and sender-score tracking (HubSpot); not documented as a fail-closed, receipt-audited architecture |
| Owner burden / max-3-actions discipline | `founder-command-center.mjs` caps binding owner actions at 3; this mission's own activation card follows the same discipline | Not a documented design goal of any compared platform |
| Mailbox scale / lead supply / warm-up network effect | None — 1 real provider (Gmail, no warm-up), 0 connected mailboxes | Instantly documents warm-up across up to ~1M user accounts; Apollo/Clay document 150+ data sources |
| Revenue attribution | Payment-truth-gated, provider-event-proof-required (`src/payments.mjs`) | Not the product category these platforms document (they document lead/reply metrics, not cleared-payment attribution) |

**UberBond is not, and is not claimed to be, competitive with Instantly on
mailbox scale, network-effect warm-up, or enrichment breadth tonight.** Its
real, tested advantages are in evidence discipline, fail-closed safety, and
payment-truth revenue attribution — categories the compared platforms
either don't document at all or document far more loosely.

Sources:
- [Your Complete Guide to Instantly Features for 2026](https://instantly.ai/blog/instantly-features/)
- [Apollo Waterfall Enrichment docs](https://docs.apollo.io/docs/enrich-phone-and-email-using-data-waterfall)
- [Apollo Waterfall Enrichment Overview](https://knowledge.apollo.io/hc/en-us/articles/34071089002509-Waterfall-Enrichment-Overview)
- [Clay: The Complete Guide to Waterfall Enrichment (2026)](https://www.clay.com/guides/waterfall-enrichment)
- [Clay Waterfall product page](https://www.clay.com/waterfall-enrichment)
- [HubSpot: Set sending limits for connected email accounts](https://knowledge.hubspot.com/connected-email/set-daily-send-limits-for-connected-email-accounts)
