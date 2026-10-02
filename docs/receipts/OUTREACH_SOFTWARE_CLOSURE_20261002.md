# Outreach Software Closure — 2026-10-02

Truth class: **SOURCE + TEST + REACHABILITY RECEIPT.** This is not a deployment receipt, not a customer receipt and not evidence of demand. Nothing was sent, no provider or DNS state was changed, nothing was spent, and no production system was read or written. Basis: `origin/main` `7008c87d` plus branch `claude/smtp-public-business-contact-v1`.

Machine-readable companions: `artifacts/outreach/outreach-software-gap-register-20261002.json` (every gap and its disposition), `artifacts/outreach/outreach-reachability-20261002.json` (live import-graph classes), `artifacts/outreach/powerhouse-preflight-request-20261002.json` (the exact authenticated call that replaces the manual V6 ledger read).

## What now exists (all read-only, admin-authenticated, zero send authority)

| Capability | Source | Production route | Guards (mutation war) |
|---|---|---|---|
| Exact production contact history (suppressions, prospects, outbound reservations/events, replies; messages, provider events) | `src/prospect-contact-history.mjs` | `GET /api/prospect-preflight/contact-history` | OUTREACH-CH-01..05, OUTREACH-ROUTE-01 |
| Deterministic prospect verification consuming the receipt | `src/prospect-verification-intake.mjs` | in the preflight | OUTREACH-INT-01..02 |
| Generic prework + V5 tournament, composed from the UberReply machinery | `src/prospect-message-tournament.mjs` | in the preflight | OUTREACH-MT-01..05 |
| Generic effect-package compiler (no final digest while any participant is a placeholder) | `src/prospect-effect-package.mjs` | in the preflight | OUTREACH-EP-01..03 |
| One typed terminal operation | `src/prospect-preflight.mjs` | `POST /api/prospect-preflight` | OUTREACH-PF-01..03 |
| Lead generator -> preflight candidate handoff | `src/prospect-preflight-handoff.mjs` | `GET /api/prospect-preflight/candidates` | — |
| Outreach economics (unknown costs stay UNKNOWN) | `src/outreach-economics-snapshot.mjs` | `GET /api/outreach/economics` | OUTREACH-ECON-01..02 |
| Plan-only sender-fleet expansion planner | `src/winnr-expansion-planner.mjs` | `POST /api/outbound/fleet/expansion-plan` | OUTREACH-FLEET-01..04 |
| Outreach drift doctor | `src/outreach-drift-doctor.mjs` | `npm run outreach:drift-doctor` | OUTREACH-DRIFT-01 |

Preflight terminal states: `READY_FOR_AUTHORIZATION`, `READY_PENDING_DRAFT_TIME_FACTS`, `DO_NOT_SEND`, `BLOCKED_EXTERNAL_FACT`, `BLOCKED_IDENTITY`, `BLOCKED_LEGAL_AUTHORITY`, `BLOCKED_SENDER_HEALTH`, `BLOCKED_CONTACT_HISTORY`. Every one carries `sendAuthority: false`; `READY_*` means every participating fact is final, never that anything is authorized. APPROVED, DISPATCHED and RECONCILED stay with their existing owners (outreach-governance approvals, outbound reservations/events, reservation-recovery).

## Corrections made while building (kept as lineage, not hidden)

