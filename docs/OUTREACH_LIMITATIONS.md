# Outreach OS Limitations

Explicit, honest gap list. Nothing here is dressed up as "planned" or
"partially implemented" unless real code backs that claim.

## Genuinely missing, not built tonight or any prior wave

| Capability (this mission's wave) | Status | Why not built tonight |
|---|---|---|
| ICP/account-search builder, territory/persona filters (Wave 5) | `NOT_IMPLEMENTED` | Real, valuable, but a genuinely separate subsystem (filtering + a UI/query surface) at least as large as tonight's whole domain/mailbox build. Building a shallow version would produce exactly the "impressive empty module" this mission forbids. |
| Multi-provider enrichment waterfall with per-field confidence/cost/expiry tracking (Wave 6) | `NOT_IMPLEMENTED` | `src/contacts.mjs` (34 lines) does one Hunter.io call — real but not a waterfall. No second/third provider is configured to waterfall through. |
| Sequence branching, variants, mailbox-assignment-aware sends (Wave 7) | `PARTIAL` | Follow-up cancellation, evidence-expiry cancellation, and bounded follow-ups already exist in `src/pipeline.mjs`/`src/send-safety.mjs`. Branching logic and per-variant tracking do not. |
| Evidence-bound personalization with a PASS/REVIEW/DENY claim evaluator (Wave 8) | `PARTIAL` | `src/copy.mjs`/`src/dossier.mjs` already tie every message to a real audit finding (so it's not un-evidenced), but there is no confidence-scored claim evaluator that explicitly rejects invented names/jobs/revenue/relationships the way this mission specifies. |
| Unified inbox (Unibox) with the full reply taxonomy (Wave 9) | `PARTIAL` | Reply storage + polling exists (`replies` collection, `src/pipeline.mjs`). Classification into positive/negative/objection/referral/wrong-person/out-of-office/auto-reply categories does not exist as a distinct, tested capability. Opt-out -> suppression is real and immediate (`src/unsubscribe.mjs`). |
| Per-cost-stage economic instrumentation (cost per verified contact / draft / send / positive reply / qualified conversation / payment) (Wave 12) | `PARTIAL` | The revenue/margin side is real and payment-proof-gated (`src/revenue.mjs`, `src/commercial-learning.mjs`). The upstream per-stage cost tracking (enrichment cost, draft AI cost, send cost) is not wired into one attribution chain yet. |

## Real, tested, and matches this mission's ask directly

Domain/mailbox control plane, provider adapter contract, read-only DNS
verification, warm-up orchestration and circuit breakers, the 9-state live
activation rule, the deny-only V9/Guard-composing gate, the beginner
dashboard, one-click unsubscribe/suppression, payment-truth-gated revenue,
and OMNIA-V9 composition. 590/590 deterministic tests pass across the whole
repository as of this wave.

## Explicitly not attempted, by mission instruction

No website, no Vercel domain attachment, no real third-party HTTP client
built against an unconfigured provider, no cold outreach, no account
creation, no DNS mutation, no fabricated Instantly integration.
