# OMNIA V9 Owner Exception Queue

## Purpose

Surface only the cases that genuinely require Mohamed's judgment. Everything V9 and legacy agree on, and everything that's routine incompleteness (no real approval provisioned yet), stays out of his queue entirely.

## What qualifies as an exception

Derived directly from `buildConfusionMatrix()` output plus a small set of category filters — no separate storage, no separate schema, computed on read from the same `omnia_v9_outbound_compare` / `omnia_v9_outbound_final_shadow` audit records:

| Category | Included in the queue? | Why |
|---|---|---|
| `BOTH_ALLOW` | No | Agreement — no ambiguity. |
| `BOTH_DENY` | No | Agreement — no ambiguity. |
| `LEGACY_ALLOW_V9_DENY` | Only if V9's reason is NOT a routine incompleteness reason (see below) | Most of these are V9 correctly being stricter about proof it doesn't yet have (expected right now); genuinely surprising strictness reasons (e.g. `approval:revoked`, `evidence:invalid-external-source-ref` on content that legacy considered verified) belong in the queue. |
| `LEGACY_DENY_V9_ALLOW` | **Always** | Critical by definition — the mission requires zero of these before any promotion. |
| `V9_INCOMPLETE` | No, unless it recurs identically for the same tenant/campaign many times in a row | A single `REVIEW` from a missing approval is expected and routine right now; a *pattern* suggesting the approval-issuance gap itself needs owner attention is a once-per-campaign summary item, not a per-action exception. |
| `V9_ERROR` | Only if the error rate crosses a threshold (see `V9_METRICS_SPEC.md`) | A single transient error is a reliability metric, not an owner exception; a sustained error rate is. |

Additional category types named in the mission that don't yet have a live data source in this integration slice (no real approvals exist, so these can't be observed yet) but are documented here for when they do:
- ambiguous authority (multiple covering approvals disagree)
- conflicting evidence
- external legal/professional requirement
- recipient ambiguity
- payment/refund/dispute (see `V9_PAYMENT_ADAPTER_SPEC.md` — not integrated yet)
- new authority scope requested
- unknown consequential action

## Exception record shape

```json
{
  "action": "outbound email send to buyer@example.com (campaign c1)",
  "whyReviewRequired": "V9 denied on evidence:invalid-external-source-ref while legacy's issue.safeForOutreach was true",
  "evidence": { "intentDigest": "...", "reservationId": "...", "v9Reasons": ["..."], "legacyReason": "" },
  "suggestedDefault": "hold — do not send until evidence is re-verified",
  "maximumConsequence": "one external email to one recipient (blast radius 1, no payment authority)",
  "timeRequiredMinutes": 2
}
```

## What is explicitly NOT sent to the owner

- Routine `V9_INCOMPLETE` (no approval provisioned) — this is the expected, honest current state, not a surprise.
- Any `BOTH_*` agreement.
- Transient single errors below the reliability threshold.

## Where this lives operationally

This mission does not build a UI for this queue — it defines the filter logic and record shape so `V9_REAL_INTEGRATION_REPORT.md`'s "what requires Mohamed" section and any future operator view (`V9_COMPLEXITY_AUDIT.md` classifies a dashboard as `REQUIRED_LATER`, not `REQUIRED_NOW`) can implement it directly from `buildConfusionMatrix()` and the raw compare records without inventing new persistence.
