# CHIMERA V9: "build the mind" session, 2026-11-24 (research milestone, NOT the finished CHIMERA)

- **Branch:** `ccr-9399d410-lphg3o`. Started from `996f5927b32ce64dba491bc76c14784a237cf8e0`. The final SHA is in the commit log.
- **Default engine** is still the V8 native core with EvalV2. Every new mechanism is opt-in, because none passed its pre-registered test.
- **Frozen reference:** `native/ref/chimera_v8_996f592.cpp` (SHA-256 `b0d1aa37…`), built as `native/ref/chimera-v8-ref` and used as the anchor player.
- **Default behaviour unchanged:** the current default build reproduces the reference's fixed-depth bench exactly on x86-64 and on arm64 (`native/dist/PARITY.txt`).
- **Tests:** 25 pass (V7 15, native 10). Rating: UNRATED (FIDE / human-equivalent).

## P1 Strength verification

V8 frozen reference vs Stockfish 16 UCI_Elo 2800 at **60s+0.6**: 48 games, 24 openings × 2 colours. Result **4–25–19 (34.4%), −112 [−231, −15]**, 0 forfeits, 0 illegal moves (`evidence/v9/matches/v8ref_vs_sf2800_60s.*`).

That implies about 2690 on Stockfish's scale (95% range roughly 2570–2785). It is consistent with the 20s+0.2 result (−145, pooled 2585 [2504, 2666]) within uncertainty. Both numbers are on **Stockfish's self-calibrated limited-strength scale, not FIDE or human-equivalent.**

Not done: a stronger independent fixed-node baseline. Only Stockfish anchors and our own builds were used.

## P2 Trained evaluator: VERIFIED_FAIL, twice

Pre-registered in `evidence/v9/PREREG_nnue.md`.

| Attempt | Data | Result vs EvalV2 |
|---|---|---|
| v1: 768→128→1, 128,677 positions (puzzles plus match PGNs, game-disjoint, SF16 depth-7 labels) | puzzle positions have a +484cp mean label for the side to move | Validation loss 0.0315 vs EvalV2 static 0.101. **0–48** at equal time |
| v2r: residual on EvalV2, 768→64→1, 69,322 quiet self-play positions | game-disjoint 63k/6k | Validation loss 0.00742 vs 0.00828. **10–8–30** (−154) at equal time; **18–9–21** (−22 [−125, +78]) at equal nodes |

- **Diagnosis** (`evidence/v9/failures/nnue_v1_diagnosis.txt`): on quiet game positions, v1 correlates 0.32 with Stockfish vs 0.64 for EvalV2; its start-position eval is +209cp.
- **Lesson:** a lower validation loss did not translate into chess results at these data sizes. The net costs about 2× in node rate, and even at equal nodes it is not better.
- Failed weights are kept in `evidence/v9/failures/`. No net ships by default.

## P3 Independent Skeptic: VERIFIED_FAIL (no headroom)

- **Mechanism:** a different evaluator plus a separate transposition table re-searches the chosen sacrifice and the best non-sacrifice alternative, and overrules the sacrifice if it scores more than 50cp worse (`native/chimera.cpp`, option `Skeptic`).
- **Results:**

  | Suite | Baseline | With Skeptic |
  |---|---|---|
  | V7 counterexamples, false sacrifices | 0/18 | 0/18 |
  | V7 positives solved | 37/42 | 37/42 |
  | Hard sacrifices solved | 50/60 | 50/60 (1↔1 swap) |
  | **New** 37 hard near-identical counterexamples, false sacrifices (`hard_sac_negatives.json`) | 0/37 | 0/37 |

- **Finding:** V8's search does not play unsound sacrifices on any of these suites. Its creative deficit is *missed* deep sound sacrifices, which are depth- or evaluation-limited (V8 diagnosis). The Skeptic therefore cannot help here and stays off.

## P4 Architect plan state: implemented and tested; no strength benefit (BOUNDED_TRIAL_NO_GAIN)

What `PlanState` in the native core does:
- Persists across real moves: objective, prerequisite squares, predicted reply, next move, expected score, confidence and plan version.
- Checks whether the game continued from the engine's own move, then classifies the plan as ON_TRACK, SURPRISED or BROKEN.
- Acts on that status:
  - ON_TRACK: the plan move goes first in move ordering, and the soft budget is ×0.75.
  - SURPRISED: extra repair time, soft budget ×1.35.
  - BROKEN: soft budget ×1.5.
  - The hard deadline is never extended.
- Resets on `ucinewgame` or FEN restore.
- Prints `info string plan …` traces every move.

| Test | Result |
|---|---|
| `tests.test_native.PlanMemoryTests` | ON_TRACK, surprise, reset, and **same board via two histories → different state** all pass |
| Equal-clock match, memory vs memoryless, 10s+0.1, 48 games | **13–17–18, −36 [−141, +62]** |

No benefit was measured, so the option stays off. A learned plan-state head and memory-dependent tasks remain open.

## P5 Grandmaster personality: BLOCKED

A historical master PGN corpus needs a licensing decision (see the owner action in the final reply). Nothing was trained, and no style labels were attached.

## P6 Sixth Instinct: NOT_ATTEMPTED

No concept-discovery experiment was run this session.

## P7 Humanization: measured baselines

On 800 held-out human positions (Lichess 2013-01, CC0, SHA-256 `aa40b367…1635`; both players ≥1600, base time ≥300s), top-1 agreement with the human move:

| Engine | Agreement |
|---|---|
| Maia3-5M | 54.9% |
| V8 (20k nodes) | 40.3% |
| Stockfish 16 depth 10 | 38.5% |

V8 agrees with Maia on 43.5% (`evidence/v9/human_match_lichess2013.json`).

The bounded-loss human-preference trade-off curve is in `evidence/v9/humanizer_pareto.json`. It plays Maia's predicted move only if V8's own 20k-node search rates it within the margin of V8's best. Stockfish 16 at depth 10 re-scores every chosen move:

| Margin | Human match | Mean SF cp loss | Maia move used |
|---|---|---|---|
| 0 | 41.1% | 36.3 | 49.5% |
| 10 | 43.5% | 38.6 | 57.0% |
| 25 | 47.0% | 38.2 | 68.6% |
| **50** | **50.8%** | **39.3** | 81.3% |
| 100 | 52.6% | 40.8 | 89.8% |
| 200 | 54.9% | 43.8 | 95.6% |

For reference: pure V8 matches 39.9% (cp loss ≈36); pure Maia3 matches 54.9% with cp loss 58.4.

At a 50cp margin, human-likeness gains about +11 points for about 3cp of extra loss. **This is MEASURED, not a gate pass.** It has not yet been wired into the UCI engine (Maia runs in Python), and the depth-10 cp-loss estimates are noisy.

Two engine bugs were found and fixed during this run; both have regression tests:
- `searchmoves` swallowed the `nodes N` limit.
- A forced single move returned with no `info pv` line. These are amateur human games, not grandmasters, and there was no blinded expert assessment. No scripted errors, telemetry or impersonation features exist.

## P8 Mobile: cross-build and parity only

The current source produces a static ARM64 build. Its output is identical to x86 and to the V8 reference under QEMU, including plan traces. `native/dist/device_bench.sh` is unchanged. **PHONE NOT TESTED.**
