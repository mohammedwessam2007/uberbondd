# Exclusions — per lane

Restated verbatim from each lane's `lane_meta()["exclusions"]` in
`src/urf/lanes/*.py`. Use the block matching the engagement's lane when
drafting a buyer-facing scope-of-work; do not paraphrase these away.

## msft_csp
- No live Microsoft, Azure Service Health, or CSP partner system is accessed.
- No SLA credit is claimed, requested, or submitted.
- No current SLA/contract text is fetched or verified.

## hospital_mrf
- No live HTTP fetch of any hospital website is performed.
- No price accuracy, completeness, or legal-sufficiency certification is issued.
- No CMS/regulator submission or attestation is made.

## agency_rfp
- No PDF/DOCX binary parsing is performed; unsupported document formats degrade to an 'unknown' finding and a blocking human-review request rather than fabricated content.
- No bid is submitted, drafted for submission, or transmitted to any issuing organization.
- No legal sufficiency, win-probability, or compliance-guarantee determination is made.

## accessibility
- No live crawl or scan of any real website is performed.
- No WCAG conformance, ADA, or Section 508 compliance certification is issued.
- No assistive-technology (screen reader, switch device, etc.) testing is performed by this system.

## lead_path
- No live crawl, click-through recording, or real analytics export is used.
- No dollar-value revenue-loss figure is calculated or claimed.
- No certification that the funnel is free of leaks beyond what this pack explicitly checked.

## Cross-lane exclusions (all engagements)
- No outbound email, call, submission, filing, or payment action is taken by this system on the buyer's behalf.
- No credential, PHI, or live-payment data is accepted as input; any detected, it is force-classified `PROHIBITED` and quarantined (`data_safety/classify.py`), not delivered.
- No fresh web research or live data fetch of any kind occurs during a run.
