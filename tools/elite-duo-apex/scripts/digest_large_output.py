#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json,re
from pathlib import Path
ap=argparse.ArgumentParser(); ap.add_argument('input'); ap.add_argument('--output',required=True); ap.add_argument('--head',type=int,default=40); ap.add_argument('--tail',type=int,default=40); a=ap.parse_args(); p=Path(a.input); text=p.read_text(errors='replace'); lines=text.splitlines(); errors=[x for x in lines if re.search(r'(?i)\b(error|failed|failure|exception|traceback|fatal|panic|assert)\b',x)][:100]
result={'source':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'lines':len(lines),'head':lines[:a.head],'errors':errors,'tail':lines[-a.tail:]}
Path(a.output).write_text(json.dumps(result,indent=2)+'\n'); print(a.output)
