#!/usr/bin/env python3
"""Score the NEU205 engine on independently written book probes.
Usage: probe_eval.py KB.json OUT.json probes1.json [probes2.json ...] [--split test|dev|all]
Supported item correct  = engine ANSWERs and reply (speech or on-screen text) contains any must_contain_any phrase.
Supported item wrong    = engine ANSWERs without any expected phrase (counted as a FALSE answer).
Supported item missed   = CLARIFY / NOT_FOUND.
Unsupported item correct= engine does NOT answer; answering = FALSE (fabrication risk) answer.
Page agreement is reported separately (cited page within +-1 of an expected page)."""
import json, os, re, subprocess, sys, tempfile, collections
args = [a for a in sys.argv[1:] if not a.startswith("--split")]
split = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--split=")), "test")
kb, out, files = args[0], args[1], args[2:]
items = []
for f in files:
    items += [x for x in json.load(open(f)) if split == "all" or x["split"] == split]
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as t:
    t.write("\n".join(x["question"].replace("\n", " ") for x in items) + "\n")
res = subprocess.run(["java", "-cp", os.path.join(here, "build/core"), "ai.neu205.one.core.tools.BatchAnswer", kb, t.name],
                     capture_output=True, text=True).stdout.rstrip("\n").split("\n")
assert len(res) == len(items), (len(res), len(items))
norm = lambda s: re.sub(r"\s+", " ", s.lower().replace("&", "and"))
rows, c = [], collections.Counter()
bycat = collections.defaultdict(collections.Counter)
for x, line in zip(items, res):
    kind, cite, speech, display = (line.split("\t") + ["", "", ""])[:4]
    m = re.search(r"p\.(\d+)", cite)
    page = int(m.group(1)) if m else None
    text = norm(speech + " " + display)
    if x["kind"] == "supported":
        hit = any(norm(p) in text for p in x["must_contain_any"])
        v = "correct" if kind == "ANSWER" and hit else ("wrong" if kind == "ANSWER" else "missed")
        page_ok = page is not None and any(abs(page - p) <= 1 for p in x["pages"])
    else:
        v = "correct_refusal" if kind != "ANSWER" else "false_answer_unsupported"
        page_ok = None
    c[v] += 1
    bycat[x.get("category", "?") + ("" if x["kind"] == "supported" else "/unsup")][v] += 1
    rows.append({**{k: x[k] for k in ("id", "kind", "question", "pages", "category")}, "verdict": v, "engine_kind": kind,
                 "cited_page": page, "page_ok": page_ok, "speech": speech[:300]})
sup = [r for r in rows if r["kind"] == "supported"]
uns = [r for r in rows if r["kind"] == "unsupported"]
summary = {"split": split, "n_supported": len(sup), "n_unsupported": len(uns),
           "supported_correct": c["correct"], "supported_wrong": c["wrong"], "supported_missed": c["missed"],
           "supported_accuracy": round(c["correct"] / max(1, len(sup)), 4),
           "page_agreement_when_correct": round(sum(1 for r in sup if r["verdict"] == "correct" and r["page_ok"]) / max(1, c["correct"]), 4),
           "unsupported_correct_refusals": c["correct_refusal"], "unsupported_false_answers": c["false_answer_unsupported"],
           "by_category": {k: dict(v) for k, v in sorted(bycat.items())}}
json.dump({"summary": summary, "rows": rows}, open(out, "w"), indent=1)
print(json.dumps({k: v for k, v in summary.items() if k != "by_category"}))
