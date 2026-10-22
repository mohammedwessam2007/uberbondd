# Independent quality evaluation: 22 October 2026

**Verdict: PARTIAL; not independently quality-verified.** Evidence classes are deliberately separate.

The freeze ledger `artifacts/commercialization/frozen-40-home-service-sites-2026-10.json` lists 40 home-service operator domains selected before scanning, without filtering known-weak sites. It is a nonrandom convenience sample, not a prevalence estimate for the population. Two read-only, two-page-per-site runs were completed under Node heap ceilings of 2 GB and 4 GB. Both observed pages from 34/40 sites, with six unavailable/unobservable. The initial scan emitted seven assertable candidates on five distinct sites; 35/40 sites produced no assertable candidate. These are candidate *observations*, not seven independently proven buyer-impacting defects.

An independent fresh HTTP retrieval and Python standard-library HTML parser, not the scanner's JavaScript parser, examined all seven candidate evidence URLs (`scripts/independent-inquiry-quality.mjs`, `scripts/independent-inquiry-html.py`). Four JSON-LD parse errors were corroborated in newly fetched public HTML. The other three observations were not independently corroborated by that parser. This establishes at most **four fresh parser-corroborated syntactic observations, only three with original-source SHA-256 agreement**, **zero human-verified defects**, **zero third-party reproduction passes**, and **zero proved lead or revenue losses**.

The quality acceptance target was 20 independently supported findings; current shortfall is at least 17 using the strict matching-source parser-corroborated definition and all 20 using the required human-confirmed standard. No unsupported precision or false-positive fraction is calculated from this incomplete reference set. The initial local host Chromium launch failed SIGTRAP, and the original Docker daemon was full. A later isolated overlay2 Docker daemon, two successful image builds, read-only live container witness and 2 GB/4 GB Chromium runtime smokes superseded these infrastructure limitations (see `docs/commercialization/PHOENIX_OMEGA_CONTAINER_ADDENDUM_2026-10-22.md`). A full adversarial browser matrix and independent customer-path acceptance are still not proven.

## Failure taxonomy and adversarial concerns

| Test or quantity | Evidence and verdict |
|---|---|
| Structural-data syntax | Four fresh parser confirmations; three agree with the original-source hash; not proof of business impact |
| Other observed link and phone facts | Three observations remain unconfirmed independently; abstain from external claims |
| Call tracking and legitimate alternate destinations | Existing source downgrades many differences to `ASK_DONT_ASSERT`; an owner must establish intended routing before a defect is claimed |
| Redirects, DNS and robots | 40-site field evidence plus hostile fixtures; unobservable never becomes billable |
| Browser-modified tel links | Pure normalizer/source tests; live browser confirmation unavailable in this environment |
| Reproduction reliability | UNKNOWN without an independent human reader following the report |
| Precision, FPR and clean-site accuracy | UNKNOWN without an independently labeled reference set |
| Cost per human-verified finding | UNKNOWN; denominator is zero and billable quality is not established |
| Buyer-facing clarity | Report renders with clear URLs, evidence, timestamps and disproof steps; independent buyer usability not tested |

No real customer acceptance or payment has been evidenced. Raw fetched HTML is not committed into Git to avoid unnecessary site-content retention. Public URLs, observations and SHA-256 values are preserved in `artifacts/commercialization/quality-eval-2026-10.json` with the associated source run; websites may change, so historic observations require fresh verification. Human-only gate: have an independent reviewer reproduce each intended assertion using an ordinary browser and document URL, time, page source, business-intent ambiguity, and whether the report's instructions work. **The Actor and current candidate findings are not approved for a paid Store listing.**
