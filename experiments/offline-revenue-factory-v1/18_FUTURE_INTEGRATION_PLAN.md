# Future integration plan

This system is offline by design. Nothing here proposes enabling
outbound access without explicit human approval — every item below is
a description of a possible future gate, not an instruction to build
it now.

## Gate 1 — Real MRF ingestion at scale
`hospital_mrf` currently validates one candidate file (or a small set)
per run. A real engagement processing dozens of hospital MRF files
would need batch orchestration around the existing single-file lane
logic — the lane's structural checks would not need to change, only
the run-management layer around them.

## Gate 2 — A real CSP partner submission channel
`msft_csp`'s blocked-conclusion mechanism is intentionally
unreachable-past in this offline system
(`rule_source_current`/`partner_submission_channel_available` hard-
coded `False`). Enabling a real submission path requires: (a) a live,
authorized Microsoft CSP partner integration outside this repo's
scope, (b) explicit human/legal sign-off that the eligibility logic
has been reviewed against current, non-synthetic SLA/contract terms,
and (c) removing the hard-coded `False` only after both of those exist
— never as a code-only change.

## Gate 3 — Office-document parsing for `agency_rfp`
Adding a real PDF/DOCX parser (rather than requiring human
transcription into the lane's markup) would need a vetted, offline-
capable parsing library and careful review that it doesn't introduce
a network dependency or silent-failure mode that could cause the lane
to fabricate extracted content instead of degrading to an `unknown`
finding.

## Gate 4 — Real pricing data
`economics/pricing.py`'s scenario calculator uses stated placeholder
assumptions. Replacing them with real billing/market data (still
without contacting any external system — this would come from the
owner's own historical records) would let the same scenario shape
carry `"observed fact"`/`"source-derived"` labels instead of
`"assumption"`/`"modeled"` for whichever inputs are actually sourced.

## Gate 5 — PDF report export
Scoped as optional and not built, to preserve the zero-dependency
guarantee. Adding it would mean vetting an offline-capable PDF library
and ensuring the claim-safety scan still runs over PDF-bound text
exactly as it does today over markdown/HTML.

## Gate 6 — Outbound delivery
Not proposed at all by this plan beyond naming it as the obvious final
gate: this system produces packages for a human to review and manually
deliver. Any future automated delivery (email, portal upload, API
submission) is a categorically different, much higher-risk system that
would need its own security review, explicit approval, and is
out of scope for this offline factory by design.

## What does not need a gate
The core evidence model, claim-safety scanner, data-safety scanner,
QA engine, and packaging/chain-of-custody system are lane-agnostic and
already proven across all 5 current lanes plus their 26 fixture
combinations. A sixth lane, or expanded fixtures for an existing lane,
needs no architectural gate — see
`UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/11_adding_a_new_lane.md`.
