# Late-night launch repair receipt — 2026-10-06

Base: `c49df1d0f2825512077e55708ee1e014f1fd45e2`

Defects found:
- three committed test files did not parse because of a malformed object-spread assignment in the in-memory store setter;
- canonical brain startup treated a fixed historical Capability Genome pilot as current and therefore failed after the 30-day freshness window;
- the production Revenue Terminal still surfaced obsolete PayPal/Lemon Squeezy owner actions after current canon deactivated PayPal and selected Contra as the first-cash path.

Repair law:
- fix syntax rather than exclude tests;
- never weaken `CURRENT` freshness;
- historical startup is allowed only for the exact committed pilot binding and must self-label as historical;
- preserve dormant/deactivated payment implementations for provenance while removing them from the current owner-action critical path;
- never claim Contra account readiness before exact account/KYC/Wallet/payout evidence exists.

Pre-persistence evidence:
- 2699 files parsed after syntax repair;
- focused repaired tests passed;
- Genome hostile tests passed;
- brain/capability/genesis/readiness doctors passed after the exact historical-pilot repair;
- partial deterministic run reached 505 pass / 0 observed fail before sandbox lifetime termination.

The partial deterministic run is not a full-suite pass. Persisted exact-head verification remains mandatory before merge.

External effect ledger for this repair: messages 0; purchases 0; payment requests 0; money movement 0; DNS changes 0; credential changes 0.


## Persisted-head Vercel finding and donor recovery

Vercel genuinely executed repair head `0fdfb142050ba84a686afcedf962384197e8b093`. Both preview projects failed current-truth regeneration on the exact 14-module reachability list previously documented by PR #1209. GitHub Actions red jobs had `steps=[]` and remain runner pathology, but the Vercel failures were real executed checks.

PR #1209 was inspected as donor lineage. Its classifier additions exactly matched the current unclassified list and preserve fail-closed activation. The classifications and original reconciliation receipt are therefore recovered into the current branch rather than merging the stale PR wholesale.


## Semantic evidence collision repair

The second exact-head Vercel run proved the recovered reachability classifier worked and then refused on exactly four semantic contracts. The failures traced to evidence binding, not four absent organs. The candidate now:
- refuses to promote a historical donor from only a `SUB_PHRASE` heuristic match while preserving exact whole-name promotion;
- loads the same terminal-closure implementation declarations in the semantic generator that coverage already uses;
- uses a verified declaration's exact source/test set for semantic behavioral proof instead of contaminating it with broad filename matches.

This specifically prevents false bindings from generic `company-*` and `living-evidence-graph` filenames and restores exact Reachability War behavioral evidence.


## Night Frontier final semantic residue

Exact-head `b8bd02cadf37f96afd6408cf904edf83609e28a2` reduced the semantic tribunal from four invalid finite contracts to one: `total-brain:night-frontier` with only `caller-required`.

Inspection showed the declared module is tested but deliberately `AWAITING_ACTIVATION` and has no runtime caller. Rather than minting a fake caller, donor classification is tightened so `CLASSIFIED_OR_UNREACHABLE` implementation evidence cannot promote a historical donor into current finite behavior. Exact/whole-name donor code that is genuinely production/operator reachable can still promote normally.


## Coverage operator-reachability contradiction

The 59fc exact-head private build still reported Night Frontier as a finite caller-less behavior. Inspection found the coverage index itself re-admitted every gated source file as `operatorReachable` immediately after excluding those files from `productionReachable`. The candidate now removes registered gated modules from both approximation lists and adds a regression asserting no classified/gated path leaks into operator reachability. The exact reachability ratchet remains authoritative for the detailed partition.
