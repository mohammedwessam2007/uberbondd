#!/usr/bin/env python3
from __future__ import annotations
import argparse, csv, fnmatch, json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("csv")
    a=ap.parse_args(); rows=list(csv.DictReader(Path(a.csv).open(encoding="utf-8-sig"))); errors=[]
    for i,x in enumerate(rows):
        for y in rows[i+1:]:
            if x["owner"]==y["owner"]: continue
            if x["path_glob"]==y["path_glob"] or fnmatch.fnmatch(x["path_glob"],y["path_glob"]) or fnmatch.fnmatch(y["path_glob"],x["path_glob"]):
                errors.append(f"possible overlap: {x} vs {y}")
    print(json.dumps({"passed":not errors,"errors":errors},indent=2))
    raise SystemExit(0 if not errors else 1)
if __name__=="__main__": main()
