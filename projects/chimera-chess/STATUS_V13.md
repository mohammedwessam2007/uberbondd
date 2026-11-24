# CHIMERA V13 "Operation Metamorphosis" (session 2026-11-24). Mission state: **INCOMPLETE**

- **Branch:** `ccr-9399d410-lphg3o`. Started from `e0f8745`. The final SHA is in the commit log.
- **Default engine:** still V8 (EvalV2). The default bench equals the frozen V8 reference at 536,355 nodes, and x86-64 == linux-arm64 (qemu) == ref (`native/dist/PARITY.txt`). Every V13 mechanism is opt-in.
- **Rating:** UNRATED (FIDE / human-equivalent).
- **Tests:** 37 pass (test_v7, test_native, test_oracle).
- **Ledger:** `canon/LEDGER_V13_167.json` (V12 ledger plus V13 overlays, built by `tools/build_v13_ledger.py`). The unmodified checker reports **167/167 accounted for, 0 errors** (`evidence/v13/checker_v13.json`).
  - Status counts: RESEARCH_INCOMPLETE 100, VERIFIED_FAIL_VARIANT 24, BOUNDED_TRIAL 23, ARCHIVE_ONLY 12, PROXY_ONLY 5, SOURCE_MISSING 3.
- **119-idea offensive:** **20 previously unattempted IDs newly attempted**, each with a mechanism-specific test and its own evidence JSON. **9 met their pre-registered bar** (capped at BOUNDED_TRIAL); **0 validated** (no fresh confirmation yet).
  - Passed: #005 #007 #009 #011 #012 #037 #038 #104 #167.
  - Failed: #003 #013 #014 #022 #081 #086 #120 #123 #131 #137 #154.

## 1. Measurement firewall

- **Deterministic oracle** (`lab/oracle.py`): Stockfish 16, Threads 1, Hash 32, `ucinewgame` before every call, fixed nodes, SQLite cache. Three invariance tests (`tests/test_oracle.py`).
- **Resumable jobs:**
  - `tools/headroom_miner.py`: sharded; kill/resume tested with 0 duplicates.
  - `lab/human_dataset.py`: resumable.
- **Frozen inputs:** `evidence/v13/human_v13_frozen166.jsonl` (sha `c709977d…`) and `evidence/v13/headroom_v13.json` (51 items from 4,266 scanned).
- **Equal-time match isolation:** all other jobs were SIGSTOPped during the match (`evidence/v13/matches/isolation.txt`).

## 2. Evaluator × search co-evolution

- **A1 factorial:** EvalV2 / residual / residual ×0.5, crossed with three RFP/futility margin settings. 40 positions; depth 10 for statistics, 200k nodes for decisions (`evidence/v13/eval/factorial_d10.json`).
  - The residual net **lowers the null-move cut rate from 0.57 to 0.46** and raises the LMR re-search rate. At equal depth it searches more nodes (412k vs 360k).
  - Narrow margins shrink the net's trees but raise its decision loss (18.7 vs 12.3cp).
  - SPSA is **not** justified by this data. The next lever is null-move conditions or R for the net.
- **A4 equal-time 40s+0.4, isolated:** residual ×0.5 vs frozen V8 scored **21–10–17, +29 [−70, +133]**. That **fails** the pre-registered bar.
  - Three equal-time runs of this variant (10s, 20s, 40s) pool to 62–34–48 over 144 games (55.6%): consistently positive, never significant.

## 3. Creative verification (B): RootHint controls at equal nodes (51 hard positions, 200k nodes)

| Hint | Solved (all) | Confirm half | Hint = solution |
|---|---|---|---|
| none | 1 | 1 | — |
| Maia3 | 2 | 1 | 15 |
| random | 3 | 3 | 2 |
| learned student | 3 | 2 | 20 |
| **oracle-best (upper bound)** | **4** | 3 | 51 |

- **The decisive finding:** even when handed the correct move, the verifier accepts it in only 4/51 positions. The bottleneck is **verification depth, not proposal** (H1 FAIL).
- H2 (Maia beats random on confirm): FAIL.
- **#038 sparse activation** (fire the Maia hint only when Maia ≠ the 2k-node move; fires 59% of the time): expected loss 512.9 vs 539.7 for random routing at the same rate, and 530.6 for always-on. That passes the pre-registered bar, but with no CI and a small suite.

## 4. Causal memory (D): `PlanBias` / `PlanCorrupt` native channel

- **The channel:** plan target squares get move-ordering priority inside the tree, and the plan move gets a root extension.
- **60 positions, 150k nodes, TT cleared** (`evidence/v13/memory/causal_intervention.json`):

