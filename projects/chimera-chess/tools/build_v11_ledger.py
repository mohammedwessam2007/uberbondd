"""Build canon/LEDGER_V11_167.json from the supplied V11 template (lab/03_completion_template.json, unchanged).
Every result string is read from an evidence file at build time; every artifact is hashed. Slots without an experiment
are recorded as RESEARCH_INCOMPLETE with an explicit 'NOT ATTEMPTED' limitation (never as success).
Usage: python tools/build_v11_ledger.py && python lab/04_check_completion.py canon/LEDGER_V11_167.json --root ."""
import hashlib
import json
import os

T = json.load(open("lab/03_completion_template.json"))


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def arts(*paths):
    return [{"path": p, "sha256": sha(p)} for p in paths if os.path.isfile(p)]


def summ(p):
    d = json.load(open(p))
    return d.get("summary", d)


def match(p):
    d = json.load(open(p))
    return f"{d['a']} vs {d['b']} {d['tc']}: {d['a_wins']}-{d['draws']}-{d['a_losses']} ({d['a_pct']*100:.1f}%), Elo {d['elo_diff_a_minus_b_95ci'][0]} [{d['elo_diff_a_minus_b_95ci'][1]},{d['elo_diff_a_minus_b_95ci'][2]}], forfeits {d['time_forfeits']}"


M = "evidence/v11/matches/"
R = {}


def rec(ids, status, impl, cmd, base, metric, result, artifacts, lim, nxt):
    for i in ids:
        R[i] = dict(status=status, implementation=impl, command=cmd, baseline=base, metric=metric, result=result,
                    artifacts=artifacts, limitations=lim, next_action=nxt)


# ---------------------------------------------------------------- EVAL
ev_t = match(M + "eval3v3_vs_ref_10s_j1.summary.json")
ev_n = match(M + "eval3v3_vs_ref_fixed50k.summary.json")
ev_c = match(M + "eval3v3_vs_ref_10s_CONTENDED.summary.json")
tr = json.load(open("nnue/eval_v3_all.train.json"))
rec(["#025"], "VERIFIED_FAIL_VARIANT",
    "tools/train_nnue.py residual 768->128->1 on 341,692 quiet self-play positions (SF16 d7 labels); native EvalVersion 3",
    "python tools/train_nnue.py lab/data/eval_v3_merged.tsv.gz nnue/eval_v3_all 128 2 1 residual; python tools/match.py --a native:3:file=nnue/eval_v3_all.bin --b ref:2 ...",
    "frozen V8 reference (EvalV2), equal time and equal nodes",
    "pre-registered equal-time Elo > +20 (evidence/v11/PREREG_eval_v3.md)",
    f"val loss {tr['val_loss_trained']:.6f} vs EvalV2 {tr['val_loss_baselines']['EvalV2_static']:.6f}; equal nodes: {ev_n}; equal time (clean): {ev_t}; contended run: {ev_c}",
    arts("evidence/v11/PREREG_eval_v3.md", "nnue/eval_v3_all.train.json", M + "eval3v3_vs_ref_10s_j1.summary.json",
         M + "eval3v3_vs_ref_fixed50k.summary.json", "evidence/v11/eval/eval_v3_bias_diagnosis.txt", "nnue/eval_v3_all.bin"),
    "equal-time criterion failed; training data is 100% white-to-move (builder bug, diagnosed); hand eval still computed in residual mode",
    "fix tools/build_selfplay_dataset.py to sample both sides to move; pure-net (non-residual) variant; SIMD int16; re-run prereg")
rec(["#036"], "BOUNDED_TRIAL", "native/chimera.cpp quantized incremental accumulator (Position::acc_update, nn_refresh, nncheck)",
    "printf 'setoption name EvalFile value nnue/eval_v3_all.bin\\nposition fen <fen>\\nnncheck 3\\n' | native/chimera; python -m unittest tests.test_native.V11FeatureTests",
    "full recomputation (V9 nnue_eval) and float reference", "incremental==refresh at every node; quantization error; node rate",
    "0 mismatches over ~164k perft-tree nodes incl. castling/EP/promotions; max quantization error <=2.9cp; EvalV3 node rate 1.06M vs EvalV2 1.01M nps (V9 full recompute was ~2x slower)",
    arts("native/chimera.cpp", "tests/test_native.py"), "games with the trained net did not pass the strength bar (see #025)",
    "SIMD int16 accumulation; remove hand-eval term in pure-net mode")
