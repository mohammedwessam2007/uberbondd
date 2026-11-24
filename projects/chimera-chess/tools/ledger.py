"""Produce the V7 167-ID ledger. The Phase 1 CSV columns are copied unchanged; V7 adds
columns. The raw V4 canon is never edited (hash re-checked here). Run from project root."""
import csv
import hashlib

CANON = "canon/handoff_2026-11-24/01_CANON/CHIMERA_OMEGA_V4_MASTER_167_ID_REGISTER_2026-11-23.txt"
CANON_SHA = "c6cae3f0cd1e658196d3ca7d053c0e57025e3fdd064e3a3f0eafb568fdbdb149"
PHASE1 = "canon/handoff_2026-11-24/02_CODEX_PHASE1_EVIDENCE/idea_coverage_PHASE1.csv"
OUT = "canon/LEDGER_V7_167.csv"

B = "BOUNDED_TRIAL"   # functional code + test + measured result; NOT demonstrated mastery
TAG = "TAG_ONLY"      # recognised/labelled by the Artist; no dedicated mechanism
NA = "NOT_ATTEMPTED_V7"
CB = "chimera/creative.py"
V7 = {
    "#017": (B, "chimera/creative.py (V7.1 clock give-back)", "evidence/creative/run2_*.json",
             "verification time only spent on candidates within 250cp; else returned to main search",
             "simple rule, not a learned governor", ""),
    "#018": (B, "evidence/failures/; Decision.candidates rejected rows", "tests.test_v7 deadline regression",
             "every rejected proposal keeps refutation + deficit; harness bug log preserved", "", ""),
    "#032": (TAG, CB, "evidence/creative bench quietMove theme", "see run summaries quietMove_*", "no quiet-move specific mechanism", ""),
    "#047": (B, CB + " artist_candidates", "test_artist_tags_sacrifice; creative bench",
             "tags: sacrifice/check/king_zone/quiet/break", "hand-written grammar, not learned primitives", ""),
    "#050": (NA, CB + " STYLES['petrosian'].prophylaxis", "none",
             "parameter declared but UNUSED in decisions", "no prophylaxis mechanism yet", "needs opponent-threat model"),
    "#052": (B, CB + " row['missing_condition']", "creative bench rejections",
             "refutation + cp deficit recorded per rejected sacrifice", "does not yet generate preparatory moves", ""),
    "#053": (B, CB + " Skeptic.verify (equal budget vs plain best)", "test_creative_rejects_refuted_sacrifice; bench negatives",
             "see creative run summaries false-sacrifice rate", "same evaluator as proposer (correlated critic)", ""),
    "#065": (B, CB + " PlanMemory.observe/recoveries", "test_memory_detects_interference",
             "INTERFERED/REFUTED drop plan and re-plan", "", ""),
    "#073": (B, CB + " PlanWitness/architect_witness", "test_witness_prerequisites_and_memory",
             "goal + board prerequisites + expected line + refutation", "prerequisites are shallow (piece presence, king proximity)", ""),
    "#095": (B, CB + " PlanMemory", "test_witness_prerequisites_and_memory", "validated after each opponent move", "", ""),
    "#112": (NA, "", "", "", "", "needs BT4/Lc0 weights + distillation compute"),
    "#113": (B, CB + " PlanMemory (deterministic)", "tests.test_v7", "episodic plan state persists across moves",
             "no learned recurrent token", ""),
    "#118": (B, CB + " Skeptic on unusual candidates", "creative bench", "unusual candidates searched against best defence",
             "no KL regularisation", ""),
    "#163": (B, CB + " 1.5x budget for sacrifices", "creative bench", "deeper verification of sacrifices",
             "fixed multiplier, not value-of-search", ""),
    "#164": (TAG, CB, "", "", "multi-sacrifice lines not mined", ""),
    "#165": (TAG, CB, "creative bench zugzwang theme", "see zugzwang_* in run summaries", "no zugzwang detector", ""),
    "#166": (TAG, CB + " 'break' tag", "", "", "no fortress model", ""),
    "#025": ("PHASE1_T_PRESERVED", "", "", "Phase1 student result preserved; not re-run in V7", "", "torch path not used in V7"),
}


