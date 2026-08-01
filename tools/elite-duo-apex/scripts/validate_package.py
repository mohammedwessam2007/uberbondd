#!/usr/bin/env python3
from __future__ import annotations
import json, py_compile, re, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
errors=[]; warnings=[]

def files(pattern):
    return [p for p in ROOT.rglob(pattern) if "__pycache__" not in p.parts]

# JSON
for p in files("*.json"):
    try: json.loads(p.read_text(encoding="utf-8"))
    except Exception as e: errors.append(f"invalid JSON {p.relative_to(ROOT)}: {e}")

# Python
for p in files("*.py"):
    try: py_compile.compile(str(p),doraise=True)
    except Exception as e: errors.append(f"invalid Python {p.relative_to(ROOT)}: {e}")

# Counts
agents=list((ROOT/"claude/agents").glob("*.md"))
skills=list((ROOT/"claude/skills").glob("*/SKILL.md"))
hooks=list((ROOT/"claude/hooks").glob("*.py"))
schemas=list((ROOT/"schemas").glob("*.schema.json"))
workflows=list((ROOT/"workflows").glob("*.md"))
evals=list((ROOT/"evals").glob("*/suite.json"))
kernel_modules=list((ROOT/"kernels").glob("*/*.md"))

expected={"agents":32,"skills":64,"hooks":18,"schemas":18,"workflows":24,"evals":24,"kernel_modules":36}
actual={"agents":len(agents),"skills":len(skills),"hooks":len(hooks),"schemas":len(schemas),"workflows":len(workflows),"evals":len(evals),"kernel_modules":len(kernel_modules)}
for key,value in expected.items():
    if actual[key]!=value: errors.append(f"{key}: expected {value}, found {actual[key]}")

# Agent quality
for p in agents:
    text=p.read_text()
    match=re.search(r"^---\n(.*?)\n---",text,re.S)
    if not match: errors.append(f"{p.relative_to(ROOT)} missing frontmatter"); continue
    fm=match.group(1)
    if not re.search(r"(?m)^model:\s+sonnet$",fm): errors.append(f"{p.relative_to(ROOT)} not pinned to Sonnet")
    effort=re.search(r"(?m)^effort:\s+(\w+)$",fm)
    if not effort or effort.group(1) not in {"high","xhigh","max"}: errors.append(f"{p.relative_to(ROOT)} below quality floor")
    if re.search(r"(?m)^model:\s+(haiku|fable|opus|inherit)",fm): errors.append(f"{p.relative_to(ROOT)} forbidden model route")

# Skills
for p in skills:
    text=p.read_text()
    if "Do not call a non-Sonnet model." not in text: errors.append(f"{p.relative_to(ROOT)} lacks model prohibition")
    contract=p.parent/"contract.json"
    if not contract.exists(): errors.append(f"{p.relative_to(ROOT)} missing contract")
    else:
        data=json.loads(contract.read_text())
        if data.get("model")!="claude-sonnet-5": errors.append(f"{contract.relative_to(ROOT)} wrong model")

# Hook targets
settings=json.loads((ROOT/"claude/settings/settings.apex.json").read_text())
for groups in settings.get("hooks",{}).values():
    for group in groups:
        for hook in group.get("hooks",[]):
            if hook.get("type")=="command":
                m=re.search(r'hooks/([^"]+)',hook["command"])
                if not m or not (ROOT/"claude/hooks"/m.group(1)).exists():
                    errors.append(f"missing hook target for {hook}")

# No hidden executable calls
for p in files("*.py")+files("*.sh"):
    if "legacy" in p.parts or "tests" in p.parts or p.name=="validate_package.py":
        continue
    text=p.read_text(errors="replace")
    forbidden=[
        "OPENAI"+"_"+"API_KEY",
        "ANTHROPIC"+"_"+"API_KEY",
        "--model "+"claude-"+"fable-5",
        "model: "+"haiku",
        "--dangerously-"+"skip-permissions",
    ]
    for token in forbidden:
        if token in text: errors.append(f"forbidden executable token {token} in {p.relative_to(ROOT)}")

# Tests
proc=subprocess.run([sys.executable,"-m","unittest","discover","-s",str(ROOT/"tests")],capture_output=True,text=True)
if proc.returncode: errors.append("unit tests failed:\n"+proc.stdout+proc.stderr)
raw_test_output=proc.stdout+proc.stderr
test_summary=("Ran 9 unit tests: OK" if proc.returncode==0 and "Ran 9 tests" in raw_test_output else raw_test_output[-4000:])

file_count=len([p for p in ROOT.rglob("*") if p.is_file() and "__pycache__" not in p.parts])
if file_count<500: errors.append(f"package unexpectedly small: {file_count} files")

report={
    "passed":not errors,
    "file_count":file_count,
    "counts":actual,
    "expected":expected,
    "unit_test_exit_code":proc.returncode,
    "unit_test_summary":test_summary,
    "warnings":warnings,
    "errors":errors,
}
print(json.dumps(report,indent=2))
raise SystemExit(0 if not errors else 1)
