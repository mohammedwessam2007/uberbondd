# UberBond: MACHIAVELLI Wealth Engine

Status: **FIRST EXECUTION PROGRAM — research, invention, lab and ledgers built; cleared contribution profit $0.00**
Mission source: founder directive "UBERBOND: MACHIAVELLI — Autonomous Wealth Invention & Economic Dominance Engine" (2026-10-21).
Subordinate to the Sovereign Cognitive Continuum. `businessEffectAuthority: NONE`. No money was moved, traded, spent or requested.

> The founder supplies the ambition. The intelligence searches the economic possibility space. Reality determines what earns.

## What exists now (verified in this repository)

| Deliverable | Where | State |
|---|---|---|
| 1. Wealth Mechanism Atlas | `artifacts/machiavelli/wealth-mechanism-atlas.json`, test `tests/machiavelli-wealth-atlas.test.mjs` | all 890 founder ideas classified by economic mechanism + 48-mechanism external reality catalogue |
| 2. Autonomous Profit Tournament | `artifacts/machiavelli/profit-tournament.json` | 16 mechanisms, 6 adversarially refuted, all WOUNDED |
| 3. Quant Trading Research Laboratory | `src/quant-data-vault.mjs`, `src/quant-backtest.mjs`, `src/quant-strategies.mjs`, `src/quant-research-protocol.mjs`, `src/quant-paper-ledger.mjs`, `scripts/quant-lab.mjs`, receipt `artifacts/quant-lab/experiments-2021-01_2026-09.json` | working; 17 pre-registered experiments; none promoted |
| 4. Prototype portfolio | see below | 3 built, tested and exercised on live public data |
| 5. Capital Allocation Intelligence | `src/capital-allocation-intelligence.mjs` | $0/$100/$500/$1k/$5k/$25k scenarios with ruin firewall, correlation groups, founder-hour limits |
| 6. Revenue Reality Ledger | `src/revenue-reality-ledger.mjs` | five tiers, hash-chained, never summed across tiers |
| 7. Commercialization paths | see below | smallest lawful experiment per survivor |
| 8. PHOENIX preservation | this document + receipts + rejected-strategy records | |
| Money Entry Rail Registry | `src/money-entry-rails.mjs` | blocks mechanisms whose money has no lawful way in |
| Operator command | `scripts/machiavelli-scoreboard.mjs` | reality tiers + capital scenarios + rail checks |

## The constraint that dominates everything: how money enters

Verified 2026-10-21 for an Egypt-resident founder:

- **Stripe: UNSUPPORTED.** Stripe does not serve Egyptian merchants.
- **Crypto: LEGALLY BLOCKED pending counsel.** Law 194/2020 Art. 206 requires a Central Bank of Egypt licence to issue, trade or promote crypto, and none are reported granted.
  - Consequence: the crypto quant results below are research only. No crypto rail may carry revenue until Egyptian counsel says otherwise.
- **Apify Store: PLAUSIBLE.**
  - Pay-per-event revenue, of which Apify keeps 20% plus platform costs.
  - Monthly payouts by PayPal or Wise (minimum $20) or wire (minimum $100), after identity verification.
- **PayPal Egypt: PLAUSIBLE.** Receiving works via a linked Egypt-issued Visa card.
- **Upwork local-bank payout: PLAUSIBLE.** It sells hours unless the listing is a productized automated deliverable.
- **Payoneer, Paddle, Lemon Squeezy: UNVERIFIED.**

Nothing is `VERIFIED_WORKING` until a real payout lands.

## Quant lab: what reality said

**Data**
- 4 assets (BTC, ETH, SOL, XRP), spot + USD-M perpetual hourly klines and funding rates, 2021-01 to 2026-09, about 50,000 aligned hours each.
- Every monthly file is verified against the publisher's SHA-256.
- The 2025 microsecond-timestamp change in spot archives is normalised.