def main():
    h = hashlib.sha256(open(CANON, "rb").read()).hexdigest()
    assert h == CANON_SHA, f"canon changed: {h}"
    rows = list(csv.DictReader(open(PHASE1)))
    assert len(rows) == 167
    extra = ["v7_status", "v7_source_path", "v7_test", "v7_result", "v7_failure_or_limit", "v7_blocker"]
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) + extra)
        w.writeheader()
        for r in rows:
            if r["id"] in V7:
                vals = V7[r["id"]]
            elif r["disposition"] == "X":
                vals = ("ARCHIVE_ONLY", "", "", "", "fair-play-evasion / impersonation class: preserved, never implemented", "")
            else:
                vals = (NA, "", "", "", "", "no V7 experiment allocated")
            r.update(dict(zip(extra, vals)))
            w.writerow(r)
    from collections import Counter
    print(Counter(dict(zip(extra, V7.get(r["id"], ("",)))).get("v7_status", "") for r in rows))
    c = Counter(row["v7_status"] for row in csv.DictReader(open(OUT)))
    print(dict(c), "fully demonstrated: 0")


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------- V8 columns (added 2026-11-23)
V8 = {
    "#017": ("BOUNDED_TRIAL", "native/chimera.cpp think(): soft/hard deadline", "tests.test_native.test_hard_deadline_movetime; evidence/v8/latency_native_host.json", "hard-deadline time manager, internal <=70.2ms at movetime 80 (10ms overhead)", "rule-based, not learned"),
    "#099": ("BOUNDED_TRIAL", "native/chimera.cpp soft/hard budget", "same as #017", "iteration-start gate (soft) + abort (hard)", "no value-of-thought model"),
    "#116": ("BOUNDED_TRIAL", "native/chimera.cpp soft/hard budget", "same as #017", "deliberation stops at soft budget", "no learned governor"),
    "#063": ("MEASURED_BASELINE", "tools/match.py trace + tools/trace_analysis.py", "evidence/v8/trace_metrics_sf2800.json", "opponent-reply prediction rate from search PV", "PV-based, not a learned opponent model"),
    "#115": ("MEASURED_BASELINE", "tools/trace_analysis.py", "evidence/v8/trace_metrics_sf2800.json", "see reply_prediction_rate", "PV-based"),
    "#073": ("MEASURED_BASELINE", "tools/trace_analysis.py plan_continuation", "evidence/v8/trace_metrics_sf2800.json", "plan continuation when prediction held", "PV, not a learned plan head; V7 PlanWitness unchanged"),
    "#095": ("MEASURED_BASELINE", "tools/trace_analysis.py", "evidence/v8/trace_metrics_sf2800.json", "replan rate after surprise", "PV-based"),
    "#103": ("MEASURED_BASELINE", "tools/trace_analysis.py surprise_repair", "evidence/v8/trace_metrics_sf2800.json", "score shift + replan after deviation", "no learned repair"),
    "#118": ("VERIFIED_FAIL", "native/chimera.cpp ArtistExtension (default off)", "evidence/v8/PREREG_artist_extension.md; evidence/v8/hard_sac_ext_vs_base_300ms.json", "50/60 vs 50/60, 0 paired differences", "root +1 ply cannot fix depth/eval-limited misses (evidence/v8/hard_sac_miss_diagnosis.txt)"),
    "#163": ("VERIFIED_FAIL", "native/chimera.cpp ArtistExtension (default off)", "same as #118", "no gain on pre-registered objective", "see #118"),
    "#047": ("BOUNDED_TRIAL", "native artistic() tagger + V7 chimera/creative.py", "evidence/v8/hard_sac_*", "tags used by ArtistExtension; V7 grammar unchanged", "no learned primitives"),
    "#032": ("MEASURED_GENERAL_SEARCH", "native/chimera.cpp (no dedicated mechanism)", "evidence/v8/heldout_v8_vs_v7_1000ms.json", "quietMove 20/20 (V7 14/20)", "gain from search depth, not a quiet-move module"),
    "#165": ("MEASURED_GENERAL_SEARCH", "native/chimera.cpp", "evidence/v8/heldout_v8_vs_v7_1000ms.json", "zugzwang 10/10 (V7 9/10)", "no zugzwang detector"),
    "#057": ("MEASURED_GENERAL_SEARCH", "native/chimera.cpp", "evidence/v8/heldout_v8_vs_v7_1000ms.json", "defensiveMove 28/30 (V7 23/30)", "general search, not 'beauty of defence'"),
    "#143": ("SOURCE_MISSING", "", "", "original body absent from canon; not defined, not implemented", ""),
    "#144": ("SOURCE_MISSING", "", "", "original body absent from canon; not defined, not implemented", ""),
}


