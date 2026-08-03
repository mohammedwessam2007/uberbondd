# Limitation register

## Structural (by design — not defects)
- **No lane reaches a positive decision.** All four decision lanes
  always end in `"blocked conclusion"`; this is intentional and cannot
  be configured away without a deliberate, separately-reviewed change.
- **No PDF export.** The mission scoped PDF as optional-if-available-
  offline; none was added, to keep the zero-third-party-dependency
  guarantee. Markdown/HTML/JSON/CSV are the supported formats.
- **`agency_rfp` cannot parse real PDF/DOCX.** Real office-format
  documents must be transcribed into the lane's own line-based markup
  by a human first. No binary-format parser exists in this offline
  system.
- **`msft_csp` cannot submit to Microsoft.** `rule_source_current` and
  `partner_submission_channel_available` are hard-coded `False` — this
  is what makes the blocked-conclusion mechanism structurally
  unreachable-past, not a bug to fix.
- **No real pricing.** `economics/pricing.py` produces only labeled
  assumptions/models from operator-supplied inputs, never a sourced
  real price.

## Detection limitations (best-effort, stated in the code itself)
- **Claim safety (`claim_safety/rules.py`) is regex-based**, not
  semantic. It will not catch every possible unsafe phrasing —
  synonyms, indirection, or split-across-sentence claims can evade
  pattern matching. It is a mandatory backstop, not a substitute for
  human legal review.
- **Data safety (`data_safety/classify.py`) is regex-based.** It will
  not catch every possible credential/PHI/payment-data shape —
  novel formats, encodings, or obfuscation can evade it. Never rely on
  it as the sole reason to put sensitive data into this system.

## Fixed this build cycle (documented so they aren't rediscovered as
## "new" defects)
- `hospital_mrf.py` had three code paths (duplicate-key, missing-
  structural-field, non-dict-top-level) and `msft_csp.py` had one
  (unmatched incident) where a finding was flagged
  `human_review_required=True` without a matching `human_review_request`
  — an audit-trail dead end. Found by strengthening
  `tests/test_lanes_full_pipeline.py`'s cross-lane invariant assertion,
  fixed in the lane code itself (not by weakening the test). See
  `UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/10_testing.md`. The
  `msft_csp.py` instance was confirmed unreachable by either existing
  fixture at the time of the fix — it remains a latent-but-fixed path,
  not something currently exercised by `example_deliveries/msft_csp/`.

## Known but not yet investigated
- A crude regex cross-check (flagged-finding count vs.
  `add_human_review` call count) surfaced a numeric mismatch in
  `agency_rfp.py` (9 flagged findings vs. 8 requests in one run) that
  was never individually traced to a specific code path. Unlike the
  `hospital_mrf`/`msft_csp` fixes above, this was not confirmed as a
  real defect — it is equally possible one request legitimately covers
  two findings (which is not itself wrong) as it is a genuine gap. This
  is left as an open item for the next maintenance pass rather than
  guessed at here.
- `accessibility` and `lead_path` showed the opposite-direction
  mismatch (more requests than flagged findings), which is not
  inherently a defect — one request can legitimately cover multiple
  findings — but was likewise not individually traced.

## Process limitations (not code)
- QA passing is not enforced as a hard precondition of `package` in
  code — only that a QA result exists at all. The discipline that a
  failed-QA run should not be delivered lives in
  `12_COMMERCIAL_TEMPLATES/` (`04_delivery_checklist.md`), not in
  code. See `UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/08_packaging_and_chain_of_custody.md`.
- This system has no way to observe real owner/AI review minutes; they
  are always `"unknown"` unless a human operator supplies them.
