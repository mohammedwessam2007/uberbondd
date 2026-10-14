# UBERWARM³ PHOENIX: Owner-selected zero paid warming decision and effect firewall

Date: 2026-10-12
Main source base: 298bd585d3ba0cf1fe5cdc2f81a525eb67819608
Pull request: https://github.com/mohammedwessam2007/uberbondd/pull/1403
Status: DRAFT BRANCHED SOURCE, not deployed, not accepted CI, no provider activation.

## Founder decision resolved

**Do not purchase Winnr's optional $0.60/mailbox/month warming.** The existing $9 prewarmed three-seat pilot is a separate subscription already bought and is not equivalent to the optional recurring warm-up add-on. A $69 Startup subscription for 50 new mailboxes is also a distinct purchase and is not confirmed active.

This is a current cash-protection and expected-value decision, **not a proven claim that UberWarm³ already achieves higher Inbox placement than paid network warming**.

Why: Google independently requires authenticated mail and rewards wanted, gradual, low-complaint sending. Gmail does not publish any guarantee that purchased synthetic-warming engagements increase reputation. A vendor's claim does not establish comparative causal evidence. Vendor doc: https://winnr.app/help/warming/how-warming-works.html. Google guidelines: https://support.google.com/mail/answer/81126. Winnr price: https://winnr.app/help/warming/warming-billing.html (first enabled month charged immediately, no prorating).

## What was actually closed in source

Previously, `src/warmup-orchestrator.mjs` would call the configured provider's `warmupCapable()` and `startWarmup()` after basic DNS/mailbox checks; the actual effect path had **no authenticated evidence that the provider feature was free**, and owner approval was merely passed through. Calling provider warm-up could create a billable state.

PR #1403 now enforces ZERO_ADDON gate **before any provider capability/activation call**:
- `verifyZeroCostWarmupEntitlement` must be a trusted service-side callback with `verified === true`, a concrete nonblank provider receipt ID and `incrementalRecurringCostCents === 0`.
- `verifyCurrentOwnerWarmupApproval` must separately return true for the exact scope `provider-warmup-zero-add-on-only`.
- Unknown price, $0.60 charge, absent/forged approval, failed/throwing provider entitlement verifier all block with ZERO provider calls.
- No default bypass: prior call sites without both trusted callbacks now fail closed. A truly free provider option can be activated later only once those trusted verified callbacks are connected; default operation remains blocked rather than risk a charge.
- No subscription cancellation has been made. Nothing is silently removed from existing billing; founder must explicitly approve any future existing-plan cancellation.
- Unit fixture `tests/uberwarm3-zero-addon-activation-firewall.test.mjs`, 5/5 branch-fetched-source V8 behavioral tests. No real provider charges or messages in tests.

The $0 spend lock is an architectural constraint, not evidence the warmer has created actual recipient engagement. The real Inbox-placement engine still needs independent recipient-provider proof. UberWarm³ reputation oracle, opt-in panel, Postmaster v2, fail-closed SMTP seed probes and truth-gated expansion remain in this draft PR and require exact-source Node, PostgreSQL and real SMTP/IMAP tests.

## Acceptance test before claiming "better than Winnr"

1. Verified sending DNS and independent current consent/permission, source-held owner authorization, durable nonreplay.
2. Matched and real legally eligible recipient cohorts across at least two recipient network types, independently verified receiving outcomes, unchanged offers/time/recipient type.
3. Comparable trusted bounce and complaint evidence, absence of damaging sender/domain reputation regressions, negative cost as claimed (zero warming add-on) and proven positive economic value.
4. `compareUberWarm3AgainstWinnr` outputs `MEASURED_HIGHER_INBOX_RATE_WITH_MATCHED_EVIDENCE` under its hard >=100 observed per arm, >=2 providers, balanced per-provider and conservative bounds; no human must proclaim superiority from a mock test.
5. Genuine real provider delivery signals confirm test source. Code, smoke tests, provider 250 acceptance or opened Gmail seeds alone are insufficient.

Current actual experimental evidence of beating Winnr: **NONE VERIFIED**. The founder's $0 paid-warmup constraint **IS** supported and now reinforced in source, pending verified deployment.

## Next action without founder minutiae

The frontier is not another idea list. Complete exact-source CI via a free permitted runner, connect only trusted protected provider and receiver readings, continue sender QA through paid pilot and voluntary genuine correspondence, qualify legally eligible prospects, compare outcomes honestly. Do not provision 50 non-existent mailboxes or send synthetic reputation farming.

Preserve the full UberBond Sovereign Cognitive Continuum, 0001–0890 founder ideas with canonical source provenance, and GENESIS beyond 890 unchanged by reference.
