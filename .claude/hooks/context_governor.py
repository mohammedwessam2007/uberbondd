#!/usr/bin/env python3
from lib import *
data=read_input(); apex=apex_dir(data); health=apex/'CONTEXT_HEALTH.json'
if not health.exists(): raise SystemExit(0)
try: h=json.loads(health.read_text())
except Exception: raise SystemExit(0)
zone=h.get('zone','GREEN'); pct=h.get('used_percentage',0); ratio=h.get('cache_ratio',0)
actions={
 'GREEN':'Continue. Keep the prefix stable.',
 'YELLOW':'Send noisy exploration and logs to isolated Sonnet workers. Spill large outputs to evidence files.',
 'ORANGE':'Finish the current phase, persist state, and prepare focused compaction. Prefer a cache-sharing fork for same-context side work.',
 'RED':'Do not start a broad new branch. Snapshot now; compact at the next safe phase boundary or rewind an abandoned branch.',
 'CRITICAL':'Persist state immediately. Perform only work required to reach a safe compact or stop boundary.'}
emit({'hookSpecificOutput':{'hookEventName':data.get('hook_event_name'),'additionalContext':f'APEX context: {pct:.0f}% {zone}; cache ratio {ratio:.0%}. {actions.get(zone)}'}})
