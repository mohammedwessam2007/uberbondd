# Example delivery packages (mission Phase 14)

Five real, generated-and-verified delivery packages, one per lane,
each produced by actually running the full `urf.cli` pipeline
(`init-run → validate-input → execute → qa → render → package →
verify-package → cleanup`) against a representative fixture. Nothing
here is hand-written or fabricated — every finding, evidence item, and
report file was produced by the real lane code and passed its own QA
gate and package-integrity verification.

| Lane | Fixture used | run_id | Findings | Evidence | Human review requests | QA |
|---|---|---|---|---|---|---|
| msft_csp | `complete` | `example-msft_csp` | 2 | 13 | 1 | 5/5 pass |
| hospital_mrf | `valid` | `example-hospital_mrf` | 5 | 5 | 0 (clean fixture; no flagged findings) | 4/4 pass |
| agency_rfp | `complete` | `example-agency_rfp` | 9 | 5 | 1 | 5/5 pass |
| accessibility | `violations_found` | `example-accessibility` | 13 | 11 | 4 | 5/5 pass |
| lead_path | `broken_link_step` | `example-lead_path` | 12 | 3 | 3 | 4/4 pass |

Each `<lane>/` subdirectory is an isolated `--workspace` containing the
full run tree (`reports/`, `evidence/`, `logs/`; `tmp/` was removed by
the `cleanup` stage). The delivered artifact is the zip at
`<lane>/reports/runs/example-<lane>/example-<lane>.zip`; it was
independently re-verified with
`python -m urf.cli verify-package --package <zip>` (result: `OK`,
zero mismatches) after packaging, exactly as `04_delivery_checklist.md`
requires before a real delivery.

Fixtures were chosen to be representative rather than uniformly clean:
`hospital_mrf/valid` shows the "nothing wrong, no review needed" case,
while `accessibility/violations_found`, `lead_path/broken_link_step`,
and `agency_rfp/complete` (which still surfaces a blocking human
review per the lane's own always-block-conclusion design) show the
system's evidence trail on data with real issues to flag.

Every package was rendered with the `direct_buyer` template. To see
the same evidence rendered for a different audience (e.g.
`white_label_partner` with branding stripped, or `technical_appendix`
for a technical reviewer), re-run `render` against the same run_id
with a different `--template` — the underlying evidence does not
change, only the presentation.
