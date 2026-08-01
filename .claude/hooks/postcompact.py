#!/usr/bin/env python3
from lib import *
data=read_input()
append_jsonl(apex_dir(data)/"lifecycle.jsonl",event_row(data,{"status":"compacted"}))
