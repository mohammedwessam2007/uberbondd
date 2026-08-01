#!/usr/bin/env python3
from lib import *
data=read_input()
inp=data.get("tool_input") or {}
response=data.get("tool_response")
append_jsonl(apex_dir(data)/"tool_evidence.jsonl",event_row(data,{
    "tool":data.get("tool_name"),
    "input_sha256":sha(inp),
    "output_sha256":sha(response),
    "success":True,
}))
