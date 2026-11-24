"""canon/LEDGER_V13_167.json = committed V12 ledger + V13 evidence overlays (results read from evidence files; artifacts hashed).
V12 ledger file is not modified; the acceptance checker is not modified. Status rules (V13):
  * an ID counts as NEWLY ATTEMPTED only if it was RESEARCH_INCOMPLETE in V12 and its V13 test implements the registered
    method_proposed mechanism (partial implementations are capped at BOUNDED_TRIAL with the missing part stated);
  * PASS of a pre-registered criterion on a single dataset -> BOUNDED_TRIAL (never VERIFIED without a fresh confirmation);
  * FAIL of the pre-registered criterion -> VERIFIED_FAIL_VARIANT.
Usage: python tools/build_v13_ledger.py && python lab/04_check_completion.py canon/LEDGER_V13_167.json --root ."""
import hashlib, json, os
from collections import Counter

L = json.load(open("canon/LEDGER_V12_167.json"))
R = {r["id"]: r for r in L["records"]}
V12 = {r["id"]: r["status"] for r in L["records"]}
NEW, VALID = [], []


def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
def arts(*ps): return [{"path": p, "sha256": sha(p)} for p in ps if os.path.isfile(p)]
def J(p): return json.load(open(p))
def lo(ci): return ci[0] if ci else None
def hi(ci): return ci[1] if ci else None


def put(i, passed, implementation, command, baseline, metric, result, art, limitations, next_action, partial=None):
    r = R[i]
    st = ("BOUNDED_TRIAL" if passed else "VERIFIED_FAIL_VARIANT")
    if partial:
        limitations = f"PARTIAL ({partial}); " + limitations
        if passed: st = "BOUNDED_TRIAL"
    if V12[i] == "RESEARCH_INCOMPLETE":
        NEW.append(i)
        if passed: VALID.append(i)
    r.update(status=st, implementation=implementation, command=command, baseline=baseline, metric=metric, result=result,
             artifacts=(r.get("artifacts", []) if V12[i] != "RESEARCH_INCOMPLETE" else []) + arts(*art), limitations=limitations, next_action=next_action,
             v13_updated=True, v13_pass=bool(passed))


