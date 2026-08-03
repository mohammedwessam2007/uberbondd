# Legal and claim boundaries

## This system does not decide, certify, or claim anything on its own
No lane in this codebase reaches a positive legal, compliance,
eligibility, or certification conclusion. All four decision lanes
(`msft_csp`, `agency_rfp`, `accessibility`, `lead_path`) structurally
end in a `"blocked conclusion"` finding — the actual decision is
reserved for a human, a partner channel, or a licensed professional
this offline system cannot reach. `hospital_mrf` (a data-integrity
lane) never asserts file completeness, price accuracy, or legal
sufficiency; it only reports structural anomalies.

## Specifically, this system never:
- represents Microsoft, asserts SLA-credit eligibility, or claims a
  submission will be accepted (`msft_csp`);
- certifies a hospital MRF file complete, accurate, or legally
  sufficient (`hospital_mrf`);
- submits a bid, asserts legal sufficiency of a submission, or
  guarantees agency acceptance (`agency_rfp`);
- certifies WCAG, ADA, or Section 508 conformance — an automated pass
  is never a legal compliance certification (`accessibility`);
- quantifies a guaranteed dollar revenue loss or promises a
  conversion-rate uplift (`lead_path`);
- provides legal, tax, accounting, or medical advice.

## Enforcement is structural, not just written policy
`claim_safety/rules.py::scan_text` runs at `render` time over every
report's executive summary and limitations and **blocks the render**
(raises `SystemExit`) on any detected guarantee, compliance claim,
certification claim, eligibility claim, government-acceptance claim,
conversion-uplift claim, professional-advice claim, unsupported bare
number, unverified price mention, or undisclosed synthetic-data usage.
See `docs/06_claim_safety.md` for the full category list and
`tests/test_claim_safety.py` (12 tests) for the enforcement proof.

## Every finding is labeled, nothing is silently asserted
Every `Finding` record carries exactly one of 9 labels: `observed
fact`, `parsed fact`, `deterministic calculation`, `source-derived
rule`, `model interpretation`, `assumption`, `unknown`, `blocked
conclusion`, `human-review requirement` (`docs/04_evidence_model.md`).
A reader of any generated report can distinguish a directly-observed
fact from a labeled assumption from an explicit refusal to conclude —
none of these are presented as equivalent to a verified determination.

## This is not a sellable business, a legal opinion, or proof of buyer
## demand
Generating a polished example delivery package proves the pipeline
works end to end on synthetic data. It is not evidence of market
demand, legal clearance to operate any of the five candidate
offerings commercially, or that a real customer would accept any given
report. Human review, legal review, and (where applicable) partner
qualification remain required before any of this system's output is
used commercially.

## Synthetic data disclosure
Any report built from synthetic fixture data must disclose that fact
in its text (`check_synthetic_disclosure`) — `render` blocks on a
missing disclosure exactly as it blocks on a prohibited claim.
