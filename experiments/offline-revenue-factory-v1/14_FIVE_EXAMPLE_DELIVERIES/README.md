# Five example deliveries

Pointer directory — the real generated packages live in the product
tree: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/example_deliveries/`.

Exactly five complete, validated example delivery packages, one per
candidate lane, each produced by actually running the full CLI
pipeline (`init-run → validate-input → execute → qa → render →
package → verify-package → cleanup`) against a representative fixture
— nothing here is hand-written.

| Lane | Fixture | Findings | Evidence | Human review requests | QA |
|---|---|---|---|---|---|
| msft_csp | `complete` | 2 | 13 | 1 | 5/5 pass |
| hospital_mrf | `valid` | 5 | 5 | 0 (clean fixture) | 4/4 pass |
| agency_rfp | `complete` | 9 | 5 | 1 | 5/5 pass |
| accessibility | `violations_found` | 13 | 11 | 4 | 5/5 pass |
| lead_path | `broken_link_step` | 12 | 3 | 3 | 4/4 pass |

Each package is:
- **synthetic or local-public-artifact-only** — every fixture used is
  synthetic data, per the mission's fixture-safety requirement;
- **internally consistent** — every finding's `evidence_refs` resolves
  to a real evidence item (the base `qa-evidence-refs-resolve` check
  passed for all 5);
- **checksummed** — `verify-package --package <zip>` returns `OK`
  with zero mismatches for all 5, independently re-verified during
  this documentation pass;
- **free of unsupported claims** — each package's report passed the
  claim-safety scan at `render` time (a violation would have raised
  `SystemExit` and prevented the package from existing at all);
- **explicit about human review** — 3 of 5 lanes' example fixtures
  produced at least one `human_review_request`; the two that produced
  zero (`hospital_mrf/valid`) did so because the fixture was
  genuinely clean, not because the check was skipped.

See `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/example_deliveries/README.md`
for the full generation notes, including which report template each
package used (`direct_buyer`) and how to re-render the same evidence
for a different audience.
