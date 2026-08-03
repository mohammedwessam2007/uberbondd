# Economics and pricing

Two separate modules under `src/urf/economics/`, deliberately kept
apart because they answer two different questions with two different
evidentiary standards.

## `recorder.py` — what actually happened (real facts only)
`record_run_economics(manifest, package_path=None, owner_minutes=None,
ai_minutes=None)` builds a record from **only** values already present
on disk or explicitly supplied by a human operator:
- `wall_clock_duration_seconds` — computed from the run manifest's own
  `started_at`/`finished_at` ISO timestamps (`%Y-%m-%dT%H:%M:%SZ`,
  UTC). Labeled `"observed fact"` when both timestamps exist,
  `"unknown"` otherwise — never estimated or interpolated.
- `finding_count` / `unknown_count` / `human_review_count` /
  `warning_count` — passed straight through from the manifest, labeled
  `"observed fact"`.
- `final_package_byte_size` — `Path.stat().st_size` on the real
  packaged zip if `package_path` is given and exists; `"unknown"`
  otherwise.
- `owner_minutes` / `ai_minutes` — **always `None`/"unknown" unless a
  human operator supplies them explicitly.** This offline system has
  no way to observe wall-clock human review time or its own
  "AI minutes"; the module's docstring is explicit that it will not
  fabricate a number here.

Nothing in `recorder.py` computes a dollar figure. That is a hard line
between the two modules, not a stylistic choice — a real run's cost in
dollars is not something this system can observe, only estimate under
stated assumptions, which is exactly what `pricing.py` is for.

## `pricing.py` — what a delivery might be worth (labeled assumptions only)
`build_scenario(volume_per_month, price_per_delivery_usd,
assumptions=None)` computes one volume-tier scenario:
```
review_cost_per_delivery   = (owner_review_minutes / 60) * hourly_review_rate
cost_per_delivery          = review_cost_per_delivery + compute_cost_per_delivery
rework_adjusted_cost       = cost_per_delivery * (1 + rework_rate_pct / 100)
revenue_per_month          = price_per_delivery * volume_per_month
cost_per_month             = rework_adjusted_cost * volume_per_month
margin_per_month           = revenue_per_month - cost_per_month
```
`DEFAULT_ASSUMPTIONS`: `$75/hr` review rate, `30` review minutes per
delivery, `$0.10` compute cost per delivery, `15%` rework rate — all
explicitly labeled `"assumption_source": "modeled placeholder; not
sourced from real billing, invoicing, or market data"`. Any subset can
be overridden per call; unset keys keep the default.

Every output field carries its own `_label` sibling
(`volume_label`, `price_label`, `assumptions_label`,
`modeled_cost_label`, `modeled_revenue_label`, `modeled_margin_label`)
set to `"assumption"` or `"modeled"` — never `"observed fact"` — plus a
fixed `disclaimer` string repeating that these are not real costs or
guaranteed pricing. `build_all_scenarios(price_per_delivery_usd,
assumptions=None)` runs `build_scenario` across the four standard
volume tiers (`DELIVERY_VOLUME_SCENARIOS_PER_MONTH = [1, 10, 50,
100]`).

Worked example at defaults, volume 1, price $250:
`review_cost = 30/60*75 = 37.50`, `cost_per_delivery =
37.50+0.10=37.60`, `rework_adjusted = 37.60*1.15 = 43.24`,
`margin_per_month = 250 - 43.24 = 206.76`. At volume 10 the same
per-delivery arithmetic scales linearly: `margin_per_month = 2067.60`.

## Test coverage
`tests/test_economics.py` — 11 tests, all passing (6 for `recorder.py`,
5 for `pricing.py`), including the exact worked examples above and a
check that every dollar-bearing field really is labeled
assumption/modeled and never "observed fact".
