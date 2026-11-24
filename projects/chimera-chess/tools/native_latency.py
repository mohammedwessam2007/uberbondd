"""Native-core latency contract test (HOST ONLY, not phone data).
Cold load: process spawn -> uciok -> readyok, 10 repeats (separate from move latency).
Warm moves: 'go movetime <req>' on 120 distinct positions (held-out suite + hard suite), wall-clock
from 'go' write to 'bestmove' read, after an 'isready' sync. Reports P50/P95/P99/max and violations.
Usage: python tools/native_latency.py out.json [req_ms ...]"""
import json
import os
import platform
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.path.join(ROOT, "native", "chimera")


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]


class E:
    def __init__(self):
        self.p = subprocess.Popen([BIN], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)

    def send(self, s):
        self.p.stdin.write(s + "\n"); self.p.stdin.flush()

    def until(self, pre):
        while True:
            l = self.p.stdout.readline()
            if not l:
                raise EOFError
            if l.startswith(pre):
                return l


def main(out, reqs):
    fens = [i["fen"] for i in json.load(open(os.path.join(ROOT, "evidence/v8/heldout_suite.json")))["items"]]
    fens += [i["fen"] for i in json.load(open(os.path.join(ROOT, "evidence/v8/hard_sac_suite.json")))["items"]]
    fens = fens[:120]
    res = {"host": platform.platform(), "cpu_count": os.cpu_count(), "positions": len(fens),
           "note": "HOST ONLY. PHONE NOT TESTED. Other processes may share the CPU (see 'concurrent_load').",
           "concurrent_load": os.getloadavg()}
    cold = []
    for _ in range(10):
        t0 = time.perf_counter()
        e = E(); e.send("uci"); e.until("uciok"); e.send("isready"); e.until("readyok")
        cold.append((time.perf_counter() - t0) * 1000)
        e.send("quit"); e.p.wait()
    res["cold_load_ms"] = {"p50": round(pct(cold, 50), 1), "max": round(max(cold), 1)}
    e = E(); e.send("uci"); e.until("uciok")
    for req in reqs:
        xs = []
        for fen in fens:
            e.send(f"position fen {fen}"); e.send("isready"); e.until("readyok")
            t0 = time.perf_counter(); e.send(f"go movetime {req}"); e.until("bestmove")
            xs.append((time.perf_counter() - t0) * 1000)
        res[f"movetime_{req}"] = {"requested_ms": req, "n": len(xs), "p50": round(pct(xs, 50), 2), "p95": round(pct(xs, 95), 2),
                                  "p99": round(pct(xs, 99), 2), "max": round(max(xs), 2),
                                  "violations_over_request": sum(x > req for x in xs)}
    e.send("quit")
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], [int(x) for x in sys.argv[2:]] or [80, 250, 1000])
