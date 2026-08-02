#!/usr/bin/env python3
from __future__ import annotations
import argparse, csv, hashlib, json, os, re, sqlite3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LIB=ROOT/"library"
SKIP={"catalog.sqlite","catalog.jsonl","catalog.csv","CATALOG_STATS.json"}

def category(path: Path) -> str:
    parts=path.parts
    if "library" in parts:
        i=parts.index("library")
        return parts[i+1] if len(parts)>i+1 else "library"
    return parts[0] if parts else "root"

def title(path: Path, text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "): return line[2:].strip()
    return path.stem.replace("_"," ").replace("-"," ").title()

def build(output_dir: Path) -> dict:
    output_dir.mkdir(parents=True,exist_ok=True)
    rows=[]
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or "__pycache__" in path.parts or path.name in SKIP or path.suffix.lower() in {".zip",".sqlite"}:
            continue
        rel=path.relative_to(ROOT)
        raw=path.read_bytes()
        text=raw.decode("utf-8",errors="replace")
        words=re.findall(r"[a-z0-9][a-z0-9_-]+",(" ".join(rel.parts)+" "+text[:5000]).lower())
        keywords=" ".join(sorted(set(words))[:500])
        rows.append({
            "path":str(rel),"category":category(rel),"title":title(rel,text),
            "bytes":len(raw),"sha256":hashlib.sha256(raw).hexdigest(),
            "keywords":keywords,"preview":text[:3000]
        })
    with (output_dir/"catalog.jsonl").open("w",encoding="utf-8") as f:
        for row in rows: f.write(json.dumps(row,ensure_ascii=False)+"\n")
    fields=["path","category","title","bytes","sha256","keywords"]
    with (output_dir/"catalog.csv").open("w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore");w.writeheader();w.writerows(rows)
    db=output_dir/"catalog.sqlite"
    if db.exists(): db.unlink()
    con=sqlite3.connect(db)
    con.execute("create table artifacts(path text primary key,category text,title text,bytes integer,sha256 text,keywords text,preview text)")
    con.executemany("insert into artifacts values(:path,:category,:title,:bytes,:sha256,:keywords,:preview)",rows)
    con.execute("create index idx_artifacts_category on artifacts(category)")
    con.execute("create index idx_artifacts_title on artifacts(title)")
    con.commit()
    stats={"artifacts":len(rows),"bytes":sum(x["bytes"] for x in rows),"categories":{}}
    for row in rows: stats["categories"][row["category"]]=stats["categories"].get(row["category"],0)+1
    (output_dir/"CATALOG_STATS.json").write_text(json.dumps(stats,indent=2)+"\n")
    con.close()
    return stats

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output-dir",default=None,
        help="Directory to write catalog.jsonl/csv/sqlite/CATALOG_STATS.json into. "
             "Defaults to library/ (or $APEX_LIBRARY_CATALOG_DIR if set) -- pass a "
             "temporary directory for validation/test runs so nothing generated "
             "lands in the tracked tree.")
    args=ap.parse_args()
    out=Path(args.output_dir) if args.output_dir else Path(os.environ.get("APEX_LIBRARY_CATALOG_DIR",LIB))
    stats=build(out)
    print(json.dumps(stats,indent=2))
if __name__=="__main__":
    main()
