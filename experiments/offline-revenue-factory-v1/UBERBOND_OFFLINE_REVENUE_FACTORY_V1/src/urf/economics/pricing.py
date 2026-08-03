"""Pricing-hypothesis worksheet and scenario calculator (mission Phase 16).

Every dollar figure this module produces is explicitly labeled
'assumption' or 'modeled'. Nothing here is sourced from real billing,
invoicing, or market data, and nothing here sets an actual price. This
is arithmetic over operator-supplied assumptions, presented for human
review -- not a claim about real-world profitability.
"""
from __future__ import annotations

DELIVERY_VOLUME_SCENARIOS_PER_MONTH = [1, 10, 50, 100]

DEFAULT_ASSUMPTIONS = {
    "assumed_hourly_review_rate_usd": 75.0,
    "assumed_owner_review_minutes_per_delivery": 30.0,
    "assumed_compute_cost_usd_per_delivery": 0.10,
    "assumed_rework_rate_pct": 15.0,
    "assumption_source": "modeled placeholder; not sourced from real billing, invoicing, or market data",
}

DISCLAIMER = (
    "All dollar figures in this scenario are modeled from operator-supplied assumptions, not observed "
    "billing data. Do not present these as guaranteed pricing, real costs, or actual historical performance."
)


def build_scenario(volume_per_month: int, price_per_delivery_usd: float, assumptions: dict | None = None) -> dict:
    a = dict(DEFAULT_ASSUMPTIONS)
    if assumptions:
        a.update(assumptions)

    review_cost_per_delivery = (
        a["assumed_owner_review_minutes_per_delivery"] / 60.0
    ) * a["assumed_hourly_review_rate_usd"]
    cost_per_delivery = review_cost_per_delivery + a["assumed_compute_cost_usd_per_delivery"]
    rework_adjusted_cost_per_delivery = cost_per_delivery * (1 + a["assumed_rework_rate_pct"] / 100.0)

    revenue_per_month = price_per_delivery_usd * volume_per_month
    cost_per_month = rework_adjusted_cost_per_delivery * volume_per_month
    margin_per_month = revenue_per_month - cost_per_month

    return {
        "volume_per_month": volume_per_month,
        "volume_label": "assumption",
        "price_per_delivery_usd": price_per_delivery_usd,
        "price_label": "assumption",
        "assumptions": a,
        "assumptions_label": "assumption",
        "modeled_cost_per_delivery_usd": round(rework_adjusted_cost_per_delivery, 2),
        "modeled_cost_label": "modeled",
        "modeled_revenue_per_month_usd": round(revenue_per_month, 2),
        "modeled_revenue_label": "modeled",
        "modeled_cost_per_month_usd": round(cost_per_month, 2),
        "modeled_margin_per_month_usd": round(margin_per_month, 2),
        "modeled_margin_label": "modeled",
        "disclaimer": DISCLAIMER,
    }


def build_all_scenarios(price_per_delivery_usd: float, assumptions: dict | None = None) -> list[dict]:
    return [
        build_scenario(volume, price_per_delivery_usd, assumptions)
        for volume in DELIVERY_VOLUME_SCENARIOS_PER_MONTH
    ]
