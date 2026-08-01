#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, subprocess
from pathlib import Path

def call(project,agent,prompt,output):
    cmd=["claude","-p","--model","claude-sonnet-5","--agent",agent,"--output-format","json","--permission-mode","plan",prompt]
    p=subprocess.run(cmd,cwd=project,text=True,capture_output=True)
    Path(output).write_text(json.dumps({"command":cmd,"exit_code":p.returncode,"stdout":p.stdout,"stderr":p.stderr},indent=2)+"\n")
    if p.returncode: raise SystemExit(p.returncode)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--project",default="."); ap.add_argument("--mission",required=True); ap.add_argument("--context",required=True); ap.add_argument("--output-dir",default="apex-architecture")
    a=ap.parse_args(); out=Path(a.output_dir); out.mkdir(parents=True,exist_ok=True)
    mission=Path(a.mission).read_text(); context=Path(a.context).read_text()
    call(a.project,"fable-execution-architect",f"Mission:\n{mission}\n\nContext:\n{context}",out/"fable.json")
    fable=(out/"fable.json").read_text()
    call(a.project,"sol-decision-architect",f"Mission:\n{mission}\n\nContext:\n{context}\n\nFable artifacts/result:\n{fable}",out/"sol.json")
    print(out)
if __name__=="__main__": main()
