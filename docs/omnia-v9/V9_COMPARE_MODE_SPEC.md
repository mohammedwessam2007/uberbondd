# OMNIA V9 Compare Mode Spec

## Purpose

Compare mode answers one question for every eligible outbound action: **did V9 agree with legacy, and if not, in which direction?** It never resolves the disagreement — it only labels it for later human review.

## The six categories (exact, exhaustive)

Implemented in `src/omnia-v9/integrations/compare.mjs`, `classifyComparison({ legacyEligible, v9Status, v9Decision })`:

| Category | Condition | Meaning |
|---|---|---|
| `BOTH_ALLOW` | legacy=ALLOW, V9=ALLOW | agreement |
| `BOTH_DENY` | legacy=DENY, V9=DENY | agreement |
| `LEGACY_ALLOW_V9_DENY` | legacy=ALLOW, V9=DENY | V9 potentially stricter |
| `LEGACY_DENY_V9_ALLOW` | legacy=DENY, V9=ALLOW | **potentially dangerous V9 miss — critical** |
| `V9_INCOMPLETE` | V9 status is `NO_HOOK`, or V9 decision is `REVIEW` (or anything not exactly ALLOW/DENY) | proof/authority incomplete, not a hard decision |
| `V9_ERROR` | the hook threw | V9 reliability problem |

`isCriticalDisagreement(category)` returns true only for `LEGACY_DENY_V9_ALLOW`. Per the mission, every instance of this category is treated as a potential V9 safety defect until investigated, and promotion beyond shadow/compare is blocked while any unresolved instance exists.

## What gets persisted

One `omnia_v9_outbound_compare` audit-log entry per evaluated candidate (via the existing generic `store.log()` — no new table):

```json
{
  "schemaVersion": "omnia.v9.outbound-compare.v1",
  "reservationId": "...",
  "category": "LEGACY_ALLOW_V9_DENY",
  "legacyEligible": true,
  "legacyReason": "",
  "v9Decision": "DENY",
  "v9Reasons": ["evidence:origin-not-allowed"],
  "policyDigest": "",
  "constitutionDigest": "",
  "intentDigest": "...",
  "observedAt": "2026-08-08T..."
}
```

This is deliberately the same shape whether the record came from live shadow-hook logging or is later loaded for analysis — one schema, one code path (`classifyComparison`), no divergence between "what compare mode computes live" and "what the operator view / metrics module reads back."

## Non-resolution guarantee

Compare mode has no code path that changes `sent`/`reserved`/`retry` behavior based on `category`. It is write-only from the send path's perspective — a pure observer. This is enforced structurally (the hook's return value is only ever passed to `store.log()`, never back into `Pipeline.maybeSend()`'s control flow) and is covered by the non-interference tests in `tests/omnia-v9-integration-outbound.test.mjs`.

## Known boundary limitation

Because the hook fires only after legacy eligibility already returned `ok: true` (see `V9_REAL_INTEGRATION_ARCHITECTURE.md`), **live production compare-mode data can only ever contain `BOTH_ALLOW`, `LEGACY_ALLOW_V9_DENY`, `V9_INCOMPLETE`, and `V9_ERROR`.** `BOTH_DENY` and `LEGACY_DENY_V9_ALLOW` cannot occur at this exact boundary in production — legacy never reaches the hook when it would have denied. The replay harness (`V9_REPLAY_REPORT.md`) exercises all six categories synthetically; this is stated here so nobody reads a live compare-mode report and wrongly concludes "V9 never disagreed with a legacy DENY" as evidence of safety, when it's actually a structural non-observation.

## Promotion gate this enables

`buildConfusionMatrix()` in `src/omnia-v9/integrations/metrics.mjs` computes `criticalDisagreementCount` directly from persisted compare records. The promotion state machine (`OMNIA_V9_FROZEN_BASELINE.md` amendment protocol notwithstanding — this is a promotion gate, not a core amendment) requires this to be exactly zero, with a minimum observation count, before `CANARY_ELIGIBLE` may even be discussed. See `V9_CANARY_CONTRACT.md`.
