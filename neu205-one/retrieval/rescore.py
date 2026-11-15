#!/usr/bin/env python3
"""Re-score qwen_eval outputs with a stem-level lenient matcher alongside the strict phrase scorer.
lenient: every content token (bm25 stems) of at least one must_contain_any phrase appears in the answer.
Usage: rescore.py RESULT.json probes1.json [...]   (prints strict vs lenient counts)"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bm25 import tokens

res = json.load(open(sys.argv[1]))
P = {p["id"]: p for f in sys.argv[2:] for p in json.load(open(f))}
strict, lenient = {}, {}
for r in res["rows"]:
    p = P.get(r["id"])
    strict[r["verdict"]] = strict.get(r["verdict"], 0) + 1
    v = r["verdict"]
    if p and p["kind"] == "supported" and v == "wrong":
        a = set(tokens(r["answer"]))
        if any(tokens(m) and set(tokens(m)) <= a for m in p["must_contain_any"]):
            v = "correct"
    lenient[v] = lenient.get(v, 0) + 1
print(json.dumps({"file": os.path.basename(sys.argv[1]), "strict": strict, "lenient": lenient,
                  "ttft_p50_ms": res["summary"]["ttft_p50_ms"], "ttft_p95_ms": res["summary"]["ttft_p95_ms"]}))
