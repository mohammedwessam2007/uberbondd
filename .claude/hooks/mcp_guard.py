#!/usr/bin/env python3
from lib import *
data=read_input()
tool=str(data.get("tool_name",""))
if tool.startswith("mcp__"):
    allow=(project_dir(data)/".claude/apex/ALLOW_MCP").exists()
    if not allow:
        emit({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"MCP is disabled in the default ELITE DUO APEX profile. Explicitly approve and create .claude/apex/ALLOW_MCP."}})
