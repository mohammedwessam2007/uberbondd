"""Lane registry."""
from __future__ import annotations

LANES = ("msft_csp", "hospital_mrf", "agency_rfp", "accessibility", "lead_path")


def get_lane_module(lane: str):
    if lane not in LANES:
        raise ValueError(f"unknown lane: {lane!r}. Known lanes: {LANES}")
    import importlib
    return importlib.import_module(f"urf.lanes.{lane}")
