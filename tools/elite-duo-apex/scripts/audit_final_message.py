#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, re
from pathlib import Path

BANNED=[r"\bproduction ready\b",r"\bdeployed successfully\b",r"\bemail sent\b",r"\bpayment received\b"]

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("message"); ap.add_argument("--evidence")
    a=ap.parse_args(); text=Path(a.message).read_text(); errors=[]
    evidence=Path(a.evidence).read_text() if a.evidence and Path(a.evidence).exists() else ""
    for pat in BANNED:
        if re.search(pat,text,re.I) and not re.search(pat,evidence,re.I):
            errors.append(f"unsupported phrase: {pat}")
    if text.rstrip().endswith(("I can","If you want","Want me to")): errors.append("ends with follow-up offer")
    print(json.dumps({"passed":not errors,"errors":errors},indent=2))
    raise SystemExit(0 if not errors else 1)
if __name__=="__main__": main()
