# Economic instrumentation

Pointer directory — the real implementation lives in the product tree:
`../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/economics/`
(`recorder.py`, `pricing.py`). Full detail:
`../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/09_economics_and_pricing.md`.

## Real-fact recording (`recorder.py`) — never invents a cost
`record_run_economics` records only what's actually observable from a
completed run's own manifest and package file: wall-clock duration
(from real `started_at`/`finished_at` timestamps, `"unknown"` if
either is missing), finding/unknown/human-review/warning counts, and
final package byte size. Owner minutes and AI minutes are not tracked
automatically — they are `"unknown"` unless a human operator supplies
them explicitly. Every field carries an explicit
`"observed fact"`/`"unknown"` label.

## Labeled-assumption pricing calculator (`pricing.py`) — never
## asserted as real
`build_all_scenarios` computes cost/revenue/margin for the mission's
required 4 volume tiers (1, 10, 50, 100 deliveries/month) from
explicit, overridable assumptions (`$75/hr` review rate, 30 review
minutes/delivery, `$0.10` compute cost/delivery, 15% rework rate — all
labeled `"modeled placeholder; not sourced from real billing,
invoicing, or market data"`). Every dollar-bearing output field
carries an `"assumption"` or `"modeled"` label — never `"observed
fact"` — plus a fixed disclaimer restating that these are not real
costs or guaranteed pricing.

## Proof
`tests/test_economics.py` — 11 tests, all passing — including the
worked example (`$250` price, volume 1 → `$206.76` modeled margin;
volume 10 → `$2067.60`) and an explicit check that no dollar field is
ever labeled `"observed fact"`.
