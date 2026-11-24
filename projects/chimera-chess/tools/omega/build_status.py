"""Builds the CODEX220 engineering ledger from evidence (never from typed numbers):
canon/PDF_REQUIREMENTS_220.json, canon/PDF_REQUIREMENTS_CROSSWALK.json, canon/PDF_CONTRADICTIONS.json,
canon/IMPLEMENTATION_STATUS.json, canon/PDF_BENCHMARKS.json.
Usage: python tools/omega/build_status.py"""
import glob, hashlib, inspect, json, os, sys
sys.path.insert(0, ".")
from chimera.omega import motifs as M
from chimera.omega.controls import CONTROLS

SRC = json.load(open("canon/PDF_REQUIREMENTS_220_SOURCE.json"))
TITLE_FIX = {20: "Tempo Development Bias", 24: "Clearance Sacrifice Opener", 37: "Maia-3 Policy Query", 82: "Mate-In-N Delay Obfuscator",
             89: "Pawn-Chain Wedge Lock", 111: "Deep Sacrifice Verifier", 112: "Counter-Attack Preemptor", 129: "Visual Blindspot Bias",
             148: "Game-Review Confusion Bias", 149: "Dual Stockfish+Maia-3 Worker Bridge", 150: "Candidate Pruning", 153: "Clock Scaler",
             169: "Modular Registry", 172: "Terminal-Motif Trajectory", 192: "Castling Checkmate Override", 197: "Two-Time Repetition Fake-Out",
             201: "En-Passant Mate Override", 207: "Queen Conveyor Sacrifice"}


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def traces():
    out = []
    for f in sorted(glob.glob("evidence/omega/**/trace*.jsonl", recursive=True)):
        out += [json.loads(l) for l in open(f) if l.strip()]
    return out


