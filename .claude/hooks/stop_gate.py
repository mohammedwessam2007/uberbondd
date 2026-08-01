#!/usr/bin/env python3
import json
from lib import *
data=read_input()
root=project_dir(data)
apex=apex_dir(data)
append_jsonl(apex/"lifecycle.jsonl",event_row(data,{"status":"stop_requested"}))
state_path=apex/"APEX_STATE.json"
if not state_path.exists():
    raise SystemExit(0)
state=json.loads(state_path.read_text())
if state.get("state") in {"STOP","BLOCKED_USER_INPUT"}:
    raise SystemExit(0)
# Assessment-only missions may stop without implementation evidence.
mission=root/"MISSION_CONTRACT.json"
intent=None
if mission.exists():
    try: intent=json.loads(mission.read_text()).get("intent")
    except Exception: pass
required=[]
if intent in {"implement","build","fix","repair","change"}:
    required=["EVIDENCE_PACKET.json"]
if intent in {"review","audit"}:
    required=["FINAL_VERDICT.json"]
missing=[x for x in required if not (root/x).exists()]
if missing:
    emit({"decision":"block","reason":f"Mission is not at a valid stop boundary. Missing {missing}. Persist state, complete or mark BLOCKED_USER_INPUT."})
