"""canon/LEDGER_V12_167.json = committed V11 ledger + V12 evidence overlays (results read from evidence files, artifacts hashed).
The V11 ledger file is not modified. Usage: python tools/build_v12_ledger.py && python lab/04_check_completion.py canon/LEDGER_V12_167.json --root ."""
import hashlib
import json
import os

L = json.load(open("canon/LEDGER_V11_167.json"))
R = {r["id"]: r for r in L["records"]}


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def arts(*ps):
    return [{"path": p, "sha256": sha(p)} for p in ps if os.path.isfile(p)]


def J(p):
    return json.load(open(p))


def match(p):
    d = J(p)
    c = d["elo_diff_a_minus_b_95ci"]
    return f"{d['a']} vs {d['b']} {d['tc']}: {d['a_wins']}-{d['draws']}-{d['a_losses']} ({d['a_pct']*100:.1f}%), Elo {c[0]} [{c[1]},{c[2]}]"


def put(i, **kw):
    r = R[i]
    r.update(kw)
    r["v12_updated"] = True


M = "evidence/v12/matches/"
# ---- EVAL
g1r, g1p, g2 = M + "eval4R_vs_ref_fixed50k.summary.json", M + "eval4P_vs_ref_fixed50k.summary.json", M + "eval4R_vs_ref_10s_clean.summary.json"
g2s = M + "eval4R50_vs_ref_10s_clean.summary.json"
tr = J("nnue/v12/eval_v4_residual.train.json")
res = f"preflight PASS (304,129 rows, 50.6% white-to-move); val loss {tr['val_loss_trained']:.6f} vs EvalV2 {tr['val_loss_baselines']['EvalV2_static']:.6f}; " \
      f"Gate1 equal nodes: {match(g1r)}; Gate2 equal time: {match(g2)}; pure net Gate1: {match(g1p)}"
if os.path.isfile(g2s):
    res += f"; EXPLORATORY damped residual x0.5 equal time: {match(g2s)}"
g2c = M + "eval4R50_vs_ref_20s_confirm.summary.json"
if os.path.isfile(g2c):
    res += f"; PRE-REGISTERED CONFIRMATION x0.5 at 20s+0.2: {match(g2c)} (point bar met, lower bound not -> not promoted)"
put("#025", status="VERIFIED_FAIL_VARIANT", implementation="tools/train_nnue.py residual 768->128->1 on corrected V12 data; native EvalVersion 3 (+NNResidualScale)",
    command="python tools/dataset_preflight.py lab/data/v12/eval_v4_merged.tsv.gz; python tools/train_nnue.py lab/data/v12/eval_v4_merged.tsv.gz nnue/v12/eval_v4_residual 128 2 1 residual; python tools/match.py --a native:3:file=nnue/v12/eval_v4_residual.bin --b ref:2 ...",
    baseline="frozen V8 reference (EvalV2)", metric="pre-registered Gate1 (equal nodes > 0) and Gate2 (equal time > +20, low > -40)", result=res,
    artifacts=arts("evidence/v12/PREREG_eval_v4.md", "evidence/v12/data/preflight_v12_merged.json", "nnue/v12/eval_v4_residual.bin", "nnue/v12/eval_v4_residual.train.json",
                   g1r, g1p, g2, g2s, M + "eval4R50_vs_ref_20s_confirm.summary.json", "evidence/v12/eval/tree_size_diagnosis.txt", "evidence/v12/eval/nps_idle.txt"),
    limitations="evaluation quality now clearly better at equal nodes (significant), but equal-time gate fails: search trees 0.78-2.12x larger at fixed depth (pruning tuned to EvalV2), node rate 90-95%",
    next_action="retune pruning margins/LMR for the net (SPSA on node-limited self-play), then re-run Gate2 with a new pre-registration")
