# Sovereign Forge Ω∞ Wave 5 — Unbiased Paired Evidence and Canonical Typed Timestamps
Date 2026-10-08. Recovery parent main: `88a6acf2ed1baf6d2f0450dcadacaea37a8a63b0`. Parent Render deployment `dep-db3oi6ajnfac73ctlqs0` LIVE, native production 118/118 pass on Node v26.11.1; original 890/890 and ten shard hashes verified unchanged.

## Concrete source defects
1. `reviewPairedWorkloadSubmission` wrongly refused `candidateOutputDigest===frontierOutputDigest`. Independent matched candidate and frontier models can produce identical byte-level answers; excluding such rows would systematically remove strong matching pairs from later audits. Allowing them only STAGES UNTRUSTED RECEIPTS. It does not authenticate independence, evaluator quality, provider invoices or any economic multiplier.
2. `precommitPublicWorkload` accepted parseable non-string `asOf` and `sourceObservedAt`, including Date objects, but `verifyPublicWorkloadManifest` refused the resulting output due to its required string fields. Constructor and verifier could disagree about a valid commitment. Refuse such inputs at construction, including coercion objects whose toString throws.

## Competing options and implementation
- Chosen: remove equality exclusion; retain all other digest/ref/cost/duplicate/authority checks and non-promotion truth. Enforce typed source/asOf timestamps before Date.parse.
- Rejected: treat same-answer pairs as automatically scored equivalence (would fabricate blind quality/billing evidence).
- Deferred: independent quality/custody review and pay-per-task evidence market, which require genuine task owner/provider receipts.
- Explicit 890 donors: #0057 Proof Economy, #0058 Error Economy, #0059 Prediction Accounting, #0060 Civilizational Memory, #0067 Trust Compiler, #0653 Self-Falsifying System, #0877 Recursion Proof System, preserving other 883 ideas without modification.

Three new hostile tests: same-answer pair staged without quality promotion, refusing typed/coercing non-string asOf, refusing non-string source timestamps while preserving verified normal path. Existing historical+Wave1–4 test suites remain in the live native runner.

## Boundaries
No provider inference, benchmarking, customer mail, DNS, account mutation, purchase, payout, subscription or paid authorization. Even if tests pass, the full UberBond vision is not implemented/proven. Existing commercial gates: current owner-authenticated Contra setup/identity/payout route, lawful and approved source of outreach, independent buyer acceptance and actual cleared bank payment. UberMind frontier claim still needs fresh sealed independent tasks, blind quality evaluator and verifiable cheapest eligible provider invoices and all-in accounting. No hallucinated 33,333x.

PHOENIX `UBERBOND-FORGE-OMEGA-20261008-W5-UNBIASED-PAIR-EVIDENCE`.
Exact merged main, CI/native results and deployed SHA must be appended to issue #1188 after actual verification. Do not mark production green based on this document alone.
