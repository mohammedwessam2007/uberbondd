# CHIMERA: the full report of everything done (V7 → V13 in progress)

Written 2026-11-24. Branch `ccr-9399d410-lphg3o`. All work is confined to `projects/chimera-chess/`.

Every number below comes from a file in this repository: a STATUS file, `evidence/`, or the ledgers.

**Rating:** UNRATED (FIDE / human-equivalent). The 2500–2600 human-equivalent goal has **never** been measured. The 2585 figure is on Stockfish's own scale only.

**Spending:** $0 throughout. No paid APIs, purchases or deployments.

---

## 0. One-paragraph truth

CHIMERA is a real, fast, tested native C++ chess engine.

- On Stockfish 16's own limited-strength scale it measures about **2585 at 20s+0.2** (95% CI 2504–2666) and about **2690 at 60s+0.6** (wide CI). This is not FIDE or human-equivalent.
- The "mind" faculties — Artist, Architect, Skeptic, memory, personality, Sixth Instinct and governor — all exist as working, opt-in mechanisms with pre-registered tests.
- **None has yet passed a strength-improving, independently confirmed test.** Most have well-documented failures, and those failures taught specific lessons.
- The biggest real gains:
  - The native core is about 100× faster than V7.
  - EvalV2 beats EvalV1 by +137 Elo.
  - A trained residual NNUE gives **+154 Elo at equal nodes**, though not yet at equal time.
  - The measurement system was hardened after it caught its own fake "passes".

---

## 1. Timeline of commits

| Commit | Version | Headline |
|---|---|---|
| `12705a7` | V7 | Python tactical core, Artist–Architect–Skeptic layer, Maia3 policy, first matches, checkpoint |
| `0a99ae8` | V8 interim | Native C++17 core, EvalV2, held-out suites, ARM64 static build |
| `996f592` | V8 | Stockfish 2800 anchor, cognition traces, latency contract, checkpoint |
| `f759f68` | V9 interim | 60s anchor, NNUE and Skeptic pre-registrations (both failed), native plan state, humanization baseline |
| `17d13c2` | V9 | Humanizer trade-off curve, two engine protocol fixes, checkpoint |
| `ea0e763` | V11 | 167-slot ledger (checker-clean), incremental NNUE, Android NDK build, discovery lab, style/governor/memory/artist experiments |
| `e0f8745` | V12 | Corrected evaluator data and preflight, +154 Elo at equal nodes, CC0 named-player corpus, Blacksmith, memory controls, deterministic scoring |
| `886994a` | V13 interim | Deterministic oracle, resumable miners, A1 factorial, causal plan channel and intervention test, transform style, probe suites |
| `3548f50` | V13 | A4 match log, partial |

---

## 2. V7 — Opus takeover (first session)

- **Recovery:**
  - The Codex V6 executable and Android ZIP were **not found** in the uploads, the container or the git remote. G1 is BLOCKED and recorded in `RECOVERY_RECEIPT_2026-11-23.md`.
  - The 167-ID canon was preserved byte-for-byte: 44/44 manifest hashes match, register SHA-256 `c6cae3f0…b149`.
- **Built:** new Python engine (V7 is *not* V6):
  - Tactical alpha-beta search with a hard clock.
  - Artist–Architect–Skeptic creative layer.
  - Persistent plan memory.
  - Maia3-5M human policy via ONNX.
  - UCI front end.
- **Maia3 verified:** the Python port matches the JS reference argmax on 61/61 positions. Maximum probability difference 3.2e-6.
- **Strength at 40s+0.4:**
  - vs Stockfish 16 at UCI_Elo 1600: 14–1–9 (+73).
  - vs Stockfish 16 at UCI_Elo 2000: 11–5–8 (+44).
  - Pooled: **1880** [1765–1996] on Stockfish's scale.
- **Failure:** the Artist–Architect–Skeptic layer did not beat plain Tactical at equal time, so it stays off by default.
- **Mobile:** host latency only. No phone data.
- **Tests:** 15 pass.

## 3. V8 — Grandmaster Completion Mandate

