"""Autonomous style calibration toward the PDF's character (document A §6.1 / §6.3), recorded round by round.
Each round: 10 games PDF_STYLE vs sf:2685 at 60+0.6 (isolated, nothing else running) -> tools/omega/pdf_characteristics.py ->
multiplicative update of each category's style weights toward its PDF per-game target, and of the anti-draw contempt toward the
~17% draw rate. The soundness gate (floor/max_cp_drop/Skeptic) is NEVER changed by calibration.
Usage: python tools/omega/calibrate.py rounds [start_style.json]"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "evidence", "omega", "calibration")
KNOBS = {  # category -> style-weight keys it controls
    "tal_sacrifices": ["sacrifice"], "maia_panic_traps": ["human"], "multipin_battery_nets": ["tactic"],
    "underpromotion_fakeouts": ["#186", "#194", "#203", "#197", "#176"], "zero_retreat_ep_setups": ["#209", "#172", "#201"],
    "judas_zombie_0check": ["#215", "#217", "#220"]}
TARGET = {"tal_sacrifices": 4.2, "maia_panic_traps": 3.8, "multipin_battery_nets": 5.1, "underpromotion_fakeouts": 2.4,
          "zero_retreat_ep_setups": 3.1, "judas_zombie_0check": 2.8}


def run_round(k, style):
    sp = os.path.join(OUT, f"style_round{k}.json"); json.dump(style, open(sp, "w"), indent=1)
    tr = f"evidence/omega/calibration/trace_round{k}.jsonl"; outp = f"evidence/omega/calibration/round{k}_vs_sf2685"
    if not os.path.isfile(os.path.join(ROOT, outp + ".summary.json")):
        subprocess.run([sys.executable, "tools/match.py", "--a", f"omega:PDF_STYLE_V5:trace={tr}:style=evidence/omega/calibration/style_round{k}.json",
                        "--b", "sf:2685", "--tc", "60+0.6", "--openings", "5", "--jobs", "2", "--out", outp], cwd=ROOT,
                       stdout=open(os.path.join(OUT, f"round{k}.log"), "w"), stderr=subprocess.STDOUT)
    r = subprocess.run([sys.executable, "tools/omega/pdf_characteristics.py", os.path.join(OUT, f"characteristics_round{k}.json"), tr, outp + ".summary.json"],
                       cwd=ROOT, capture_output=True, text=True)
    return json.load(open(os.path.join(OUT, f"characteristics_round{k}.json")))


def update(style, ch):
    gs = dict(style["group_scale"])
    for cat, keys in KNOBS.items():
        m = ch["per_game"][cat]
        f = max(0.5, min(2.0, ((TARGET[cat] + 0.3) / (m + 0.3)) ** 0.7))
        for kk in keys:
            gs[kk] = round(min(8.0, max(0.1, gs.get(kk, 1.0) * f)), 3)
    st = dict(style, group_scale=gs)
    dr = ch["matches"][0]["draw_rate"]
    # V6: draws come from liquidation into bare endings -> steer the PDF's anti-liquidation motifs, contempt stays at -120
    f = 1.4 if dr > 0.20 else (0.8 if dr < 0.14 else 1.0)
    for kk in ("#4", "#46", "#142", "#196"):
        gs[kk] = round(min(6.0, max(0.3, gs.get(kk, 1.0) * f)), 3)
    st["group_scale"] = gs
    st["anti_draw_contempt_cp"] = -120.0
    return st


def main(rounds, start=None, first=1):
    os.makedirs(OUT, exist_ok=True)
    from chimera.omega.config import PROFILES
    style = json.load(open(start)) if start else {"group_scale": PROFILES["PDF_STYLE_V5"]["group_scale"], "anti_draw_contempt_cp": -120.0, "motif_scale": 0.15}
    lp = os.path.join(OUT, "calibration_log.json")
    log = json.load(open(lp)) if os.path.isfile(lp) else []
    log = [r for r in log if r["round"] < first]
    for k in range(first, first + rounds):
        ch = run_round(k, style)
        rec = {"round": k, "style": style, "per_game": ch["per_game"], "pdf_target": TARGET, "ratio": ch["ratio_to_pdf"], "match": ch["matches"][0]}
        log.append(rec); json.dump(log, open(os.path.join(OUT, "calibration_log.json"), "w"), indent=1)
        print(json.dumps(rec), flush=True)
        style = update(style, ch)


if __name__ == "__main__":
    sys.path.insert(0, ROOT)
    main(int(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else None, int(sys.argv[3]) if len(sys.argv) > 3 else 1)
