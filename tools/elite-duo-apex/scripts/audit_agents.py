#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, re
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--root",default="claude/agents")
    a=ap.parse_args(); errors=[]; rows=[]
    for p in sorted(Path(a.root).glob("*.md")):
        text=p.read_text()
        front=re.search(r"^---\n(.*?)\n---",text,re.S)
        if not front: errors.append(f"{p}: missing frontmatter"); continue
        fm=front.group(1)
        model=re.search(r"^model:\s*(.+)$",fm,re.M)
        effort=re.search(r"^effort:\s*(.+)$",fm,re.M)
        m=model.group(1).strip() if model else None; e=effort.group(1).strip() if effort else None
        rows.append({"path":str(p),"model":m,"effort":e})
        if m!="sonnet": errors.append(f"{p}: model must be sonnet")
        if e not in {"high","xhigh","max"}: errors.append(f"{p}: effort below quality floor")
    print(json.dumps({"passed":not errors,"agents":rows,"errors":errors},indent=2))
    raise SystemExit(0 if not errors else 1)
if __name__=="__main__": main()
