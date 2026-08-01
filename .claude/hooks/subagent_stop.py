#!/usr/bin/env python3
from lib import *
data=read_input()
apex=apex_dir(data)
append_jsonl(apex/"agents.jsonl",event_row(data,{
    "status":"stopped",
    "last_message_sha256":sha(data.get("last_assistant_message",""))
}))
agent=str(data.get("agent_type",""))
required={
 "fable-execution-architect":["FABLE_EXECUTION_MODEL.json","FABLE_STATE_MACHINE.json"],
 "sol-decision-architect":["SOL_DECISION_CONTRACT.json","SOL_ACCEPTANCE_TESTS.md"],
 "evidence-compiler":["EVIDENCE_PACKET.json"],
 "fable-independent-reviewer":["FABLE_REVIEW_FINDINGS.json"],
 "sol-independent-reviewer":["SOL_REVIEW_FINDINGS.json"],
 "apex-judge":["FINAL_VERDICT.json"],
}
missing=[name for name in required.get(agent,[]) if not (project_dir(data)/name).exists()]
if missing:
    emit({"decision":"block","reason":f"Required agent artifacts are missing: {missing}. Produce and validate them before stopping."})