| Hypothesis | Result | Verdict |
|---|---|---|
| H1: the channel changes decisions | **21.7%** of decisions changed (V12 plan memory: 0%) | **PASS** |
| H2: wrong memory hurts | CI includes 0 | FAIL |
| H3: irrelevant history behaves like none | RESET in 100%, but decisions differ from "none" in 17% | FAIL; caused by the uncleared history table (cache confound) |
| H4: correct memory improves play | no loss benefit | FAIL |

## 5. Style (E): #050 Petrosian→Tal transform, state-conditioned

- **Mechanism:** native `StyleProfile=transform` restrains until opponent mobility ≤ 28 or attack pressure ≥ 6, then attacks.
- **Engine limitation found:** style probes abort under node limits, so the first run was invalid. It is kept as `transform_120_INVALID_nodes.json`.
- **Valid run** (depth 8, 120 fresh positions): transform loss 32.1 vs attack-only 29.4, so **H1 FAILS**. It changes 10/120 moves (2 attack-mode, 8 restraint-mode).

## 6. Human-cognition and regret probes

Data: 157 games, one position per game, Lichess 2013-01 (CC0).

| ID | Test | Result |
|---|---|---|
| #009 | Held-out log loss of the human move | Maia 1.44 vs class-frequency 3.12 vs uniform 3.19. **PASS** |
| #012 | False safety | 9 positions where the most human-likely move is quiet but loses ≥100cp: error rate 0.78 vs 0.13 (rating-matched CI [0.32, 0.89]). **PASS**, small n |
| #037 | Tiny cheap-feature regret estimator | AUC 0.63 vs 0.50 for a single flip. **PASS** |
| #005 | WDL calibration | Brier: Maia 0.197, oracle logistic 0.188, constant 0.234. **PASS** vs constant |
| #007 | Disagreement records | 75 records adjudicated by the oracle: search better 34, policy better 39 (descriptive; training not done) |
| #154 | Engine loss vs complexity | No significant relation at 2k/20k/200k nodes. FAIL |
| #014 | Atlas vs Maia entropy | AUC 0.50 vs 0.56. FAIL |
| #081 | Shallow→deep value change | AUC 0.51. FAIL |
| #086 | Dispersion (AUC 0.70) vs entropy (0.66) | Difference not significant. FAIL |
| #013 | Fronts count | AUC gain −0.014. FAIL |
| #137 | Motif difficulty | AUC gain −0.05. FAIL |
| #120 | Two-world critic | Mix worse than oracle-only on held-out games. FAIL |
| #131 | Only-move diagnostic | ρ −0.14, CI crosses 0. FAIL |
| #123 | Flip-triggered escalation | Worse than random routing. FAIL |

## 7. Discovery probes (150 pool items)

- **#104:** 132/150 confirmed at deterministic 300k; 87 are persistent gaps not found by V8 at 600k. **PASS**
- **#011:** 21 verified counterintuitive mutants out of 300 (7% yield). **PASS**
- **#022:** 0/150 source-novel; every item is a published puzzle. FAIL
- **#003:** after capping mate scores, the quiet-family depth rise (86.8) is not above the forcing-family rise (91.0). FAIL
- **#032:** quiet head 0.873 vs 0.732 top-3 recall on quiet moves, 5/5 folds. BOUNDED_TRIAL; the smoke run was seen before pre-registration.
- **#018:** failure contrast sets win 2/5 folds. FAIL

## 8. #167 highlight generator

- 6 games of the A4 match: 112 claims, of which **93 survived independent 1M-node re-verification (83%)**; 19 were dropped; 25 are quiet only-moves.
- Not pre-registered, and no human usefulness raters.

## 9. Integrity corrections made this session

1. First-draft probes did not match canon `method_proposed` (e.g. #154 must measure engine quality; #013 forbids move-agreement proxies). They were rewritten **before** the final data, and the revision is logged in `PREREG_probes_human.md`. #029 and #127 were dropped rather than relabelled.
2. The #003 first pass was dominated by mate scores; it was recomputed with a ±1000cp cap, and the correction is stored in its JSON.
3. The #050 node-limit run was invalid (style inactive); kept and amended.
4. The memory control has a history-table cache confound; recorded as a failure, not hidden.

## 10. Mobile

- ARM64 static and Android NDK r27c binaries were rebuilt from the V13 source; parity is OK.
- **No Android emulator is possible here** (no `/dev/kvm`, no emulator image).
- **No phone has been tested.**

## Queue

`lab/EXPERIMENT_QUEUE_V13.json`.
