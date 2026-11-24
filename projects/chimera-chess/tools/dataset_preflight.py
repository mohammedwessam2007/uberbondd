"""Dataset preflight audit (Wave A1). Exit code 1 = training must not start.
Checks: side-to-move balance; label perspective consistency (per side to move, label correlates positively with the
handcrafted EvalV2 static eval which is side-to-move relative); split disjointness by game id and by position key;
duplicate rate; phase/material diversity; mate/extreme-label rate; required columns.
Usage: python tools/dataset_preflight.py <dataset.tsv.gz> [more shards ...] --report out.json"""
import gzip
import json
import sys
from collections import Counter, defaultdict

import numpy as np

VALS = {"p": 1, "n": 3, "b": 3, "r": 5, "q": 9}


def phase_bucket(board):
    m = sum(VALS.get(c.lower(), 0) for c in board if c.isalpha() and c.lower() != "k")
    return "opening/middle" if m >= 50 else "middlegame" if m >= 30 else "late-middle" if m >= 15 else "endgame"


def main(paths, report):
    rows = []
    for p in paths:
        with gzip.open(p, "rt") as f:
            head = next(f).rstrip("\n").split("\t")
            for line in f:
                rows.append(dict(zip(head, line.rstrip("\n").split("\t"))))
    n = len(rows)
    fails, notes = [], []
    req = {"fen", "score_stm_cp", "split", "game"}
    if not req <= set(rows[0]):
        fails.append(f"missing columns {req - set(rows[0])}")
    stm = Counter(r["fen"].split()[1] for r in rows)
    w_share = stm["w"] / max(n, 1)
    if not 0.35 <= w_share <= 0.65:
        fails.append(f"side-to-move imbalance: white share {w_share:.3f}")
    y = np.array([float(r["score_stm_cp"]) for r in rows])
    if "evalv2_static" in rows[0]:
        e = np.array([float(r["evalv2_static"]) for r in rows])
        for s in ("w", "b"):
            k = np.array([r["fen"].split()[1] == s for r in rows]) & (np.abs(y) < 1000)
            if k.sum() > 100:
                c = float(np.corrcoef(y[k], e[k])[0, 1])
                notes.append(f"corr(label, EvalV2 static | stm={s}) = {c:.3f} (n={int(k.sum())})")
                if c < 0.2:
                    fails.append(f"label perspective suspicious for stm={s}: corr {c:.3f}")
    games = defaultdict(set)
    keys = defaultdict(set)
    for r in rows:
        games[r["game"]].add(r["split"])
        keys[" ".join(r["fen"].split()[:4])].add(r["split"])
    leak_g = sum(1 for v in games.values() if len(v) > 1)
    leak_p = sum(1 for v in keys.values() if len(v) > 1)
    if leak_g:
        fails.append(f"{leak_g} games appear in more than one split")
    if leak_p:
        fails.append(f"{leak_p} identical positions appear in more than one split")
    dup = n - len(keys)
    ph = Counter(phase_bucket(r["fen"].split()[0]) for r in rows)
    if min(ph.values()) < 0.03 * n or len(ph) < 4:
        fails.append(f"phase coverage too thin: {dict(ph)}")
    ext = float(np.mean(np.abs(y) >= 2000))
    if ext > 0.15:
        fails.append(f"extreme/mate-clipped labels {ext:.3f} > 0.15")
    out = {"files": paths, "rows": n, "stm": dict(stm), "white_share": round(w_share, 4),
           "label_mean": round(float(y.mean()), 1), "label_mean_by_stm": {s: round(float(y[[r['fen'].split()[1] == s for r in rows]].mean()), 1) for s in stm},
           "splits": dict(Counter(r["split"] for r in rows)), "games": len(games), "game_split_leaks": leak_g,
           "position_split_leaks": leak_p, "duplicate_rows": dup, "phase": dict(ph), "extreme_label_rate": round(ext, 4),
           "notes": notes, "FAILS": fails, "verdict": "PASS" if not fails else "FAIL"}
    json.dump(out, open(report, "w"), indent=1)
    print(json.dumps(out, indent=1))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    a = sys.argv[1:]
    rep = a[a.index("--report") + 1] if "--report" in a else "/dev/stdout"
    files = [x for x in a if x.endswith(".gz")]
    main(files, rep)
