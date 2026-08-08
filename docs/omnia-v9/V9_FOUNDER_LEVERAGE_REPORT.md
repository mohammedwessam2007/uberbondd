# OMNIA V9 Founder Leverage Report

North-star metric: **`founder_minutes_per_100_governed_actions`**. Machine-readable evidence: [`artifacts/omnia-v9/reality-shadow-report.json`](../../artifacts/omnia-v9/reality-shadow-report.json) (`founderBurden`), computed by [`buildFounderBurdenEstimate()`](../../src/omnia-v9/integrations/metrics.mjs).

## MEASURED vs. ESTIMATED

**MEASURED** in this report means: computed directly from this mission's real-Cedar-substituted replay and real-Postgres-backed demonstrations, with no interpolation. **Nothing in this report is claimed as a production forecast**, because `REAL_OPERATIONAL` sample count is 0 in this environment (see [`V9_REALITY_SHADOW_REPORT.md`](./V9_REALITY_SHADOW_REPORT.md)). Every number below describes how often *this specific probe set* requires review — not how often real UberBond traffic would.

## Review burden, by label (never merged)

| | SYNTHETIC (162 candidates) | ADVERSARIAL (26 candidates) |
|---|---:|---:|
| Governed actions | 162 | 26 |
| Reviews required | 111 | 26 |
| Reviews per 100 governed actions | 68.5 | 100.0 |
| Founder minutes per 100 governed actions (at 3 min/review) | 205.6 | 300.0 |
| Owner exceptions per 100 (critical `LEGACY_DENY_V9_ALLOW`) | 0 | 0 |

(These SYNTHETIC figures were corrected after fixing a replay-harness defect that misclassified 8 revocation scenarios as requiring no review — see [`V9_REALITY_SHADOW_REPORT.md`](./V9_REALITY_SHADOW_REPORT.md), "A genuine defect found and fixed.")

"Reviews required" = `LEGACY_ALLOW_V9_DENY + V9_INCOMPLETE + V9_ERROR` — the categories where V9 and legacy disagree or V9 couldn't reach a decision at all. Agreements (`BOTH_ALLOW`, `BOTH_DENY`) never require review.

**Why ADVERSARIAL is 100%:** every adversarial scenario in this set is, by construction, either a forged signature, a post-signing mutation, or tampered evidence — every single one is *supposed* to require scrutiny. A 100% review rate on a hostile-input probe set is not a founder-burden problem; it is confirmation the adversarial suite is doing its job. It would be dishonest to average this into the SYNTHETIC number, which is why it never is.

**Why SYNTHETIC is 68.5%, not near-zero:** the SYNTHETIC set deliberately includes every edge case PR #19 built to probe correctness (expired or revoked approvals, tenant mismatches, missing digests, malformed inputs, simulated DB/Cedar outages) — not a representative sample of "normal" outreach. It is not evidence that 69 of every 100 real outbound emails would need Mohamed's attention; it is evidence that when V9 has no real, unrevoked, resolvable approval to check (`V9_INCOMPLETE` = 50 of the 111 SYNTHETIC reviews required), it correctly refuses to guess.

## The reusable-approval leverage test

This mission's real question: does a bounded, reusable owner approval reduce review burden, or does V9 still ask for a decision on every single action?

**Demonstrated (real PostgreSQL + real Cedar):** one shadow approval, scoped to one campaign, one operation, `maxUses: 3` — evaluated against 4 candidates:

```
[ALLOW, ALLOW, ALLOW, REVIEW]
```

- **Candidates covered by one owner decision: 3 of 4 (75%)** — the owner made one approval decision and it correctly covered three separate outbound candidates without a second look.
- **Candidates falling outside scope: 1 of 4** — the 4th exceeds `maxUses` and correctly requires a fresh decision (a new approval, or an exception), never a silently-fabricated `ALLOW`.
- **Usage accounting remained atomic**: the `omnia_v9_approval_usage` row is updated inside the same transaction as the reservation (frozen `reserveAuthority()`), so concurrent evaluators cannot double-spend the same 3 uses — this was independently verified by the frozen closure suite's concurrency races, re-run against a real Postgres server this mission (352/352 pass, 0 skipped, including the 10 tests that specifically require true multi-connection concurrency).

This is the actual founder-leverage mechanism this mission was asked to test: **one owner decision, several governed actions, zero re-asking**, as long as the approval's declared scope (tenant, operation, purpose, cost, blast radius, use count) actually covers the candidate.

## Revocation and expiry: does the leverage mechanism stay safe under change?

Yes, both drills reproduced against real Postgres and real Cedar (full detail: [`V9_REVOCATION_EXPIRY_DRILL.md`](./V9_REVOCATION_EXPIRY_DRILL.md)):
- **Revocation**: before revoking a fresh approval, a candidate resolves `ALLOW`; immediately after revocation, the same shape of candidate resolves `REVIEW` — no cached authorization survives, because authority is re-resolved from the database on every evaluation, not cached.
- **Expiry**: a 2-second-lived approval covers a candidate within its window and stops covering one evaluated 500ms after expiry, using real PostgreSQL timestamp comparison, not string comparison.

A founder who revokes or lets an approval lapse gets the safety change to take effect on the very next evaluation, with zero additional code path to trust.

## Owner exception packets: what "one glance, one decision" looks like

[`V9_OWNER_EXCEPTION_QUEUE.md`](./V9_OWNER_EXCEPTION_QUEUE.md) (Mission 3) designed the concept; this mission built and tested it ([`src/omnia-v9/integrations/owner-review.mjs`](../../src/omnia-v9/integrations/owner-review.mjs)). A packet carries exactly: action, reason, maximum consequence, evidence summary, authority gap, a safe recommended default (always `DENY` — a missed send is reversible, an unauthorized one is not), and an expiry. No raw Cedar diagnostics, no digests, no internal context — verified directly in [`tests/omnia-v9-owner-review.test.mjs`](../../tests/omnia-v9-owner-review.test.mjs), which also asserts the packet does *not* contain `cedarDiagnostics` or `policyDigest`.

Using synthetic fixture responses (never live outreach to the real owner), all five required response types resolve deterministically: `APPROVE`, `DENY`, silent expiry (falls back to the safe default, idempotently), `REVOKE` (only valid after a prior `APPROVE`, falls back to the safe default, keeps the original decision in the audit trail rather than erasing it), and duplicate/late responses (the first response always wins; anything after resolution or past expiry is recorded as rejected, never silently overwriting the outcome).

## What this report does not claim

- It does not estimate real Mohamed-minutes-per-day, because there is no real traffic volume in this environment to multiply by.
- It does not claim the 63.6%/100% review rates predict production review rates — see "Why SYNTHETIC/ADVERSARIAL" above.
- It does not claim founder burden has already been reduced in production — no real approval has ever been issued outside a test, and `enforce`/`canary` mode do not exist in this codebase.
- What it does claim, with real evidence: **the reusable-approval mechanism itself works exactly as designed** — one decision, several covered actions, atomic usage accounting, immediate effect on revoke/expiry — which is the prerequisite for founder burden ever going down, not proof that it already has.