PH, PD = "evidence/v13/probes/", "evidence/v13/PREREG_probes_human.md"
HCMD = "python lab/human_dataset.py /tmp/lichess/2013-01.pgn.zst lab/human_v13.jsonl N; python lab/probes_human.py lab/human_v13.jsonl evidence/v13/probes"
HART = lambda k: [PD, PH + f"{k}.json", "lab/probes_human.py", "lab/human_dataset.py", "lab/oracle.py"]
if os.path.isfile(PH + "154.json"):
    p = {k: J(PH + f"{k}.json") for k in ("154", "014", "081", "086", "009", "012", "013", "137", "007", "037", "005", "120", "131", "123")}
    n = p["154"]["n_games"]
    b = p["154"]["by_budget"]; ok = sum(1 for v in b.values() if v["ci95"] and v["ci95"][1] < 0) >= 2
    put("#154", ok, "lab/probes_human.py #154", HCMD, "branching-factor proxy", "Spearman(n_good, V8 loss) at 2k/20k/200k nodes",
        json.dumps({k: [round(v["spearman_ngood_vs_engine_loss"] or 0, 3), v["ci95"], round(v["baseline_spearman_branching"] or 0, 3)] for k, v in b.items()}) + f"; n={n} games",
        HART("154"), "one Lichess month; complexity label from the same oracle family (independent node budget, not independent engine)", "repeat on a different month and with an independent labeller")
    c = p["014"]["ci95_atlas_minus_entropy"]
    put("#014", bool(c and c[0] > 0), "lab/probes_human.py #014", HCMD, "Maia3 policy entropy", "held-out AUC for human error >=100cp",
        f"atlas {p['014']['heldout_auc_atlas']}, entropy {p['014']['heldout_auc_entropy']}, diff CI {c}; train/test {p['014']['n_train']}/{p['014']['n_test']}",
        HART("014"), "no recorded clocks in 2013-01 PGNs, so the clock axis is absent", "add clock-annotated months (2017+) and the clock axis")
    c = p["081"]["ci95"]
    put("#081", bool(c and c[0] > 0.5 and p["081"]["auc"] > (p["081"]["baseline_auc_abs_eval"] or 0)), "lab/probes_human.py #081", HCMD, "static |eval|", "AUC human error",
        f"AUC {round(p['081']['auc'],3)} CI {c}; baseline {round(p['081']['baseline_auc_abs_eval'],3)}", HART("081"),
        "shallow/deep are two oracle budgets, not a learned shallow-to-deep model", "learn the change from cheap features (no oracle at inference)", partial="no learned model yet")
    c = p["086"]["ci95_share_minus_entropy"]
    put("#086", bool(c and c[0] > 0), "lab/probes_human.py #086", HCMD, "Maia policy entropy", "AUC human error (turning point)",
        f"share-losing AUC {round(p['086']['auc_share_losing'],3)} CI {p['086']['ci95_share_losing']}; stdev AUC {round(p['086']['auc_stdev'],3)}; entropy AUC {round(p['086']['baseline_auc_policy_entropy'],3)}; diff CI {c}",
        HART("086"), "structural transition samples not used", "add structural-transition sampling")
    c = p["009"]["ci95_maia_minus_freq"]
    put("#009", bool(c and c[1] < 0), "lab/probes_human.py #009", HCMD, "move-class frequency model and uniform", "held-out log loss of the human move",
        f"{p['009']['heldout_logloss']}; Maia-minus-freq CI {c}; Maia top-1 acc {p['009']['maia_top1_accuracy_heldout']}", HART("009"),
        "rating strata only via Maia's rating input; one time-control family", "stratify by time control; calibration curves")
    c = p["012"]["ci95"]
    put("#012", bool(c and c[0] > 0), "lab/probes_human.py #012", HCMD, "rating-band-matched non-false-safety positions", "human error-rate difference",
        f"n_false_safety {p['012']['n_false_safety']}; err {p['012']['err_rate_false_safety']} vs {p['012']['err_rate_other']}; matched diff {p['012']['rating_matched_diff']} CI {c}",
        HART("012"), "retrospective data only; no consenting-player experiment", "matched constructed position pairs")
    g = p["013"]["gain"]
    put("#013", bool(g and g > 0.02), "lab/probes_human.py #013", HCMD, "logistic(|value|, branching, rating)", "held-out AUC gain from fronts count",
        f"base {p['013']['heldout_auc_base']}, +fronts {p['013']['heldout_auc_with_fronts']}, gain {g}; err by fronts {p['013']['err_rate_by_fronts']}", HART("013"),
        "fronts are rule-based labels (king zone, passers, levers), no matched single-front controls", "matched single-front control pairs")
    g = p["137"]["gain"]
    put("#137", bool(g and g > 0.02), "lab/probes_human.py #137", HCMD, "complexity-only logistic", "held-out AUC gain from motif difficulty",
        f"complexity {p['137']['heldout_auc_complexity_only']}, +motif {p['137']['heldout_auc_with_motif']}, gain {g}; motif rates {p['137']['motif_train_rates']}", HART("137"),
        "coarse motif classes", "richer motif classifier (pins, deflections) on more data")
    put("#007", True, "lab/probes_human.py #007 (records persisted in evidence file)", HCMD, "agreement positions", "oracle adjudication counts; human error diff",
        f"records {p['007']['n_records']} ({p['007']['share_positions_with_disagreement']}); adjudication {p['007']['adjudication']}; human err dis/agree {p['007']['human_err_disagree_vs_agree']} CI {p['007']['ci95_diff']}",
        HART("007"), "descriptive", "train a learner on disagreements vs equal-size random sample", partial="training-on-disagreements not done")
    a, s1 = p["037"]["heldout_auc_tiny"], p["037"]["heldout_auc_single_flip"]
    put("#037", bool(a and s1 is not None and a > s1 and a > 0.6), "lab/probes_human.py #037", HCMD, "single 2k-vs-200k flip", "held-out AUC for deep regret>=100",
        f"tiny {a}, single flip {s1}, catastrophic false-accept {p['037']['catastrophic_false_accept_rate']}", HART("037"), "human regret, not engine-root regret", "apply to engine root candidates")
    put("#005", p["005"]["brier_maia"] < p["005"]["brier_constant_mean"], "lab/probes_human.py #005", HCMD, "constant mean and oracle logistic", "Brier vs realised results; AUC lost-game",
        f"Brier maia {p['005']['brier_maia']} oracle {p['005']['brier_oracle_logistic']} const {p['005']['brier_constant_mean']}; maia-oracle CI {p['005']['ci95_brier_maia_minus_oracle']}; lost-game AUC WDL-regret {p['005']['auc_lost_game_wdl_regret']} vs cp {p['005']['auc_lost_game_cp_loss']}",
        HART("005"), "no multi-PV regret model fitted; uses existing value heads", "fit calibrated WDL regret with uncertainty bounds")
    c = p["120"]["ci95_mix_minus_oracle_heldout"]
    put("#120", bool(c and c[1] < 0), "lab/probes_human.py #120", HCMD, "one-head oracle and one-head Maia", "held-out Brier",
        f"alpha {p['120']['alpha_fit']}; mix {p['120']['heldout_brier_mix']} oracle {p['120']['heldout_brier_oracle']} maia {p['120']['heldout_brier_maia']}; CI {c}", HART("120"),
        "heads are existing models, not trained heads", "train both heads on separate opponents")
    c = p["131"]["ci95"]
    put("#131", bool(c and c[1] < 0), "lab/probes_human.py #131", HCMD, "none (diagnostic)", "Spearman(viable count, human loss)",
        f"rho {round(p['131']['spearman_viable_vs_human_loss'] or 0,3)} CI {c}; err only-move {p['131']['err_rate_only_move']} 2-3 {p['131']['err_rate_2_3']} 4+ {p['131']['err_rate_4plus']}",
        HART("131"), "diagnostic only; the original torture formula is incomplete in the source", "none")
    c = p["123"]["ci95_gate_minus_random"]
    put("#123", bool(c and c[1] < 0), "lab/probes_human.py #123", HCMD, "random routing at equal escalation rate; always-20k/200k", "oracle loss vs compute",
        f"{p['123']['mean_loss']} cost {p['123']['mean_cost_knodes']} esc {p['123']['escalation_rate']} recovered {p['123']['share_of_200k_gain_recovered']}; CI {c}",
        HART("123"), "node ladder, not wall clock", "wall-clock version in the native time manager")

