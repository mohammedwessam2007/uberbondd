"""Whole-game cognition metrics from match traces (tools/match.py >= V8 writes per-move PV traces).
For the engine named by --who:
  reply_prediction: share of its moves whose predicted opponent reply (PV[1]) was actually played (#063/#115)
  plan_continuation: when the opponent DID play the predicted reply, share of next moves equal to PV[2] (#073/#095)
  surprise_repair: when the opponent deviated, mean |score change| and share of next moves that leave the old PV
Usage: python tools/trace_analysis.py evidence/v8/matches/X.jsonl native:2 out.json"""
import json
import sys


def main(path, who, out):
    pred_n = pred_hit = cont_n = cont_hit = surp_n = 0
    surp_delta = []
    surp_replan = 0
    games = 0
    for line in open(path):
        g = json.loads(line)
        tr = g.get("trace")
        if not tr:
            continue
        games += 1
        me = "w" if g["white"] == who else "b"
        for i, t in enumerate(tr):
            if t["side"] != me or not t["pred_reply"] or i + 2 >= len(tr):
                continue
            reply, nxt = tr[i + 1], tr[i + 2]
            pred_n += 1
            if reply["move"] == t["pred_reply"]:
                pred_hit += 1
                if len(t["pv"]) > 2:
                    cont_n += 1
                    cont_hit += nxt["move"] == t["pv"][2]
            else:
                surp_n += 1
                if t["score_cp"] is not None and nxt["score_cp"] is not None and abs(t["score_cp"]) < 5000 and abs(nxt["score_cp"]) < 5000:
                    surp_delta.append(abs(nxt["score_cp"] - t["score_cp"]))
                surp_replan += len(t["pv"]) > 2 and nxt["move"] != t["pv"][2]
    res = {"games": games, "engine": who, "moves_with_prediction": pred_n,
           "reply_prediction_rate": round(pred_hit / max(pred_n, 1), 3),
           "plan_continuation_rate_when_predicted": round(cont_hit / max(cont_n, 1), 3), "plan_continuation_n": cont_n,
           "surprises": surp_n,
           "mean_abs_score_shift_after_surprise_cp": round(sum(surp_delta) / max(len(surp_delta), 1), 1),
           "replan_rate_after_surprise": round(surp_replan / max(surp_n, 1), 3),
           "note": "Search-PV based state, not a learned memory. Baseline for any future learned plan-state head."}
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