def v8():
    rows = list(csv.DictReader(open(OUT)))
    extra = ["v8_status", "v8_source_path", "v8_evidence", "v8_result", "v8_limit"]
    with open("canon/LEDGER_V8_167.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) + extra)
        w.writeheader()
        for r in rows:
            if r["id"] in V8:
                vals = V8[r["id"]]
            elif r["v7_status"] == "ARCHIVE_ONLY":
                vals = ("ARCHIVE_ONLY", "", "", "preserved; never implemented (fair-play evasion / impersonation class)", "")
            else:
                vals = ("CARRIED_FROM_V7:" + r["v7_status"], "", "", "", "no V8 experiment this session")
            r.update(dict(zip(extra, vals)))
            w.writerow(r)
    from collections import Counter
    print("V8", dict(Counter(r["v8_status"] for r in csv.DictReader(open("canon/LEDGER_V8_167.csv")))), "fully demonstrated: 0")


if __name__ == "__main__":
    v8()


# ---------------------------------------------------------------- V9 columns (added 2026-11-24)
V9 = {
    "#025": ("VERIFIED_FAIL", "tools/train_nnue.py; native EvalVersion 3", "evidence/v9/PREREG_nnue.md; matches/eval3v1_vs_eval2_10s (0-48); eval3v2r_vs_eval2_10s (10-8-30); eval3v2r_vs_eval2_fixed50k (18-9-21)", "trained evaluator (search-to-instinct distillation from SF16 labels) lost both attempts", "v1 data bias (puzzles, +484cp stm mean); v2 residual: small data (63k), no gain even at equal nodes"),
    "#053": ("VERIFIED_FAIL_NO_HEADROOM", "native Skeptic option (EvalV3/EvalV1 + separate TT)", "evidence/v9/PREREG_skeptic.md; skeptic_v7bench_1000ms; skeptic_hardsac_300ms; skeptic_hardneg_300ms", "baseline already 0/18 and 0/37 false sacrifices; hard sacs 50/60 both", "V8 search does not produce unsound sacrifices on these suites"),
    "#118": ("VERIFIED_FAIL", "native ArtistExtension + Skeptic", "V8 prereg + V9 skeptic suites", "no gain", "misses are depth/eval-limited"),
    "#163": ("VERIFIED_FAIL", "native ArtistExtension + Skeptic", "same", "no gain", ""),
    "#065": ("BOUNDED_TRIAL_NO_GAIN", "native PlanState (plan_observe/plan_record)", "tests.test_native.PlanMemoryTests; matches/planmemory_vs_none_10s (13-17-18, -36 [-141,62])", "ON_TRACK/SURPRISED/BROKEN with repair time; history-dependent", "no measured strength benefit"),
    "#073": ("BOUNDED_TRIAL_NO_GAIN", "native PlanState objective/prereq/pred_reply", "PlanMemoryTests; planmemory match", "plan witness carried across real moves", "objective classifier is heuristic"),
    "#082": ("BOUNDED_TRIAL", "native PlanState.prereq", "PlanMemoryTests", "prerequisite squares checked every move", "shallow dependency model"),
    "#095": ("BOUNDED_TRIAL_NO_GAIN", "native PlanState", "PlanMemoryTests; planmemory match", "versioned, reset on new game / FEN restore", ""),
    "#103": ("BOUNDED_TRIAL_NO_GAIN", "native plan_observe -> soft budget x1.35/x1.5", "planmemory match", "surprise -> extra deliberation", "no gain"),
    "#108": ("BOUNDED_TRIAL_NO_GAIN", "native PlanState", "PlanMemoryTests.test_same_board_two_histories", "same board, different history -> different plan state", ""),
    "#113": ("BOUNDED_TRIAL_NO_GAIN", "native PlanState (deterministic)", "same", "episodic state across moves", "not learned"),
    "#063": ("MEASURED_BASELINE", "native pred_reply + tools/trace_analysis.py", "evidence/v8/trace_metrics_sf2800.json", "39.5% reply prediction", ""),
    "#045": ("MEASURED_BASELINE", "tools/human_match.py", "evidence/v9/human_match_lichess2013.json", "human top-1: Maia3 54.9%, V8 40.3%, SF16 d10 38.5% (800 positions)", "Lichess 2013 amateurs, not grandmasters"),
    "#013": ("MEASURED_BASELINE", "tools/humanizer_pareto.py", "evidence/v9/humanizer_pareto.json", "margin 50cp: human match 50.8% vs V8 39.9% for +3cp SF loss (800 positions)", "not wired into UCI; not blinded expert assessment"),
    "#020": ("BLOCKED", "", "", "", "needs a lawfully licensed historical master PGN corpus (owner decision on source/terms)"),
    "#059": ("BLOCKED", "", "", "", "same corpus blocker as #020"),
    "#111": ("BLOCKED", "", "", "", "same corpus blocker as #020"),
    "#019": ("NOT_ATTEMPTED", "", "", "", "no concept-discovery experiment this session"),
    "#112": ("NOT_ATTEMPTED", "", "", "", "Searchless-9M needs JAX/Haiku checkpoint conversion; no JAX/torch here; not ported"),
}


def v9():
    rows = list(csv.DictReader(open("canon/LEDGER_V8_167.csv")))
    extra = ["v9_status", "v9_source_path", "v9_evidence", "v9_result", "v9_limit"]
    with open("canon/LEDGER_V9_167.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) + extra)
        w.writeheader()
        for r in rows:
            vals = V9.get(r["id"]) or (("ARCHIVE_ONLY", "", "", "preserved; never implemented", "") if r["v8_status"] == "ARCHIVE_ONLY"
                                       else ("SOURCE_MISSING", "", "", "", "") if r["v8_status"] == "SOURCE_MISSING"
                                       else ("CARRIED_FROM_V8:" + r["v8_status"], "", "", "", "no V9 experiment"))
            r.update(dict(zip(extra, vals)))
            w.writerow(r)
    from collections import Counter
    print("V9", dict(Counter(r["v9_status"] for r in csv.DictReader(open("canon/LEDGER_V9_167.csv")))), "fully demonstrated: 0")


if __name__ == "__main__":
    v9()
