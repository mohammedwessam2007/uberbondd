from __future__ import annotations
import hashlib, json, os, sys, time
from pathlib import Path
from typing import Any

# This file lives at <repo-root>/.claude/hooks/lib.py, so its own location
# (not the process's working directory) is an authoritative fallback for the
# repo root -- deriving from __file__ means running a hook from an arbitrary
# cwd (e.g. tools/elite-duo-apex/) can never resolve outside the repo.
_REPO_ROOT_FALLBACK = Path(__file__).resolve().parents[2]

def read_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    return json.loads(raw) if raw.strip() else {}

def project_dir(data: dict | None = None) -> Path:
    # CLAUDE_PROJECT_DIR is the session-wide, explicitly-supplied project root
    # and must win over data["cwd"] -- the latter is only the working directory
    # of the specific tool invocation (e.g. a Bash command that itself ran
    # `cd some/subdir`), so trusting it here would make persistent state
    # location depend on the process working directory of arbitrary tool calls.
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env).resolve()
    if data and data.get("cwd"):
        return Path(data["cwd"]).resolve()
    return _REPO_ROOT_FALLBACK

def apex_dir(data: dict | None = None) -> Path:
    p = project_dir(data) / ".claude" / "apex"
    p.mkdir(parents=True, exist_ok=True)
    return p

def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")

def event_row(data: dict, extra: dict | None = None) -> dict:
    row = {
        "at": time.time(),
        "event": data.get("hook_event_name"),
        "session_id": data.get("session_id"),
        "agent_id": data.get("agent_id"),
        "agent_type": data.get("agent_type"),
        "cwd": data.get("cwd"),
        "model": data.get("model"),
        "effort": (data.get("effort") or {}).get("level"),
    }
    if extra:
        row.update(extra)
    return row

def sha(value: Any) -> str:
    raw = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()

def emit(obj: dict) -> None:
    print(json.dumps(obj, ensure_ascii=False))

def block(reason: str) -> None:
    print(reason, file=sys.stderr)
    raise SystemExit(2)