- **Profiling:** V7 ran about 7.6k nodes/s, with 44% of time in evaluation.
- **Native C++17 core:** bitboards, PVS, transposition table, null move, LMR, SEE quiescence, hard-deadline time manager. About 2–2.9M nodes/s, roughly **100× faster** than V7. It became the default engine.
- **EvalV2** (mobility, king-attack units, passed-pawn terms): **+137 Elo** [+39, +262] over EvalV1 at equal time.
- **Strength:**

  | Opponent | TC | W–D–L | Elo diff [95% CI] |
  |---|---|---|---|
  | V7 | 40s+0.4 | 24–0 | — |
  | SF16 UCI_Elo 2400 | 20s+0.2 | 23–18–7 | +120 [+23, +241] |
  | SF16 UCI_Elo 2800 | 20s+0.2 | 3–23–22 | −145 [−273, −48] |

  Pooled: **2585 [2504–2666]** on Stockfish's scale.
- **Held-out tactics:** 107/110 vs 87/110 for V7.
- **Latency:** 0 deadline violations at 80, 250 and 1000ms movetime. Under load the maximum was 70ms at an 80ms budget.
- **ARM64:** the static build has perft and bench parity with x86 under qemu.
- **Failures:**
  - ArtistExtension (root sacrifice extension), pre-registered: 50/60 vs 50/60.
  - Diagnosis: 7 of 10 misses are depth-limited and 3 are evaluation- or pruning-limited.
- **Bug fixed:** a Python timeout corrupted the board (unwind fix).

## 4. V9 — "Operation The Sixth Instinct"

- **60s+0.6 vs SF2800:** 4–25–19, −112 [−231, −15], which implies about **2690** on Stockfish's scale.
- **Frozen V8 reference player:** `ref:2`. The default build must reproduce its bench (536,355 nodes).
- **Trained NNUE:** VERIFIED_FAIL ×2.
  - v1 (puzzle-biased labels, +484cp mean) lost 0–48.
  - v2 residual lost −154 at equal time and scored −22 at equal nodes.
  - Lesson: lower validation loss did not mean better chess.
- **Independent Skeptic:** VERIFIED_FAIL (no headroom).
  - V8 never plays unsound sacrifices: 0/18 and 0/37 false sacrifices on the counterexample suites.
  - Its problem is *missed* deep sacrifices, not reckless ones.
- **Architect PlanState:** objective, predicted reply, ON_TRACK/SURPRISED/BROKEN status. It persists across moves, and the same board reached by two different histories gives different states (tested).
  - Match result: −36 [−141, +62]. No benefit.
- **Humanization** (800 Lichess positions):
  - Human-move agreement: Maia 54.9%, V8 40.3%, Stockfish depth 10 38.5%.
  - Humanizer trade-off: at a 50cp margin, human match is **50.8% for about +3cp loss**.
- **Bugs fixed:** `searchmoves` swallowed `nodes N`; a forced move printed no `pv` line. Both have regression tests.
- **Tests:** 25 pass.

## 5. V11 — "Operation Absolute Completion" (167-ID register)

- **Ledger:** 167/167 slots accounted for, with 0 errors from the unmodified checker.
  - 0 validated, 14 bounded trials, 8 verified failures, 119 not attempted, 12 archive-only, 3 source-missing.
