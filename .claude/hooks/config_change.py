#!/usr/bin/env python3
from lib import *
data=read_input()
append_jsonl(apex_dir(data)/"config_changes.jsonl",event_row(data,{"config":data}))
source=str(data.get("source",""))
if source in {"project_settings","local_settings"} and not (project_dir(data)/".claude/apex/ALLOW_CONFIG_CHANGE").exists():
    emit({"decision":"block","reason":"Project or local Claude configuration changes require explicit approval and .claude/apex/ALLOW_CONFIG_CHANGE."})
