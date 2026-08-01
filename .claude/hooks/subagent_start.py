#!/usr/bin/env python3
from lib import *
data=read_input()
append_jsonl(apex_dir(data)/"agents.jsonl",event_row(data,{"status":"started"}))
emit({"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"You are an ELITE DUO Sonnet-only role. Use the assigned kernel, stay within file ownership and tool boundaries, produce the required artifact, and do not approve your own work."}})