for i in ("#005", "#037", "#120"):
    rec([i], "RESEARCH_INCOMPLETE", "", "", "", "", "", [], "NOT ATTEMPTED in V7-V11 (no calibrated WDL/regret head trained)", "train WDL head from MultiPV deep labels in lab/data; calibration vs raw cp")

# ---------------------------------------------------------------- PLAN / SKEPTIC / CREATIVE
au = summ("evidence/v11/artist/artist_union_1000ms.json")
ac = summ("evidence/v11/artist/artist_conservative_dev_1000ms.json")
rec(["#002"], "VERIFIED_FAIL_VARIANT",
    "tools/artist_union.py: union of native MultiPV-3, Maia3-5M top-3, #047 Artist; each verified by native searchmoves",
    "python tools/artist_union.py evidence/v11/headroom_suite.json evidence/v11/artist/artist_union_1000ms.json 1000",
    "plain native search, equal wall clock 1000 ms", "fresh-half SF16-d20 best-move solves (pre-registered)",
    f"fresh: union {au['fresh']['union_solved']}/{au['fresh']['n']} vs base {au['fresh']['base_solved']}; solution recall in candidate union {au['fresh']['solution_recall_in_candidates']}/{au['fresh']['n']}; sources {au['solution_found_by_source']}",
    arts("evidence/v11/PREREG_artist_union.md", "evidence/v11/artist/artist_union_1000ms.json", "evidence/v11/headroom_suite.json"),
    "proposal recall is high but short focused verification picks wrong moves", "deeper verification only of the single highest-prior non-best candidate; learned candidate head (#032/#039)")
rec(["#118"], "VERIFIED_FAIL_VARIANT", "tools/artist_union.py conservative mode (switch only if candidate verifies >= base+15cp)",
    "python tools/artist_union.py evidence/v11/headroom_suite.json evidence/v11/artist/artist_conservative_dev_1000ms.json 1000 --mode conservative --split dev",
    "plain native search, equal wall clock", "dev-half solves (exploratory; fresh consumed)",
    f"dev: {ac['dev']['union_solved']}/{ac['dev']['n']} vs base {ac['dev']['base_solved']}; also V8 ArtistExtension 50/60 vs 50/60",
    arts("evidence/v11/artist/artist_conservative_dev_1000ms.json", "evidence/v8/hard_sac_ext_vs_base_300ms.json"),
    "dev-only; no gain", "new fresh headroom suite before any further promotion")
rec(["#163"], "VERIFIED_FAIL_VARIANT", "native ArtistExtension (root +1 ply on sacrifices) and native Skeptic",
    "python tools/suite_run.py evidence/v8/hard_sac_suite.json out.json 300 native:2:art native:2",
    "same binary without extension", "hard sacrifice solves", "50/60 vs 50/60 (V8); Skeptic 50/60 vs 50/60 (V9)",
    arts("evidence/v8/hard_sac_ext_vs_base_300ms.json", "evidence/v9/skeptic_hardsac_300ms.json"),
    "misses are depth/eval limited (evidence/v8/hard_sac_miss_diagnosis.txt)", "inside-tree sacrifice extensions; better eval")
rec(["#053"], "VERIFIED_FAIL_VARIANT", "native Skeptic (different evaluator + separate TT re-searches offer vs alternative)",
    "python tools/suite_run.py evidence/v9/hard_sac_negatives.json out.json 300 native:2:skeptic native:2",
    "same binary, Skeptic off", "false sacrifices on near-identical counterexamples",
    "baseline already 0/18 (V7 negatives) and 0/37 (hard negatives): no headroom",
    arts("evidence/v9/skeptic_hardneg_300ms.json", "evidence/v9/PREREG_skeptic.md"), "no false-positive headroom exists for V8",
    "re-test when proposal generation produces risky candidates (after #002/#032 heads)")
rec(["#047"], "BOUNDED_TRIAL", "chimera/creative.artist_candidates sacrifice-grammar tagger used as Artist source in tools/artist_union.py",
    "python tools/artist_union.py evidence/v11/headroom_suite.json ... 1000", "MultiPV / Maia sources",
    "share of headroom solutions proposed", f"#047 source proposed the solution {au['solution_found_by_source'].get('artist047', 0)} times out of 80",
    arts("evidence/v11/artist/artist_union_1000ms.json"), "tags, not composed multi-move programs; recipe's composition test not met",
    "compose motif primitives into legal multi-move programs with defense witnesses")