**Protocol**, fixed before any data was loaded:
- no lookahead (a decision at bar *t* earns only bar *t+1*);
- explicit taker fee + spread + slippage on every unit of turnover;
- walk-forward selection (12-month train, 3-month test);
- Sharpe and the Deflated Sharpe Ratio measured in excess of the T-bill rate, deflated over the parameter variants tried (unbiased trial variance);
- a sealed holdout (2025-10 to 2026-09) opened once;
- doubled-cost stress on the holdout and on a replay of the walk-forward's own per-fold choices (protocol 1.1.0);
- a **risk-free hurdle** from US Treasury average T-bill rates: 4.02% over the out-of-sample window, 3.80% over the holdout.

| Family | Label | OOS Sharpe over T-bills | OOS CAGR | DSR over T-bills | Holdout | OOS max DD |
|---|---|---|---|---|---|---|
| BUY_AND_HOLD:BTC | REJECTED | 0.61 | 24.8% | 0.881 | -26.9% | 68.4% |
| TIME_SERIES_MOMENTUM:BTC | REJECTED | 0.52 | 17.9% | 0.515 | -4.9% | 41.3% |
| FUNDING_CARRY:BTC | REJECTED | -1.91 | 2.4% | 0.000 | 0.8% | 0.9% |
| FUNDING_CARRY_OPTIMISTIC_BOUND:BTC | REJECTED | -0.69 | 3.2% | 0.002 | 1.4% | 1.3% |
| BUY_AND_HOLD:ETH | REJECTED | 0.28 | -0.3% | 0.706 | -35.3% | 77.9% |
| TIME_SERIES_MOMENTUM:ETH | INCONCLUSIVE | 0.22 | 3.5% | 0.418 | 2.3% | 58.3% |
| FUNDING_CARRY:ETH | REJECTED | -1.54 | 1.9% | 0.000 | 0.0% | 1.9% |
| FUNDING_CARRY_OPTIMISTIC_BOUND:ETH | REJECTED | -0.75 | 3.0% | 0.005 | 0.3% | 1.8% |
| BUY_AND_HOLD:SOL | REJECTED | 0.48 | 1.3% | 0.826 | -43.1% | 95.8% |
| TIME_SERIES_MOMENTUM:SOL | REJECTED | 0.60 | 24.8% | 0.708 | -36.1% | 68.9% |
| FUNDING_CARRY:SOL | REJECTED | -2.06 | 1.7% | 0.000 | 0.0% | 1.1% |
| FUNDING_CARRY_OPTIMISTIC_BOUND:SOL | REJECTED | -1.60 | 2.1% | 0.000 | 0.0% | 1.2% |
| BUY_AND_HOLD:XRP | REJECTED | 0.75 | 37.9% | 0.928 | -47.6% | 68.1% |
| TIME_SERIES_MOMENTUM:XRP | REJECTED | -0.22 | -26.4% | 0.236 | -51.5% | 85.3% |
| FUNDING_CARRY:XRP | REJECTED | -1.50 | 2.2% | 0.000 | -0.8% | 0.5% |
| FUNDING_CARRY_OPTIMISTIC_BOUND:XRP | REJECTED | -1.13 | 2.7% | 0.001 | -0.2% | 0.5% |
| FUNDING_ROTATION:BTC+ETH+SOL+XRP | REJECTED | -1.75 | 1.9% | 0.000 | 0.0% | 1.1% |

**Decisive finding:** delta-neutral funding carry is *economically worthless* for retail. Protocol 1.0.0 measured Sharpe on raw returns and showed it as statistically real (raw Sharpe up to 3.0, DSR up to 1.00); the 2026-10-22 review showed that compares a low-volatility return with zero instead of cash. Measured in excess of T-bills, every carry variant has a negative Sharpe and a DSR of at most 0.005. Only TIME_SERIES_MOMENTUM:ETH stays INCONCLUSIVE; nothing survives.
- It compounds at 1.7–3.2% a year on deployed capital against a 4% T-bill. Funding is credited only to positions held through the full hour before settlement.
- That holds even with unattainable maker-only fees.
- In the BTC holdout, taker costs ate 61% of the funding collected.
- The edge only pays during leverage manias (late 2023 to early 2024, late 2024).

