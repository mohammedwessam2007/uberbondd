# Common report engine

Pointer directory — the real implementation lives in the product tree:

- Templates: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/report_engine/templates.py`
- Rendering: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/report_engine/render.py`
- Shared report builder: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/lanes/base.py::build_report`

## Output formats
Markdown, HTML, JSON, and a CSV evidence index
(`render_markdown`, `render_html`, `render_json`,
`render_evidence_index_csv`) — all four written by `write_all` at the
`render` CLI stage. PDF was scoped as optional in the mission brief and
was not built: no offline PDF renderer was added as a dependency,
consistent with the zero-third-party-dependency constraint.

## 4 role-based templates (`TEMPLATES`)
`direct_buyer`, `white_label_partner`, `internal_qa`,
`technical_appendix` — `sections_for(template)` selects which report
sections each audience sees. `white_label_partner` additionally
supports `strip_branding=True` at render time.

## Every report includes
Executive summary, scope, exclusions, inputs, methods, findings,
evidence references, unknowns, blocked conclusions, human-review
requirements, limitations, a `delivery_acceptance_ref`, a
`run_manifest_ref`, and a `checksum` computed over the rest of the
report's own content (`build_report` in `lanes/base.py`) — this is
the record every lane, regardless of type, produces identically.

## No fabricated marketing content
No fake logos, testimonials, certifications, customer names, or
metrics appear anywhere in the templates or rendering code — every
field the engine writes traces back to a real evidence item, finding,
unknown, or human-review record from the run it is rendering.

## Enforcement point
`render` runs the claim-safety scan over the executive summary and
limitations before writing any file — see `03_CLAIM_SAFETY_POLICY.md`.
