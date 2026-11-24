"""V13 human-cognition / regret probes (#005 #007 #009 #012 #013 #014 #037 #081 #086 #120 #137 #154).
Input: lab/human_v13.jsonl (one position per Lichess 2013-01 game, seed 13; see lab/human_dataset.py). Each probe is a
distinct, pre-declared mechanism test with its own evidence file evidence/v13/probes/<ID>.json. Units are games (one
position per game), so the position-level bootstrap IS the game-level bootstrap. Human error := oracle loss >= 100 cp
(oracle_score - oracle_human, 300k nodes, deterministic oracle). Pre-registration: evidence/v13/PREREG_probes_human.md.
Usage: python lab/probes_human.py lab/human_v13.jsonl evidence/v13/probes"""
import json, math, os, random, sys
import chess

ERR = 100


def load(p):
    rows = [json.loads(l) for l in open(p) if l.strip()]
    out = []
    for r in rows:
        if abs(r["oracle_score"]) >= 90000:   # mate scores: loss ill-defined at cp scale
            continue
        r["loss"] = max(0, min(1000, r["oracle_score"] - r["oracle_human"]))
        r["err"] = int(r["loss"] >= ERR)
        out.append(r)
    return out


def auc(scores, labels):
    pos = [s for s, l in zip(scores, labels) if l]; neg = [s for s, l in zip(scores, labels) if not l]
    if not pos or not neg:
        return None
    w = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return w / (len(pos) * len(neg))


def boot(fn, rows, k=1000, seed=13):
    rng = random.Random(seed); vals = []
    for _ in range(k):
        s = [rows[rng.randrange(len(rows))] for _ in rows]
        v = fn(s)
        if v is not None:
            vals.append(v)
    vals.sort()
    if not vals:
        return None
    return [round(vals[int(.025 * len(vals))], 4), round(vals[int(.975 * len(vals)) - 1], 4)]


