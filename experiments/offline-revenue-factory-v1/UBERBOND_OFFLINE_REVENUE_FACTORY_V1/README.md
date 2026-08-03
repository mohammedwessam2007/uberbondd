# UberBond Offline Revenue Factory V1

A standalone, offline, deterministic, evidence-preserving delivery
factory for five candidate revenue wedges. It runs entirely on the
local filesystem with the Python 3 standard library — no network
access, no paid APIs, no production systems, no live customer data.

## What this is
Five independent "lanes," each a synthetic-fixture-driven evidence
pipeline for a candidate commercial offering:
1. **Microsoft CSP outage SLA-credit evidence desk** (`msft_csp`)
2. **Hospital price-transparency MRF integrity evidence pack** (`hospital_mrf`)
3. **Agency RFP compliance-matrix backend** (`agency_rfp`)
4. **Accessibility acceptance-evidence backend** (`accessibility`)
5. **Lead-form/booking-path revenue-leak evidence pack** (`lead_path`)

Every lane runs through one common pipeline
(`init-run → validate-input → execute → qa → render → package →
cleanup → verify-package`), one common evidence model (11 record
types, 9 finding labels, 8 data classes), one claim-safety scanner,
one data-safety scanner, and one chain-of-custody packaging system.
See `docs/00_overview.md` for the full product overview and
`docs/` for the complete operating documentation set (`docs/00`
through `docs/13`).

## What this is not
This system does **not** send anything, contact anyone, submit a bid,
claim, form, booking, or invoice, certify legal/compliance/
accessibility/Microsoft/hospital-pricing status, quantify a guaranteed
dollar recovery or revenue uplift, or take any live external action.
Outbound is structurally absent from this codebase, not merely
disabled by configuration. See `LEGAL_AND_CLAIM_BOUNDARIES.md` and
`SECURITY_AND_PRIVACY_BOUNDARIES.md`.

## Quickstart
```
python3 -m py_compile $(find src -name '*.py')
./scripts/run_tests.sh
```
See `docs/01_installation_and_quickstart.md` for a full CLI walkthrough.

## Requirements
Python 3.11+, standard library only. See `requirements.txt`.

## Layout
```
src/urf/          the product (see docs/03_architecture.md)
schemas/           JSON Schema per evidence-model record type
fixtures/          synthetic input fixtures, one tree per lane
templates/commercial/  human-facing commercial paperwork drafts
examples/          one valid example instance per schema
example_deliveries/    5 real, generated, checksum-verified delivery packages
docs/              operating documentation (docs/00 .. docs/13)
tests/             stdlib unittest self-test suite (82 tests)
scripts/           run_tests.sh and other operator scripts
bin/urf            CLI entry-point script
reports/ evidence/ logs/ tmp/   default (empty until a run is executed) run-output roots
```
