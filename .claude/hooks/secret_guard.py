#!/usr/bin/env python3
import re
from lib import *
import secret_paths

data=read_input()
tool=data.get("tool_name","")
inp=data.get("tool_input") or {}
text=json.dumps(inp).lower()
secret_patterns=[
    # Environment-file paths moved to the token-aware classifier in
    # secret_paths.py; a substring regex here could not tell a bare relative
    # path from an absolute one and let the former through.
    r"id_rsa",r"id_ed25519",r"\.pem\b",r"\.p12\b",r"\.pfx\b",
    r"credentials\.json",r"service-account",r"seed[_ -]?phrase",r"mnemonic",
]
GUARDED_TOOLS={"Read","Edit","Write","Bash","Grep"}

APPROVAL_NOTE=("Create .claude/apex/ALLOW_SECRET_ACCESS only after explicit "
               "user approval.")

def decide(tool_name, tool_input, blob):
    """Return a block reason, or None to allow.

    Pure function of its arguments so the policy can be tested directly, without
    spawning a hook process or constructing a fake session payload.
    """
    if tool_name not in GUARDED_TOOLS:
        return None
    blocked, _allowed, ambiguous = secret_paths.scan(tool_input)
    if blocked:
        return ("ELITE DUO blocked access to a protected configuration file: %s. %s"
                % (", ".join(sorted(blocked)), APPROVAL_NOTE))
    if ambiguous:
        return ("ELITE DUO blocked a command it could not parse that appears to "
                "reference a protected configuration file. Rewrite it "
                "unambiguously, or approve access. %s" % APPROVAL_NOTE)
    if any(re.search(p,blob) for p in secret_patterns):
        return ("ELITE DUO blocked access to a likely secret-bearing path. %s"
                % APPROVAL_NOTE)
    return None

reason=decide(tool,inp,text)
if reason and not (project_dir(data)/".claude/apex/ALLOW_SECRET_ACCESS").exists():
    block(reason)