- **Incremental quantized NNUE accumulator (#036):** exact over about 164k nodes, and the same speed as EvalV2.
- **Residual net (#025), 342k positions:**
  - Equal nodes: +97 [−1, +211].
  - Equal time: −14.
  - Found the **training data was 100% white-to-move** (builder bug, fixed).
- **Artist union (#002/#047):** the solution was among the candidates in 30/43 positions, but the hinted search solved only 13/43 vs 24/43 for plain search.
  - Lesson: **proposal is not the bottleneck; verification is.**
- **Governor:**
  - Learned version: AUC 0.50, a fail.
  - Hand rule: +22, not significant.
- **Memory (#113):** stateful search scored +14, failing the +20 bar.
- **Style (#050/#020):**
  - v1 with MultiPV-4 lost −293. A MultiPV-4 control without style lost −243, so **MultiPV costs about 240 Elo**.
  - v2 (null-window probes): −22, within the bar. Bounded trial.
- **Discovery (#030/#019):** MAP-Elites archive of 448 search-gap discoveries.
  - The student beats Maia on a game-disjoint holdout (0.469 vs 0.429).
  - **Transfer fails:** leave-one-family-out, it is worse than Maia on 4 of 5 families.
- **Android:** real NDK r27c build (bionic, API 28, 16 KB-aligned). **Never executed on a device.**
- **Tests:** 32 pass.

## 6. V12 — "Operation Prometheus"

- **Data preflight gate:**
  - It rejected the biased V11 data.
  - It caught 81 cross-split transposition leaks in the new data. These were deduplicated, and the data passed: 304k rows, 50.6% white-to-move.
- **Evaluator:**

  | Test vs frozen V8 | Result |
  |---|---|
  | Residual net, **equal nodes** | **+154 [+56, +284]**, significant |
  | Residual net, equal time 10s+0.1 | −22 |
  | Damped ×0.5, 10s+0.1 | +44 |
  | Damped ×0.5, 20s+0.2 confirmation | +29 [−70, +133]; point bar met, lower bound not, so not promoted |

  - Diagnosis: trees are 0.78–2.12× larger at fixed depth.
- **Blacksmith (#008/#052):** 0/37 sacrifices restorable by any legal preparation against best defence. Premise falsified.
- **Memory controls:**
  - Plan memory changes **0/60** decisions.
  - The earlier "pass" was **Stockfish non-determinism**. Deterministic rescoring was introduced, and earlier cp-loss deltas were marked approximate.
- **Named style corpus:** CC0 Lichess broadcasts, with identity audits.
  - Players and game counts: Dubov 910, Ivanchuk 720, Shirov 537, Karpov 16, Basman 9.
  - Wrong identities were excluded (Tigran L. Petrosian, Kirill Morozevich).
  - Absent from the broadcasts: Tal, Nezhmetdinov, Planinc, Kupreichik, Suttles and Tigran V. Petrosian.
  - Attribution: 36.2% vs 33.3% chance (z = 2.26), below the z ≥ 3 bar.
- **Sixth Instinct student:** still fails. MLP 0/5 families; residual-on-Maia 2/5.
- **Governor labels:** AUC 0.64 (preliminary). The V11 "best changed" flag turned out to be anti-predictive (0.23).
- **Ledger:** 120 research-incomplete, 13 bounded trials, 12 verified failures, 12 archive-only, 6 proxy-only, 3 source-missing, 1 implemented-unvalidated.

## 7. V13 — "Operation Metamorphosis" (in progress now)

### Built
- **Measurement firewall** (`lab/oracle.py`): deterministic Stockfish oracle.
  - Fresh hash on every call, 1 thread, fixed nodes, SQLite cache.
  - 3 invariance tests pass: fresh engines agree, order independence, cache hit.
- **Resumable sharded headroom miner:** interruption-tested, with 0 duplicates after resume.
- **Resumable human dataset builder:** Lichess 2013, Maia top-5, V8 moves at 2k/20k/200k nodes, oracle score of every legal move.
- **Native engine additions:**
  - `SearchStats` (TT hit rate, null-move cut rate, LMR, cutoff and pruning counters).
  - `RFPMargin` and `FutilityMargin` options.
  - **PlanBias**: a causal plan-memory channel that orders plan target squares inside the tree and extends the plan move.
  - **PlanCorrupt**: a wrong-memory control.
  - **StyleProfile=transform**: Petrosian→Tal, conditioned on board state rather than move count. Restrains until opponent mobility is ≤28 or attack pressure is ≥6, then attacks.
  - The default bench is still **536,355** nodes (unchanged).

### Results so far
- **A1 evaluator × pruning factorial** (40 positions, depth 10):
  - The residual net **lowers the null-move cut rate from 0.57 to 0.46** and enlarges trees.
  - Narrower margins shrink trees but raise decision loss (18.7 vs 12.3cp).
  - This pinpoints a *mechanism* for the equal-time gap. SPSA is not justified yet.
- **Causal memory intervention** (60 positions, 150k nodes, TT cleared):
  - **H1 PASS:** the channel changes 21.7% of decisions, so memory is now causal (V12 was 0%).
  - **H2 FAIL:** wrong memory does not measurably hurt.
  - **H3 partial:** irrelevant history is reset 100% of the time, but decisions still differ in 17% due to an uncleared history table. This is a cache confound and is recorded.
  - **H4 FAIL:** no strength benefit.
- **Discovery learners** (smoke, seen before pre-registration, so bounded only):
  - Quiet-move head: 0.873 vs 0.732 top-3 recall on quiet moves.
  - Failure augmentation: 0.829 vs 0.825 (no effect).
- **A4 isolated 40+0.4 match** (net ×0.5 vs frozen V8, all other jobs suspended): **10–3–9 after 22/48 games.** Running; no conclusion yet.

### Integrity correction made this session
- When the probes were checked against each ID's registered method, several first drafts tested the wrong thing.
  - #154 must measure engine quality.
  - #013 forbids move-agreement proxies.
- They were rewritten, and the change is logged in `evidence/v13/PREREG_probes_human.md` before the final data.
- #029 and #127 were dropped from the count rather than relabelled.

### Queued, with code written
- Human-cognition probes: #005, #007, #009, #012, #013, #014, #037, #081, #086, #120, #123, #131, #137, #154.
- Discovery probes: #003, #011, #022, #104.
- RootHint controls on the frozen suite (none / Maia / random / learned / oracle-best upper bound) plus #038 sparse activation.
- #167 highlight generator with 1M-node fact verification.
- #050 transform test.
- V13 ledger builder.
- **Target: 20 newly attempted IDs.**

---

## 8. Every failure, kept visible

1. V6 not recovered.
2. V7 creative layer did not beat Tactical.
3. ArtistExtension: no gain.
4. NNUE v1: 0–48.
5. NNUE v2: −154 at equal time.
6. Skeptic: no headroom.
7. Plan memory: −36.
8. Learned governor: AUC 0.50.
9. Style v1: −293.
10. MultiPV-4 costs about 240 Elo.
11. Discovery transfer: 4/5 families worse than Maia.
12. Artist union: 13/43 vs 24/43.
13. Blacksmith: 0/37.
14. Memory: 0/60 decisions changed.
15. Fake memory "pass" caused by oracle noise.
16. Style attribution: z 2.26 < 3.
17. MLP student: 0/5.
18. Damped net equal-time: lower bound not met, twice.
19. V13 wrong-memory: no measurable harm.
20. V13 cache confound in the irrelevant-memory control.
21. V13 first-draft probes misaligned with canon (corrected).

## 9. Bugs found and fixed
- Board corruption on Python timeout.
- Deadline test sent `go` before `readyok`.
- Loss classifier mislabelled already-lost games.
- `searchmoves` swallowed `nodes`.
- No `pv` printed for a forced move.
- ETXTBSY when rebuilding while engines ran: fixed with an atomic build.
- python-chess refuses to set MultiPV: fixed with a `ForceMultiPV` alias.
- `game_id` parsing.
- White-only training data.
- 81 cross-split leaks.
- Non-deterministic oracle.
- Mutable artifact hashes: re-pinned to git snapshots.
- Wrong-identity corpus players.

## 10. Open blockers (owner-only)
1. A **OnePlus 15** run of `native/dist/device_bench.sh`. No phone or emulator number has ever been measured; none is fabricated.
2. Historical master games (Tal, Nezhmetdinov, Planinc, and others) under a clear licence.
3. Consenting human experts for aesthetics and blinded evaluation.

## 11. What is honestly true right now
- **Strong engine:** yes, about 2585–2690 on Stockfish's scale.
- **Human-equivalent 2500–2600:** unmeasured.
- **"Mind" faculties:** implemented and tested. Memory is now causal but shows no benefit. Creativity: proposal works, verification fails. Style: weak signal. Sixth Instinct: no transfer.
- **Mobile:** builds exist; device-untested.
- **Science discipline:** pre-registration, frozen baselines, isolation, a deterministic oracle and preserved failures.