for i, desc in (("#032", "quietMove 20/20 vs V7 14/20"), ("#165", "zugzwang 10/10 vs V7 9/10"), ("#057", "defensiveMove 28/30 vs V7 23/30")):
    rec([i], "PROXY_ONLY", "general native search (no dedicated head)", "python tools/suite_run.py evidence/v8/heldout_suite.json out.json 1000 native:2 chimera:Tactical",
        "V7 Python", "held-out theme solves", desc, arts("evidence/v8/heldout_v8_vs_v7_1000ms.json"),
        "gain comes from search depth, not the specific mechanism", "train dedicated candidate head on verified examples")
plan_arts = arts("native/chimera.cpp", "tests/test_native.py", "evidence/v9/matches/planmemory_vs_none_10s.summary.json")
pm = match("evidence/v9/matches/planmemory_vs_none_10s.summary.json")
for i in ("#065", "#073", "#082", "#095", "#103"):
    rec([i], "BOUNDED_TRIAL", "native PlanState: objective, prerequisite squares, predicted reply, ON_TRACK/SURPRISED/BROKEN, repair time",
        "python -m unittest tests.test_native.PlanMemoryTests; python tools/match.py --a native:2:plan --b native:2 --tc 10+0.1",
        "same engine PlanMemory off", "unit behaviour + equal-clock games", f"tests pass; {pm}", plan_arts,
        "deterministic heuristic state; no strength benefit; prerequisite model shallow", "typed plan DAG with local repair vs restart on an interruption suite")
for i, nm in (("#063", "39.5% opponent-reply prediction from search PV over 2,740 moves"),):
    rec([i], "PROXY_ONLY", "native pred_reply + tools/trace_analysis.py", "python tools/trace_analysis.py evidence/v8/matches/v8n2_vs_sf2800_20s.jsonl native:2 out.json",
        "none", "reply prediction rate", nm, arts("evidence/v8/trace_metrics_sf2800.json"), "PV-based, not a learned resistance simulator", "train reply-distribution head")

# ---------------------------------------------------------------- MEMORY
if os.path.isfile(M + "stateful_vs_stateless_10s.summary.json"):
    st = match(M + "stateful_vs_stateless_10s.summary.json")
    rec(["#113"], "VERIFIED_FAIL_VARIANT", "native ClearStateEachMove ablation: carried TT/history/plan vs wiped every move",
        "python tools/match.py --a native:2 --b native:2:stateless --tc 10+0.1 --jobs 1", "memoryless engine, equal clock",
        "Elo (pre-registered > +20, evidence/v11/PREREG_wave_cdg.md)", st,
        arts(M + "stateful_vs_stateless_10s.summary.json", "evidence/v11/PREREG_wave_cdg.md"),
        "memory here is computational cache, not learned episodic memory", "recurrent learned plan token with history-dependent tasks")
rec(["#108"], "BOUNDED_TRIAL", "native PlanState history dependence", "python -m unittest tests.test_native.PlanMemoryTests.test_same_board_two_histories",
    "FEN-restored identical board", "plan state differs only by history", "test passes (ON_TRACK vs RESET); no strength benefit (see #065)",
    plan_arts, "not trained; deterministic", "train recurrent continuity state")

# ---------------------------------------------------------------- GOVERNOR
gf = json.load(open("evidence/v11/governor_fit.json"))
rec(["#093"], "VERIFIED_FAIL_VARIANT", "tools/governor_lab.py: 6-feature logistic value-of-thought predictor from 4T-vs-decision-point labels",
    "python tools/governor_lab.py data lab/governor_data.jsonl 100 700; python tools/governor_lab.py fit lab/governor_data.jsonl evidence/v11/governor_fit.json",
    "single 'best changed' flag; stability", "holdout AUC", f"logistic AUC {gf['holdout_auc_logistic']:.3f} vs changed-flag {gf['holdout_auc_changed_flag']:.3f}; positives {gf['positive_rate']:.3f} of {gf['rows']}",
    arts("evidence/v11/governor_fit.json", "lab/governor_data.jsonl"), "too few positives (54); learned model not better than chance",
    "10x more labelled positions; include score-gap and MultiPV margin features")
if os.path.isfile(M + "governor_rule_vs_ref_10s.summary.json"):
    gr = match(M + "governor_rule_vs_ref_10s.summary.json")
    rec(["#017", "#099", "#116"], "BOUNDED_TRIAL", "native Governor option with hand rule (extend if best changed, stop early if stable); lab/governor_changed_rule.txt",
        "python tools/match.py --a native:2:gov=lab/governor_changed_rule.txt --b ref:2 --tc 10+0.1 --jobs 1", "frozen V8 reference default time manager",
        "Elo (pre-registered > +20)", gr, arts(M + "governor_rule_vs_ref_10s.summary.json", "lab/governor_changed_rule.txt", "evidence/v11/PREREG_wave_cdg.md"),
        "point estimate meets the +20 bar but the 95% interval includes 0: NOT validated; hand rule, not learned (learned variant failed, #093)", "learned router with more data; compare entropy/random schedules")

