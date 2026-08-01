#!/usr/bin/env python3
import json, time
from lib import *
data=read_input()
apex=apex_dir(data)
state=apex/"APEX_STATE.json"
snapshot=apex/f"precompact-{int(time.time())}.json"
payload={"hook":data,"state":json.loads(state.read_text()) if state.exists() else None}
snapshot.write_text(json.dumps(payload,indent=2,default=str)+"\n",encoding="utf-8")
append_jsonl(apex/"lifecycle.jsonl",event_row(data,{"snapshot":str(snapshot)}))
