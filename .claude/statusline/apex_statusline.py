#!/usr/bin/env python3
from __future__ import annotations
import json, os, sys, time
from pathlib import Path

def zone(p):
    if p < 45: return 'GREEN'
    if p < 62: return 'YELLOW'
    if p < 75: return 'ORANGE'
    if p < 88: return 'RED'
    return 'CRITICAL'

data=json.load(sys.stdin)
ctx=data.get('context_window') or {}
use=ctx.get('current_usage') or {}
pct=float(ctx.get('used_percentage') or 0)
read=int(use.get('cache_read_input_tokens') or 0)
create=int(use.get('cache_creation_input_tokens') or 0)
fresh=int(use.get('input_tokens') or 0)
ratio=read/max(1,read+create+fresh)
model=(data.get('model') or {}).get('display_name','Sonnet')
eff=(data.get('effort') or {}).get('level','?')
cost=(data.get('cost') or {}).get('total_cost_usd')
project=Path((data.get('workspace') or {}).get('project_dir') or (data.get('workspace') or {}).get('current_dir') or os.getcwd())
apex=project/'.claude'/'apex'; apex.mkdir(parents=True,exist_ok=True)
row={'at':time.time(),'session_id':data.get('session_id'),'used_percentage':pct,'zone':zone(pct),'cache_read':read,'cache_create':create,'fresh_input':fresh,'cache_ratio':ratio,'effort':eff,'cost_usd':cost}
with (apex/'context-telemetry.jsonl').open('a',encoding='utf-8') as f: f.write(json.dumps(row)+'\n')
(apex/'CONTEXT_HEALTH.json').write_text(json.dumps(row,indent=2)+'\n')
bar='█'*int(pct//10)+'░'*(10-int(pct//10))
cost_text=f' ${cost:.2f}' if isinstance(cost,(int,float)) else ''
print(f'[{model} {eff}] {bar} {pct:.0f}% {zone(pct)} | cache {ratio:.0%}{cost_text}')
