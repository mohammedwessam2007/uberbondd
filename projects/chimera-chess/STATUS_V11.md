# CHIMERA V11: execution of the 167-ID register (session 2026-11-24). Mission state: **INCOMPLETE**

- **Branch:** `ccr-9399d410-lphg3o`. Started from `17d13c2c6fe7471a7d088def654859b57da20be5`. The final SHA is in the commit log.
- **Default engine:** still the V8 native core with EvalV2. It equals the frozen V8 reference bench on x86-64 and linux-arm64 (`native/dist/PARITY.txt`).
- **Tests:** 32 pass.
- **Rating:** UNRATED (FIDE / human-equivalent). The 2500–2600 target is not measured.

## Ledger

`canon/LEDGER_V11_167.json` was built by `tools/build_v11_ledger.py` from the unmodified template, and checked with the unmodified checker (`lab/04_check_completion.py`).

| | Count |
|---|---|
| Slots accounted for (structural, 0 checker errors) | **167/167** |
| Actionable slots validated (VERIFIED_VALIDATED) | **0** (release check exits 2, as it should) |
| Bounded trials (mechanism plus experiment, not validated) | 14 |
| Verified failures of a specific variant | 8 |
| Proxy measurements only | 6 |
| Implemented, unvalidated | 1 |
| Blocked (licensed master corpus) | 3 |
| Research incomplete with partial component (e.g. #112 Maia verified, Searchless missing) | 1 |
| **Not attempted** (explicit next action recorded) | 119 |
| Archive-only (preserved, never implemented) | 12 |
| Source missing (#140, #143, #144; not reconstructed) | 3 |

**Integrated release readiness:** not releasable as "CHIMERA complete". The strong default engine is releasable as the V8 engine.

## What was built and measured this session

All pre-registrations are in `evidence/v11/PREREG_*.md`. Matches are 48 games over 24 openings × 2 colours against the frozen `ref:2` unless stated.

| Workstream / IDs | Mechanism (code) | Result | Verdict |
|---|---|---|---|
| EVAL #036 | Quantized incremental accumulator (`Position::acc_update`, `nncheck`) | 0 mismatches over about 164k tree nodes; ≤2.9cp quantization error; node rate equal to EvalV2 (V9 was 2× slower) | bounded trial: mechanism works |
| EVAL #025 | Residual 768→128→1 net, 341,692 quiet self-play positions; scaling curve 50k/150k/342k = 0.00748/0.00693/0.00654 validation loss (EvalV2 0.00833) | Equal nodes **+97 [−1, +211]**; equal time **−14 [−117, +85]** (clean), −81 (CPU-contended run, kept and labelled) | FAIL of the equal-time bar; real evaluation gain at equal nodes |
| EVAL diagnosis | `evidence/v11/eval/eval_v3_bias_diagnosis.txt` | Training data was **100% white-to-move** (builder bug, now fixed). Still better correlation with SF on both sides (0.80/0.82 vs 0.75/0.77) | next: rebuild data with both sides |
| PLAN #002 / #047 | Artist union: MultiPV + Maia3 + #047 grammar, focused verification (`tools/artist_union.py`) | Fresh headroom half: **13/43 vs 24/43** plain search. Solution was in the candidate union 30/43; Maia covers 46/80 | FAIL: proposal good, short verification bad |
| PLAN #118 | Conservative switching variant (dev only) | 17/37 vs 18/37 | FAIL (exploratory) |
| GOVERNOR #093 | Learned 6-feature value-of-thought logistic (`tools/governor_lab.py`, 700 labelled positions) | Holdout AUC **0.50** vs single "best changed" flag 0.62 | FAIL |
| GOVERNOR #017/#099/#116 | Hand rule in native `Governor` (extend if best changed, stop early if stable) | **16–19–13, +22 [−78, +125]** | point bar met, **not significant**, not validated |
| MEMORY #113 | Stateful (TT/history/plan persist) vs `ClearStateEachMove` | 19–12–17, +14 [−85, +117] | FAIL (bar +20) |
| STYLE #050/#020 | Native `StyleProfile` attack/restraint: trait choice among near-best moves | Fixed-depth lab (200 positions): changes 33%/39% of moves; trait gain +3.45/+6.59; no SF cp cost. **Games v1 (MultiPV-4): 1–13–34, −293.** MultiPV-4 control without style: **−243** | FAIL v1; variant 2 (null-window probes) result below |
| DISCOVERY #030 / #019 | MAP-Elites archive of 448 search-gap discoveries in 16 cells; listwise student | Game-disjoint holdout: student top-1 **0.469 vs Maia 0.429**. **Leave-one-family-out: worse than Maia on 4 of 5 families** | archive works; **transfer FAILS**, so the Sixth Instinct is NOT demonstrated |
| MOBILE | **Real Android NDK r27c build** (`native/dist/chimera-android-arm64`: bionic `/system/bin/linker64`, API 28, 16 KB-aligned LOAD, libc/libm/libdl only); device harness prefers it | Built and statically checked; **NOT EXECUTED** (no Android device or emulator) | phone NOT tested |
| HUMAN #115 | V9 measurements carried (Maia3 54.9%, V8 40.3% human move match) | — | proxy only |

## Style variant 2

Variant 2 drops MultiPV and uses null-window margin probes.

- **Games:** attack vs ref **18–9–21, −22 [−125, +78]**. That meets the pre-registered ≥ −30 bar.
- **Lab** (100 positions, depth 8):

  | Profile | Moves changed | Trait gain on changed moves | SF cp cost on changed moves |
  |---|---|---|---|
  | attack | 19% | +3.37 | +32 |
  | restraint | 31% | +4.68 | +17 |

**Verdict: BOUNDED_TRIAL.** It visibly changes play toward the trait at an acceptable game cost, but bound-only scores add objective loss per changed move. These are heuristic trait profiles, not named masters.

## Known negative facts the next session must not re-learn

1. More data alone did not make the evaluator win at equal time. Its equal-node gain is real; time cost and the white-to-move data bias are the next levers.
2. Candidate *proposal* is not the creative bottleneck; *verification at short budgets* is.
3. A linear student over hand features does not transfer across motif families.
4. MultiPV-4 costs about 240 Elo at 10s+0.1. No profile may depend on it.
5. A learned governor needs far more than 54 positive labels.

## Blockers needing the owner (at most three)

1. A licensed historical master corpus is needed for named-master style (#111, #145, #060).
2. OnePlus 15 run of `native/dist/device_bench.sh`.
3. Consenting human experts for aesthetics and blinded evaluation (#021, #064, #160 and the G11 claims).
