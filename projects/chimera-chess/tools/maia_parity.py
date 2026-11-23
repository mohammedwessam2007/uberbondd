"""Compare chimera.maia (Python port) with the maia3-js 0.2.0 reference on the same ONNX file.
Reference output produced by tools/maia3js_parity.mjs (node, onnxruntime-node, chess.js)."""
import json, sys
import chess
sys.path.insert(0, __file__.rsplit("/tools/", 1)[0])
from chimera.maia import MaiaPolicy
ref = json.load(open(sys.argv[1]))
m = MaiaPolicy()
top1 = 0; maxdiff = 0.0; wdl_diff = 0.0
for r in ref:
    p, (w, d, l) = m.predict(chess.Board(r["fen"]), 2200, 2200)
    best = max(p, key=p.get)
    top1 += best == r["cands"][0][0]  # JS bestMove is temperature-sampled; compare argmax
    for u, q in r["cands"]:
        maxdiff = max(maxdiff, abs(p.get(u, 0) - q))
    wdl_diff = max(wdl_diff, abs(w - r["wdl"]["win"]), abs(l - r["wdl"]["loss"]))
out = {"positions": len(ref), "top1_agreement": top1, "max_abs_prob_diff_top5": maxdiff,
       "max_abs_wdl_diff": wdl_diff}
print(json.dumps(out))
json.dump(out, open(sys.argv[2], "w"), indent=1)