def rank(xs):
    o = sorted(range(len(xs)), key=lambda i: xs[i]); r = [0.0] * len(xs); i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and xs[o[j + 1]] == xs[o[i]]:
            j += 1
        for k in range(i, j + 1):
            r[o[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = rank(a), rank(b); n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    c = sum((x - ma) * (y - mb) for x, y in zip(ra, rb)); va = sum((x - ma) ** 2 for x in ra); vb = sum((y - mb) ** 2 for y in rb)
    return c / math.sqrt(va * vb) if va and vb else None


# ---------- features (all computed from stored, deterministic oracle data) ----------
def n_good(r, tol=50):
    m = max(r["move_scores_60k"].values()); return sum(v >= m - tol for v in r["move_scores_60k"].values())


def fragility(r, tol=150):
    m = max(r["move_scores_60k"].values()); v = list(r["move_scores_60k"].values()); return sum(x < m - tol for x in v) / len(v)


def instability(r):
    return abs(max(r["move_scores_60k"].values()) - r["oracle_score"])


def board(r):
    return chess.Board(r["fen"])


def is_forcing(b, u):
    m = chess.Move.from_uci(u); return b.is_capture(m) or b.gives_check(m)


def is_backward(b, u):
    m = chess.Move.from_uci(u); d = chess.square_rank(m.to_square) - chess.square_rank(m.from_square)
    return (d < 0) if b.turn == chess.WHITE else (d > 0)


def rate(rows, f):
    s = [r for r in rows if f(r)]; return (round(sum(r["err"] for r in s) / len(s), 4) if s else None), len(s)


def diff_rate(f):
    def g(rows):
        a = [r["err"] for r in rows if f(r)]; b = [r["err"] for r in rows if not f(r)]
        return (sum(a) / len(a) - sum(b) / len(b)) if a and b else None
    return g


def logloss(p, y):
    p = min(max(p, 1e-4), 1 - 1e-4); return -(y * math.log(p) + (1 - y) * math.log(1 - p))


def split(rows, salt):
    import hashlib
    tr = [r for r in rows if int(hashlib.sha256((salt + r["site"]).encode()).hexdigest(), 16) % 2 == 0]
    te = [r for r in rows if r not in tr]
    return tr, te


def logistic(Xtr, ytr, l2=1e-2, it=400, lr=0.1):
    import numpy as np
    X = np.c_[np.ones(len(Xtr)), np.array(Xtr, float)]; y = np.array(ytr, float)
    mu, sd = X[:, 1:].mean(0), X[:, 1:].std(0) + 1e-9
    X[:, 1:] = (X[:, 1:] - mu) / sd; w = np.zeros(X.shape[1])
    for _ in range(it):
        p = 1 / (1 + np.exp(-X @ w)); w -= lr * (X.T @ (p - y) / len(y) + l2 * np.r_[0, w[1:]])
    def pred(Xs):
        Z = np.c_[np.ones(len(Xs)), (np.array(Xs, float) - mu) / sd]; return list(1 / (1 + np.exp(-Z @ w)))
    return pred


def maia_entropy(r):
    ps = [p for _, p in r["maia_top5"]]; rest = max(1e-9, 1 - sum(ps)); n = max(1, len(r["move_scores_60k"]) - 5)
    return -sum(p * math.log(p) for p in ps if p > 0) - rest * math.log(rest / n)


def fronts(r):
    """#013: count distinct fronts for the side to move: king threat (>=3 attacked squares in enemy king zone),
    passed pawn on rank >=5, pawn lever available (a pawn can capture a pawn), plus the same for the opponent (defence fronts)."""
    b = board(r); c = 0
    for side in (b.turn, not b.turn):
        ek = b.king(not side)
        if ek is not None and sum(1 for z in chess.SquareSet(chess.BB_KING_ATTACKS[ek]) if b.attackers(side, z)) >= 3:
            c += 1
        for sq in b.pieces(chess.PAWN, side):
            f, rk = chess.square_file(sq), chess.square_rank(sq)
            ahead = [s for s in b.pieces(chess.PAWN, not side) if abs(chess.square_file(s) - f) <= 1 and ((chess.square_rank(s) > rk) if side else (chess.square_rank(s) < rk))]
            if not ahead and ((rk >= 4) if side else (rk <= 3)):
                c += 1; break
        if any(b.piece_type_at(t) == chess.PAWN and b.color_at(t) != side for sq in b.pieces(chess.PAWN, side) for t in b.attacks(sq)):
            c += 1
    return c


def motif(b, u):
    m = chess.Move.from_uci(u); p = b.piece_type_at(m.from_square)
    if is_backward(b, u): return "backward"
    if b.is_capture(m): return "capture"
    if b.gives_check(m): return "check"
    return {chess.PAWN: "quiet-pawn", chess.KNIGHT: "quiet-knight", chess.KING: "quiet-king"}.get(p, "quiet-slider")


def move_class(b, u):
    m = chess.Move.from_uci(u); return (b.piece_type_at(m.from_square), int(b.is_capture(m)), int(b.gives_check(m)))


def probes(rows):
    R = {}
    labels = [r["err"] for r in rows]
    tr, te = split(rows, "v13probe")
    # #154 ENGINE decision quality vs independently labelled complexity at controlled budgets (2k/20k/200k nodes)
    def eloss(r, nn): return max(0, min(1000, r["oracle_score"] - r[f"oracle_v8_{nn}"]))
    ng = [n_good(r) for r in rows]
    by = {}
    for nn in ("2000", "20000", "200000"):
        by[nn] = {"spearman_ngood_vs_engine_loss": spearman(ng, [eloss(r, nn) for r in rows]),
                  "ci95": boot(lambda s, nn=nn: spearman([n_good(r) for r in s], [eloss(r, nn) for r in s]), rows),
                  "baseline_spearman_branching": spearman([len(r["move_scores_60k"]) for r in rows], [eloss(r, nn) for r in rows])}
    sharp = [r for r in rows if n_good(r) == 1]; broad = [r for r in rows if n_good(r) >= 4]
    R["154"] = {"mechanism": "native V8 decision loss (deterministic oracle) vs complexity label n_good (moves within 50cp of best, 60k oracle) at 2k/20k/200k nodes; baseline proxy = branching factor",
                "by_budget": by, "decay_slope_sharp_minus_broad_mean_loss": {nn: round((sum(eloss(r, nn) for r in sharp) / max(1, len(sharp))) - (sum(eloss(r, nn) for r in broad) / max(1, len(broad))), 1) for nn in by},
                "n_sharp": len(sharp), "n_broad": len(broad), "prediction": "negative Spearman at every budget; |slope| shrinking with budget"}
    # #014 atlas -> held-out difficulty prediction vs simple Maia-entropy baseline
    def cell(r):
        band = 0 if r["mover_elo"] < 1700 else 1 if r["mover_elo"] < 2000 else 2
        cb = 0 if n_good(r) == 1 else 1 if n_good(r) <= 3 else 2
        return (band, cb, min(2, int(fragility(r) * 3)))
    tab = {}
    for r in tr:
        a = tab.setdefault(cell(r), [1, 2]); a[0] += r["err"]; a[1] += 1   # Laplace-smoothed
    base = (sum(r["err"] for r in tr) + 1) / (len(tr) + 2)
    atlas_pred = lambda r: tab[cell(r)][0] / tab[cell(r)][1] if cell(r) in tab else base
    R["014"] = {"mechanism": "difficulty atlas keyed by rating band x complexity class x fragility tercile, fit on half the games; held-out AUC vs Maia-entropy baseline (no clocks available)",
                "heldout_auc_atlas": auc([atlas_pred(r) for r in te], [r["err"] for r in te]),
                "heldout_auc_entropy": auc([maia_entropy(r) for r in te], [r["err"] for r in te]),
                "ci95_atlas_minus_entropy": boot(lambda s: (auc([atlas_pred(r) for r in s], [r["err"] for r in s]) or 0) - (auc([maia_entropy(r) for r in s], [r["err"] for r in s]) or 0), te),
                "cells": {str(k): {"n": v[1] - 2, "err_rate_smoothed": round(v[0] / v[1], 3)} for k, v in sorted(tab.items())}, "n_train": len(tr), "n_test": len(te)}
    # #081 shallow-to-deep value change (60k max-move score vs 300k score) predicting human error, vs static uncertainty (|eval|)
    ins = [instability(r) for r in rows]
    R["081"] = {"mechanism": "fragility oracle: shallow(60k)-to-deep(300k) value change as error predictor; baseline = static |eval| (static uncertainty proxy)",
                "auc": auc(ins, labels), "ci95": boot(lambda s: auc([instability(r) for r in s], [r["err"] for r in s]), rows),
                "baseline_auc_abs_eval": auc([-abs(r["oracle_score"]) for r in rows], labels)}
    # #086 legal-reply value dispersion predicting turning points (human error) vs policy entropy and eval volatility proxy
    fr = [fragility(r) for r in rows]
    import statistics
    disp = [statistics.pstdev(list(r["move_scores_60k"].values())) for r in rows]
    R["086"] = {"mechanism": "instability cartographer: dispersion of legal-move values (share losing >150cp; stdev) predicting held-out turning points (human errors) vs Maia policy entropy",
                "auc_share_losing": auc(fr, labels), "ci95_share_losing": boot(lambda s: auc([fragility(r) for r in s], [r["err"] for r in s]), rows),
                "auc_stdev": auc(disp, labels), "baseline_auc_policy_entropy": auc([maia_entropy(r) for r in rows], labels),
                "ci95_share_minus_entropy": boot(lambda s: (auc([fragility(r) for r in s], [r["err"] for r in s]) or 0) - (auc([maia_entropy(r) for r in s], [r["err"] for r in s]) or 0), rows)}
    # #009 population reply distribution: held-out log loss of the HUMAN move under (a) class-frequency model (b) Maia3
    cnt = {}; tot = 0
    for r in tr:
        b = board(r); k = move_class(b, r["human"]); cnt[k] = cnt.get(k, 0) + 1; tot += 1
    def lp_freq(r):
        b = board(r); cls = [move_class(b, m.uci()) for m in b.legal_moves]; k = move_class(b, r["human"])
        mass = {c: (cnt.get(c, 0) + 0.5) for c in set(cls)}; Z = sum(mass.values())
        return math.log(mass[k] / Z / cls.count(k))
    def lp_maia(r):
        d = dict(r["maia_top5"]); n = len(r["move_scores_60k"])
        return math.log(d[r["human"]]) if r["human"] in d else math.log(max(1e-6, 1 - sum(d.values())) / max(1, n - 5))
    def lp_unif(r): return -math.log(len(r["move_scores_60k"]))
    ll = lambda f, s: -sum(f(r) for r in s) / len(s)
    R["009"] = {"mechanism": "population-level reply model: held-out log loss of the actual human move under a move-class frequency model (fit on train games) vs Maia3 vs uniform",
                "heldout_logloss": {"uniform": round(ll(lp_unif, te), 4), "class_frequency": round(ll(lp_freq, te), 4), "maia3": round(ll(lp_maia, te), 4)},
                "ci95_maia_minus_freq": boot(lambda s: ll(lp_maia, s) - ll(lp_freq, s), te), "maia_top1_accuracy_heldout": round(sum(r["human"] == r["maia_top5"][0][0] for r in te) / len(te), 3),
                "note": "Maia probability outside its stored top-5 is spread uniformly (conservative for Maia); population-level only, no individual profiling"}
    # #012 false-safety (retrospective labelled data): quiet, most-human-likely move that loses >=100cp; control for strength by rating-matched comparison
    def fs(r):
        b = board(r); m = r["maia_top5"][0][0]
        return (not is_forcing(b, m)) and (r["oracle_score"] - r["oracle_maia_top1"] >= ERR)
    sub = [r for r in rows if fs(r)]
    def matched_diff(s):
        out = []
        for band in (0, 1, 2):
            f = lambda r: (0 if r["mover_elo"] < 1700 else 1 if r["mover_elo"] < 2000 else 2) == band
            a = [r["err"] for r in s if f(r) and fs(r)]; c = [r["err"] for r in s if f(r) and not fs(r)]
            if a and c: out.append((len(a), sum(a) / len(a) - sum(c) / len(c)))
        return sum(n * d for n, d in out) / sum(n for n, _ in out) if out else None
    R["012"] = {"mechanism": "false safety: positions whose most human-likely move (Maia) is quiet yet loses >=100cp; rating-band-matched human error-rate difference (retrospective labelled data, no player experiments)",
                "n_false_safety": len(sub), "err_rate_false_safety": rate(rows, fs)[0], "err_rate_other": rate(rows, lambda r: not fs(r))[0],
                "rating_matched_diff": matched_diff(rows), "ci95": boot(matched_diff, rows),
                "human_played_the_trap": sum(r["human"] == r["maia_top5"][0][0] for r in sub)}
    # #013 multi-front interaction beyond value, branching and skill (no move-agreement proxy)
    def X13(r, with_f=True):
        x = [abs(r["oracle_score"]), len(r["move_scores_60k"]), r["mover_elo"]]
        return x + [fronts(r)] if with_f else x
    p0 = logistic([X13(r, False) for r in tr], [r["err"] for r in tr]); p1 = logistic([X13(r) for r in tr], [r["err"] for r in tr])
    y = [r["err"] for r in te]; a0 = auc(p0([X13(r, False) for r in te]), y); a1 = auc(p1([X13(r) for r in te]), y)
    R["013"] = {"mechanism": "attention conflict: count of distinct fronts (king threats, advanced passers, pawn levers, both sides) added to a logistic error model with |value|, branching and rating; held-out AUC gain",
                "heldout_auc_base": a0, "heldout_auc_with_fronts": a1, "gain": (a1 - a0) if a0 and a1 else None,
                "fronts_distribution": {k: sum(fronts(r) == k for r in rows) for k in range(7)},
                "err_rate_by_fronts": {k: rate(rows, lambda r, k=k: fronts(r) == k)[0] for k in range(7)}}
    # #137 aggregate motif difficulty classifier (motif of the BEST move) vs complexity-matched baseline
    mt = {}
    for r in tr:
        k = motif(board(r), r["oracle_best"]); a = mt.setdefault(k, [1, 2]); a[0] += r["err"]; a[1] += 1
    mp = lambda r: (lambda k: mt[k][0] / mt[k][1] if k in mt else base)(motif(board(r), r["oracle_best"]))
    pc = logistic([[n_good(r), fragility(r)] for r in tr], [r["err"] for r in tr]); pm = logistic([[n_good(r), fragility(r), mp(r)] for r in tr], [r["err"] for r in tr])
    a0 = auc(pc([[n_good(r), fragility(r)] for r in te]), y); a1 = auc(pm([[n_good(r), fragility(r), mp(r)] for r in te]), y)
    R["137"] = {"mechanism": "aggregate motif-difficulty classifier: per-motif error rate of the best move (backward/capture/check/quiet-pawn/knight/king/slider), fit on train games, added to a complexity-matched logistic",
                "motif_train_rates": {k: round(v[0] / v[1], 3) for k, v in mt.items()}, "motif_train_n": {k: v[1] - 2 for k, v in mt.items()},
                "heldout_auc_complexity_only": a0, "heldout_auc_with_motif": a1, "gain": (a1 - a0) if a0 and a1 else None}
    # #007 disagreement records: persist (policy=Maia top1, search=V8@200k, shallow=V8@2k), adjudicate with independent teacher (oracle)
    dis = lambda r: r["maia_top5"][0][0] != r["v8"]["200000"]
    dl = [r for r in rows if dis(r)]
    R["007"] = {"mechanism": "disagreement laboratory: persisted policy/search/shallow-search disagreement records adjudicated by the independent deterministic oracle",
                "n_records": len(dl), "share_positions_with_disagreement": round(len(dl) / len(rows), 3),
                "adjudication": {"search_better": sum(r["oracle_v8_200000"] > r["oracle_maia_top1"] for r in dl), "policy_better": sum(r["oracle_maia_top1"] > r["oracle_v8_200000"] for r in dl),
                                 "tie": sum(r["oracle_maia_top1"] == r["oracle_v8_200000"] for r in dl)},
                "human_err_disagree_vs_agree": [rate(rows, dis)[0], rate(rows, lambda r: not dis(r))[0]], "ci95_diff": boot(diff_rate(dis), rows),
                "not_done": "training on disagreements vs random sample (needs a learner on these records)"}
    # #037 tiny regret estimator from cheap features (no oracle at inference) vs single shallow-flip baseline
    def cheapX(r): return [int(r["v8"]["2000"] != r["v8"]["200000"]), int(r["v8"]["20000"] != r["v8"]["200000"]), r["maia_top5"][0][1], maia_entropy(r), len(r["move_scores_60k"]), int(r["human"] != r["v8"]["2000"])]
    pr = logistic([cheapX(r) for r in tr], [r["err"] for r in tr])
    ph = pr([cheapX(r) for r in te])
    R["037"] = {"mechanism": "instant regret estimator: 7-weight logistic on cheap signals (V8 2k/20k vs 200k flips, Maia top-1 prob and entropy, branching, human!=V8@2k) predicting deep-oracle regret>=100 on held-out games",
                "heldout_auc_tiny": auc(ph, y), "heldout_auc_single_flip": auc([cheapX(r)[0] for r in te], y),
                "catastrophic_false_accept_rate": round(sum(1 for p, r in zip(ph, te) if p < 0.2 and r["loss"] >= 300) / max(1, sum(r["loss"] >= 300 for r in te)), 3)}
    # #005 WDL regret calibration
    def ev_maia(r):
        w, d, l = r["maia_wdl"]; return w + 0.5 * d
    def ev_or(r):
        return 1 / (1 + 10 ** (-r["oracle_score"] / 400))
    res = [r["result_mover"] for r in rows]
    def brier(f, s): return sum((f(r) - r["result_mover"]) ** 2 for r in s) / len(s)
    bins = {}
    for r in rows:
        k = min(4, int(ev_maia(r) * 5)); b = bins.setdefault(k, [0, 0.0, 0.0]); b[0] += 1; b[1] += ev_maia(r); b[2] += r["result_mover"]
    wregret = lambda r: ev_or(r) - 1 / (1 + 10 ** (-r["oracle_human"] / 400))
    R["005"] = {"mechanism": "oracle of regret: calibration of WDL estimates against realised results (Maia WDL vs oracle logistic vs constant) and WDL-regret vs raw cp loss as predictors of losing the game",
                "brier_maia": round(brier(ev_maia, rows), 4), "brier_oracle_logistic": round(brier(ev_or, rows), 4),
                "brier_constant_mean": round(sum((sum(res) / len(res) - y_) ** 2 for y_ in res) / len(res), 4),
                "ci95_brier_maia_minus_oracle": boot(lambda s: brier(ev_maia, s) - brier(ev_or, s), rows),
                "reliability_maia": {f"{k/5:.1f}-{(k+1)/5:.1f}": {"n": v[0], "pred": round(v[1] / v[0], 3), "obs": round(v[2] / v[0], 3)} for k, v in sorted(bins.items())},
                "auc_lost_game_wdl_regret": auc([wregret(r) for r in rows], [int(r["result_mover"] == 0) for r in rows]),
                "auc_lost_game_cp_loss": auc([r["loss"] for r in rows], [int(r["result_mover"] == 0) for r in rows])}
    # #120 two-world critic
    best = None
    for a in [x / 10 for x in range(11)]:
        L = brier(lambda r, a=a: a * ev_maia(r) + (1 - a) * ev_or(r), tr)
        if best is None or L < best[0]:
            best = (L, a)
    a = best[1]; mix = lambda r: a * ev_maia(r) + (1 - a) * ev_or(r)
    R["120"] = {"mechanism": "two-world critic: best-defence head (oracle logistic) and human-response head (Maia WDL) combined with weight fit on half the games; held-out Brier vs one-head baselines",
                "alpha_fit": a, "heldout_brier_mix": round(brier(mix, te), 4), "heldout_brier_oracle": round(brier(ev_or, te), 4),
                "heldout_brier_maia": round(brier(ev_maia, te), 4), "ci95_mix_minus_oracle_heldout": boot(lambda s: brier(mix, s) - brier(ev_or, s), te)}
    # #131 only-move diagnostic: number of objectively viable moves (within 50cp, 60k oracle) vs human error
    R["131"] = {"mechanism": "cognitive-overload diagnostic: count of objectively viable moves for the side to move (within 50cp of best); human error rate by count; Spearman(count, human loss)",
                "spearman_viable_vs_human_loss": spearman(ng, [r["loss"] for r in rows]), "ci95": boot(lambda s: spearman([n_good(r) for r in s], [r["loss"] for r in s]), rows),
                "err_rate_only_move": rate(rows, lambda r: n_good(r) == 1), "err_rate_2_3": rate(rows, lambda r: 2 <= n_good(r) <= 3), "err_rate_4plus": rate(rows, lambda r: n_good(r) >= 4),
                "note": "source formula for the original 'torture metric' is incomplete; this is the diagnostic only (no use against opponents)"}
    # #123 sparse high-leverage deliberation gate on the V8 budget ladder (2k/20k/200k nodes)
    cost = {"2000": 2, "20000": 20, "200000": 200}
    def pol_always(r, nn): return eloss(r, nn), cost[nn]
    def pol_gate(r):   # cheap probe: 2k and 20k; escalate to 200k only if they disagree
        return (eloss(r, "200000"), 222) if r["v8"]["2000"] != r["v8"]["20000"] else (eloss(r, "20000"), 22)
    gl = [pol_gate(r) for r in rows]; rate_esc = sum(c == 222 for _, c in gl) / len(rows)
    rr = random.Random(123); rnd = [(eloss(r, "200000"), 222) if rr.random() < rate_esc else (eloss(r, "20000"), 22) for r in rows]
    mean = lambda xs: round(sum(x for x, _ in xs) / len(xs), 2); mc = lambda xs: round(sum(c for _, c in xs) / len(xs), 1)
    R["123"] = {"mechanism": "deliberation gate: escalate from 20k to 200k nodes only when the 2k and 20k decisions disagree; compared at matched escalation rate to random routing and to always-20k / always-200k (oracle-scored V8 decisions)",
                "escalation_rate": round(rate_esc, 3),
                "mean_loss": {"always_20k": mean([pol_always(r, "20000") for r in rows]), "always_200k": mean([pol_always(r, "200000") for r in rows]), "gate": mean(gl), "random_same_rate": mean(rnd)},
                "mean_cost_knodes": {"always_20k": 20, "always_200k": 200, "gate": mc(gl), "random_same_rate": mc(rnd)},
                "ci95_gate_minus_random": boot(lambda s: sum((eloss(r, "200000") if r["v8"]["2000"] != r["v8"]["20000"] else eloss(r, "20000")) for r in s) / len(s)
                                                - sum(eloss(r, "200000") * rate_esc + eloss(r, "20000") * (1 - rate_esc) for r in s) / len(s), rows),
                "share_of_200k_gain_recovered": None}
    g20, g200, gg = R["123"]["mean_loss"]["always_20k"], R["123"]["mean_loss"]["always_200k"], R["123"]["mean_loss"]["gate"]
    R["123"]["share_of_200k_gain_recovered"] = round((g20 - gg) / (g20 - g200), 3) if g20 != g200 else None
    return R


def main(src, outdir):
    rows = load(src)
    R = probes(rows)
    os.makedirs(outdir, exist_ok=True)
    for k, v in R.items():
        v.update({"id": k, "n_games": len(rows), "error_threshold_cp": ERR, "source": src, "base_error_rate": round(sum(r["err"] for r in rows) / len(rows), 4)})
        json.dump(v, open(os.path.join(outdir, f"{k}.json"), "w"), indent=1)
    print(json.dumps({k: {x: v[x] for x in v if not isinstance(v[x], dict) or x in ("heldout_logloss","adjudication","by_budget")} for k, v in R.items()}, indent=0))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
