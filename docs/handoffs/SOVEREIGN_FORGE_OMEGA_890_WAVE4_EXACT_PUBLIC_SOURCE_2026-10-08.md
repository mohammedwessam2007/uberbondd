# Sovereign Forge Ω∞ Wave 4: exact historical public issue-source retrieval
Date: 2026-10-08. Frozen parent main `bfffaa1372574d6c7253bc97435a44bb5ef14d78`. Previous source-integrity waves #1311, #1312, #1313 remain production verified.

## Reproduced weakness in actual source
The historical opt-in collector in `scripts/ubermind-public-issue-intake.mjs` requested `GET /repos/mohammedwessam2007/uberbondd/issues?state=open&per_page=100` exactly once, then looked for the selected historical IDs [1211,1206,1001,1000,999,998,997,996,995,994,908,902]. The first 100 open results are not the entire GitHub history; older issue #902 could simply not appear. The collector could misleadingly report a small observed count without distinguishing selected-but-unreachable sources.

## Source-grounded intervention
Selected the smallest fix over (a) cursor-pagination and bulk project issue inventory with broader data collection, and (b) a new cross-source scraping/verification platform requiring permissions unrelated to the present proof. Exact per-ID GitHub public GETs for the existing approved selection are safely bounded at four simultaneous requests, with seven-second aborts, individual HTTP/malformed/transport failure accounting and stable original selection order. No public body text is returned; only one-way version fingerprints and URLs. A complete failure preserves error details. `liveIssueCount=null` because no repository-wide census was performed.

Direct authenticated **read-only GitHub API** independently confirmed all twelve selected issue IDs are presently open at their exact canonical URLs with nonempty bodies and version timestamps. This does not validate quality, benchmark reuse permission or hidden holdout status.

Eight mocked hostile source retrieval tests were added and included in `scripts/jev-native-runtime-tests.mjs`: old issue extraction, partial 403 truth, complete 404 refusal, pull-request masquerade, wrong ID, transport failure, out-of-scope/duplicate selection, and version-change digest. Do not mark the suite successful until an observed native receipt exists after merge/deploy.

Original 890 source, manifest and ten shards unchanged. Donor linkage: #0057 reusable source proof, #0058 error evidence, #0059 prediction/version accounting, #0060 lineage, #0067 trust refusal, #0653 adversarial disconfirmation, #0877 constrained action. Every remaining founder original stays inherited and addressable; no 890 realization claim.

## Non-effects and external blockers
Opt-in source-reading is separate from production startup and is NOT a standing instruction to fetch public GitHub, upload content to any model, or spend inference. Public availability is not external consent or fresh sealed blind evidence. Other live critical-path blockers remain: authenticated Contra account/payout-state observation, legal sender route and standing campaign authority, a real consenting buyer, accepted contract/delivery and cleared cash, and independently sealed diverse evaluated tasks with audited bills for the ambitious 33,333x research claim.

PHOENIX ID: `UBERBOND-FORGE-OMEGA-20261008-W4-EXACT-SOURCE-INVENTORY`.
Before closure: review diff, merge with evidence, deploy existing Render service at exact main SHA, obtain native test result, verify 890 integrity and revenue truth; update issue #1188. No buying Winnr or contacting prospects.
