# Data safety

`src/urf/data_safety/classify.py` is a second, independent
pattern-based scanner, applied to evidence text rather than report
text. It is also explicitly best-effort (see its own docstring).

## The 8 data classes (`DATA_CLASSES`)
`PUBLIC`, `SYNTHETIC`, `CUSTOMER_PROVIDED`, `CONFIDENTIAL`,
`PERSONAL_DATA`, `PHI`, `CREDENTIAL`, `PROHIBITED`. Every
`EvidenceItem.data_classification` a lane declares must be one of
these (enforced by the schema's `enum` constraint independently of
this module).

## Detection patterns
- **Credentials** (`scan_for_credentials`): AWS access key IDs
  (`AKIA[0-9A-Z]{16}`), generic `api_key=`/`secret_key=`/`access_token=`
  assignments, PEM private-key headers (`-----BEGIN ... PRIVATE
  KEY-----`), `Bearer <token>` headers, `password=` assignments.
- **PHI** (`scan_for_phi`): "medical record number" labels, ICD-10-like
  codes, "patient name" labels, SSN-shaped strings (`\d{3}-\d{2}-\d{4}`).
- **Live payment details** (`scan_for_live_payment_details`):
  card-PAN-shaped digit runs (13–19 digits, optionally
  space/dash-separated), `cvv=` labels.

## `classify_and_maybe_quarantine(text, declared_classification)`
Runs the union of all three scans (`scan_for_prohibited`) against the
text. If *any* hit is found, the function returns `"PROHIBITED"` as the
**effective** classification, overriding whatever classification the
lane author declared — a lane cannot mark a credential-bearing string
`PUBLIC` and have that stand. Callers are expected to route a
`PROHIBITED`-effective item to quarantine rather than the normal
evidence store; the function itself only classifies, it does not
perform the quarantine I/O.

Passing a `declared_classification` not in `DATA_CLASSES` raises
`ValueError` immediately — this is a programming-error guard, not a
data-safety finding.

## Relationship to claim safety
Data safety and claim safety are independent gates over different
inputs: data safety scans *evidence* (what was read from source
files, before it ever reaches a report) for things that must never be
stored or disclosed at all; claim safety scans the *report text*
(what the system is about to say) for things that must never be
asserted as true. A run can pass one and still be blocked by the
other.

## Test coverage
`tests/test_data_safety.py` — 9 tests, all passing: each credential
pattern is detected, each PHI pattern is detected, each live-payment
pattern is detected, clean text is classified as clean, and
`classify_and_maybe_quarantine` forces `PROHIBITED` regardless of the
declared classification when a hit occurs, while leaving the declared
classification untouched when the text is clean.
