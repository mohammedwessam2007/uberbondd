# RESUME HERE (CHIMERA): mission INCOMPLETE, frontier as of V11

1. `git fetch origin ccr-9399d410-lphg3o && git checkout ccr-9399d410-lphg3o && cd projects/chimera-chess`
2. `sh native/build.sh && g++ -std=c++17 -O2 -DNDEBUG -pthread native/ref/chimera_v8_996f592.cpp -o native/ref/chimera-v8-ref`
3. `python -m unittest tests.test_v7 tests.test_native`. Expect 32 OK.
4. `python tools/build_v11_ledger.py && python lab/04_check_completion.py canon/LEDGER_V11_167.json --root .`. Expect 167 accounted and 0 errors; release check exits nonzero by design.
5. Read `STATUS_V11.md`, then `canon/LEDGER_V11_167.json`. Pre-registrations are in `evidence/v11/PREREG_*.md`.

## Frontier queue (ordered by evidence)

1. **EVAL #025.**
   - Regenerate quiet data with both sides to move. The fixed builder alternates parity:
     `for s in 21 22 23; do python tools/build_selfplay_dataset.py lab/data/sp2_s$s.tsv.gz 3000 $s & done; wait`
   - Train a pure (non-residual) net and a residual net; add SIMD int16.
   - Gate both against `ref:2` with the same pre-registration.
2. **CREATIVE #002/#118/#032.**
   - Proposals already contain the solution 70% of the time.
   - Build a *deep* single-candidate verification: give the full remaining budget to the top Maia candidate only when the governor says the position is critical. Do not split the budget across many candidates.
   - Build a new fresh headroom suite (`tools/build_headroom_suite.py`, new seed) first.
3. **DISCOVERY #019.** Replace the linear student with a small board-encoder student trained on discoveries plus matched failures. Re-run leave-one-family-out against Maia.
4. **MEMORY #113/#108.** Build a memory-dependent task suite (opponent tendency, repetition rights), then a recurrent token. Computational carried state alone measured +14 (not significant).
5. **STYLE #050.** Variant 2 (null-window probes) result is in `evidence/v11/matches/style_attack_v2_vs_ref_10s.*`. Then build the fused restrict-then-attack profile.
6. **GOVERNOR.** Confirm the +22 hand rule with 96 more games; gather 10× governor labels.
7. **The 126 NOT-ATTEMPTED slots:** take the next actions from the ledger, grouped by shared lab component.

## Next command

```sh
for s in 21 22 23; do python tools/build_selfplay_dataset.py lab/data/sp2_s$s.tsv.gz 3000 $s & done; wait
```
