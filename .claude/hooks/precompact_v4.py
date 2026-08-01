#!/usr/bin/env python3
from __future__ import annotations
import json, time
from lib import *
data=read_input(); root=project_dir(data); apex=apex_dir(data)
files=['MISSION_CONTRACT.json','FABLE_EXECUTION_MODEL.json','SOL_DECISION_CONTRACT.json','ELITE_DECISION_CONTRACT.json','EVIDENCE_PACKET.json','REPAIR_CONTRACT.json','FINAL_VERDICT.json']
art=[]
for name in files:
 p=root/name
 if p.exists(): art.append({'path':name,'sha256':sha(p.read_text(errors='replace')),'bytes':p.stat().st_size})
state=apex/'APEX_STATE.json'; snapshot={'at':time.time(),'trigger':data.get('trigger'),'custom_instructions':data.get('custom_instructions'),'state':json.loads(state.read_text()) if state.exists() else None,'artifacts':art,'required_continuity':['mission','authority','architecture','invariants','changes','tests','blockers','external actions','rollback','next action']}
path=apex/f'precompact-v4-{int(time.time())}.json'; path.write_text(json.dumps(snapshot,indent=2)+'\n'); (apex/'LATEST_PRECOMPACT').write_text(str(path)+'\n')
append_jsonl(apex/'lifecycle.jsonl',event_row(data,{'snapshot':str(path),'v4':True}))
