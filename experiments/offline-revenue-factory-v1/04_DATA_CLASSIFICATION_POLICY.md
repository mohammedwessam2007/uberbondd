# Data classification policy

Full technical detail: `UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/07_data_safety.md`.
This is the mission-level policy statement.

## The 8 data classes
`PUBLIC`, `SYNTHETIC`, `CUSTOMER_PROVIDED`, `CONFIDENTIAL`,
`PERSONAL_DATA`, `PHI`, `CREDENTIAL`, `PROHIBITED`. Every evidence item
declares exactly one via `EvidenceItem.data_classification`, enforced
by the schema's `enum` constraint.

## Policy
Credentials, secret keys, PHI, unapproved personal data, live payment
details, and live customer identifiers must never be stored in this
system's evidence store as anything other than `PROHIBITED` and
quarantined. Fixtures are synthetic data by design (`SYNTHETIC`
classification); real local artifacts a lane accepts
(`hospital_mrf` MRF files, transcribed `agency_rfp` documents) remain
the operator's responsibility to vet before they enter the system.

## Enforcement
`src/urf/data_safety/classify.py::classify_and_maybe_quarantine`
scans evidence text for credential patterns (AWS access keys, generic
API-key/secret-key/access-token assignments, PEM private-key blocks,
bearer tokens, password assignments), PHI patterns (medical record
number labels, ICD-10-like codes, patient-name labels, SSN-shaped
strings), and live-payment patterns (card-PAN-shaped digit runs, CVV
labels). Any hit **forces the effective classification to
`PROHIBITED`**, overriding whatever classification was declared —
a lane cannot mark a credential-bearing string `PUBLIC` and have that
stand.

## Proof this works
`tests/test_data_safety.py` — 9 tests, all passing — exercises every
credential, PHI, and live-payment pattern, confirms clean text
classifies cleanly, and confirms the force-to-`PROHIBITED` override
fires regardless of the declared classification.

## Known limitation
This is deterministic pattern matching, not perfect detection — the
module's own docstring says so. It is a mandatory backstop, not a
substitute for never putting real credentials, PHI, or live payment
data into this system's inputs in the first place. See
`SECURITY_AND_PRIVACY_BOUNDARIES.md` and `16_LIMITATION_REGISTER.md`.