Rejected strategies are kept with their failure reasons, data manifests and receipt hashes. They may be reconsidered only if:
- the fee tier falls below the maker bound, or
- funding regimes re-enter mania territory for a sustained period, or
- the founder's realistic alternative yield changes.

Nothing has earned paper trading. The paper ledger (`src/quant-paper-ledger.mjs`) exists for the first strategy that does.

## Revenue Reality Ledger

`SIMULATED ≠ PAPER ≠ REALIZED_TRADING ≠ COLLECTED_RECEIPTS ≠ CLEARED_CONTRIBUTION_PROFIT`

Each tier requires its own evidence:

| Tier | Required evidence |
|---|---|
| SIMULATED | backtest receipt hash |
| PAPER | hash-chained decisions committed before prices |
| REALIZED_TRADING | non-synthetic venue fill IDs, fees, and a founder capital authorization reference |
| COLLECTED_RECEIPTS | non-sandbox provider event |
| CLEARED_CONTRIBUTION_PROFIT | canonical `PROVIDER_CLEARED_PAYMENT_PROVEN` payment truth, retained and digest-intact, minus attributable costs |

`checkMoneyClaim` rewrites any "it made $X" sentence to the strongest tier that actually supports it.

**Current state:** SIMULATED entries only. Cleared contribution profit: **$0.00**.

## Wealth Mechanism Atlas: what the 890 ideas are, economically

`artifacts/machiavelli/wealth-mechanism-atlas.json` covers all 890 founder ideas (no merges, no drops, literal titles) and a 48-mechanism external reality catalogue.

