#!/usr/bin/env python3
import time
from lib import *
data=read_input()
apex=apex_dir(data)
prompt=data.get("prompt","")
append_jsonl(apex/"prompts.jsonl",event_row(data,{"prompt_sha256":sha(prompt),"chars":len(prompt)}))
state=apex/"APEX_STATE.json"
if not state.exists():
    state.write_text(__import__("json").dumps({
        "mission_id":f"mission-{int(time.time())}",
        "state":"INGEST",
        "completed":[],
        "blockers":[],
        "modified_files":[],
        "tests":[],
        "external_actions":[],
        "next_action":"Compile MISSION_CONTRACT.json"
    },indent=2)+"\n",encoding="utf-8")
emit({"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"Compile or update the mission contract before high-cost architecture or implementation. Ground progress in tool evidence."}})
