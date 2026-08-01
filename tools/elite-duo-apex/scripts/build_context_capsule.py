#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
from apex_common import sha256_file

EXT={".md",".txt",".json",".yaml",".yml",".toml",".py",".js",".mjs",".cjs",".ts",".tsx",".jsx",".sql",".sh",".csv"}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("paths",nargs="+"); ap.add_argument("--root",default="."); ap.add_argument("--max-chars",type=int,default=120000); ap.add_argument("--output",default="CONTEXT_CAPSULE.md")
    a=ap.parse_args(); root=Path(a.root).resolve()
    files=[]
    for raw in a.paths:
        p=Path(raw).resolve()
        files += [p] if p.is_file() else [x for x in p.rglob("*") if x.is_file() and x.suffix.lower() in EXT]
    sections=[]; manifest=[]; loss=[]; remaining=a.max_chars
    for p in sorted(set(files)):
        rel=str(p.relative_to(root)) if p.is_relative_to(root) else str(p)
        try: text=p.read_text(encoding="utf-8",errors="replace")
        except Exception as e: loss.append({"path":rel,"reason":str(e)}); continue
        if remaining<=0: loss.append({"path":rel,"reason":"budget exhausted"}); continue
        part=text[:remaining]; remaining-=len(part)
        sections.append(f"\n## {rel}\n\n```text\n{part}\n```\n")
        manifest.append({"path":rel,"sha256":sha256_file(p),"total_chars":len(text),"included_chars":len(part),"truncated":len(part)<len(text)})
        if len(part)<len(text): loss.append({"path":rel,"reason":"truncated","omitted_chars":len(text)-len(part)})
    out=Path(a.output)
    out.write_text("# Context Capsule\n"+"".join(sections)+"\n## Manifest\n```json\n"+json.dumps(manifest,indent=2)+"\n```\n",encoding="utf-8")
    Path("CONTEXT_MANIFEST.json").write_text(json.dumps({"capsule_sha256":__import__("hashlib").sha256(out.read_bytes()).hexdigest(),"files":manifest,"loss_ledger":loss},indent=2)+"\n")
    Path("LOSS_LEDGER.json").write_text(json.dumps(loss,indent=2)+"\n")
    print(out)
if __name__=="__main__": main()
