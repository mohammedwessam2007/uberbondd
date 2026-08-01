#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, subprocess, time
from pathlib import Path

def run(effort,agent,prompt,cwd):
    cmd=["claude","-p","--model","claude-sonnet-5","--effort",effort,"--agent",agent,"--output-format","json",prompt]
    started=time.time(); p=subprocess.run(cmd,cwd=cwd,text=True,capture_output=True)
    return {"effort":effort,"exit_code":p.returncode,"duration_seconds":time.time()-started,"stdout":p.stdout,"stderr":p.stderr}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--project",default="."); ap.add_argument("--agent",required=True); ap.add_argument("--prompt-file",required=True); ap.add_argument("--output",default="EFFORT_BENCHMARK_RAW.json")
    a=ap.parse_args(); prompt=Path(a.prompt_file).read_text()
    results=[run(e,a.agent,prompt,a.project) for e in ("xhigh","max")]
    Path(a.output).write_text(json.dumps({"model":"claude-sonnet-5","results":results},indent=2)+"\n")
    print(a.output)
if __name__=="__main__": main()
