# CHIMERA V7: gate status, 2026-11-23 (Opus takeover session)

Every number below comes from a file in `evidence/`. Rating: **UNRATED** (FIDE / human-equivalent).

| Gate | Status | Evidence |
|---|---|---|
| G0 Archive continuity | **VERIFIED PASS** | 44/44 manifest hashes; V4 167-ID register `c6cae3f0…b149` unchanged; `tools/ledger.py` asserts the hash |
| G1 Exact V6 recovered | **BLOCKED** | `RECOVERY_RECEIPT_2026-11-23.md`. V6 checkpoint ZIP and Android ZIP absent from uploads, container and git remote |
| G2 Real pretrained forward calls | **PARTIAL** | Maia3-5M passes (below). Searchless-9M is not attempted |
| G3 Strength | **PARTIAL** | 48 clocked, colour-balanced games vs two Stockfish anchors (below). No neural-strength or V6 comparison |
| G4 Creative mechanism | **PARTIAL / VERIFIED FAIL as a strength feature** | Artist–Architect–Skeptic works and is tested, but does not beat Tactical at equal time. Kept **disabled by default** |
| G5 Memory / personality | **PARTIAL / NOT ATTEMPTED** | Deterministic plan memory is tested. No trained style corpus; no learned personality |
| G6 Mobile | **NOT ATTEMPTED on device** | Host latency only. No OnePlus 15 data exists. V7 is Python; the V6 native ARM64 build was not recovered |
| G7 Evidence / checkpoint | **PASS for V7 scope** | Source, tests, PGNs, logs, failures, ledger, `MANIFEST.sha256`, checkpoint ZIP. Maia weights come via `tools/fetch_models.sh` (pinned hash) |

G2 detail:
- Maia3-5M (UofTCSSLab weights, ONNX from MIT `maia3-js@0.2.0`, SHA-256 `f7bd01b3…b804`) runs real forward calls.
- The Python port matches the JS reference on 61/61 positions (argmax).
- Maximum probability difference is 3.2e-6; maximum WDL difference is 4.9e-7 (`evidence/maia/`).

## Strength (G3)

Engine: CHIMERA V7 **Tactical** mode, a pure-Python alpha-beta searcher at about 20–30k nodes/s.
Conditions: 40s+0.4s per side, 12 openings × 2 colours, harness-owned clock, python-chess legality.
Opponent: Stockfish 16 (Ubuntu 16-1build1), Threads 1, Hash 16, `UCI_LimitStrength`.

| Opponent | Games | W–D–L | Score | Elo diff (95% CI) | Forfeits / illegal |
|---|---|---|---|---|---|
| SF16 UCI_Elo 1600 | 24 | 14–1–9 | 60.4% | +73 (−64, +241) | 0 / 0 |
| SF16 UCI_Elo 2000 | 24 | 11–5–8 | 56.3% | +44 (−97, +201) | 0 / 0 |

Pooled maximum-likelihood estimate on **Stockfish's own UCI_Elo scale**: 1880, 95% CI 1765–1996 (`evidence/matches/pooled_estimate.json`).

Falsifier against this number:
- The two anchors are non-monotone.
- Stockfish's limited-strength calibration at this time control and on this host is unverified.
- 48 games is a small sample.

This is **not** FIDE, not human-equivalent and not CCRL. The 2500–2600 target is **not reached and not measured**.

The match games ran on the build that polled the clock every 512 nodes. The only change after that is the 128-node poll, which affects timing, not search logic.

**Loss diagnosis** (`evidence/matches/loss_analysis_sf1600.json`, SF16 depth 12): each of the 9 losses to SF-1600 has one decisive error, the largest drop while the position was still ≥ −300cp.
- 7 were positional or horizon misjudgements (150–500cp drops with no immediate material loss).
- 1 was a tactical material loss.
- 1 was gradual.

So the next strength lever is evaluation quality and depth, not blunder-checking. A first-pass classifier mislabelled already-lost positions as "allowed mate". It is kept in `evidence/failures/`.

## Creative intelligence (G4): unseen, independently validated benchmark

- **Source.** 60 positions from the CC0 Lichess puzzle database (`evidence/creative/bench.json`). The first 4 MB slice was used; its SHA-256 is recorded in the file.
- **Positives (42).** 24 sacrifice, 12 quiet-move and 6 zugzwang positions, each first-move-confirmed best by SF16 at depth 18.
- **Negatives (18).** Near-identical counterexamples: one attacking piece is removed, and SF16 confirms the original sacrifice now loses at least 150cp.
- **Conditions.** Equal 2s per position; every chosen move is re-scored by SF16 at depth 16.

| Run | Mode | Positives solved (strict) | False sacrifices on negatives | Mean cp loss |
|---|---|---|---|---|
| run1 V7.0 | Tactical | 30/42 | 1/18 | 121 |
|  | Creative (AAS) | 28/42 | **0/18** | 160 |
| run2 V7.1 (clock give-back) | Tactical | 30/42 | 1/18 | 125 |
|  | Creative | 29/42 | 1/18 | 146 |
| run3 V7.2 (Maia3 as independent Artist) | Tactical | 31/42 | 1/18 | 119 |
|  | Creative+Maia | 30/42 | 1/18 | 138 |

**Verdict.** At equal wall-clock time, the creative layer does **not** improve play. That has held across three variants, so it stays opt-in (`setoption name Mode value Creative`).

**Diagnosis** (from the per-position diff, run3).
- When Creative picks a different move, it is almost always because the main search got only 60% of the clock and missed what the full-time search finds (e.g. 001xO, 008LT).
- The Artist found a strictly better move once (00QyM: cp loss 5 vs 255 for Tactical).
- The Skeptic is the same evaluator as the proposer, so it is a correlated critic. That is a known limit of #053.

**What is verified about the mechanism.**
- The Artist tags candidates: sacrifice, check, king-zone, quiet, break.
- The Skeptic re-searches the best defence at a budget equal to the plain best, and gives sacrifices 1.5× budget.
- Every rejection keeps its refutation and cp deficit; 98–189 per run are logged.
- The Architect emits a plan witness with board prerequisites.
- PlanMemory detects interference and refutation and re-plans.
- These are unit-tested in `tests/test_v7.py`, which also keeps the V6 Qg8/Kd3 fixtures as regressions.

## Latency (host only, `evidence/latency_host.json`)

- **Tactical at a requested 80ms:** P50 81ms, P95 83ms, max 85ms. Before the poll fix it was P95 100ms (`evidence/failures/latency_host_v7.0_poll512_P95_overshoot.json`). The UCI path also subtracts `MoveOverheadMs` (default 50).
- **Maia3-5M forward:** P50 13ms, P95 15ms; load 164ms.
- **Peak RSS:** 102MB.
- None of this is OnePlus 15 data.

## Next highest-value steps (ordered by the evidence)

1. **Evaluation and depth.** 7 of 9 decisive errors were positional. Options:
   - port the search core to C++ or Rust (about 50× node rate);
   - use the Maia3 value head, or a Searchless-style critic, at the root and PV leaves;
   - test an NNUE-style learned evaluation trained on SF-labelled positions.
   Measure each with `tools/match.py` against the same anchors.
2. **Creative layer.**
   - Give it extra time only in positions the main search marks as critical (score instability or a sacrifice in the top-3). It should never take time from the main search.
   - Use an *independent* critic, e.g. the Maia3 value, so the Skeptic is not correlated with the proposer.
   - Re-run `creative_bench.py`.
3. **Device run of the host harness.** This needs the owner's phone (see the owner actions in the session reply).
