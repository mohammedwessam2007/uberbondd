# Scale Architecture

24/7 Continuous Revenue Core, section 11. Design target, named by the mission: 250,000 public
signals scanned monthly, 100,000 businesses scored monthly, 30,000 qualified contacts monthly
**after staged proof**. This document designs how the existing components get there, states which
component is the real bottleneck today, and is explicit about what is not built this session.
Nothing in this document changes a live limit — every cap named below is already `0`/`false` by
default in shipped code, cited by file and constant.

## The staging discipline (the mission's own words: "scale only through explicit policies and
proven safety/economics")

Scale is not a single global setting. It is a per-campaign ceiling, set by
`campaign-policy.mjs#createCampaignPolicy`, that can only be raised by hand, one bounded policy at
a time, and only after the previous stage clears a real evidence bar:

| Stage | `maxProspects` / `maxDailySends` (example) | Gate to advance to the next stage |
|---|---|---|
| 0 — current | 0 live (dry-run only) | N/A — this is where every policy starts (`CAMPAIGN_POLICY_DEFAULTS`: `outboundEnabled: false, dryRun: true, liveSendApproval: false, provider: 'test', budgetCeilingCents: 0`) |
| 1 — validation batch | tens | `learning.mjs#evaluateChannelPerformance` reports `sufficientSample` (≥ `MIN_SAMPLE_FOR_CHANNEL_DECISION` = 10 delivered sends) and a payment rate above `LOSING_CHANNEL_PAYMENT_RATE_THRESHOLD`, **and** a positive contribution margin from `fulfillment.mjs#computeFulfillmentMetrics` on at least one completed, non-refunded order |
| 2 — proven channel | hundreds | Stage 1's bar held across ≥ `funnel.mjs`'s own `MIN_SAMPLE_SIZE` (30) qualified conversations, still positive margin, complaint/bounce rate (`learning.mjs#computeComplaintAndBounceRates`) below an owner-set ceiling |
| 3 — scaled | thousands, working toward the 250k/100k/30k monthly targets | Same bar, sustained across more than one channel/offer pair, reviewed and re-approved as a **new** policy (never an edit that removes the expiry — `campaign-policy.mjs`'s `MAX_POLICY_DURATION_DAYS` still applies at every stage) |

No stage is a code change. Every transition is: the owner creates and approves a new
`campaign-policy.mjs` record with a higher `maxProspects`/`maxDailySends`/`budgetCeilingCents`,
after reading the previous policy's `learning.mjs` results. `CampaignPolicyError` refuses a policy
whose `expiresAt`/`startAt` gap exceeds 90 days regardless of stage, so "scaled" never means
"permanent" either.

## Per-component scale assessment

- **Ingest** (`buyer-intent.mjs#prepareBuyerIntentBatch`, `importer.mjs#prepareImportBatch`): pure
  functions over an in-memory array — no I/O, trivially parallelizable, not a bottleneck at 250,000
  signals/month (roughly 8,300/day, roughly 350/hour) even single-threaded. The real constraint is
  the *source* of those 250,000 signals: `UBERBOND_LIVE_BUYER_INTENT_STRIKE_PACK`, named in this
  mission as an "uploaded" input, was never actually provided to this session (see the final
  report's disclosed-blockers section) — this design assumes a real signal-discovery pipeline is
  supplied externally, imported through the existing pack formats (`importCsvPack`/
  `importJsonPack`/`importJsonlPack`/`importXlsxPack`/`importMarkdownTablePack`), not built here.
- **Scoring** (`scoring.mjs#scoreOpportunity`/`rankOpportunities`): a deterministic weighted sum
  over ≤15 factors per opportunity. 100,000 businesses/month is ~3,300/day — computationally
  trivial for this function; not a bottleneck at any realistic single-process throughput.
- **Persistence** (`store.mjs`'s `Store`, JSON-file backend): **the actual bottleneck.** Every
  write is a whole-file read-modify-write inside one serialized `transaction()` — correct and
  crash-safe at the scale this session tested (hundreds of records), but a single JSON file is not
  a horizontally scalable store. `revenue-os/migrations/*.sql` is written to a Postgres-compatible
  shape specifically so a `PostgresStore` implementing the same `add`/`get`/`list`/`patch`/
  `transaction`/`recoverStaleJobs`/`log` interface could replace it without touching any calling
  module — this was intentionally **not** attempted this session (see
  `docs/REUSE_VS_REPLACE_DECISION.md`'s own disclosed scope reduction) and remains the single
  largest piece of unbuilt work standing between this codebase and the 250k/100k/30k targets.
- **Scheduling** (`scheduler.mjs` + `src/queue.mjs`'s `DurableQueue`): bounded concurrency via
  `REVENUE_OS_QUEUE_CONCURRENCY` (`config.mjs`, default 2). Raising this is a one-line config
  change once the store is no longer the bottleneck; running multiple worker processes against a
  shared store requires the Postgres backend above (a single JSON file has exactly one writer).
- **Distribution** (`distribution.mjs`): every adapter's `automationPermitted` is `false` for every
  one of the five channel categories — by design, there is currently **zero** real send throughput
  regardless of scale target, because no real email/form/portal automation is implemented anywhere
  in this package. Reaching 30,000 qualified contacts/month of real outbound requires implementing
  and individually ToS-reviewing at least one real adapter — explicitly out of this mission's scope
  ("Do not automate CAPTCHAs, support forms, prohibited channels, inferred contacts, or channels
  whose terms forbid automation" already forecloses most of the easy paths).
- **Learning/capital allocation** (`learning.mjs`): read-only aggregation over the same store;
  scales with the same ceiling as persistence, not separately.

## "Live limits must remain zero by default"

Already true in shipped code, not a future commitment:

- `config.mjs#loadRevenueOsConfig`: `liveSending: false`, `liveBilling: false`, `liveDeploy: false`,
  `outboundMode: 'dry-run'`, `dailySendCap: 25`, `rollingSendCap: 100` — all defaults, all
  overridable only by an explicit environment variable an operator sets by hand.
- `campaign-policy.mjs#CAMPAIGN_POLICY_DEFAULTS`: `outboundEnabled: false, dryRun: true,
  liveSendApproval: false, provider: 'test', budgetCeilingCents: 0`.
- `distribution.mjs#DEFAULT_DISTRIBUTION_POLICY`: `{ enabled: false, dryRun: true }`, and
  `automationPermitted` is a platform-fixed `false` on every adapter regardless of policy.

Scaling the *design* in this document never requires changing any of the above; it only ever adds
a new, expiring, bounded `campaign-policy.mjs` record on top of them.

## Explicitly not built this session

- A `PostgresStore` implementation (the actual scale blocker, see above).
- A real signal-discovery crawler/API integration capable of 250,000 signals/month — buyer-intent.mjs
  is proven against representative, synthetic `.invalid`-domain fixtures only.
- Any real distribution automation for any of the five channel categories.
- Load testing of any kind. Every throughput number above is a structural/complexity argument
  ("this function is O(n) over small n"), not a measured benchmark — disclosed, not implied.