def main():
    T = traces()
    fired, deep_fired, chosen, influence, vetoed = {}, {}, {}, {}, {}
    for t in T:
        for c in t.get("candidates", []):
            for k in c["bd"]:
                n = int(k[1:]); fired[n] = fired.get(n, 0) + 1
                if c.get("deep"):
                    deep_fired[n] = deep_fired.get(n, 0) + 1
        ch = t.get("chosen", {})
        for k, v in ch.get("bd", {}).items():
            n = int(k[1:]); chosen[n] = chosen.get(n, 0) + 1
        arb = t.get("arbitration", {})
        if arb.get("result", "").startswith("motif"):
            lose = arb.get("loser_motifs") or {}
            for k, v in (arb.get("winner_motifs") or {}).items():
                if v > lose.get(k, 0):                 # this motif contributed more to the winner than to the objective best
                    n = int(k[1:]); influence[n] = influence.get(n, 0) + 1
        for v in t.get("vetoed", []):
            vetoed[v["move"]] = 1
    fx = json.load(open("tests/fixtures/omega_fixtures.json")) if os.path.isfile("tests/fixtures/omega_fixtures.json") else {"positives": {}, "negatives": {}}
    dedicated = {186, 192, 201, 215, 220, 144, 214}
    recs, counts = [], {}
    for r in SRC["records"]:
        n = int(r["original_id"][1:])
        r = dict(r)
        if n in TITLE_FIX:
            r["title_correction"] = {"parsed": r["original_title"], "corrected": TITLE_FIX[n], "reason": "pdftotext column interleaving; raw text preserved"}
            r["original_title"] = TITLE_FIX[n]
        if n in M.REGISTRY:
            m = M.REGISTRY[n]
            cls = "MOTIF"
            impl = {"file": "chimera/omega/motifs.py", "function": m.fn.__name__, "line": inspect.getsourcelines(m.fn)[1],
                    "weight": m.weight, "needs": sorted(m.needs), "level": m.level, "group": m.group,
                    "engineering_interpretation": (inspect.getdoc(m.fn) or inspect.getsource(m.fn).split("\n")[0].split("#", 1)[-1]).strip()[:300]}
        elif n in CONTROLS:
            cls = "CONTROL"
            name, where, test = CONTROLS[n]
            impl = {"file": "chimera/omega (see where)", "where": where, "test": test}
        else:
            cls = "RESTRICTED_ARCHIVE"
            impl = {"restriction": M.RESTRICTED[n], "executable": False}
        pos = len(fx["positives"].get(str(n), [])); neg = len(fx["negatives"].get(str(n), []))
        st = {
            "preserved": True, "specified": True, "class": cls,
            "implemented": cls != "RESTRICTED_ARCHIVE",
            "unit_tested": (cls == "MOTIF" and (pos > 0 or n in dedicated)) or (cls == "CONTROL" and "tests." in CONTROLS[n][2]),
            "positive_fixtures": pos, "negative_fixtures": neg,
            "integration_fired_on_candidates": fired.get(n, 0), "fired_on_deep_candidates": deep_fired.get(n, 0),
            "on_chosen_move": chosen.get(n, 0), "decision_influence_events": influence.get(n, 0),
            "integration_tested": fired.get(n, 0) > 0 or (cls == "CONTROL" and n in (29, 150, 151, 165, 180, 149, 159)),
            "experimentally_supported": False, "validated": False, "archived": cls == "RESTRICTED_ARCHIVE",
        }
        r.update({"engineering": impl, "status": st,
                  "acceptance_tests": {"positive": "tests/test_omega.py FixtureReplay (real-game fixtures)" if pos else None,
                                       "negative": "tests/test_omega.py FixtureReplay.test_negatives_silent" if neg else None,
                                       "colour_reversal": "tests/test_omega.py FixtureReplay.test_colour_reversal_invariance" if pos and cls == "MOTIF" and not (M.REGISTRY[n].needs & {"replies", "maia", "history", "clock"}) else None,
                                       "integration": "evidence/omega/**/trace*.jsonl" if fired.get(n) else None},
                  "limitations": _limit(n, cls, pos, fired.get(n, 0))})
        recs.append(r)
        for k, v in st.items():
            if isinstance(v, bool) and v:
                counts[k] = counts.get(k, 0) + 1
    counts["decision_influence_ids"] = sum(1 for r in recs if r["status"]["decision_influence_events"] > 0)
    counts["on_chosen_move_ids"] = sum(1 for r in recs if r["status"]["on_chosen_move"] > 0)
    counts["total"] = len(recs)
    json.dump({"schema": "codex220-requirements-2", "source_sha256": SRC["source_sha256"], "records": recs}, open("canon/PDF_REQUIREMENTS_220.json", "w"), indent=1, ensure_ascii=False)
    json.dump({"schema": "codex220-status-1", "computed_from": ["chimera/omega/motifs.py", "chimera/omega/controls.py", "tests/fixtures/omega_fixtures.json", "evidence/omega/**/trace*.jsonl"],
               "trace_moves": len(T), "counts": counts,
               "never_combined_into_one_percentage": True,
               "per_id": {r["id"]: r["status"] for r in recs}}, open("canon/IMPLEMENTATION_STATUS.json", "w"), indent=1)
    print(json.dumps(counts))


def _limit(n, cls, pos, fired):
    if cls == "RESTRICTED_ARCHIVE":
        return "Not implemented by design (restriction); original text preserved verbatim."
    out = []
    if cls == "MOTIF" and not pos:
        out.append("no real-game positive fixture yet (did not fire in the traced games); recognition untested on real data")
    if cls == "MOTIF" and not fired:
        out.append("never fired in integrated play so far")
    if cls == "MOTIF" and M.REGISTRY[n].level == "RECOGNITION" and M.REGISTRY[n].group in ("mate", "cage", "sacrifice"):
        out.append("recognition-level predicate; construction relies on #172 potentials and search")
    return "; ".join(out) or "see engineering_interpretation"


if __name__ == "__main__":
    main()