1. **The named V6 read could not answer the question.** `GET /api/leadgen/intelligence` is aggregate and omits suppressed/contacted rows, so a clean response would have been false assurance. The preflight now reads the raw ledgers itself.
2. **I had introduced a parallel offer-id namespace** in the intake (`AGENCY_REVENUE_LEAK_PROOF_PACK`, ...) beside the canonical production genome (`LEAD_TO_BOOKING_LEAK_AUDIT`, ...). That was duplicate debt. The intake now resolves every id, public name and former name through `UBERREPLY_OFFER_PORTFOLIO`; legacy labels remain accepted aliases.
3. **The generic tournament exposed two real defects in generated candidates** that the hand-built one had hidden: a candidate that dropped *why* the recipient was being told about the client, and one that opened on a pronoun with no antecedent. Both are now hard critics. With them, the generic pipeline independently re-derives the earlier hand-built winner text; Powerhouse is a fixture (`tests/fixtures/outreach/powerhouse.fixture.mjs`), not a code path.
4. **My first mutation run was invalid.** The war copies `src/`, `tests/` and `scripts/` but not `artifacts/` or `docs/`; suites that read those failed for the wrong reason and were recorded as kills. Every suite was rewritten to be hermetic (fixtures under `tests/`, injected existence checks, a placeholder artifact created only where `artifacts/` is absent) and verified to pass unmutated in the sandbox before the war was re-run. One guard (OUTREACH-FLEET-01) survived the first honest run because its test was too weak; the test was strengthened and the guard is now killed.
5. **Hardening from self-review:** caller-supplied unsupported-claim patterns are literal text, never compiled regular expressions; the receipt HMAC uses a purpose-bound subkey instead of the raw deployment secret; control, zero-width and bidi characters disqualify a candidate (header injection); the new read routes fail closed when no admin token is configured (the shared `auth()` treats "no token" as open).

## Dispositions (full register in the JSON)

- Implemented and reachable: contact history, intake receipt path, tournament, effect package, preflight, candidate handoff, economics, fleet planner, drift doctor, cold-route envelope validation (reachable, never self-authorizing).
- Proven not actually a gap: founder one-button (#877; the button is bound to canonical server readiness and `prepareSovereignOneButtonLaunch` does not exist in source), outreach automation (the permitted internal transitions already run in `pipeline.pollReplies`; the rule engine stays `AWAITING_ACTIVATION`), reply taxonomy (production-wired through `ai.mjs` -> `pipeline.mjs`).
- External reality only: `uberwarm2-*` (classified, needs a provisioned fleet and owner authority), the reachability-ratchet debt of 14 non-outreach modules that fails identically on `main`.

## Verification

- Focused suites (`npm run test:prospect-preflight`): 151 tests, 0 failing. Mutation war, 26 registered guards: **26 killed, 0 survived** (hermetic suites, verified green unmutated).
- Drift doctor: clean on the real tree; its own hostile tests prove it fires on stale claims, missing pointers, handoff/state disagreement, a released quarantine, a "cold route live" claim and a one-button route/model regression.
- Reachability audit of 46 outreach modules: 30 production-reachable, 10 operator-reachable, 5 `AWAITING_ACTIVATION`, 1 `RESEARCH_ONLY`, 0 test-only, 0 unknown.
- Deterministic suite vs `origin/main` baseline: main = 8780 tests, 34 failing; branch run 1 = 8941 tests, 37 failing = the same 34 plus 3 caused by this work (an importer allow-list in two inertness tests and an uppercase-token check in the war source), all fixed. Final branch run: 8943 tests, 35 failing = the same 34 baseline failures plus one importer allow-list in an inertness test (`src/capability-graph.mjs` merely names the module), fixed afterwards and re-run green; the failing-name set is otherwise identical to `main`. Failures are other organs (Infinite-Opus/franchise/Thought-Bond/evidence-graph suites, capability-genome doctor receipts, canon/constitution freshness, production-coverage and reachability ratchets) and are identical on `main`; they are not caused by and not hidden by this work.
- `node scripts/check-syntax.mjs`: the same 3 unparseable test files as on `main` (none is in this change).

## What is still not software

`LEGAL_AUTHORITY_HOLD` (sender-side scope, including the conservative Egypt hold), `IDENTITY_FACT_HOLD` (legal business sender name, publishable postal address, footer authorization), and the Powerhouse production-ledger verdict, which needs a deployed build plus an authenticated owner call to `POST /api/prospect-preflight`. Customer response, price acceptance, cleared payment, accepted delivery and renewal are unknown (zero observed). Do not read any state above as demand or revenue.