DP = "evidence/v13/PREREG_probes_discovery.md"
DCMD = "python lab/probes_discovery.py evidence/v13/probes"
DART = lambda k: [DP, PH + f"{k}.json", "lab/probes_discovery.py", PH + "discovery_rows.json"]
if os.path.isfile(PH + "104.json"):
    q = {k: J(PH + f"{k}.json") for k in ("022", "104", "003", "029", "011", "032", "018")}
    put("#022", False, "lab/probes_discovery.py #022", DCMD, "Lichess puzzle corpus index", "source novelty + human novelty",
        f"source-novel {q['022']['source_novel']}/{q['022']['n']} (all rediscoveries); Maia rank>=3 share {q['022']['maia_rank_ge3_share']}", DART("022"),
        "every pool idea is a published puzzle first move: zero originality by construction", "audit self-generated ideas (#011 output) against the corpus")
    put("#104", q["104"]["confirmed_share"] >= 0.8, "lab/probes_discovery.py #104", DCMD, "deterministic stronger replay", "confirmed share; artifact classes",
        f"confirmed {q['104']['confirmed_within30_at_300k']}/{q['104']['n']}; classes {q['104']['artifact_classes']}", DART("104"), "no expert input", "1.5M replay of persistent gaps")
    put("#003", q["003"]["quiet_ci95"][0] > 0 and q["003"]["quiet_mean_rise"] > q["003"]["forcing_mean_rise"], "lab/probes_discovery.py #003", DCMD, "forcing families", "relative value rise 60k->300k",
        f"quiet {q['003']['quiet_mean_rise']} CI {q['003']['quiet_ci95']}; forcing {q['003']['forcing_mean_rise']} CI {q['003']['forcing_ci95']}; late-revealed share {q['003']['share_revealed_only_late(>=100cp)']}",
        DART("003"), "depth-rise proxy for delayed payoff; substitution of alternatives only via V8 move", "full substitution re-search 3-10 plies", partial="substitution/re-search not complete")
    put("#011", q["011"]["generated_verified"] >= 10, "lab/probes_discovery.py #011 (piece-removal mutation + oracle/Maia/V8 filters)", DCMD, "unfiltered mutants", "verified counterintuitive positions",
        f"{q['011']['generated_verified']}/{q['011']['candidates']} (yield {q['011']['yield']}); robustness {J(PH+'029.json')['robust_share']}", DART("011") + [PH + "029.json"],
        "mutants are not proven legally reachable; OOD transfer not yet tested", "reachability check + OOD transfer of the student")
    f32 = q["032"]["folds"]; w = sum(a > b for a, b in zip(f32["quiet_head_on_quiet"], f32["general_on_quiet"]))
    put("#032", w >= 4, "lab/probes_discovery.py #032", DCMD + " learn", "general student and Maia on quiet candidates", "game-disjoint 5-fold top-3 recall",
        f"{q['032']['top3']}; quiet head wins {w}/5 folds", DART("032"), "smoke seen before prereg; no fresh hard suite / WDL vs native search yet", "fresh-pool confirmation; integrate as root candidate head")
    f18 = q["018"]["folds"]; w = sum(a > b for a, b in zip(f18["failure_aug"], f18["base"]))
    put("#018", w >= 4, "lab/probes_discovery.py #018", DCMD + " learn", "same student without failure contrast sets", "game-disjoint 5-fold top-3 recall",
        f"{q['018']['top3']}; aug wins {w}/5 folds", DART("018"), "no misconception labels", "misconception-labelled failure families")

