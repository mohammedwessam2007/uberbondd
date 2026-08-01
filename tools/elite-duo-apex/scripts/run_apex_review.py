#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, subprocess
from pathlib import Path

def call(project,agent,prompt,path):
    cmd=["claude","-p","--model","claude-sonnet-5","--agent",agent,"--output-format","json","--permission-mode","plan",prompt]
    p=subprocess.run(cmd,cwd=project,text=True,capture_output=True)
    path.write_text(json.dumps({"exit_code":p.returncode,"stdout":p.stdout,"stderr":p.stderr},indent=2)+"\n")
    if p.returncode: raise SystemExit(p.returncode)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--project",default="."); ap.add_argument("--mission",required=True); ap.add_argument("--contract",required=True); ap.add_argument("--evidence",required=True); ap.add_argument("--output-dir",default="apex-review")
    a=ap.parse_args(); out=Path(a.output_dir); out.mkdir(parents=True,exist_ok=True)
    packet="\n\n".join([Path(a.mission).read_text(),Path(a.contract).read_text(),Path(a.evidence).read_text()])
    call(a.project,"fable-independent-reviewer",packet,out/"fable-review.json")
    call(a.project,"sol-independent-reviewer",packet,out/"sol-review.json")
    combined=packet+"\n\nFable review:\n"+(out/"fable-review.json").read_text()+"\n\nSol review:\n"+(out/"sol-review.json").read_text()
    call(a.project,"apex-judge",combined,out/"judge.json")
    print(out)
if __name__=="__main__": main()
