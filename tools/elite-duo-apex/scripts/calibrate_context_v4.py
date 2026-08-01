#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,statistics
from pathlib import Path
ap=argparse.ArgumentParser(); ap.add_argument('telemetry'); ap.add_argument('--output',default='CONTEXT_CALIBRATION.json'); a=ap.parse_args(); rows=[json.loads(x) for x in Path(a.telemetry).read_text().splitlines() if x.strip()]
pcts=[float(x.get('used_percentage',0)) for x in rows]; ratios=[float(x.get('cache_ratio',0)) for x in rows]
# Conservative recommendations. Actual promotion requires benchmark quality parity.
maxp=max(pcts) if pcts else 0; median=statistics.median(pcts) if pcts else 0; cache=statistics.mean(ratios) if ratios else 0
threshold=82
if maxp>92: threshold=76
elif maxp>86: threshold=80
elif maxp<65 and cache>0.75: threshold=88
result={'samples':len(rows),'observed_max_pct':maxp,'median_pct':median,'mean_cache_ratio':cache,'recommended_autocompact_pct':threshold,'status':'recommendation_only','quality_gate':'Run equal-task acceptance benchmark before applying.'}
Path(a.output).write_text(json.dumps(result,indent=2)+'\n'); print(a.output)
