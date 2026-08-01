#!/usr/bin/env python3
from __future__ import annotations
import json, py_compile, re, sqlite3, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errors=[]

file_count=len([p for p in ROOT.rglob("*") if p.is_file() and "__pycache__" not in p.parts])
if file_count<6000: errors.append(f"file count below 6000: {file_count}")

expected={
 "domains":144,"routes":288,"skills":288,"agents":144,
 "playbooks":144,"controls":288,"benchmarks":288
}
actual={
 "domains":len(list((ROOT/"library/domains").glob("*/*/DOMAIN_DOCTRINE.md"))),
 "routes":len(list((ROOT/"library/routes").glob("*/*/ROUTE.md"))),
 "skills":len(list((ROOT/"library/skills").glob("*/*/SKILL.md"))),
 "agents":len(list((ROOT/"library/agents").glob("*/*/AGENT.md"))),
 "playbooks":len(list((ROOT/"library/failure-playbooks").glob("*/*/PLAYBOOK.md"))),
 "controls":len(list((ROOT/"library/controls").glob("*/*/CONTROL.md"))),
 "benchmarks":len(list((ROOT/"library/benchmarks").glob("*/*/CASE.json"))),
}
for k,v in expected.items():
    if actual[k]!=v: errors.append(f"{k}: expected {v}, found {actual[k]}")

for p in (ROOT/"library/agents").glob("*/*/AGENT.md"):
    text=p.read_text()
    if "model: sonnet" not in text or "effort: max" not in text:
        errors.append(f"non-apex agent {p.relative_to(ROOT)}")

for p in ROOT.rglob("*.json"):
    if "__pycache__" in p.parts: continue
    try: json.loads(p.read_text())
    except Exception as e: errors.append(f"invalid JSON {p.relative_to(ROOT)}: {e}")

for p in ROOT.rglob("*.py"):
    if "__pycache__" in p.parts: continue
    try: py_compile.compile(str(p),doraise=True)
    except Exception as e: errors.append(f"invalid Python {p.relative_to(ROOT)}: {e}")

db=ROOT/"library/catalog.sqlite"
if not db.exists(): errors.append("catalog.sqlite missing")
else:
    con=sqlite3.connect(db)
    count=con.execute("select count(*) from artifacts").fetchone()[0]
    con.close()
    if count<6000: errors.append(f"catalog too small: {count}")

proc=subprocess.run([sys.executable,"-m","unittest","discover","-s",str(ROOT/"tests")],capture_output=True,text=True)
if proc.returncode: errors.append("tests failed:\n"+proc.stdout+proc.stderr)

report={
 "passed":not errors,"file_count":file_count,"counts":actual,"expected":expected,
 "catalog_artifacts":count if db.exists() else 0,
 "unit_test_exit_code":proc.returncode,
 "unit_test_summary":"All V2 and V3 tests passed" if proc.returncode==0 else (proc.stdout+proc.stderr)[-5000:],
 "errors":errors
}
print(json.dumps(report,indent=2))
raise SystemExit(0 if not errors else 1)
