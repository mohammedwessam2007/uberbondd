# Security and privacy boundaries

## No network access
Every CLI subcommand is synchronous and makes no network requests
(`docs/02_cli_reference.md`). `init-run` reads `git_commit` directly
from `.git/HEAD` on disk — never via a subprocess or remote call.
`tests/test_lanes_full_pipeline.py` exercises the real CLI subprocess
end to end for all 26 lane×fixture combinations without any network
dependency; the self-test suite as a whole requires none.

## No credentials, ever
This system has no concept of an API key, login, or secret it needs to
operate. It should never be given one. If a fixture or evidence source
happens to contain credential-shaped text, `data_safety/classify.py`'s
`scan_for_credentials` (AWS access keys, generic API-key/secret-key/
access-token assignments, PEM private-key blocks, bearer tokens,
password assignments) forces that evidence item's effective
classification to `PROHIBITED` (`docs/07_data_safety.md`). This
detection is pattern-based and explicitly best-effort — it does not
claim to catch every possible credential shape. Never rely on it as
the only safeguard: do not put real credentials in fixtures or inputs
in the first place.

## No PHI, ever
`hospital_mrf` processes machine-readable-file *structure* (hashes,
sizes, JSON field presence, staleness), not patient records. If
PHI-shaped text (medical record number labels, ICD-10-like codes,
patient-name labels, SSN-shaped strings) is detected in evidence text,
it is likewise forced to `PROHIBITED` classification. As above: this is
a backstop, not a license to feed real patient data into this system.
Real MRF files are public price-transparency files by design and do
not contain patient-level PHI, but this system does not verify that
assumption — an operator pointing it at the wrong file type is still
responsible for not doing so.

## No live payment details
`scan_for_live_payment_details` flags card-PAN-shaped digit runs and
CVV labels. `lead_path`'s payment-step handling is limited to metadata
about a booking/payment *step's presence in a funnel*, never real
card data.

## The 8 data classifications
`PUBLIC`, `SYNTHETIC`, `CUSTOMER_PROVIDED`, `CONFIDENTIAL`,
`PERSONAL_DATA`, `PHI`, `CREDENTIAL`, `PROHIBITED` — every evidence
item declares one, and `classify_and_maybe_quarantine` can override any
declared value to `PROHIBITED` if a live scan detects prohibited
content regardless of what was declared (`docs/07_data_safety.md`).

## Fixtures are synthetic
Every fixture under `fixtures/` is synthetic data (`SYNTHETIC`
classification) or, where a lane accepts real local artifacts
(`hospital_mrf` MRF files, `agency_rfp` documents already transcribed
into the lane's markup), the operator is the one responsible for
ensuring nothing above these boundaries enters the system.

## Writes stay inside the workspace
Every subcommand writes only under the resolved `Workspace`
(`--workspace`, defaulting to the product root's `reports/`,
`evidence/`, `logs/`, `tmp/`). Nothing in this codebase writes outside
that tree.

## Detection is best-effort, not a guarantee
Both `claim_safety/rules.py` and `data_safety/classify.py` say so in
their own docstrings. Pattern-based regex scanning has known blind
spots (encoding tricks, novel phrasing, split-across-lines content).
Treat these scanners as a mandatory structural gate, not as proof of
absence — an operator must still exercise judgment about what data
enters the system in the first place.
