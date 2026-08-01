#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, platform, subprocess, time
from pathlib import Path
from apex_common import timestamp

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--cwd",default="."); ap.add_argument("--output",default="TEST_EVIDENCE.json"); ap.add_argument("command",nargs=argparse.REMAINDER)
    a=ap.parse_args()
    if not a.command: raise SystemExit("command required after --")
    started=timestamp(); t=time.time()
    proc=subprocess.run(a.command,cwd=a.cwd,text=True,capture_output=True)
    ended=timestamp()
    stdout=proc.stdout.encode(); stderr=proc.stderr.encode()
    result={
        "command":" ".join(a.command),"exit_code":proc.returncode,"started_at":started,"ended_at":ended,
        "duration_seconds":time.time()-t,"stdout_sha256":hashlib.sha256(stdout).hexdigest(),"stderr_sha256":hashlib.sha256(stderr).hexdigest(),
        "stdout_tail":proc.stdout[-10000:],"stderr_tail":proc.stderr[-10000:],
        "environment":{"python":platform.python_version(),"platform":platform.platform(),"cwd":str(Path(a.cwd).resolve())}
    }
    Path(a.output).write_text(json.dumps(result,indent=2)+"\n")
    print(a.output)
    raise SystemExit(proc.returncode)
if __name__=="__main__": main()
