# UberBond: MACHIAVELLI Wealth Engine

Status: **FIRST EXECUTION PROGRAM — research, invention, lab and ledgers built; cleared contribution profit $0.00**
Mission source: founder directive "UBERBOND: MACHIAVELLI — Autonomous Wealth Invention & Economic Dominance Engine" (2026-10-21).
Subordinate to the Sovereign Cognitive Continuum. `businessEffectAuthority: NONE`. No money was moved, traded, spent or requested.

> The founder supplies the ambition. The intelligence searches the economic possibility space. Reality determines what earns.

## What exists now (verified in this repository)

| Deliverable | Where | State |
|---|---|---|
| 1. Wealth Mechanism Atlas | `artifacts/machiavelli/wealth-mechanism-atlas.json`, test `tests/machiavelli-wealth-atlas.test.mjs` | all 890 founder ideas classified by economic mechanism + 48-mechanism external reality catalogue |
| 2. Autonomous Profit Tournament | `artifacts/machiavelli/profit-tournament.json` | see section below |
| 3. Quant Trading Research Laboratory | `src/quant-data-vault.mjs`, `src/quant-backtest.mjs`, `src/quant-strategies.mjs`, `src/quant-research-protocol.mjs`, `src/quant-paper-ledger.mjs`, `scripts/quant-lab.mjs`, receipt `artifacts/quant-lab/experiments-2021-01_2026-09.json` | working; 17 pre-registered experiments; none promoted |
| 4. Prototype portfolio | see section below | |
| 5. Capital Allocation Intelligence | `src/capital-allocation-intelligence.mjs` | $0/$100/$500/$1k/$5k/$25k scenarios with ruin firewall, correlation groups, founder-hour limits |
| 6. Revenue Reality Ledger | `src/revenue-reality-ledger.mjs` | five tiers, hash-chained, never summed across tiers |
| 7. Commercialization paths | tournament `smallestLawfulExperiment` per survivor | |
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
- Deflated Sharpe Ratio over the parameter variants tried;
- a sealed holdout (2025-10 to 2026-09) opened once;
- doubled-cost stress;
- a **risk-free hurdle** from US Treasury average T-bill rates: 4.02% over the out-of-sample window, 3.80% over the holdout.

| Family | Label | OOS Sharpe | OOS CAGR | DSR | Holdout | OOS max DD |
|---|---|---|---|---|---|---|
| BUY_AND_HOLD:BTC | REJECTED | 0.69 | 24.8% | 0.908 | -26.9% | 68.4% |
| TIME_SERIES_MOMENTUM:BTC | REJECTED | 0.63 | 17.9% | 0.663 | -4.9% | 41.3% |
| FUNDING_CARRY:BTC | INCONCLUSIVE | 3.02 | 2.4% | 0.992 | 0.8% | 0.9% |
| FUNDING_CARRY_OPTIMISTIC_BOUND:BTC | INCONCLUSIVE | 2.87 | 3.2% | 0.998 | 1.4% | 1.3% |
| BUY_AND_HOLD:ETH | REJECTED | 0.34 | -0.3% | 0.743 | -35.3% | 77.9% |
| TIME_SERIES_MOMENTUM:ETH | INCONCLUSIVE | 0.31 | 3.5% | 0.530 | 2.3% | 58.3% |
| FUNDING_CARRY:ETH | REJECTED | 1.43 | 1.9% | 0.445 | 0.0% | 1.9% |
| FUNDING_CARRY_OPTIMISTIC_BOUND:ETH | INCONCLUSIVE | 2.27 | 3.0% | 0.996 | 0.3% | 1.8% |
| BUY_AND_HOLD:SOL | REJECTED | 0.52 | 1.3% | 0.844 | -43.1% | 95.8% |
| TIME_SERIES_MOMENTUM:SOL | REJECTED | 0.66 | 24.8% | 0.782 | -36.1% | 68.9% |
| FUNDING_CARRY:SOL | REJECTED | 1.54 | 1.7% | 0.978 | 0.0% | 1.1% |
| FUNDING_CARRY_OPTIMISTIC_BOUND:SOL | REJECTED | 1.83 | 2.1% | 0.999 | 0.0% | 1.2% |
| BUY_AND_HOLD:XRP | REJECTED | 0.80 | 37.9% | 0.940 | -47.6% | 68.1% |
| TIME_SERIES_MOMENTUM:XRP | REJECTED | -0.16 | -26.4% | 0.292 | -51.5% | 85.3% |
| FUNDING_CARRY:XRP | REJECTED | 1.92 | 2.2% | 0.959 | -0.8% | 0.5% |
| FUNDING_CARRY_OPTIMISTIC_BOUND:XRP | REJECTED | 2.32 | 2.7% | 1.000 | -0.2% | 0.5% |
| FUNDING_ROTATION:BTC+ETH+SOL+XRP | REJECTED | 1.58 | 1.9% | 0.004 | 0.0% | 1.1% |

**Decisive finding:** delta-neutral funding carry is *statistically real* (DSR up to 1.00) and *economically worthless* for retail.
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

## Tournament, prototypes and commercialization

_Filled from `artifacts/machiavelli/profit-tournament.json` when the adversarial tournament completes._

## Truth boundary

Architecture, backtests, atlas classifications and tournament scores are not revenue. The highest tier any mechanism has reached is SIMULATED.


## PHOENIX 2026-10-22 post-donor repair and Cash Now continuation

This original donor document remains preserved. Its original descriptions predate the corrections now documented at `docs/project-cash-now/EXECUTION_CHECKPOINT_20261022.md`. A recovered historical backtest or internally self-digested payment field is **not** independent proof of money earned. The restored `artifacts/machiavelli/profit-tournament.json` deliberately has no capital candidates or verified paid customers; two $0-spend local prototypes demonstrate technical feasibility only. The `machiavelli-scoreboard` output records `SIMULATED` as the strongest observed tier and $0 cleared contribution profit. Live sale, account/KYC/payout and real demand remain external gates.
