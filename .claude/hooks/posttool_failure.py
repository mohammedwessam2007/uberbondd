#!/usr/bin/env python3
from lib import *
data=read_input()
append_jsonl(apex_dir(data)/"tool_failures.jsonl",event_row(data,{
    "tool":data.get("tool_name"),
    "input_sha256":sha(data.get("tool_input") or {}),
    "error_sha256":sha(data.get("error") or data.get("tool_response")),
    "success":False,
}))
