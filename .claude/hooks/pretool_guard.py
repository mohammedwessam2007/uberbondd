#!/usr/bin/env python3
import re
from lib import *
data=read_input()
tool=data.get("tool_name","")
inp=data.get("tool_input") or {}
if tool!="Bash":
    raise SystemExit(0)
cmd=str(inp.get("command",""))
normalized="\n".join(" ".join(line.lower().split()) for line in cmd.split("\n"))
danger=[
    r"(^|[;&|]\s*)rm\s+-rf\s+/(?:\s|$)",
    r"\bgit\s+push\b[^;&|\n]*\b(origin\s+)?main\b",
    r"\bgit\s+push\b[^;&|\n]*\b(origin\s+)?master\b",
    r"\bgit\s+push\b[^;&|\n]*(--force\b|(?<![\w-])-f\b)",
    r"\bgit\s+push\b[^;&|\n]*--force-with-lease\b",
    r"\bgit\s+push\b[^;&|\n]*--mirror\b",
    r"\bgit\s+push\b[^;&|\n]*--all\b",
    r"\bgit\s+push\b[^;&|\n]*(--delete\b|(?<![\w-])-d\b)",
    r"\bgit\s+push\b[^;&|\n]*\s:\S",
    r"\bgit\s+push\b[^;&|\n]*--tags\b",
    r"\bgit\s+push\b[^;&|\n]*refs/tags/",
    r"\bgh\s+pr\s+merge\b",
    r"\bnpm\s+publish\b",
    r"\bpnpm\s+publish\b",
    r"\byarn\s+publish\b",
    r"\bdocker\s+push\b",
    r"\bkubectl\s+(apply|delete|replace|patch)\b",
    r"\bterraform\s+(apply|destroy)\b",
    r"\bvercel\s+(deploy|promote)\b",
    r"\baws\s+.*\b(delete|terminate|put-|create-)\b",
    r"\bcurl\b.*\s(-x\s+(post|put|patch|delete)|--request\s+(post|put|patch|delete)|-d\s|--data)",
    r"\bssh\b",
    r"\bscp\b",
    r"\bchmod\s+-r\s+777\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
]
for pattern in danger:
    if re.search(pattern,normalized):
        block(f"ELITE DUO blocked an external, destructive, publishing, merge, or production-like command: {cmd}")
append_jsonl(apex_dir(data)/"pretool.jsonl",event_row(data,{"tool":tool,"input_sha256":sha(inp)}))
