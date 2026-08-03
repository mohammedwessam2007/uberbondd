# Glossary and FAQ

## Glossary
- **Lane** — one self-contained evidence-gathering workflow
  (`msft_csp`, `hospital_mrf`, `agency_rfp`, `accessibility`,
  `lead_path`), implemented as one module satisfying the plugin
  contract in `lanes/base.py`.
- **Run** — one execution of a lane against one fixture, identified by
  a `run_id`, persisted entirely on disk under a `Workspace` (see
  `03_architecture.md`). Resumable across CLI invocations because
  every stage reads prior state from disk before appending.
- **Evidence item** — one atomic, sourced, classified fact recorded via
  `RunContext.add_evidence`; the base unit everything else (findings,
  the report) ultimately cites back to.
- **Finding** — a labeled statement (one of the 9 labels — see
  `04_evidence_model.md`) that cites one or more evidence items via
  `evidence_refs`.
- **Blocked conclusion** — a finding label meaning "this lane's actual
  decision is explicitly refused"; used by all four decision lanes,
  never fabricated as a real yes/no.
- **Unknown** — a record type for "the system could not determine
  this," used instead of a guess.
- **Human review request** — a record type representing a specific,
  trackable ask for a human to resolve something the system could not;
  every `human_review_required=True` finding must have at least one
  matching request (the invariant `test_lanes_full_pipeline.py`
  enforces).
- **Workspace** — the resolved base directory (`reports/`,
  `evidence/`, `logs/`, `tmp/`) a run's files live under; defaults to
  the product root, overridable via `--workspace` for isolation.
- **QA gate** — the deterministic `qa` stage; base checks (evidence
  refs resolve, valid labels, human-review consistency) plus each
  lane's own `qa_checks`.
- **Claim safety** — the `render`-time scanner blocking prohibited
  claims, unsupported numbers, unverified prices, and undisclosed
  synthetic data from ever reaching a written report.
- **Data safety** — the evidence-time scanner forcing any
  credential/PHI/live-payment-shaped text to an effective
  `PROHIBITED` classification.
- **Chain of custody** — the `CHECKSUMS.sha256`-backed packaging
  guarantee that a delivered package's contents can be independently
  re-verified as unmodified since packaging.
- **Fixture** — a synthetic (never real) input dataset under
  `fixtures/<lane>/<fixture_id>/`, used both by the CLI's
  `--fixture` flag and by the self-tests.

## FAQ

**Does this system ever contact anyone or send anything?**
No. Every subcommand is synchronous, makes no network requests, and
writes only under the resolved workspace (`02_cli_reference.md`). There
is no outbound integration anywhere in this product's code.

**Can it certify WCAG/ADA/Section 508 compliance, or Microsoft SLA-credit
eligibility?**
No. The `accessibility` and `msft_csp` lanes are structurally incapable
of a positive certification — they always conclude with a `"blocked
conclusion"` finding, and even if a lane tried to write a certifying
sentence, `claim_safety/rules.py::scan_text` blocks it at `render` time.

**Why does `package` succeed even after a failed `qa`?**
This is a real, documented gap, not an oversight discovered too late —
see `08_packaging_and_chain_of_custody.md`. The code only requires a
QA result to exist, not that it passed. The discipline that a failed
QA result should not actually be delivered lives in
`templates/commercial/04_delivery_checklist.md`, not in the packaging
code.

**Why is `hospital_mrf` handled differently from the other four lanes in
tests?**
It's a data-integrity lane, not a decision lane — it reports each
anomaly individually with its own human-review flag rather than
producing one final blocked-conclusion finding. See
`05_lane_reference.md` and `10_testing.md` for how
`test_lanes_full_pipeline.py` accounts for this.

**Can I add a real-world PDF/DOCX parser to `agency_rfp`?**
Not without deliberately changing lane scope — the lane currently
requires a human to transcribe real office-format documents into its
own line-based markup first, precisely because no binary
office-format parser exists in this offline system. Adding one would
be a substantial, separately-reviewed change, not a documentation fix.

**Where do dollar figures in a report come from?**
Always from `economics/pricing.py`, always labeled `"assumption"` or
`"modeled"`, never `"observed fact"` (`09_economics_and_pricing.md`).
`economics/recorder.py` produces the only *real* dollar-adjacent fact
this system can observe, which is package byte size — never a cost or
price.

**What's the fastest way to see whether the whole product still works
after a change?**
`./scripts/run_tests.sh` from the product root — compiles every `.py`
file, then runs the full 82-test suite.
