# UberBond Offline Revenue Factory — overview

A standalone, offline, deterministic, evidence-preserving toolkit that
runs five independent "evidence desk" lanes against locally supplied
(mostly synthetic) input and produces a checksummed, human-reviewable
delivery package. It never accesses the network, never submits
anything on a buyer's behalf, and never issues a claim, certification,
or eligibility decision — every lane's output is structured evidence
plus a mandatory human-review step, not a conclusion.

## The five lanes
| Lane | What it evidences |
|---|---|
| `msft_csp` | Microsoft CSP outage SLA-credit readiness (incident/service-health overlap, claim-readiness gates). |
| `hospital_mrf` | Hospital price-transparency machine-readable file structural/integrity checks. |
| `agency_rfp` | Government/agency RFP compliance-matrix extraction (requirements, questions, attachments, amendments, conflicts). |
| `accessibility` | Automated-scan + manual-checklist accessibility acceptance evidence. |
| `lead_path` | Lead-form/booking-path funnel structural checks and drop-off candidate flagging. |

## Why "offline"
Every run is local-file-in, local-file-out. No lane fetches a URL,
calls an API, or contacts a third party. This is a deliberate product
boundary, not a temporary limitation — see `13_glossary_and_faq.md`
for why, and each lane's own `exclusions` (via `lane_meta()`) for the
specifics.

## Entry points
- CLI: `bin/urf` or `python3 -m urf.cli` (see `02_cli_reference.md`).
- Tests: `scripts/run_tests.sh` (see `10_testing.md`).
- Commercial paperwork: `templates/commercial/` (see the mission-level `templates/commercial/README.md`).
- Example, already-generated deliveries: `example_deliveries/` (see its own `README.md`).

## Where this lives
This entire product is scoped to
`experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/`
inside the parent UberBond repository. It does not modify, depend on,
or import from the parent repository's `src/`, `lite/`, `server.mjs`,
`worker.mjs`, or `migrations/` — see the parent repository's
`CLAUDE.md` for that boundary.