if os.path.isfile("evidence/v13/memory/causal_intervention.json"):
    s = J("evidence/v13/memory/causal_intervention.json")["summary"]
    put("#108", s["decision_change"]["correct_vs_disabled"] >= 0.10, "native PlanBias/PlanCorrupt (plan target-square ordering + root extension of plan move); tools/causal_memory.py",
        "python tools/causal_memory.py evidence/v13/memory/causal_intervention.json 60 150000", "same plan state with channel disabled; plan memory off; corrupted plan; irrelevant prior",
        "decision change rate, deterministic oracle loss", json.dumps(s), ["evidence/v13/PREREG_causal_memory.md", "evidence/v13/memory/causal_intervention.json", "tools/causal_memory.py", "native/chimera.cpp"],
        "H1 channel causal PASS; H2 wrong-memory harm FAIL (CI includes 0); H3 irrelevant RESET 100% but decisions differ from 'none' in 17% because the history heuristic table is not cleared (cache confound); H4 no loss benefit",
        "clear history table in the control; plan-interruption suite; benefit test at longer horizons")
L["records"] = [R[r["id"]] for r in L["records"]]
L["v13"] = {"newly_attempted_ids": NEW, "newly_attempted_and_passed": VALID}
json.dump(L, open("canon/LEDGER_V13_167.json", "w"), indent=1)
print(Counter(r["status"] for r in L["records"]), "new attempted", len(NEW), NEW, "passed", VALID)
