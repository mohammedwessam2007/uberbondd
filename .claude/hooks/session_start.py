#!/usr/bin/env python3
from pathlib import Path
from lib import *
data=read_input()
root=project_dir(data)
apex=apex_dir(data)
append_jsonl(apex/"lifecycle.jsonl",event_row(data,{"source":data.get("source")}))
state=apex/"APEX_STATE.json"
context=[
    "ELITE DUO APEX is active.",
    "Every custom AI role must use Claude Sonnet 5.",
    "Architecture and independent review use max effort; implementation uses xhigh unless the mission overrides upward.",
    "Do not call Fable, OpenAI, Haiku, or another model.",
    "External and irreversible actions require explicit approval.",
]
if state.exists():
    context.append(f"Resume durable state from {state}.")
emit({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"\n".join(context)}})
