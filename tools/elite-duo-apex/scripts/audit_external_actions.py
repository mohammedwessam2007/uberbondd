#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("ledger")
    a=ap.parse_args(); data=json.loads(Path(a.ledger).read_text()); errors=[]
    for i,row in enumerate(data.get("actions",[])):
        for key in ["type","authorized","attempted","confirmed","evidence"]:
            if key not in row: errors.append(f"row {i} missing {key}")
        if row.get("confirmed") and not row.get("evidence"): errors.append(f"row {i}: confirmed without evidence")
        if row.get("attempted") and not row.get("authorized"): errors.append(f"row {i}: attempted without authorization")
    print(json.dumps({"passed":not errors,"errors":errors},indent=2))
    raise SystemExit(0 if not errors else 1)
if __name__=="__main__": main()
