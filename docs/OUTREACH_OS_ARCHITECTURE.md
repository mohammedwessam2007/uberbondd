# Outreach OS Architecture

One canonical pipeline. No parallel prospect, campaign, mailbox,
suppression, revenue, or authorization model exists — every new module this
wave composes with what already existed rather than duplicating it.

```
owned domain (SendingDomain, src/sending-domain-registry.mjs)
  -> authenticated email provider (src/provider-adapter-contract.mjs;
     REAL today: Gmail via src/gmail.mjs. NOT configured: Instantly,
     Google Workspace Admin, Microsoft 365)
  -> mailbox registry (SendingMailbox, src/sending-mailbox-registry.mjs)
  -> MX/SPF/DKIM/DMARC (src/dns-verification.mjs -- live-capable, read-only)
  -> domain/mailbox health (folded state + src/domain-mailbox-circuit-breaker.mjs)
  -> warm-up (src/warmup-orchestrator.mjs; src/live-activation-gate.mjs)
  -> evidence-backed prospects (src/discovery.mjs + src/audit-rules.mjs +
     src/contacts.mjs -- narrower than this mission's ICP/waterfall ask,
     see docs/OUTREACH_LIMITATIONS.md)
  -> verification (src/contacts.mjs#verifyEmail, Hunter-backed)
  -> campaign (existing `campaigns` collection + src/prospect-import.mjs)
  -> sequence (existing follow-up handling in src/pipeline.mjs -- flat,
     not branching; see limitations)
  -> personalization (src/copy.mjs, src/dossier.mjs -- template-based, not
     the evidence-confidence PASS/REVIEW/DENY evaluator this mission asks
     for; see limitations)
  -> authorization (src/domain-mailbox-gate.mjs deny-only pre-check,
     composing with src/deliverability-guard.mjs and
     src/consequence-boundary.mjs / OMNIA-V9)
  -> reservation (existing src/store.mjs `outboundReservations`,
     idempotency-keyed, lease/stale-recovery already real and tested)
  -> provider send (src/gmail.mjs; real)
  -> reply (existing `replies` collection + src/pipeline.mjs polling;
     classification is basic, not the full Unibox taxonomy this mission
     lists -- see limitations)
  -> suppression (existing `suppressions` collection + src/unsubscribe.mjs;
     real, one-click, tested)
  -> offer (src/offer-compiler.mjs; real)
  -> payment (src/payments.mjs; real, payment-truth-gated)
  -> delivery / acceptance (existing `orders`/`subscriptions` collections)
  -> revenue attribution (src/revenue.mjs, src/commercial-outcome.mjs,
     src/commercial-learning.mjs -- real, payment-proof-gated, built in
     earlier waves this session)
  -> learning (src/commercial-memory.mjs, src/commercial-learning.mjs)
```

## Where tonight's mission's new asks landed

Waves 1-4 (domain/mailbox control plane, provider adapter contract,
DNS/authentication engine, warm-up system) were **already built two waves
ago tonight** and are extended, not rebuilt, this wave — see
`docs/INSTANTLY_RECONCILIATION.md`'s entity-mapping table for the exact
reconciliation of this mission's requested entity names onto the existing
implementation.

Waves 5-12 (prospect/account intelligence, enrichment waterfall,
campaign/sequence branching, evidence-bound personalization evaluator,
Unibox, full revenue-loop instrumentation) describe real, valuable
capability this repository does **not** have at Instantly/Apollo/Clay
depth. Building all of them to the same rigor as tonight's domain/mailbox
work (real code, hostile tests, no fabricated "done") is multiple further
nights of work, not a single wave — attempting to fake completeness here
would violate this mission's own explicit rule against calling a plan
implemented. See `docs/OUTREACH_LIMITATIONS.md` for the honest,
capability-by-capability status and `docs/OUTREACH_BENCHMARK.md` for how
each compares to the named competitors' documented capabilities.

Waves 13-16 (live activation, security/governance, performance/scale,
testing) are addressed directly: live activation was already built and is
re-verified in this wave's final report; the security/governance controls
this mission asks for (workspace isolation, audit trails, policy versions,
receipts, rate limits, no secret persistence, pause-all, kill switches) are
already real properties of the existing Deliverability Guard/OMNIA-V9/
domain-mailbox modules, catalogued in `docs/PROVIDER_ADAPTER_CONTRACT.md`
and `docs/WARMUP_POLICY.md`.
