#!/usr/bin/env python3
from pathlib import Path
from lib import *
data=read_input(); root=project_dir(data); apex=apex_dir(data); source=data.get('source')
append_jsonl(apex/'lifecycle.jsonl',event_row(data,{'source':source,'v4':True}))
ctx=['ELITE DUO FABLE FRACTION ENGINE V4 is active.','Use Claude Sonnet 5 only.','Preserve stable prefixes, durable artifacts and human approval boundaries.']
state=apex/'APEX_STATE.json'
if state.exists(): ctx.append(f'Resume state from {state}.')
if source=='compact':
 brief=apex/'REHYDRATION_BRIEF.md'
 if brief.exists(): ctx.append(brief.read_text(errors='replace')[:5000])
ctx.append('Architecture and independent review use max; difficult execution uses xhigh. Savings count only when quality gates remain unchanged.')
emit({'hookSpecificOutput':{'hookEventName':'SessionStart','additionalContext':'\n'.join(ctx)}})
