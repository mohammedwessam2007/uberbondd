#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("schema"); ap.add_argument("document")
    a=ap.parse_args()
    schema=json.loads(Path(a.schema).read_text())
    doc=json.loads(Path(a.document).read_text())
    missing=[x for x in schema.get("required",[]) if x not in doc]
    errors=[]
    for name,prop in schema.get("properties",{}).items():
        if name not in doc: continue
        if "const" in prop and doc[name]!=prop["const"]: errors.append(f"{name} must equal {prop['const']}")
        if "enum" in prop and doc[name] not in prop["enum"]: errors.append(f"{name} not in enum")
        if prop.get("type")=="array" and not isinstance(doc[name],list): errors.append(f"{name} must be array")
        if prop.get("type")=="object" and not isinstance(doc[name],dict): errors.append(f"{name} must be object")
        if prop.get("maxItems") is not None and isinstance(doc[name],list) and len(doc[name])>prop["maxItems"]: errors.append(f"{name} exceeds maxItems")
    errors=[f"missing {x}" for x in missing]+errors
    print(json.dumps({"passed":not errors,"errors":errors},indent=2))
    raise SystemExit(0 if not errors else 1)
if __name__=="__main__": main()
