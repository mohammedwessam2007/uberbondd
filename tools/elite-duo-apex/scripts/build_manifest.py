#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, zipfile
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("directory"); ap.add_argument("--package"); ap.add_argument("--zip")
    a=ap.parse_args(); root=Path(a.directory).resolve(); package=a.package or root.name
    files=[]
    for p in sorted(root.rglob("*")):
        if p.is_file() and p.name not in {"MANIFEST.json","SHA256SUMS.txt"}:
            files.append({"path":str(p.relative_to(root)),"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
    (root/"MANIFEST.json").write_text(json.dumps({"package":package,"files":files},indent=2)+"\n")
    lines=[f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(root)}" for p in sorted(root.rglob("*")) if p.is_file() and p.name!="SHA256SUMS.txt"]
    (root/"SHA256SUMS.txt").write_text("\n".join(lines)+"\n")
    if a.zip:
        out=Path(a.zip)
        with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for p in sorted(root.rglob("*")):
                if p.is_file(): z.write(p,p.relative_to(root.parent))
        print(out)
    else: print(root/"MANIFEST.json")
if __name__=="__main__": main()