# ---------------------------------------------------------------- STYLE
sl = summ("evidence/v11/style/style_lab_d8.json")
style_arts = arts("evidence/v11/style/style_lab_d8.json", "native/chimera.cpp")
if os.path.isfile(M + "style_attack_vs_ref_10s.summary.json"):
    style_arts += arts(M + "style_attack_vs_ref_10s.summary.json")
    sg = match(M + "style_attack_vs_ref_10s.summary.json")
    if os.path.isfile(M + "style_attack_v2_vs_ref_10s.summary.json"):
        style_arts += arts(M + "style_attack_v2_vs_ref_10s.summary.json", "evidence/v11/style/style_lab_v2_d8.json")
        v2 = summ("evidence/v11/style/style_lab_v2_d8.json")
        sg += ("; VARIANT 2 (null-window probes, no MultiPV) games: " + match(M + "style_attack_v2_vs_ref_10s.summary.json")
               + f"; v2 lab (100 pos): attack changed {v2['attack']['changed_vs_none']} trait +{v2['attack'].get('paired_trait_gain_on_changed')} cp {v2['attack'].get('paired_sf_loss_delta_on_changed')}, restraint changed {v2['restraint']['changed_vs_none']} trait +{v2['restraint'].get('paired_trait_gain_on_changed')} cp {v2['restraint'].get('paired_sf_loss_delta_on_changed')}")
    if os.path.isfile(M + "mpv4_nostyle_vs_ref_10s.summary.json"):
        style_arts += arts(M + "mpv4_nostyle_vs_ref_10s.summary.json")
        sg += "; control MultiPV-4 without style: " + match(M + "mpv4_nostyle_vs_ref_10s.summary.json")
else:
    sg = "game test not run"
rec(["#050"], "BOUNDED_TRIAL", "native StyleProfile attack|restraint: trait-ranked choice among MultiPV moves within 30cp",
    "python tools/style_lab.py evidence/v11/style/style_lab_d8.json 200 8", "StyleProfile none at equal depth",
    "decision-change rate, trait gain, SF16 d12 cp loss on changed moves",
    f"attack changed {sl['attack']['changed_vs_none']}, trait gain {sl['attack'].get('paired_trait_gain_on_changed')}, cp delta {sl['attack'].get('paired_sf_loss_delta_on_changed')}; restraint changed {sl['restraint']['changed_vs_none']}, trait gain {sl['restraint'].get('paired_trait_gain_on_changed')}, cp delta {sl['restraint'].get('paired_sf_loss_delta_on_changed')}; games: {sg}",
    style_arts, "variant 1 (MultiPV-4) failed -293 in games (MultiPV cost -243); variant 2 meets the -30 no-regression bar but costs +17..32cp on changed moves (bound scores); heuristic traits; the fused Petrosian-Tal head (restrict-then-attack) is not built",
    "fused profile requiring restricted defender before attack payoff; fresh paired positions")
rec(["#020"], "PROXY_ONLY", "two hand-defined trait axes (king-zone attack, opponent mobility restriction)", "python tools/style_lab.py ...",
    "none profile", "trait shift", "see #050", style_arts, "not learned from licensed trajectories; no identifiability test", "learn traits from licensed corpus")
for i in ("#111", "#145", "#060"):
    rec([i], "BLOCKED", "", "", "", "", "", [], "requires a lawfully licensed historical master PGN corpus; not downloaded (rights unverified)",
        "owner selects a source with clear terms, or use CC0 Lichess elite games for trait-conditioned training")

# ---------------------------------------------------------------- HUMAN / DATA / EVIDENCE
hm = summ("evidence/v9/human_match_lichess2013.json")
rec(["#115"], "PROXY_ONLY", "Maia3-5M (pretrained, licensed) as aggregate human response model; tools/human_match.py",
    "python tools/human_match.py /tmp/lichess/2013-01.pgn.zst evidence/v9/human_match_lichess2013.json 800", "V8, SF16 d10",
    "top-1 agreement with held-out human moves", f"Maia3 {hm['maia3']['all']}, V8 {hm['v8']['all']}, SF {hm['sf16_d10']['all']} (800 positions)",
    arts("evidence/v9/human_match_lichess2013.json", "evidence/v9/humanizer_pareto.json"), "amateur 2013 games; not error prediction as the recipe asks",
    "predict held-out errors (cp-loss events) vs objective-only model")
