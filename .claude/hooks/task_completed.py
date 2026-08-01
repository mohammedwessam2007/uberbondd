#!/usr/bin/env python3
from lib import *
data=read_input()
append_jsonl(apex_dir(data)/"tasks.jsonl",event_row(data,{"status":"completion_requested","task":data.get("task")}))
# Deterministic hook cannot infer every task artifact. It enforces an evidence pointer.
if not (project_dir(data)/".claude/apex/LAST_TASK_EVIDENCE").exists():
    block("Task completion requires .claude/apex/LAST_TASK_EVIDENCE pointing to a validated artifact.")
