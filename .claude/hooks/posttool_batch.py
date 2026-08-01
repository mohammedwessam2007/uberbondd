#!/usr/bin/env python3
from lib import *
data=read_input()
append_jsonl(apex_dir(data)/"batches.jsonl",event_row(data,{"batch_sha256":sha(data)}))
emit({"hookSpecificOutput":{"hookEventName":"PostToolBatch","additionalContext":"Before reporting progress, verify each claimed outcome against this session's tool evidence. Continue the finite mission rather than ending on a promise."}})
