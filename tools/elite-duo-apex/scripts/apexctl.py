#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path
from apex_common import read_json, write_json_atomic, timestamp

STATES=["INGEST","ARCHITECT","EXECUTE","VERIFY","REPAIR","DELIVER","STOP","BLOCKED_USER_INPUT"]

def init(project: Path, mission_id: str, intent: str, goal: str):
    apex=project/".claude/apex"; apex.mkdir(parents=True,exist_ok=True)
    state={
        "mission_id":mission_id,"state":"INGEST","intent":intent,"goal":goal,
        "completed":[],"blockers":[],"modified_files":[],"tests":[],
        "external_actions":[],"next_action":"Compile MISSION_CONTRACT.json","updated_at":timestamp()
    }
    write_json_atomic(apex/"APEX_STATE.json",state)
    print(apex/"APEX_STATE.json")

def transition(project: Path, target: str, next_action: str):
    path=project/".claude/apex/APEX_STATE.json"
    state=read_json(path)
    if target not in STATES: raise SystemExit(f"Invalid state: {target}")
    state["state"]=target; state["next_action"]=next_action; state["updated_at"]=timestamp()
    write_json_atomic(path,state); print(json.dumps(state,indent=2))

def status(project: Path):
    print((project/".claude/apex/APEX_STATE.json").read_text())

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--project",default=".")
    sub=ap.add_subparsers(dest="cmd",required=True)
    i=sub.add_parser("init"); i.add_argument("--mission-id",default=f"mission-{int(time.time())}"); i.add_argument("--intent",required=True); i.add_argument("--goal",required=True)
    t=sub.add_parser("transition"); t.add_argument("state",choices=STATES); t.add_argument("--next-action",required=True)
    sub.add_parser("status")
    a=ap.parse_args(); project=Path(a.project).resolve()
    if a.cmd=="init": init(project,a.mission_id,a.intent,a.goal)
    elif a.cmd=="transition": transition(project,a.state,a.next_action)
    else: status(project)
if __name__=="__main__": main()
