#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, re
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("memory_dir")
    a=ap.parse_args(); root=Path(a.memory_dir); errors=[]; warnings=[]
    index=root/"MEMORY.md"
    if not index.exists(): errors.append("MEMORY.md missing")
    else:
        text=index.read_text()
        if len(text.splitlines())>200: warnings.append("MEMORY.md exceeds 200 lines")
        if len(text.encode())>25000: warnings.append("MEMORY.md exceeds 25KB")
    patterns=[r"sk-[A-Za-z0-9_-]{10,}",r"AKIA[0-9A-Z]{16}",r"BEGIN (RSA|OPENSSH|PRIVATE) KEY",r"seed phrase"]
    for p in root.rglob("*.md"):
        text=p.read_text(errors="replace")
        for pat in patterns:
            if re.search(pat,text,re.I): errors.append(f"possible secret in {p}")
    print(json.dumps({"passed":not errors,"warnings":warnings,"errors":errors},indent=2))
    raise SystemExit(0 if not errors else 1)
if __name__=="__main__": main()
