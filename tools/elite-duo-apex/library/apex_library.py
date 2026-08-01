#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, re, shutil, sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "library" / "catalog.sqlite"

MANDATORY = [
    "00_START_HERE_V3.md",
    "01_EXECUTIVE_SPECIFICATION.md",
    "03_APEX_ARCHITECTURE.md",
    "04_QUALITY_WITHOUT_CHEAP_MODELS.md",
    "06_SECURITY_AND_APPROVALS.md",
    "07_OPERATING_CONSTITUTION.md",
    "kernels/ELITE_FUSION_MASTER.md",
    "kernels/FABLE_APEX_MASTER.md",
    "kernels/SOL_APEX_MASTER.md",
]

def terms(query: str) -> list[str]:
    return [x for x in re.findall(r"[a-z0-9][a-z0-9_-]+", query.lower()) if len(x) > 2]

def rows():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    out = [dict(x) for x in con.execute("select * from artifacts")]
    con.close()
    return out

def score(row: dict, query_terms: list[str]) -> float:
    title = row["title"].lower()
    path = row["path"].lower()
    keywords = row["keywords"].lower()
    text = row["preview"].lower()
    value = 0.0
    for term in query_terms:
        if term in title: value += 8
        if term in path: value += 5
        value += min(keywords.count(term), 3) * 2
        value += min(text.count(term), 4) * 0.5
    if row["category"] in {"domains","routes","skills","failure-playbooks","controls","benchmarks"}:
        value += 0.25
    return value

def search(query: str, limit: int = 30, category: str | None = None):
    q = terms(query)
    candidates = [r for r in rows() if not category or r["category"] == category]
    ranked = [(score(r,q),r) for r in candidates]
    ranked = [(s,r) for s,r in ranked if s > 0]
    ranked.sort(key=lambda x:(-x[0],x[1]["path"]))
    return [{"score":s,**r} for s,r in ranked[:limit]]

def materialize(query: str, output: Path, limit: int, max_bytes: int):
    output.mkdir(parents=True, exist_ok=True)
    selected = []
    seen = set()
    total = 0

    def add(rel: str, score_value: float, reason: str):
        nonlocal total
        if rel in seen:
            return
        src = ROOT / rel
        if not src.exists() or not src.is_file():
            return
        size = src.stat().st_size
        if selected and total + size > max_bytes:
            return
        dest = output / "sources" / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src,dest)
        selected.append({
            "path":rel,"bytes":size,"sha256":hashlib.sha256(src.read_bytes()).hexdigest(),
            "score":score_value,"reason":reason
        })
        seen.add(rel); total += size

    for rel in MANDATORY:
        add(rel,999.0,"mandatory apex constitution")

    results = search(query, limit=limit*3)
    categories = {}
    for result in results:
        if len(selected) >= limit + len(MANDATORY):
            break
        cat = result["category"]
        if categories.get(cat,0) >= max(3,limit//4):
            continue
        add(result["path"],result["score"],"deterministic query match")
        categories[cat] = categories.get(cat,0)+1

    context = ["# Mission Intelligence Pack",f"\n**Query:** {query}\n"]
    for item in selected:
        src = output/"sources"/item["path"]
        if src.suffix.lower() in {".md",".txt",".json",".csv",".yaml",".yml",".toml"}:
            text = src.read_text(encoding="utf-8",errors="replace")
            context.append(f"\n## {item['path']}\n\n```text\n{text[:18000]}\n```\n")
    (output/"PACK_CONTEXT.md").write_text("".join(context),encoding="utf-8")
    manifest = {
        "corpus":"ELITE_DUO_APEX_ULTRA_CORPUS_V3",
        "query":query,"selected_count":len(selected),"selected_bytes":total,
        "max_bytes":max_bytes,"files":selected
    }
    (output/"PACK_MANIFEST.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    found_terms = set()
    joined = " ".join((x["path"]+" "+x.get("keywords","")) for x in results).lower()
    for term in terms(query):
        if term in joined: found_terms.add(term)
    gaps = sorted(set(terms(query))-found_terms)
    (output/"PACK_GAPS.md").write_text("# Pack gaps\n\n"+("\n".join("- "+x for x in gaps) if gaps else "No unmatched query terms.")+"\n",encoding="utf-8")
    return manifest

def main():
    ap=argparse.ArgumentParser()
    sub=ap.add_subparsers(dest="cmd",required=True)
    sub.add_parser("stats")
    s=sub.add_parser("search"); s.add_argument("query"); s.add_argument("--limit",type=int,default=30); s.add_argument("--category")
    m=sub.add_parser("materialize"); m.add_argument("--query",required=True); m.add_argument("--output",required=True); m.add_argument("--limit",type=int,default=48); m.add_argument("--max-bytes",type=int,default=1_500_000)
    a=ap.parse_args()
    if a.cmd=="stats":
        con=sqlite3.connect(DB)
        total=con.execute("select count(*) from artifacts").fetchone()[0]
        cats=dict(con.execute("select category,count(*) from artifacts group by category").fetchall())
        bytes_=con.execute("select sum(bytes) from artifacts").fetchone()[0]
        con.close()
        print(json.dumps({"artifacts":total,"bytes":bytes_,"categories":cats},indent=2))
    elif a.cmd=="search":
        print(json.dumps(search(a.query,a.limit,a.category),indent=2))
    else:
        print(json.dumps(materialize(a.query,Path(a.output),a.limit,a.max_bytes),indent=2))
if __name__=="__main__":
    main()
