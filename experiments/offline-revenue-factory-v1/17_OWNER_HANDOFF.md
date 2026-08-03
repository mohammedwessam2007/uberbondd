# Owner handoff

## First run, in order
```
cd UBERBOND_OFFLINE_REVENUE_FACTORY_V1
python3 -m py_compile $(find src -name '*.py')
./scripts/run_tests.sh
```
Expect `Ran 82 tests ... OK`. If this doesn't pass on your machine
before you change anything, stop and diagnose the environment rather
than the product — see
`UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/12_troubleshooting.md`.

## Reading order for a new owner
1. `README.md` (product root) — what this is and isn't.
2. `LEGAL_AND_CLAIM_BOUNDARIES.md` and
   `SECURITY_AND_PRIVACY_BOUNDARIES.md` — the hard limits, read these
   before running anything against real customer data.
3. `docs/00_overview.md` through `docs/13_glossary_and_faq.md` — the
   full operating documentation set, in order.
4. `docs/01_installation_and_quickstart.md`'s CLI walkthrough — run it
   yourself once, end to end, on a fixture, before touching real data.

## Running a real engagement
Always use `--workspace` pointed at a dedicated directory per
engagement (not the product root) so runs don't collide — see
`docs/01_installation_and_quickstart.md`'s isolation guidance. Never
put real credentials, PHI, or live payment data into a fixture or
input file; the data-safety scanner is a backstop, not a green light
(`SECURITY_AND_PRIVACY_BOUNDARIES.md`).

## Before any report reaches a real buyer or partner
1. A human must read the rendered report and confirm it against
   `LEGAL_AND_CLAIM_BOUNDARIES.md` — `render`'s claim-safety gate
   catches pattern-matched violations, not everything.
2. A human must make the actual pricing decision — everything in
   `13_ECONOMIC_INSTRUMENTATION/` is a labeled assumption, never a
   real price.
3. For `msft_csp` specifically: an actual authorized CSP partner
   submission channel is required and does not exist in this system.
4. Every `human_review_request` in the package must be resolved by a
   qualified human before delivery — that is the entire point of the
   flag.

## Extending the system
Adding a sixth lane: `docs/11_adding_a_new_lane.md`. Adding a test:
`docs/10_testing.md`'s "Adding a test" section — never weaken an
assertion to make a new test pass; treat a surprising failure as a
possible real defect first.

## Who to ask when unsure
This system cannot answer legal, compliance, medical, or certification
questions about its own output — that is the entire reason the
blocked-conclusion mechanism and human-review requests exist. Route
those to a qualified human (licensed professional, legal counsel,
authorized partner channel, as specified per `required_role` on the
relevant `human_review_request`), never to another run of this system.
