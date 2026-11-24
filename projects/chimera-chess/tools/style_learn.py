"""Learned style heads from lawful named-player games (Wave E2). Corpus: lab/style_corpus/{Dubov,Shirov,Ivanchuk}.pgn
(CC0 Lichess broadcast exports, identity-audited). For each kept game, up to 8 positions where the player is to move
(ply 16..90, every 3rd) -> features of every legal move (tools/discovery_lab.feats: interpretable move features +
Maia3 log-prior) and the move the player actually chose. Split by GAME (sha256(Site+Round+White+Black)%5==0 held out).
Model: per-player listwise softmax over move features (numpy). Tests on held-out games:
 (1) attribution: for each held-out position, which player's head gives the played move the highest probability ->
     accuracy vs chance (1/3) and vs a style-free head trained on all players' pooled data (which cannot attribute);
 (2) move prediction: top-1 of own head vs pooled head vs Maia3 alone.
Usage: python tools/style_learn.py lab/style_corpus evidence/v12/style/style_learn.json [games_per_player]"""
import hashlib, io, json, math, sys
import chess, chess.pgn
import numpy as np
ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from tools.discovery_lab import feats, softmax_train, FEATS
from chimera.maia import MaiaPolicy
PLAYERS = ["Dubov", "Shirov", "Ivanchuk"]
def extract(path, player, maia, gmax):
    out = []; f = open(path); n = 0
    while n < gmax:
        g = chess.pgn.read_game(f)
        if g is None: break
        side = g.headers.get("CorpusPlayerSide")
        color = chess.WHITE if side == "White" else chess.BLACK
        key = hashlib.sha256((g.headers.get("Site", "") + g.headers.get("Round", "") + g.headers.get("White", "") + g.headers.get("Black", "")).encode()).hexdigest()
        held = int(key, 16) % 5 == 0
        b = g.board(); k = 0; n += 1
        for ply, mv in enumerate(g.mainline_moves()):
            if b.turn == color and 16 <= ply <= 90 and ply % 3 == 0 and k < 8 and b.legal_moves.count() > 2:
                probs, _ = maia.predict(b, 2600)
                legal = list(b.legal_moves)
                X = np.array([feats(b, m, math.log(max(probs.get(m.uci(), 1e-6), 1e-6)) / 10) for m in legal])
                out.append({"X": X, "y": legal.index(mv), "held": held, "game": key, "maia_top": legal.index(chess.Move.from_uci(max(probs, key=probs.get)))})
                k += 1
            b.push(mv)
    return out
def logp(w, X, y):
    z = X @ w; z = z - z.max(); return z[y] - math.log(np.exp(z).sum())
def main(src, out, gmax=300):
    maia = MaiaPolicy(); data = {}
    for p in PLAYERS:
        data[p] = extract(f"{src}/{p}.pgn", p, maia, gmax); print(p, len(data[p]), flush=True)
    heads = {p: softmax_train([(r["X"], r["y"]) for r in data[p] if not r["held"]], epochs=30) for p in PLAYERS}
    pooled = softmax_train([(r["X"], r["y"]) for p in PLAYERS for r in data[p] if not r["held"]], epochs=30)
    res = {"positions": {p: len(data[p]) for p in PLAYERS}, "heldout": {}, "weights": {p: dict(zip(FEATS, np.round(heads[p], 3).tolist())) for p in PLAYERS}}
    correct = total = 0; conf = {p: {q: 0 for q in PLAYERS} for p in PLAYERS}
    for p in PLAYERS:
        te = [r for r in data[p] if r["held"]]
        own1 = sum(int(np.argmax(r["X"] @ heads[p]) == r["y"]) for r in te)
        pool1 = sum(int(np.argmax(r["X"] @ pooled) == r["y"]) for r in te)
        maia1 = sum(int(r["maia_top"] == r["y"]) for r in te)
        for r in te:
            guess = max(PLAYERS, key=lambda q: logp(heads[q], r["X"], r["y"]))
            conf[p][guess] += 1; correct += guess == p; total += 1
        res["heldout"][p] = {"n": len(te), "own_head_top1": round(own1 / max(1, len(te)), 3), "pooled_head_top1": round(pool1 / max(1, len(te)), 3), "maia_top1": round(maia1 / max(1, len(te)), 3)}
    res["attribution_accuracy"] = round(correct / max(1, total), 4); res["attribution_chance"] = round(1 / 3, 4); res["attribution_n"] = total
    res["confusion"] = conf
    # binomial z vs chance
    p0 = 1 / 3; res["attribution_z_vs_chance"] = round((correct - total * p0) / math.sqrt(total * p0 * (1 - p0)), 2) if total else None
    json.dump(res, open(out, "w"), indent=1); print(json.dumps({k: v for k, v in res.items() if k != "weights"}, indent=1))
if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 300)