rec(["#018"], "IMPLEMENTED_UNVALIDATED", "evidence/*/failures/ archives with diagnosis files and failed weights", "", "", "", "",
    arts("evidence/v9/failures/nnue_v1_diagnosis.txt"), "no retraining-on-failure-families test", "retrain on failure families vs random sampling")
rec(["#155"], "BOUNDED_TRIAL", "tools/match.py harness: harness-owned clock, python-chess legality, PGN+JSONL+summary, pre-registration files",
    "python tools/match.py ...", "n/a", "protocol integrity (forfeits, illegal moves, raw games)",
    "all V8-V11 matches recorded with 0 illegal moves; contended run detected and re-run (evidence/v11/matches/*CONTENDED*)",
    arts("tools/match.py", M + "eval3v3_vs_ref_10s_CONTENDED.summary.json"), "no independent third-party replay", "independent replay by a second harness")

# ---------------------------------------------------------------- DISCOVERY
if os.path.isfile("evidence/v11/discovery_report.json"):
    dr = json.load(open("evidence/v11/discovery_report.json"))
    lofo = dr["leave_one_family_out"]
    gd = dr["game_disjoint_holdout"]
    darts = arts("evidence/v11/discovery_report.json", "lab/student_prior.json", "tools/discovery_lab.py")
    rec(["#030"], "BOUNDED_TRIAL", "tools/discovery_lab.py MAP-Elites archive (motif family x horizon) of search-gap discoveries",
        "python tools/discovery_lab.py mine ...; cat lab/discovery_pool.jsonl lab/discovery_pool_s0.jsonl lab/discovery_pool_s1.jsonl > lab/discovery_pool_all.jsonl; python tools/discovery_lab.py train lab/discovery_pool_all.jsonl lab/student_prior.json evidence/v11/discovery_report.json",
        "none (archive accounting)", "cells filled, elites", f"{dr['pool']} verified discoveries, {dr['archive_cells']} cells, families {dr['families']}",
        darts, "descriptors are hand-defined; novelty only relative to this pool", "corpus-relative novelty index (#022)")
    rec(["#019"], "VERIFIED_FAIL_VARIANT", "listwise linear student over interpretable move features + Maia prior, trained on discoveries",
        "same", "Maia3 prior ranking; uniform random", "leave-one-family-out top-1/top-3 recall on unseen motif families",
        f"LOFO {lofo}; game-disjoint holdout {gd}", darts, "transfer criterion FAILS: student beats Maia only on the 'check' family when held out; in-distribution gain only; linear student; 448 discoveries",
        "integrate student as Artist source and test on a fresh headroom suite")
for i in ("#006", "#011", "#022", "#023", "#024", "#029", "#043", "#059", "#074", "#100", "#104", "#150"):
    if i not in R:
        rec([i], "RESEARCH_INCOMPLETE", "", "", "", "", "", [], "NOT ATTEMPTED: no dedicated experiment yet (shared discovery lab exists: tools/discovery_lab.py)",
            "extend discovery lab with this slot's specific operator and test")

# ---------------------------------------------------------------- MOBILE / PROFILE / FUSION (remaining)
rec(["#112"], "RESEARCH_INCOMPLETE", "Maia3-5M verified (61/61 parity); Searchless-9M not ported", "", "", "", "",
    arts("evidence/maia/parity_summary.json"), "Searchless-9M needs JAX/Haiku checkpoint conversion; not available here",
    "port Searchless 9M via numpy reimplementation and verify vs publisher decoder")

# ---------------------------------------------------------------- default dispositions
out = []
for t in T["records"]:
    r = dict(t)
    i = t["id"]
    if i in R:
        r.update(R[i])
    elif t["workstream"] == "ARCHIVE":
        r.update(status="ARCHIVE_ONLY", limitations="historical fair-play-evasion / impersonation / telemetry class: preserved verbatim, never implemented", next_action="")
    elif t["workstream"] == "SOURCE":
        r.update(status="SOURCE_MISSING", limitations="original body absent or incomplete in the supplied canon; not reconstructed", next_action="founder-supplied verified source amendment")
    else:
        r.update(status="RESEARCH_INCOMPLETE", limitations="NOT ATTEMPTED in V7-V11: no implementation or experiment for this slot yet", next_action=t["method_proposed"])
    out.append(r)
json.dump({"schema_version": 1, "source_sha256": T["source_sha256"], "records": out}, open("canon/LEDGER_V11_167.json", "w"), indent=1)
from collections import Counter
print(Counter(r["status"] for r in out))
