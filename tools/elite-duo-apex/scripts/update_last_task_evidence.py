#!/usr/bin/env python3
from pathlib import Path
import argparse
ap=argparse.ArgumentParser(); ap.add_argument("artifact"); ap.add_argument("--project",default=".")
a=ap.parse_args(); p=Path(a.artifact).resolve()
if not p.exists(): raise SystemExit("artifact missing")
dest=Path(a.project)/".claude/apex/LAST_TASK_EVIDENCE"; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_text(str(p)+"\n")
print(dest)
