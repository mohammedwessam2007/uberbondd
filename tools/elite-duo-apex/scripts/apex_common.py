from __future__ import annotations
import hashlib, json, os, shutil, subprocess, time
from pathlib import Path
from typing import Any

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def sha256_file(path: str | Path) -> str:
    return sha256_bytes(Path(path).read_bytes())

def read_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))

def write_json_atomic(path: str | Path, value: Any) -> Path:
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+".tmp")
    temp.write_text(json.dumps(value,indent=2,ensure_ascii=False,default=str)+"\n",encoding="utf-8")
    os.replace(temp,path)
    return path

def append_jsonl(path: str | Path, value: Any) -> None:
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("a",encoding="utf-8") as f:
        f.write(json.dumps(value,ensure_ascii=False,default=str)+"\n")

def timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())

def command_exists(name: str) -> bool:
    return shutil.which(name) is not None

def run(command: list[str], cwd: str | Path | None=None, timeout: int | None=None) -> dict:
    started=time.time()
    proc=subprocess.run(command,cwd=cwd,text=True,capture_output=True,timeout=timeout)
    return {
        "command":command,"cwd":str(cwd) if cwd else None,"exit_code":proc.returncode,
        "stdout":proc.stdout,"stderr":proc.stderr,"duration_seconds":time.time()-started
    }
