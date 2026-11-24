"""V13 B2 RootHint controls on the frozen V13 headroom suite (evidence/v13/headroom_v13.json), equal NODES (contention-proof).
Conditions (RootHint = searched first + extended 1 ply at the root; never forced):
  none        plain native V8
  maia        Maia3-5M (2200) top-1
  random      a uniformly random legal move (seeded by item id)
  learned     Sixth-Instinct student (lab/student_prior.json) top-1
  oracle      the oracle's best move (UPPER BOUND: shows how much the verifier can exploit a perfect proposal)
  gate038     #038 sparse activation: Maia hint only when Maia top-1 != native 2k-node move (else plain); compute charged
Metrics: solved (oracle loss <= 30cp at 1.5M deterministic oracle), mean loss; per split (dev/confirm). Game-level = item-level
(one item per source game by construction of the miner). Usage: python tools/roothint_controls.py suite out.json nodes"""
import hashlib, json, random, subprocess, sys
import chess
ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT); sys.path.insert(0, ROOT + "/tools")
from lab.oracle import Oracle
from chimera.maia import MaiaPolicy


def play(fen, nodes, hint=None):
    cmd = (f"setoption name RootHint value {hint}\n" if hint else "") + f"position fen {fen}\ngo nodes {nodes}\nisready\nquit\n"
    o = subprocess.run([ROOT + "/native/chimera"], input=cmd, capture_output=True, text=True).stdout
    return [l.split()[1] for l in o.splitlines() if l.startswith("bestmove")][-1]


def main(suite, out, nodes):
    S = json.load(open(suite)); o = Oracle(); maia = MaiaPolicy()
    from discovery_lab import load_student
    student = load_student(ROOT + "/lab/student_prior.json")
    rows = []
    for it in S["items"]:
        fen = it["fen"]; b = chess.Board(fen)
        probs, _ = maia.predict(b, 2200); mtop = max(probs, key=probs.get)
        rnd = random.Random(int(hashlib.sha256(it["id"].encode()).hexdigest(), 16)).choice(list(b.legal_moves)).uci()
        learned = student(b)[0].uci()
        v2k = play(fen, 2000)
        hints = {"none": None, "maia": mtop, "random": rnd, "learned": learned, "oracle": it["solution"]}
        r = {"id": it["id"], "split": it["split"], "solution": it["solution"], "maia_top1": mtop, "learned_top1": learned, "v8_2k": v2k}
        for k, h in hints.items():
            mv = play(fen, nodes, h); r[k] = {"move": mv, "loss": o.loss(fen, mv, 1500000), "hint_is_solution": h == it["solution"] if h else None}
        fire = mtop != v2k
        r["gate038"] = dict(r["maia"] if fire else r["none"]); r["gate038"]["fired"] = fire
        rows.append(r); print(it["id"], {k: r[k]["loss"] for k in list(hints) + ["gate038"]}, flush=True)
    o.close()
    conds = ["none", "maia", "random", "learned", "oracle", "gate038"]
    def summ(rs):
        return {c: {"solved": sum(x[c]["loss"] <= 30 for x in rs), "mean_loss": round(sum(x[c]["loss"] for x in rs) / len(rs), 1)} for c in conds} | {
            "n": len(rs), "hint_recall": {c: sum(x[c]["hint_is_solution"] for x in rs) for c in ("maia", "random", "learned")},
            "gate_fire_rate": round(sum(x["gate038"]["fired"] for x in rs) / len(rs), 3)}
    res = {"suite": suite, "nodes": nodes, "oracle_nodes": 1500000, "all": summ(rows),
           "dev": summ([r for r in rows if r["split"] == "dev"]), "confirm": summ([r for r in rows if r["split"] == "confirm"]), "rows": rows}
    # #038 random-routing control at the same fire rate (expected value over all items)
    fr = res["all"]["gate_fire_rate"]
    res["gate038_vs_random_routing_expected_loss"] = {"gate": res["all"]["gate038"]["mean_loss"],
                                                       "random_same_rate": round(sum(fr * r["maia"]["loss"] + (1 - fr) * r["none"]["loss"] for r in rows) / len(rows), 1),
                                                       "always_on": res["all"]["maia"]["mean_loss"], "always_off": res["all"]["none"]["mean_loss"],
                                                       "extra_compute": "gate: +2k-node probe per position; hint search itself is equal-node"}
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps({k: res[k] for k in ("all", "dev", "confirm", "gate038_vs_random_routing_expected_loss")}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