put("#036", result=R["#036"]["result"] + "; V12: exact again for H=128 v4 nets (nncheck 0 mismatches)", artifacts=R["#036"]["artifacts"] + arts("nnue/v12/eval_v4_residual.bin"))
# ---- PLAN: Blacksmith
bs = J("evidence/v12/plan/blacksmith_37.json")["summary"]
for i in ("#008", "#052"):
    put(i, status="VERIFIED_FAIL_VARIANT", implementation="tools/blacksmith.py: search all legal preparations P, opponent best reply R (native), re-test sacrifice S with Stockfish",
        command="python tools/blacksmith.py evidence/v12/plan/blacksmith_37.json", baseline="expected random-preparation rate",
        metric="pre-registered: pick restores >= 2x random and >= 5", result=f"{bs}",
        artifacts=arts("evidence/v12/PREREG_blacksmith.md", "evidence/v12/plan/blacksmith_37.json", "evidence/v12/plan/blacksmith_relaxed_analysis.txt"),
        limitations="0/37: against best defence no single legal preparation restores a sacrifice whose attacker was removed (oracle over all preparations); relaxed check only finds already-lost positions",
        next_action="apply the Blacksmith to NEAR-sound sacrifices (fail by 30-150cp) mined from games, with 2-ply preparations")
# ---- STYLE (named corpus now lawful)
sl = J("evidence/v12/style/style_learn.json")
put("#111", status="VERIFIED_FAIL_VARIANT", implementation="tools/build_named_corpus.py (CC0 Lichess broadcasts 2021-2026, identity-audited) + tools/style_learn.py per-player listwise heads",
    command="python tools/build_named_corpus.py /tmp/bc lab/style_corpus; python tools/style_learn.py lab/style_corpus evidence/v12/style/style_learn.json 300",
    baseline="chance (1/3) and pooled style-free head", metric="pre-registered: held-out-game attribution z >= 3 and own-head >= pooled for 2/3",
    result=f"attribution {sl['attribution_accuracy']} vs chance {sl['attribution_chance']} (z={sl['attribution_z_vs_chance']}, n={sl['attribution_n']}); heldout {sl['heldout']}",
    artifacts=arts("evidence/v12/PREREG_style_learn.md", "evidence/v12/style/style_learn.json", "lab/style_corpus/MANIFEST.json"),
    limitations="weak real signal (z=2.26, own>=pooled 3/3) below the z>=3 bar; only Dubov/Shirov/Ivanchuk have enough games; Tal/Nezhmetdinov/Planinc/Kupreichik/Suttles/Tigran V. Petrosian absent from CC0 broadcasts; two wrong-identity matches excluded",
    next_action="trajectory-level features (plan/structure choices over 10+ moves) instead of single-move features; more games per player")
for i in ("#145", "#060"):
    put(i, status="RESEARCH_INCOMPLETE", limitations="NOT ATTEMPTED; corpus blocker RESOLVED in V12 for living players via CC0 Lichess broadcasts (lab/style_corpus/MANIFEST.json); historical masters still unavailable",
        next_action=R[i].get("next_action") or "build on lab/style_corpus", artifacts=arts("lab/style_corpus/MANIFEST.json"))
# ---- DISCOVERY
mlp, rs = J("evidence/v12/sixth/mlp_lofo.json"), J("evidence/v12/sixth/residual_lofo.json")
put("#019", result=R["#019"]["result"] + f"; V12 MLP student LOFO beats Maia {mlp['families_mlp_beats_maia_top1']}; V12 residual-on-Maia student {rs['families_beats_maia_top1']} (ties {rs['ties']}) vs pre-registered 3/5",
    artifacts=R["#019"]["artifacts"] + arts("evidence/v12/PREREG_mlp_student.md", "evidence/v12/sixth/mlp_lofo.json", "evidence/v12/sixth/residual_lofo.json"),
    limitations="transfer still below bar: nonlinear 0/5 (family-cue overfitting); residual-on-Maia 2/5 (+2.5 capture, +3.1 quiet-offer, much worse on quiet)",
    next_action="board-encoder student with matched failed ideas; per-family regularisation chosen without the held-out family")
