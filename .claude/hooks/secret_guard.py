#!/usr/bin/env python3
import re
from lib import *
data=read_input()
tool=data.get("tool_name","")
inp=data.get("tool_input") or {}
text=json.dumps(inp).lower()
secret_patterns=[
    r"(^|[/\\])\.env($|[./\\\"])",
    r"id_rsa",r"id_ed25519",r"\.pem\b",r"\.p12\b",r"\.pfx\b",
    r"credentials\.json",r"service-account",r"seed[_ -]?phrase",r"mnemonic",
]
if tool in {"Read","Edit","Write","Bash","Grep"} and any(re.search(p,text) for p in secret_patterns):
    allow=(project_dir(data)/".claude/apex/ALLOW_SECRET_ACCESS").exists()
    if not allow:
        block("ELITE DUO blocked access to a likely secret-bearing path. Create .claude/apex/ALLOW_SECRET_ACCESS only after explicit user approval.")
