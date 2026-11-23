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
