#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
ap=argparse.ArgumentParser(); ap.add_argument('telemetry'); a=ap.parse_args(); rows=[]
for line in Path(a.telemetry).read_text().splitlines():
 try: rows.append(json.loads(line))
 except Exception: pass
if not rows: raise SystemExit('no telemetry')
read=sum(x.get('cache_read',0) for x in rows); create=sum(x.get('cache_create',0) for x in rows); fresh=sum(x.get('fresh_input',0) for x in rows)
compactions=sum(1 for x in rows if x.get('used_percentage',0)<5)
print(json.dumps({'samples':len(rows),'cache_read_tokens':read,'cache_creation_tokens':create,'fresh_input_tokens':fresh,'weighted_cache_ratio':read/max(1,read+create+fresh),'estimated_compaction_resets':compactions,'max_context_pct':max(x.get('used_percentage',0) for x in rows)},indent=2))
