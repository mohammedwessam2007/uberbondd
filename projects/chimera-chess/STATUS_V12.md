# CHIMERA V12 "Prometheus" session (2026-11-24). Mission state: **INCOMPLETE**

- **Branch:** `ccr-9399d410-lphg3o`. Started from `ea0e763b66c094b1a218c406b2cb39d973dd3888`. The final SHA is in the commit log.
- **Default engine:** still V8 (EvalV2). Bench output equals the frozen V8 reference; every new mechanism is opt-in.
- **Ledger:** `canon/LEDGER_V12_167.json` = the V11 ledger plus V12 overlays (V11 file unchanged). Checked with the unmodified `lab/04_check_completion.py`. Counts are in the final reply.
- **Rating:** UNRATED (FIDE / human-equivalent).

All pre-registrations are in `evidence/v12/PREREG_*.md`. Every equal-time match ran with background jobs suspended (SIGSTOP), so no contention.

## Wave A: evaluator (#025, #036)

- **Data preflight** (`tools/dataset_preflight.py`, a new gate before training):
  - V11 data is correctly **rejected** (white share 1.000; also 5 cross-split position leaks).
  - The new V12 data (3 × 3,000 self-play games, both sides to move) first **failed** on 81 transposition leaks.
  - After cross-split deduplication: **PASS**. 304,129 rows, 50.6% white-to-move, label/EvalV2 correlation 0.88 for both sides.
- **Training:** residual 768→128→1 reaches validation loss 0.00687 vs EvalV2 0.00850. The pure net reaches 0.00822.

| Test vs frozen V8 | Result | Verdict |
|---|---|---|
| Residual, **equal nodes** (Gate 1) | **30–8–10, +154 [+56, +284]** | PASS (significant) |
| Pure, equal nodes | 14–2–32, −137 | FAIL |
| Residual, **equal time** 10s+0.1 (Gate 2) | 17–11–20, −22 [−125, +78] | FAIL |
| Residual damped ×0.5, equal time 10s+0.1 (exploratory) | 20–14–14, +44 [−55, +150] | point bar met, low bound not |
| Damped ×0.5, **confirmation** 20s+0.2 (pre-registered) | **21–10–17, +29 [−70, +133]** | point bar met, lower bound not, so **not promoted** |

Pooled over the two equal-time runs of the damped variant: 41–24–31 (55.2%). The direction is positive in both, but neither meets the lower bound.

**Diagnosis:** at equal time the net's node rate is 90–95% of EvalV2, but the trees to a fixed depth are **0.78–2.12× larger**. The score scale is the same, so the pruning margins tuned to EvalV2 are the suspect.

## Wave B: creative verification (#002, #118, #163)

- `RootHint`: single-candidate injection (searched first, +1 ply), with no MultiPV and no budget splitting. Unit-checked: it never forces a refuted move.
- A fresh confirmation suite is being built at fixed nodes (contention-proof). **The pre-registered run (`evidence/v12/PREREG_hint_verify.md`) did not complete this session.** It is queued as Q3.

## Wave C: Counterfactual Blacksmith (#008, #052): VERIFIED_FAIL

All legal preparations were tested on 37 near-identical failed sacrifices. The ground truth is known (one attacker removed).
- **0/37 restorable** against best defense, even by oracle search over every preparation.
- A relaxed check only finds positions that are already lost.

This falsifies the premise that one tempo can replace a missing attacker against best defence. Next: near-sound sacrifices with 2-ply preparations.

## Wave D: memory (#108, #113): VERIFIED_FAIL, plus a measurement-integrity finding

60 live-plan positions, equal nodes, four conditions.

- **Plan memory on vs off changes 0/60 decisions.**
- Correct history vs FEN reset: −0.3cp (t −0.67). The 11 differing decisions come from the warm transposition table.
- Irrelevant history reset the plan in 60/60 positions and kept the same decision as reset in 58/60 (robustness OK).
- The **3-condition "pass" (−8.1cp) was an artifact.** Stockfish scoring is non-deterministic across hash states, and identical decisions received different losses. `tools/rescore_deterministic.py` fixes this.
- **Earlier cp-loss *deltas*** (V9 humanizer, V11 style lab, V11 artist union) used the noisy method and should be treated as approximate. Solve counts and decision-change counts are unaffected.

## Wave E: named-player style (#111): lawful corpus obtained; learning below bar

- **Licence resolved autonomously:** database.lichess.org states that exports, including Broadcasts, are **CC0**. 71 monthly broadcast dumps (2021–2026) were downloaded.
- **Identity audit kept:** Dubov 910 games, Ivanchuk 720, Shirov 537, Karpov 16, Basman 9.
- **Excluded:** "Petrosian" (= Tigran **L.**, not Tigran V.) and "Morozevich" (= Kirill).
- **Absent from broadcasts:** Tal, Nezhmetdinov, Planinc, Kupreichik, Suttles and Tigran V. Petrosian.
- **Learned per-player heads**, tested on held-out games: attribution **36.2% vs 33.3% chance (z = 2.26)**, below the pre-registered z ≥ 3. Own head ≥ pooled head for 3/3 players.
- **Verdict:** a weak real style signal, not learned style.

## Wave F: Sixth Instinct student (#019): still FAIL

Leave-one-family-out transfer against Maia3:

| Student | Families beating Maia | Note |
|---|---|---|
| V11 linear | 1/5 | |
| **V12 MLP** | **0/5** | overfits family cues |
| **V12 residual-on-Maia** | **2/5** + 1 tie | +2.5 points capture, +3.1 quiet-offer; much worse on quiet |

The pre-registered bar was 3/5.

## Wave H: governor (#093)

Deterministic fixed-node learning-curve labels were collected for a partial shard (`lab/governor_v12/`: 224 positions, 672 examples).

- Holdout AUC: logistic **0.64**, score swing 0.61, instability 0.50, and the V11 "best changed" flag **0.23** (anti-predictive).
- Only 12 positives are in the holdout, so this is **preliminary**. The hand-rule confirmation is queued (Q5).

## Mobile

No new device evidence. The NDK build path is unchanged.

## Queue

`lab/EXPERIMENT_QUEUE_V12.json` (Q1–Q11, with exact commands).
