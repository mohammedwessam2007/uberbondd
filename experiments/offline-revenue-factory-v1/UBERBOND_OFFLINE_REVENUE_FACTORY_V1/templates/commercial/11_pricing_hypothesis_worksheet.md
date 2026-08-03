# Pricing-hypothesis worksheet — [LANE]

Human worksheet wrapping `src/urf/economics/pricing.py`. Every dollar
figure below is an **assumption** or **modeled** output over
assumptions — never an observed fact. Do not present these numbers to
a buyer as real costs, real pricing, or historical performance; see
`pricing.DISCLAIMER`.

## Inputs (fill in per engagement)
- Assumed hourly review rate (USD): __________ (default: 75.00)
- Assumed owner review minutes per delivery: __________ (default: 30.0)
- Assumed compute cost per delivery (USD): __________ (default: 0.10)
- Assumed rework rate (%): __________ (default: 15.0)
- Proposed price per delivery (USD): __________

## Run it
```
PYTHONPATH=src python3 -c "
from urf.economics.pricing import build_all_scenarios
import json
print(json.dumps(build_all_scenarios(<price_per_delivery_usd>), indent=2))
"
```

## Output shape (per volume tier: 1 / 10 / 50 / 100 deliveries/month)
- `modeled_cost_per_delivery_usd` — labeled `modeled`
- `modeled_revenue_per_month_usd` — labeled `modeled`
- `modeled_cost_per_month_usd` — labeled `modeled`
- `modeled_margin_per_month_usd` — labeled `modeled`

## Replacing assumptions with observed facts over time
As real runs accumulate, call `economics.recorder.record_run_economics`
per run (real wall-clock duration, real package byte size, real
finding/unknown/human-review counts are all `observed fact` already —
only `owner_minutes`/`ai_minutes` need an operator to log them). Once
enough real runs are logged, replace the assumed review-minutes figure
above with an observed average, and re-run this worksheet.

## Sign-off
- Prepared by: __________  Date: __________
- Reviewed by: __________ (must not be the same person, per the review rule)
