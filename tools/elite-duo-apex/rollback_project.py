#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, shutil
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--project",required=True); ap.add_argument("--backup",required=True); ap.add_argument("--apply",action="store_true")
    a=ap.parse_args(); project=Path(a.project).resolve(); backup=Path(a.backup).resolve(); claude=project/".claude"
    report={"project":str(project),"backup":str(backup),"apply":a.apply}
    if not backup.exists(): raise SystemExit("backup does not exist")
    if a.apply:
        if claude.exists(): shutil.rmtree(claude)
        shutil.copytree(backup,claude)
    print(json.dumps(report,indent=2))
if __name__=="__main__": main()
