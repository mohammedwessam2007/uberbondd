# MACHIAVELLI Ω∞: The Absolute Money Hunt — execution receipt

**Date:** 2026-10-22 (UTC)
**Source:** main `3a7a0b7` (PR #1533); branch `claude/machiavelli-money-hunt-20261022`
**Truth class:** EXPERIMENT RECEIPTS (read-only, public data). No buyer validated, no money moved, nothing sent, deployed, traded or purchased. Cleared contribution profit: **$0.00**.
`businessEffectAuthority: NONE`.

## Mission source

- The founder directive *UBERBOND MACHIAVELLI Ω∞: THE ABSOLUTE MONEY HUNT* was referred to as attached, but no attachment reached this session and no copy exists in the repository: **NOT_HYDRATED**.
- The "120 income mechanism seeds" it references are likewise **NOT_HYDRATED**. Nothing here claims to have read them. When the text is supplied, reconcile it against the atlas (890 ideas, 48-mechanism catalogue), the 16-mechanism tournament on main, and the 14-group audit in #1538.
- This receipt therefore executes the parts of the directive that are unambiguous: reconcile open commercial work, run the two most valuable zero-cost experiments, and produce one buyer-ready packet.

## Reconciliation: who owns what

| PR | Owner lane | State |
|---|---|---|
| #1532 | Project Cash Now: integrity gates, two offline prototypes | draft; its 5 integrity tests were ported by #1537 W4 |
| #1535 | First-money activation: Reliant finding, $99 pilot, invoicing and payout gates | draft, documentation |
| #1536 | Verified-defect billing repair (atomic charge reservation) | draft |
| #1537 | Commercial Omega W1–W8: Actor package, security, report, unit economics | draft; reviewed in #1538 |
| #1538 | Ω orchestration: claim gate, rail registry, experiment E1 (FAILED), E2 assigned to CP-02 P7 | draft |

All five work one lane: the website-inquiry audit (tournament rank 2). Its binding constraints are owner-only (#1538 §2): no observed collection account, no send authority, unknown invoicing status. More engineering in that lane does not move first cash.

So this session runs the two tournament finalists that were recommended in `docs/MACHIAVELLI_WEALTH_ENGINE.md` but never executed: **rank 1 (Single Audit Obligation Radar)** and **rank 3 (Apify Store breakage arbitrage)**. Both were pre-registered and pushed before any outcome was examined (`artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json`, commit `c0b1ded`).

## X1 — Single Audit radar hindcast: **KILL**

**Question.** When the radar flags a nonprofit whose direct federal obligations reach the Single Audit threshold and which has no FAC filing history, how often does it actually file?

**Why a hindcast.** A prospective forecast resolves in 9–21 months. Federal FY2023 resolves now.

**What changed relative to the earlier attempt.**
- The earlier Georgia run stalled on the FAC API's shared `DEMO_KEY` rate limit (it was still returning 429 today).
- FAC publishes **keyless bulk CSVs** at `app.fac.gov/dissemination/public-data/gsa/full/`. `general.csv` (272,948,578 bytes, SHA-256 `c7dd80a8…551a`) holds every report, including auditor firm name and EIN.
- USAspending's recipient endpoint returns fiscal-year-bounded obligations. That answers part of the tournament's "an award is not expenditure" objection: the bound is right, though obligations are still not expenditures.
- The threshold for FY2023 is **$750,000**. The $1,000,000 threshold applies only to fiscal years beginning on or after 2024-10-01. The radar on main uses $1M, which is right for prospective FY2026 but wrong for any hindcast.

**Cohort.** GA, OH and AZ nonprofit recipients of grants, FY2023: 500 recipients read; 135 below threshold; 287 already known filers at the forecast date.

**Result** (`x1-single-audit-hindcast-result.json`):

| Stratum | Flagged | Filed 2023/24 | Filed later only | Never filed | Precision |
|---|---:|---:|---:|---:|---:|
| core ($750K–$5M) | 69 | 24 | 1 | 44 | **0.348** |
| large (≥ $5M) | 9 | 5 | 0 | 4 | 0.556 |

Pre-registered kill line: core precision below 0.35. **Decision: KILL.**

**The kill survives attack from both sides.**
- *Overstating precision.*
  - Every 2016–2021 FAC row carries the placeholder UEI `GSA_MIGRATION` (37–45 thousand rows a year), so history before 2022 was matched by name and state only. Some prior filers were therefore flagged as new.
  - Post-hoc and not pre-registered: **10 of the 24 core "hits" are late filers** with a 2019–2022 report accepted after the forecast date. They already have auditors. New-client precision is about **14/69 ≈ 0.20**.
- *Understating precision.*
  - Some "never filed" entries are coverage artifacts. Arizona State University is in the State of Arizona's report, and the Salvation Army and International Rescue Committee are audited at headquarters.
  - Others are estimator misses: fair-housing grants obligated in one year are spent over several.
  - Even removing about six artifacts, new-client precision stays near 0.22.

**What dies.** The "new obligor prospect list for CPA firms" product. Direct-award data cannot see pass-through funding, cannot tell obligations from spending, and in practice mostly re-finds entities that already have auditors.

**Market facts kept** (FAC only, descriptive):

| Fact | Value |
|---|---|
| Single Audit reports per year | ~46,000 (2023: 46,917; 2024: 45,730) |
| Distinct audit firms by EIN, 2024 | 3,612 (2,340 with 1–5 audits; 834 with 6–20; 438 with more than 20) |
| Top-10 firm share of reports | 13.7–14.5% (an unconcentrated market) |
| **Continuing entities that change auditor EIN year over year** | **11.4% (2022→23), 13.3% (23→24), 13.8% (24→25)**, about 4,600–5,400 engagements a year |

The EIN change rate is an upper bound, because CPA-firm mergers also change EINs. The name-based rate in the receipt (22.6%) is a looser upper bound that is kept only for traceability.

## S1 — Auditor-change early warning: **KILL**

**The idea.** About 13% of engagements change auditor every year. A firm that knew which ones would change could bid before the RFP.

**Method.** Pre-registered and pushed before running (`03c1ad9`):
- population: 31,756 entities with real UEIs and valid auditor EINs for 2022–2025, split train/test by UEI hash;
- features: tenure, entity type, auditor portfolio size, expenditure band, going concern, material weakness, low-risk status, same-state auditor.

**Result** (`s1-auditor-change-hindcast-result.json`):

| Measure | Value | Bar |
|---|---:|---:|
| Test change rate | 13.9% | |
| Brier skill vs base rate | **0.025** | ≥ 0.05 |
| Top-decile change rate | 27.1% | |
| Top-decile lift | **1.95×** | ≥ 2× |

**Decision: KILL.** Change is somewhat more likely right after a recent change (17.8% at tenure 1 vs 13.3% at tenure 3). But public FAC fields do not rank engagements sharply enough to sell as a list.

## X2 — Apify Store breakage foundry: **INCOMPLETE_NOT_SCORED** (twice), foundry not advanced

**Question.** Do high-demand public Actors fail often enough, without healthy substitutes, to leave stranded users a new Actor could serve?

**Definitions.**
- Broken leader: at least 200 users in 30 days, at least 1,000 runs, and at least 20% of runs failed or timed out.
- Kill if fewer than 25 leaders exist, or if more than 70% of them are absorbed by healthy substitutes.

**Protocol history**, every change pushed before the run it governs:
1. **Pre-registered full pagination** (`c0b1ded`). It proved impossible: the public Store API returns nothing at offset 15,000 or beyond, for every sort order. The first newest-first run read 11,368 of 93,895 Actors. It is void. Its output file was overwritten by the A1 run, so only its summary survives here: 11,368 read, 1 broken leader. That summary was seen before amendment A1.
2. **Amendment A1** (`1aeea71`): a global plus per-category popularity crawl, with a tail rule assuming popularity order tracks 30-day users. The run read 66,299 Actors (receipt: `x2-apify-store-observatory-a1-incomplete.json`). It failed the rule, because the global tail still had an Actor with 1,851 users30 at rank 15,000. Result: INCOMPLETE.
3. **Amendment A2** (`8e63e23`, disclosing that A1's partial figures had been seen): newest, lastUpdate and relevance passes on the capped partitions, and completeness by enumeration against the visible fraction calibrated on fully enumerated categories (83.7%).
   - The run made 404 public GETs and read **73,964 distinct Actors**: 77.2% of the reported total, against 81.7% needed.
   - The global and AUTOMATION partitions fall short. Result: **INCOMPLETE_NOT_SCORED**.
   - Per A2, there is no further amendment this session.

**What is observable** (descriptive; it decides nothing):
- **13 broken leaders. All 13 are absorbed** by a same-category healthy substitute with at least half their users; leaders have between 1 and 112 such substitutes. Stranded users30: **0**.
- The extra roughly 7,700 Actors found by the A2 passes added **no** broken leader.
- 72,085 of 73,964 Actors (97.5%) are pay-per-event; 60,619 had at least one user in 30 days.

**Consequence.** The foundry is **not advanced**. In the observable 77% of the Store, breakage is rare and already absorbed. The remainder is untested, not cleared.

**Re-test, together, on or after 2026-11-05.**
- The canon's 14-day migration snapshot: users30 of each listed leader and its top substitutes.
- A completion attempt for the AUTOMATION partition, for example by search-term partitioning, registered before the run.


## The buyer-ready packet

**[`BUYER_PACKET_INQUIRY_PATH_CHECK.md`](BUYER_PACKET_INQUIRY_PATH_CHECK.md): an inbound, fixed-price Inquiry-Path Check, verified against the buyer's declared numbers.**

**Why this one.**
- It is the only route that sidesteps the outreach gate: buyers purchase on a marketplace, and the marketplace collects.
- Its delivery code works today.
- It answers the E1 failure: the buyer's declaration turns "maybe tracking, maybe an error" into a checkable fact on any site.

**Built this session:**
- `src/declared-number-reconciliation.mjs`, with 9 tests. Two mutations were killed. It caught two of its own defects while the sample was generated:
  - a printed declared number was reported as "not found";
  - an unreadable site rendered as "clean".
- The operator CLI `scripts/inquiry-path-check.mjs`, smoke-tested live.
- An illustrative sample generated by the same code path.
- Unpublished Upwork and Contra listing copy, with a $99 / $249 price.

**What it still needs (owner-only).** Platform account and identity check, payout method, tax and invoicing posture, and pressing publish. No send authority is needed.

## Trading-bot and market-microstructure hypotheses

**Investigated, not executed this session.**
- The lab on main (`docs/MACHIAVELLI_WEALTH_ENGINE.md`) already ran 17 pre-registered experiments across BTC, ETH, SOL and XRP: spot, perpetuals and funding.
- Measured over T-bills, none survives costs. Funding carry has a negative excess Sharpe, and only ETH time-series momentum is INCONCLUSIVE.
- Every remaining microstructure idea for a retail account needs either a crypto venue, whose rail is legally blocked for the founder pending Egyptian counsel (Law 194/2020 Art. 206), or founder trading capital.
- Neither is authorized, so new trading research would spend effort on a path whose money cannot lawfully enter.
- **Resurrection conditions** (unchanged from main):
  - a fee tier below the maker bound;
  - a sustained leverage-mania funding regime;
  - written legal clearance plus a capital authorization.

## Experiment ledger (this session)

| ID | Mechanism | Decision | External effects |
|---|---|---|---|
| X1 | Single Audit radar (tournament rank 1) | **KILL**: precision 0.348 vs 0.35; new-client precision ~0.20 | 5 USAspending POSTs (read-only); 2 FAC bulk downloads (keyless) |
| X2 | Apify breakage foundry (rank 3) | **INCOMPLETE_NOT_SCORED**: 13/13 observable leaders absorbed; not advanced | 16 + 180 + 404 public Store GETs across the void, A1 and A2 runs (plus 6 probing calls); no account |
| S1 | Auditor-change early warning (new) | **KILL**: Brier skill 0.025, lift 1.95× | none (local data) |
| Packet | Inquiry-Path Check, inbound | **BUYER-READY, UNPUBLISHED** | 1 GET + 1 robots request (example.com smoke) |

Across all of them: zero messages, form submissions, accounts, purchases, trades or deployments. Spend $0.

## Founder actions (maximum three)

1. **Pick one platform** (Upwork Project Catalog or Contra) and complete its account, identity check and payout method. This is the same Contra action #1538 already asks for, so one action serves both the direct pilot and the inbound listing.
2. **Decide the tax and invoicing posture** (W-8BEN, ETA) using the #1535 checklist.
3. **Publish the listing** from the packet, or tell Claude to change it first.

## Founder-idea crossover

- **X1 and S1:** #0059 THE PREDICTION ACCOUNTING SYSTEM. Both were scored as dated, falsifiable forecasts against later reality. Both killed; the method held.
- **Packet:** #0058 THE ERROR ECONOMY and #0146 THE KNOWLEDGE PACKET, plus a new descendant: *buyer-declared truth as a reference frame*.
- **X2 and trading:** NO_MATERIAL_890_CROSSOVER_OBSERVED beyond the existing atlas classification.
- All 890 ideas remain in the immutable corpus, unchanged.

## PHOENIX checkpoint `PHX-MONEY-HUNT-20261022`

| Item | State |
|---|---|
| **Durable** | pre-registration with amendments; X1, X2 and S1 receipts; packet; sample; the three new modules and their tests |
| **Outside git** | FAC bulk CSVs and the Apify snapshot, by SHA-256 recorded in the receipts |
| **CHAT_ONLY, unrecovered** | the founder's Ω∞ directive text and its 120 seeds |
| **Next decisive external fact** | the first inbound purchase, or 60 days of a live listing without one |
| **Scheduled re-test** | X2 migration snapshot on or after 2026-11-05 |