- **Economic relevance:** 246 ideas are DIRECT, 488 INDIRECT, and 156 have no economic mechanism. Those 156 are kept, not deleted.
- **Buildable today:** 349 could become paid software miniatures now; 66 need future technology.
- **Dominant economic primitive across the corpus: verification that makes something priceable.** About 20 of the 50 most potent primitives are variations of it, and insurance underwriting and escrow release are the recurring cross-domain hooks. Examples:
  - pay-per-verified-error (#0058);
  - evidence-carrying claims (#0146);
  - calibration ledgers (#0059);
  - verified-outcome settlement (#0305/#0306);
  - "verification creates markets" (#0513).
- **Market structures are rare:** pure price arbitrage (11) and market making (16) barely appear.

## Autonomous Profit Tournament

`artifacts/machiavelli/profit-tournament.json`:
- **Invention:** six inventor lenses each read two literal founder shards, the reality catalogue and the lab receipt, and proposed 16 materially different mechanisms with web-checked competitors. One contender built in this program was seeded in on equal terms.
- **Selection:** a selection judge merged duplicates and chose 6 finalists. Survivors that were not selected are preserved with reasons.
- **Refutation:** one adversarial refuter per finalist researched competitors, Egypt payment rails, payer evidence, legal blockers and costs on the web.
- **Ranking:** a final judge ranked the finalists under pessimistic assumptions.

**Result: all six finalists are WOUNDED. None has a positive pessimistic median monthly contribution, and mechanism probabilities are 0.07–0.15.** The six are really three independent bets: US public-data obligation inference, inquiry-path defects, and the Apify marketplace rail.

| Rank | Mechanism | Role | Pessimistic p10 / p50 / p90 (USD per month) | Decisive objection |
|---|---|---|---|---|
| 1 | Single Audit Obligation Radar | Market intelligence | -15 / 0 / 300 | An award is not expenditure; parent/child UEI coverage; willingness to pay is untested |
| 2 | Verified-defect claims (narrowed) | Fast experiment | -40 / -20 / 250 | Audited-prospect data already sells for about $7 per 1,000 leads on Apify; some call-tracking mismatches dial the business's own line |
| 3 | Breakage-Arbitrage Actor Foundry | Digital infrastructure | -25 / -15 / 40 | Apify already detects broken Actors and demotes them itself |
| 4 | EGP T-bill carry with a topological devaluation alarm | Quant research | -20 / 0 / 5 | A personal treasury rule, not income; only about 6 episodes to learn from |
| 5 | Novation Radar (merged into rank 1) | Market intelligence | -15 / -10 / 250 | The "early recompete" forecast is legally overstated (13 CFR 125.12) |
| 6 | Revenue-Defect Disclosure Market | Frontier reserve | -40 / -30 / 200 | Its flagship example dials the business's own listed number; matches the "beg bounty" pattern |

**Capital Allocation Intelligence on these numbers** (`artifacts/machiavelli/scoreboard.json`):
- At every level ($0, $100, $500, $1k, $5k, $25k) the recommended portfolio is **empty**.
- All six are preserved as the frontier reserve.
- The idle-capital alternative is the risk-free rate.
- This is the correct answer today, not a failure of the allocator.

## Prototype portfolio (built, tested, real-world exercised)

### 1. Re-Verified-at-Sale Findings (unconventional; new category)

**Code:** `src/self-verifying-findings.mjs`, `src/inquiry-findings.mjs`, the Apify Store Actor `actors/verified-inquiry-defects/`, and `scripts/verified-defects-rehearsal.mjs`.

**Mechanism:**
- Every finding is a falsifiable claim with evidence, a 30-second disproof and a verifier.
- At sale time an independent probe re-verifies it.
- Only reproduced findings are charged, never twice per buyer, finding and day.
- The seller absorbs data decay, and re-verifications build a defect-survival dataset.

**Live rehearsal** with a recording ledger and no payment provider (`artifacts/machiavelli/verified-defects-rehearsal-2026-10-22.json`):
- 4 public sites were checked; 5 defects were discovered and all 5 were re-verified by a second probe with the browser witness.
- Clean sites produced no charge.
- Day-1 survival was 100%.

### 2. Self-owned-number precision gate (the judge's build-now #1)

A call button that dials a number the business itself publishes is routing, not a defect.
- Re-run live, the gate removed 2 of Reliant's 4 findings.
- It kept the unlisted-number mismatch, the one-digit Bastrop typo and Parker & Sons' discarded LocalBusiness block (`verified-defects-rehearsal-gated-2026-10-22.json`).

### 3. Single Audit Obligation Forecast Ledger (unconventional; tournament rank 1)

**Code:** `src/single-audit-forecast-ledger.mjs` and `scripts/single-audit-radar.mjs`.

**Mechanism:**
- It reads USAspending awards and the Federal Audit Clearinghouse.
- It estimates fiscal-year federal expenditure against the 2 CFR 200.501 $1M threshold.
- It records dated, append-only forecasts that resolve against later FAC filings and are Brier-scored (#0059 Prediction Accounting).

**First live run** (Georgia):
- It produced false positives, university research foundations audited under parent reports.
- The fix: FAC `additional_ueis`, parent-coverage exclusion and a near-threshold band.
- It fails closed on FAC rate limits.
- Current honest output: no qualifying forecasts in the checked sample.

## Commercialization paths: smallest lawful experiment per survivor

1. **Single Audit Radar.**
   - Hand-resolve 15 candidates for one state, restricted to charter schools, special districts and single-site nonprofits, using outlays not obligations, in at most 6 hours.
   - Then run one bounded willingness-to-pay probe to CPA firms with Single Audit practices.
   - Kill if precision is below 35%.
2. **Verified defects.**
   - Publish the Actor with pay-per-event pricing for path-breaking classes only.
   - Measure precision on 20 hand-checked findings.
   - Observe whether any third party is charged within 60 days.
3. **Breakage observatory.**
   - Poll the public Apify Store API for 14 days (no account) to test whether users migrate when Actors break.
   - Kill the foundry if substitutes absorb more than 70% of users.
4. **EGP holonomy alarm.** Run a sealed hindcast (thresholds frozen on 2016–2021, scored on 2022–2026) as a calibration stream only. It is not an income organ.

## Founder-only actions (maximum three)

1. Complete identity verification on Payoneer and an Apify developer account, then prove that one small real payment reaches an Egyptian account. Five of six finalists share this rail gate.
2. Once owned mailboxes pass independent readiness, authorize exactly one bounded willingness-to-pay probe: volume cap, suppression gates, no bounty language, human replies by the founder.
3. Decide the invoicing identity and W-8BEN posture that US payers will request.

(Getting written Egyptian legal advice before any crypto rail is used remains standing guidance, not a current blocker: no surviving mechanism needs crypto.)

## Next work (not done)

- The Apify Store breakage-migration observatory (build-now #3).
- Re-running the Single Audit radar with an api.data.gov key.
- Paper-trading the first strategy that ever passes the lab protocol (none has).
- The defect-survival curve beyond day 1.

## Founder-idea crossover record

- **Lab:** NO_MATERIAL_890_CROSSOVER_OBSERVED for funding carry; the rejection is market evidence.
- **Atlas:** the verification primitive above.
- **Prototypes:**
  - Re-Verified-at-Sale Findings: #0058, #0146, #0306, #0513, #0013.
  - Single Audit Forecast Ledger: #0059, #0178, #0013.
  - EGP holonomy: #0049, #0488, #0491, #0492, #0483, #0585.

All other ideas remain in the immutable corpus and the atlas, unchanged.

## Truth boundary

Architecture, backtests, atlas classifications and tournament scores are not revenue. The highest tier any mechanism has reached is SIMULATED.

## Adversarial review, 2026-10-22

A three-lens review (statistics, money truth, safety) with independent refutation confirmed 13 of 16 findings. All 13 are fixed with regression tests:

- **Paper ledger:** decisions can no longer be backdated, quotes must be observed at or before the decision, a strategy cannot open a second decision while one is unmarked, and the chain fails verification on any time reversal.
- **Research protocol 1.1.0:**
  - the doubled-cost walk-forward gate replays the walk-forward's own per-fold choices, not the holdout's parameters;
  - Sharpe and the Deflated Sharpe are measured in excess of T-bills;
  - trial variance is unbiased, so two variants already deflate.
- **Revenue Reality Ledger:** CLEARED requires an ok truth with proven cleared and retained stages, no contradictions or reversals, non-synthetic provider refs, and an amount equal to the net provider-cleared revenue. One payment counts once. Sandbox refs with `.` or `/` separators are rejected.
- **Single Audit score:** scored only over matured forecasts. It is reported INCOMPLETE while any matured forecast is unresolved, and early YES resolutions are not scored.
- **Verified-defects sale:**
  - each item is delivered before it is charged;
  - charged keys persist in a named key-value store across restarts and same-day re-runs;
  - http/https/www variants of a site are one subject;
  - a charge counts only when Apify reports `chargedCount >= 1`.
- **Survival curve:** every finding ever seen is re-verified on each run, so fixed defects show as fixed.
- **Money rails:** a legally blocked leg named anywhere blocks the mechanism; a plausible exit rail does not cure it.
- **Capital allocator:** NaN or out-of-range limits and probabilities are refused instead of silently disabling the ruin firewall.
- **Probe:**
  - every URL and redirect hop must resolve to a public address;
  - redirects are followed by hand and counted;
  - a 5xx/429/unreachable robots.txt means complete disallow;
  - `$` and `*` robots rules are honoured;
  - 429/503 pages stop the crawl.
- **Runtime witness** (finding unverified, hardened anyway): service workers and WebSockets are blocked, and the Chromium sandbox stays on unless the process runs as root. DNS-rebinding between the guard's lookup and the browser's connection remains a residual risk.
