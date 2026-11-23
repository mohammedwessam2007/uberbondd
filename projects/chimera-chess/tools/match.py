"""Clocked, colour-balanced match harness with hard time forfeits and archived PGN.

Usage:
  python tools/match.py --a "chimera:Tactical" --b "sf:1600" --tc 40+0.4 --out evidence/m1 --jobs 3
Players:  chimera:<Mode>[:<Style>]   |   sf:<UCI_Elo>   |   sf:full
Each opening in OPENINGS is played twice with colours reversed. The harness owns the
clock: an engine that has not answered when its clock reaches zero loses on time.
Legality is enforced by python-chess on every move (independent of either engine).
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime
import json
import math
import os
import sys
import time

import chess
import chess.engine
import chess.pgn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SF = os.environ.get("SF", "/usr/games/stockfish")

# Twelve common, roughly balanced openings (move lists written for this harness).
OPENINGS = [
    ("Ruy Lopez", "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6"),
    ("Sicilian Najdorf", "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6"),
    ("French Winawer", "e2e4 e7e6 d2d4 d7d5 b1c3 f8b4"),
    ("Caro-Kann", "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5"),
    ("QGD", "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7"),
    ("Slav", "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4"),
    ("King's Indian", "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8"),
    ("Nimzo-Indian", "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3"),
    ("English", "c2c4 e7e5 b1c3 g8f6 g2g3 d7d5"),
    ("Italian", "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6"),
    ("Scandinavian", "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5"),
    ("London", "d2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3 c7c5"),
]


def open_player(spec: str):
    kind, *rest = spec.split(":")
    if kind == "chimera":
        eng = chess.engine.SimpleEngine.popen_uci([sys.executable, "-m", "chimera.uci"], cwd=ROOT)
        opts = {"MoveOverheadMs": 60}
        if rest:
            opts["Mode"] = rest[0]
        if len(rest) > 1:
            opts["Style"] = rest[1]
        eng.configure(opts)
        return eng
    if kind == "sf":
        eng = chess.engine.SimpleEngine.popen_uci(SF)
        opts = {"Threads": 1, "Hash": 16}
        if rest and rest[0] != "full":
            opts.update({"UCI_LimitStrength": True, "UCI_Elo": int(rest[0])})
        eng.configure(opts)
        return eng
    raise ValueError(spec)


def play_game(args):
    a, b, a_white, opening, tc, idx = args
    base, inc = (float(x) for x in tc.split("+"))
    white_spec, black_spec = (a, b) if a_white else (b, a)
    engines = {chess.WHITE: open_player(white_spec), chess.BLACK: open_player(black_spec)}
    board = chess.Board()
    for u in opening[1].split():
        board.push_uci(u)
    clock = {chess.WHITE: base, chess.BLACK: base}
    result, reason = None, None
    think = {chess.WHITE: [], chess.BLACK: []}
    try:
        for e in engines.values():
            e.protocol.send_line("ucinewgame")
        while not board.is_game_over(claim_draw=True) and board.ply() < 300:
            side = board.turn
            limit = chess.engine.Limit(white_clock=clock[chess.WHITE], black_clock=clock[chess.BLACK],
                                       white_inc=inc, black_inc=inc)
            t0 = time.perf_counter()
            try:
                res = engines[side].play(board, limit)
            except (chess.engine.EngineTerminatedError, TimeoutError, chess.engine.EngineError) as ex:
                result = "0-1" if side == chess.WHITE else "1-0"
                reason = f"engine failure: {type(ex).__name__}"
                break
            used = time.perf_counter() - t0
            think[side].append(round(used, 3))
            clock[side] -= used
            if clock[side] < 0:
                result = "0-1" if side == chess.WHITE else "1-0"
                reason = "time forfeit"
                break
            clock[side] += inc
            if res.move is None or res.move not in board.legal_moves:
                result = "0-1" if side == chess.WHITE else "1-0"
                reason = f"illegal move {res.move}"
                break
            board.push(res.move)
        if result is None:
            if board.ply() >= 300:
                result, reason = "1/2-1/2", "ply cap 300"
            else:
                outcome = board.outcome(claim_draw=True)
                result, reason = outcome.result(), outcome.termination.name
    finally:
        for e in engines.values():
            try:
                e.quit()
            except Exception:
                pass
    game = chess.pgn.Game()
    game.headers.update({"Event": "CHIMERA V7 match", "Site": "local container",
                         "Date": datetime.date.today().strftime("%Y.%m.%d"), "Round": str(idx),
                         "White": white_spec, "Black": black_spec, "Result": result,
                         "Opening": opening[0], "TimeControl": tc, "Termination": reason or ""})
    start = chess.Board()
    node = game
    for m in board.move_stack:
        node = node.add_variation(m)
    pgn = str(game)
    a_score = {"1-0": 1.0, "0-1": 0.0, "1/2-1/2": 0.5}[result]
    if not a_white:
        a_score = 1 - a_score
    mean_think = {("white" if c else "black"): (sum(v) / len(v) if v else 0) for c, v in think.items()}
    return {"idx": idx, "white": white_spec, "black": black_spec, "opening": opening[0],
            "result": result, "reason": reason, "plies": board.ply(), "a_score": a_score,
            "mean_think_s": mean_think, "pgn": pgn}


def elo_from_score(p: float, n: int):
    """Elo difference with a 95% interval from a per-game score (normal approximation)."""
    eps = 0.5 / max(n, 1)
    q = min(max(p, eps), 1 - eps)
    d = -400 * math.log10(1 / q - 1)
    se = math.sqrt(q * (1 - q) / n)
    lo, hi = min(max(q - 1.96 * se, eps), 1 - eps), min(max(q + 1.96 * se, eps), 1 - eps)
    return round(d), round(-400 * math.log10(1 / lo - 1)), round(-400 * math.log10(1 / hi - 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True)
    ap.add_argument("--b", required=True)
    ap.add_argument("--tc", default="40+0.4")
    ap.add_argument("--openings", type=int, default=len(OPENINGS))
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    tasks, idx = [], 0
    for op in OPENINGS[: a.openings]:
        for a_white in (True, False):
            idx += 1
            tasks.append((a.a, a.b, a_white, op, a.tc, idx))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    rows = []
    with cf.ProcessPoolExecutor(a.jobs) as ex:
        for r in ex.map(play_game, tasks):
            rows.append(r)
            print(f"{r['idx']:3d} {r['white']:>22} - {r['black']:<22} {r['result']:7} {r['reason']} {r['plies']}", flush=True)
    rows.sort(key=lambda r: r["idx"])
    with open(a.out + ".pgn", "w") as f:
        for r in rows:
            f.write(r["pgn"] + "\n\n")
    n = len(rows)
    s = sum(r["a_score"] for r in rows)
    w = sum(1 for r in rows if r["a_score"] == 1)
    l = sum(1 for r in rows if r["a_score"] == 0)
    summary = {"a": a.a, "b": a.b, "tc": a.tc, "games": n, "a_wins": w, "draws": n - w - l,
               "a_losses": l, "a_score": s, "a_pct": round(s / n, 4),
               "elo_diff_a_minus_b_95ci": elo_from_score(s / n, n),
               "time_forfeits": sum(1 for r in rows if r["reason"] == "time forfeit"),
               "illegal_or_failure": sum(1 for r in rows if r["reason"] and ("illegal" in r["reason"] or "failure" in r["reason"])),
               "stockfish": SF, "python": sys.version.split()[0], "chess": chess.__version__,
               "date_utc": datetime.datetime.utcnow().isoformat(timespec="seconds")}
    with open(a.out + ".jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps({k: v for k, v in r.items() if k != "pgn"}) + "\n")
    with open(a.out + ".summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
