#!/usr/bin/env python3
from __future__ import annotations
import json, re, time
from pathlib import Path
from lib import *
data=read_input(); tool=str(data.get('tool_name','')); response=data.get('tool_response')
if tool not in {'Bash','Grep','Glob'} or response is None: raise SystemExit(0)
raw=json.dumps(response,ensure_ascii=False,default=str)
threshold=24000
if len(raw)<threshold: raise SystemExit(0)
apex=apex_dir(data); store=apex/'tool-results'; store.mkdir(parents=True,exist_ok=True)
digest=sha(response); path=store/f'{int(time.time())}-{tool.lower()}-{digest[:12]}.json'; path.write_text(json.dumps(response,indent=2,ensure_ascii=False,default=str)+'\n',encoding='utf-8')
# Extract useful text from common shapes without semantic LLM summarization.
def strings(x):
    if isinstance(x,str): return [x]
    if isinstance(x,dict):
        out=[]
        for k,v in x.items():
            if k.lower() in {'stdout','stderr','output','content','text','result'}: out += strings(v)
        return out or [json.dumps(x,ensure_ascii=False,default=str)]
    if isinstance(x,list):
        out=[]
        for v in x: out += strings(v)
        return out
    return [str(x)]
text='\n'.join(strings(response)); lines=text.splitlines()
errors=[x for x in lines if re.search(r'(?i)\b(error|failed|failure|exception|traceback|fatal|panic|assert)\b',x)][:60]
head=lines[:40]; tail=lines[-40:] if len(lines)>40 else []
digest_text='\n'.join([
 f'[APEX evaporated large {tool} output]',f'Full evidence: {path}',f'SHA-256: {digest}',f'Characters: {len(text)}; lines: {len(lines)}',
 '--- HEAD ---',*head,'--- DETECTED FAILURES ---',*(errors or ['none detected deterministically']),'--- TAIL ---',*tail,
 'Read the evidence file or a targeted slice if more detail is required.'
])
updated=response
if isinstance(response,str): updated=digest_text
elif isinstance(response,dict):
 updated=dict(response)
 for key in list(updated):
  if isinstance(updated[key],str) and len(updated[key])>2000: updated[key]=digest_text
 if updated==response: updated={'output':digest_text}
else: updated=digest_text
emit({'hookSpecificOutput':{'hookEventName':'PostToolUse','updatedToolOutput':updated,'additionalContext':f'Full tool output preserved at {path}.'}})
