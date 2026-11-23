"""Host latency benchmark: requested vs measured decision time, and Maia3-5M forward time.
HOST ONLY. These are not OnePlus 15 numbers. Usage: python tools/latency_bench.py out.json"""
import json
import platform
import resource
import statistics
import sys
import time

import chess

sys.path.insert(0, __file__.rsplit("/tools/", 1)[0])
from chimera.creative import CreativeEngine  # noqa: E402

FENS = [chess.STARTING_FEN,
        "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        "r2q1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R2Q1RK1 w - - 0 10",
        "8/5pk1/6p1/3P4/5P2/6P1/5K2/8 w - - 0 40",
        "2r3k1/pp3ppp/4p3/3pP3/3P4/P4N2/1P3PPP/2R3K1 w - - 0 25"]


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]


def main(out, trials=10):
    res = {"host": platform.platform(), "python": platform.python_version(),
           "processor": platform.processor(), "note": "HOST measurements only; no device data"}
    for mode in ("Tactical", "Creative"):
        for req in (0.08, 0.5, 1.0):
            xs = []
            for fen in FENS:
                for _ in range(trials // len(FENS) + 1):
                    ce = CreativeEngine("chimera", enabled=mode == "Creative")
                    t = time.perf_counter()
                    ce.choose(chess.Board(fen), req)
                    xs.append((time.perf_counter() - t) * 1000)
            res[f"{mode}_{int(req*1000)}ms"] = {"requested_ms": req * 1000, "n": len(xs),
                                               "p50": round(pct(xs, 50), 1), "p95": round(pct(xs, 95), 1),
                                               "p99": round(pct(xs, 99), 1), "max": round(max(xs), 1),
                                               "mean": round(statistics.mean(xs), 1)}
    try:
        from chimera.maia import MaiaPolicy
        t = time.perf_counter()
        m = MaiaPolicy()
        load = (time.perf_counter() - t) * 1000
        xs = []
        for fen in FENS * 6:
            t = time.perf_counter()
            m.predict(chess.Board(fen))
            xs.append((time.perf_counter() - t) * 1000)
        res["maia3_5m_forward"] = {"load_ms": round(load, 1), "n": len(xs), "p50": round(pct(xs, 50), 2),
                                   "p95": round(pct(xs, 95), 2), "p99": round(pct(xs, 99), 2)}
    except Exception as e:  # model not fetched
        res["maia3_5m_forward"] = f"unavailable: {e}"
    res["peak_rss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
