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

**Successor hypothesis S1 (not executed, preserved).** *Auditor-change early warning.* A firm that knows which engagements will change hands could bid on them before the RFP. The test:
- predict 2025 changes from 2022–2024 features (tenure, findings, going-concern flags, auditor size, entity type);
- score with Brier against the observed 2024→2025 changes;
- beat the base rate of about 13%, or die.

It needs no outreach and no key, but it still needs willingness-to-pay evidence before it is a product.

<!-- X2 section appended below -->
