#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("paths",nargs="+")
    a=ap.parse_args(); rows=[]; total=0; duplicates={}
    for raw in a.paths:
        p=Path(raw); text=p.read_text(encoding="utf-8",errors="replace"); chars=len(text); total+=chars
        lines=[x.strip() for x in text.splitlines() if x.strip()]
        for line in lines: duplicates[line]=duplicates.get(line,0)+1
        rows.append({"path":str(p),"chars":chars,"lines":len(text.splitlines())})
    repeated=sorted([{"text":k,"count":v} for k,v in duplicates.items() if v>=3],key=lambda x:-x["count"])[:100]
    print(json.dumps({"total_chars":total,"files":rows,"repeated_lines":repeated},indent=2))
if __name__=="__main__": main()
