# RESUME HERE (CHIMERA)

1. `git fetch origin ccr-9399d410-lphg3o && git checkout ccr-9399d410-lphg3o`.
2. `cd projects/chimera-chess && sh native/build.sh && g++ -std=c++17 -O2 -DNDEBUG -pthread native/ref/chimera_v8_996f592.cpp -o native/ref/chimera-v8-ref`
3. `python -m unittest tests.test_v7 tests.test_native`. Expect 27 OK.
4. Read `STATUS_V9.md` (current), `STATUS_V8.md`, `STATUS.md`, then `canon/LEDGER_V9_167.csv`.

## What the V9 evidence says to do next (ordered)

1. **Strength via evaluation, done properly.** Both trained-evaluator attempts failed (`evidence/v9/PREREG_nnue.md`).
   - **Root causes:**
     - Data size: 63–129k positions is far too few.
     - Label bias: puzzle positions skew the target.
     - No incremental accumulator: about 2× node-rate cost.
   - **Next:**
     - Generate at least 2M quiet self-play positions (`tools/build_selfplay_dataset.py`, run in parallel shards). Label them with SF16 depth 9.
     - Add an incremental accumulator in `nnue_eval`.
     - Retrain the residual net.
   - **Gate:** the same pre-registration, versus `ref:2`.
2. **Creativity where the deficit actually is.** V8 does not play unsound sacrifices (0/37 hard counterexamples). It misses deep sound ones: 10/60 hard sacrifices, depth- or evaluation-limited.
   - The useful mechanism is selective *search* depth on sacrifice lines: singular or sacrifice extensions *inside* the tree, not just at the root, plus better evaluation.
   - **Gate:** `evidence/v8/hard_sac_suite.json` plus `evidence/v9/hard_sac_negatives.json` (no false-sacrifice regression).
3. **Memory.** The deterministic `PlanState` has no strength benefit (`evidence/v9/matches/planmemory_vs_none_10s.*`).
   - **Next:** a memory-*dependent* task suite, e.g. the same board where the history makes a different plan correct (opponent tendencies, repetition rights).
   - A learned plan-state head should only follow once that suite exists.
4. **Humanization.** On real human games, Maia3 matches 54.9% vs V8's 40.3%.
   - The bounded-loss curve in `evidence/v9/humanizer_pareto.json` gives the human-likeness vs cp-loss trade-off.
   - **Next:** wire it into the engine as a UCI option, with the margin chosen from that curve. Then do blinded assessment.
5. **Style corpus.** Blocked on a licensing decision.
6. **Device:** run `native/dist/device_bench.sh` on the phone.

## Next command

```sh
cd projects/chimera-chess && for s in 11 12 13; do python tools/build_selfplay_dataset.py nnue/dataset_v3_s$s.tsv.gz 8000 $s & done; wait
```