# ---- MEMORY (deterministic controls)
mc = J("evidence/v12/memory/memory_controls_det.json")["deterministic_rescore"]
put("#108", status="VERIFIED_FAIL_VARIANT", implementation="tools/memory_controls.py (correct / reset / irrelevant / plan-off) + tools/rescore_deterministic.py",
    command="python tools/memory_controls.py evidence/v12/memory/memory_controls.json 60 30000; python tools/rescore_deterministic.py ...",
    baseline="FEN reset and plan-off at equal nodes", metric="deterministic SF cp-loss, decision differences",
    result=f"{mc}", artifacts=arts("evidence/v12/PREREG_memory_controls.md", "evidence/v12/memory/memory_controls_det.json", "evidence/v12/memory/memory_controls_3cond.json"),
    limitations="plan memory changes 0/60 decisions at equal nodes; the 11 correct-vs-reset differences come from the warm transposition table; the earlier 3-condition 'pass' was Stockfish scoring noise (non-deterministic hash)",
    next_action="give plan state a causal channel (search extensions / ordering tied to plan prerequisites) and test on plan-interruption suite")
# ---- EVIDENCE integrity
put("#155", result=R["#155"]["result"] + "; V12: dataset preflight rejects biased V11 data and catches cross-split transposition leaks; deterministic re-scoring exposed SF cp-loss noise",
    artifacts=R["#155"]["artifacts"] + arts("tools/dataset_preflight.py", "evidence/v12/data/preflight_v11_s11_EXPECTED_FAIL.json", "tools/rescore_deterministic.py"))
# ---- optional overlays written by later steps
if os.path.isfile("evidence/v12/creative/hint_verify_v12.json"):
    hv = J("evidence/v12/creative/hint_verify_v12.json")
    put("#002", result=R["#002"]["result"] + f"; V12 single-candidate RootHint (fresh v12 suite): {hv['fresh']}",
        artifacts=R["#002"]["artifacts"] + arts("evidence/v12/PREREG_hint_verify.md", "evidence/v12/creative/hint_verify_v12.json", "evidence/v12/headroom_suite_v12.json"))
if os.path.isfile("evidence/v12/governor/curve_fit.json"):
    gf = J("evidence/v12/governor/curve_fit.json")
    put("#093", result=R["#093"]["result"] + f"; V12 learning-curve labels (deterministic, class-weighted): AUC logistic {gf['holdout_auc_logistic']}, changed-flag {gf['holdout_auc_changed_flag']}, instability {gf['holdout_auc_instability(1-stable)']}, positives {gf['positive_rate']} of {gf['examples']}",
        artifacts=R["#093"]["artifacts"] + arts("evidence/v12/governor/curve_fit.json", "lab/governor_v12/curve_s0.jsonl"),
        limitations="V12 labels are deterministic and budget-ladder based, but only 224 positions / 12 holdout positives (partial shard): PRELIMINARY; the V11 'changed' rule is anti-predictive under the corrected label")
# ---- provenance repair: artifacts whose files changed after V11 are re-pinned to frozen snapshots of the exact
# committed V11 versions (git show ea0e763:<path>), and only if the snapshot hash equals the recorded hash.
import subprocess
SNAP = "evidence/v11/source_snapshots"
for r in R.values():
    new = []
    for a in r.get("artifacts", []):
        p = a["path"]
        if os.path.isfile(p) and sha(p) == a["sha256"]:
            new.append(a); continue
        blob = subprocess.run(["git", "show", f"ea0e763b66c094b1a218c406b2cb39d973dd3888:projects/chimera-chess/{p}"], capture_output=True).stdout
        if blob and hashlib.sha256(blob).hexdigest() == a["sha256"]:
            q = os.path.join(SNAP, p)
            os.makedirs(os.path.dirname(q), exist_ok=True)
            open(q, "wb").write(blob)
            new.append({"path": q, "sha256": a["sha256"], "note": f"frozen V11 snapshot of {p} (ea0e763)"})
        else:
            new.append(a)  # left as is: the checker will flag it (no silent repair)
    r["artifacts"] = new
L["records"] = [R[r["id"]] for r in L["records"]]
json.dump(L, open("canon/LEDGER_V12_167.json", "w"), indent=1)
from collections import Counter
print(Counter(r["status"] for r in L["records"]), "v12-updated:", sum(1 for r in L["records"] if r.get("v12_updated")))
