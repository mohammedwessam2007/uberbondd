# Verified Website Inquiry Audit: unit economics (2026-10-22)

**Evidence classification:** static public-site measurements plus scenario hypotheses; NO sales or Apify costs measured.

## Historical caution
MACHIAVELLI tournament, rank 2 generic verified-defect exchange: pessimistic **-$40**, median **-$20**, optimistic **+$250 per month**. Verdict **WOUNDED**. We preserve this unfavorable baseline; the current experiment does not invalidate it.

## Frozen read-only 40-site cohort
Source: `artifacts/commercialization/frozen-40-home-service-sites-2026-10.json`, SHA-256 `22940edec709f5af2af5a630425d7807dd165784378149d57b8a811ccac05952`. Nonrandom convenience sample, selected before observation, no post-hoc removals.

| Measurement | Node 2 GB heap limit | Node 4 GB heap limit |
|---|---:|---:|
| Submitted sites | 40 | 40 |
| Sites with pages examined | 34 | 34 |
| Unobservable/no pages | 6 | 6 |
| Raw assertable candidates | 7 | 7 |
| Zero-candidate sites | 35 | 35 |
| Median latency/site | 1642 ms | 1350 ms |
| P95 latency/site | 4064 ms | 3254 ms |
| Sum of per-site runtimes | 67181 ms | 56747 ms |
| Hypothetical CU if GB reserved equals heap limit | 0.03732278 | 0.06305222 |
| Hypothetical creator compute cost at $0.20/CU | $0.007465 | $0.01261 |

**Important:** a Node heap ceiling is NOT a 2 GB or 4 GB Apify memory allocation. These CU figures are hypothetical, not provider-billed usage. Browser-witness and cloud cold-start costs are not established.

A two-site, delivery-only re-probe executed 4 sequential site probes, including two full re-verifications requiring 3381 ms collectively. The resulting 4 deliveries were **NOT_CHARGED**. Four of seven assertions were separately parser-corroborated on newly fetched pages, but only **3** matched the original captured source hash, and **zero** were human-validated.

## Channel A: proposed direct $99 pilot
PR #1535's public PayPal Egypt fee assumption: 4.4% + $0.30, or **$4.656** on $99 before FX/withdrawal/holds. This is not a live account quote. Scenario costs and founder-time shadow prices below are estimates, not empirical customer costs.

| Hypothesis | Pessimistic | Median | Optimistic |
|---|---:|---:|---:|
| Founder review and delivery | 180 min | 50 min | 20 min |
| Cash contribution conditional on a real sale, before founder time | $42.54 | $81.37 | $91.84 |
| After assumed founder time opportunity cost | $-47.46 | $71.37 | $88.51 |

No paid buyer, accepted delivery, invoice or cleared money is evidenced. Probability of customer purchase is UNKNOWN, so none of these are forecasts.

## Channel B: Apify pay-per-event
The modeled formula is **0.80 × eligible paid-event revenue − paid-plan platform usage cost − other variable costs**. Apify explicitly excludes free-tier usage from **both** creator revenue and creator platform cost. The eligible-paid-plan fraction is provisionally assumed equal across chargeable event rate and compute workload. Support is charged on all 40 inspected sites. Apify may automatically charge startup or default-dataset-item synthetic events, which must be configured and verified before publication. Actual tier mix, data-transfer charges, browser startup and billed CU remain unknown. Official rules: https://docs.apify.com/actors/publishing/monetize/pay-per-event and https://docs.apify.com/actors/publishing/monetize/pricing-and-costs.

| Scenario | Price hypothesis / verified event | Eligible-paid-plan fraction hypothesis | Supported findings/site hypothesis | Contribution per 40-site cohort |
|---|---:|---:|---:|---:|
| Pessimistic | $0.5 | 0 | 0 | $-1 |
| Median | $1 | 0.5 | 0.05 | $-1.2126 |
| Optimistic | $2 | 1 | 0.1 | $5.3888 |

These prices are NOT activated. Zero-finding sites consume compute. Refund, re-verification and browser costs are not fully measured, so the Store proposition **cannot** be declared profitable. No price is chosen.

## Decision and next gate
Keep **direct one-site pilot first** after external payment, legal and founder approval. Do not publish the Store actor until independent defect accuracy, browser resilience, genuine CU costs, correct pricing and payout are verified. No fabricated customer willingness to pay. All unknowns in the JSON ledger remain open.
