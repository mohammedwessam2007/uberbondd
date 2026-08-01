#!/usr/bin/env python3
from lib import *
data=read_input()
append_jsonl(apex_dir(data)/"instructions.jsonl",event_row(data,{
    "reason":data.get("reason"),
    "file_path":data.get("file_path"),
    "memory_type":data.get("memory_type"),
}))
