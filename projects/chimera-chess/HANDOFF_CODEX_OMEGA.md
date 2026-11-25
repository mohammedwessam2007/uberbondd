# CHIMERA Ω∞ — Full report and handoff for Codex (2026-11-25)

Branch `ccr-9399d410-lphg3o`. Everything lives in `projects/chimera-chess/`.

Every number below is computed by a script from files in the repository:
- `canon/IMPLEMENTATION_STATUS.json`, built by `tools/omega/build_status.py`
- game summaries and traces in `evidence/omega/`

Nothing here is a typed-in estimate.

**Do not restart CHIMERA. Resume from section 9.**

---

## 1. Headline: percentage match with the two PDFs (ideas and principles)

| Measure | Count | % |
|---|---|---|
| Numbered ideas preserved verbatim and individually accounted for | 220 / 220 | **100%** |
| Ideas with executable code (all legitimate ideas) | 205 / 220 | **93.2%** |
| Ideas deliberately archived, non-executable (anti-detection / fake human timing / review deception) | 15 / 220 | 6.8% (by design) |
| Motif ideas that fired inside the real WHOLE_MIND runtime (games + targeted campaign) | 160 / 177 | **90.4%** |
| Motif ideas that appeared on a move CHIMERA actually played | 156 / 177 | **88.1%** |
| Motif ideas that measurably changed a decision (won an arbitration against the objective best) | 124 / 177 | **70.1%** |
| Motif ideas with real-game unit fixtures (positive replay + matched negative) | 142 / 177 | 80.2% |
| Control / infrastructure ideas implemented | 28 / 28 | 100% |
| Control / infrastructure ideas with tests or runtime evidence | 26 / 28 | 92.9% |
| **Executable ideas working in real decisions** (motifs on played moves + tested controls) | 182 / 205 | **88.8%** |
| **All 220 ideas working in real decisions** | 182 / 220 | **82.7%** |
| Ideas scientifically validated on a fresh, independent confirmation set | 0 / 220 | 0% |

**Architecture principles of the PDFs:** 10 fully met, 5 partially met, 1 not done, 2 refused (detail in section 3).
- **69%**, counting a partial as half, over all 18 principles.
- **78%**, excluding the 2 restricted principles that will not be built.

**Character benchmarks of the PDF** (detail in section 4):
- **Score vs Stockfish 2685:** 5.0/10 in the best run (V3, 2-6-2), against the PDF's 4.8/10. Later calibration rounds scored 1.5–4/10.
- **Style profile:** two to three of six categories reach the PDF figure within ±30% in a given round. Pins, batteries and underpromotions remain short.

---

## 2. The 220 ideas, by status

Sources:
- Registry: `canon/PDF_REQUIREMENTS_220.json` (verbatim table text, page, coefficient, interpretation, tests, status).
- Code: `chimera/omega/motifs.py` (177 motif predicates), `chimera/omega/controls.py` (28 control mechanisms) and `chimera/omega/mind.py` (runtime).

### 2a. Executable, not yet fired in any real runtime decision (17)

| ID | Idea | Why | What to do |
|---|---|---|---|
| #7 | Bishop-Pair Preservation | no suitable position found | mine endgames with fewer than 10 pawns and both bishops |
| #63 | Anti-Sicilian Wing Gambit | 2.b4 is gated out as unsound (eval < floor) | PDF rule conflict #63 vs #151; build a pre-registered opening-exception rule or record as a refuted variant |
| #98 | Alekhine's Gun Stacker | predicate found; move not among candidates | add the move to Artist candidates when the predicate fires |
| #125 | Bare-King Herding Net | mate obligation chose the mate instead | correct (forced mate wins); test in a non-mating Q+N herding position |
| #137 | Clock-Burn Maze Escalator | needs two consecutive only-move positions | requires `state.last_only_move` (not yet maintained in mind.py) |
| #144 | Humiliation Finish Ranker | campaign found no mate position | unit test passes on constructed mates; run in the runtime on `tests/test_omega.py` mate positions |
| #188 | Triple-En-Prise Ghost Chain | predicate found; gated as unsound | extremely rare when sound; needs a constructed position |
| #189 | Cognitive-Freeze Clock Drain | no position | needs at least 5 losing captures plus 1 surviving retreat; construct |
| #192 | Castling Checkmate Override | campaign stopped before this ID | unit-tested on a verified position; run `integration_campaign.py ... 192` |
| #194 | 6-Knight Cavalry Swarm | not reached by the campaign | as #192 |
| #195 | Symmetry-Mirror Gaslight | not in a traced run (fired in a UCI smoke test) | as #192 |
| #201 | En-Passant Mate Override | not reached by the campaign | unit-tested on a verified position; as #192 |
| #203, #204, #205, #207, #213 | 4-Bishop Cult, Statue-of-Liberty Queen, 49.5-Move Cliffhanger, Queen Conveyor, Meatgrinder | not reached by the campaign | as #192 |

### 2b. Fired but never on a played move (4)

- #27, #61, #64 (offbeat openings): candidates were outweighed. Opening motifs use an opening cap of 5.0.
- #219 (Mercy-Denial): fired but never selected.

### 2c. Archived and not executable (15)

#26, #28, #53, #73, #74, #75, #76, #77, #78, #80, #84, #148, #161, #181, #210.

These implement statistical screening evasion, fabricated human move timing, or deceiving game review. The original mandate excluded them ("no anti-cheat evasion, fabricated human telemetry"). They are preserved verbatim with reasons in `chimera/omega/motifs.py` (`RESTRICTED`) and in the registry. **They must stay non-executable.**

---

## 3. Architecture principles (documents A §1/§5 and B §1–§5)

| # | Principle | Status | Note |
|---|---|---|---|
| 1 | Stockfish 19 MultiPV=16 as tactical truth | PARTIAL | Stockfish 16 used; 19 exists but github.com downloads are refused here (HTTP 403). Owner: supply the binary or allow github.com. |
| 2 | sf_time_sec 0.12 s per root analysis | MET | PDF_FAITHFUL_V4 / PDF_STYLE_V5 |
| 3 | CSSLab maia3 via maia3-uci, go nodes 1, MultiPV 6, use-uci-history | PARTIAL | Same model family (Maia3-5M ONNX, parity 61/61), real probabilities, history, rating conditioning. maia3-uci is unreachable. |
| 4 | Maia only for human reply probabilities, never as tactical eval | MET | |
| 5 | Soundness floor / max_cp_drop gate | MET | Preset values verbatim; V4 adds explicit contempt-vs-gate arbitration. |
| 6 | Boltzmann softmax with preset temperature | MET | Deterministic mode for tests. |
| 7 | Five Elo presets (verbatim values) | MET | Labels only; no screening-statistic matching. |
| 8 | Anti-draw contempt −120 cp → −250 cp after move 30 | MET | Applied in cp units; also covers repetition entry. |
| 9 | 220 deterministic predicates, zero stubs | PARTIAL | 205 executable, 15 archived. |
| 10 | Phase IV surrealist motifs occurring in play | PARTIAL | 17 not yet fired (section 2a). |
| 11 | Complete UCI engine (go/stop/quit, clocks, low-clock fallback) | MET | Deadline fallback crash fixed (`d610b45`). |
| 12 | Strict FEN and move-list validation | MET | |
| 13 | PGN motif annotation export | MET | `tools/omega/annotate_pgn.py` |
| 14 | Motif test suite (pytest) | MET | `tests/test_omega.py`, `tests/test_omega_controls.py` (unittest) |
| 15 | cutechess-cli 50-game gauntlet | PARTIAL | cutechess is unavailable; `tools/match.py` is the equivalent; runs are 8–16 games. |
| 16 | Lichess BOT deployment | NOT DONE | Needs the owner's authorized BOT token; inactive by rule. |
| 17 | Regan Z / MM% / ASD stealth governors | REFUSED | Anti-detection. |
| 18 | Bimodal "cortisol" clock delays | REFUSED | Fabricated human timing. |

---

## 4. PDF character benchmarks (document A §6.1 / §6.3, manual §6.2): measured, not projected

Meter: `tools/omega/pdf_characteristics.py`. It counts events on moves actually played, per game. The mapping from PDF categories to motif IDs is in the script.

| Per game | PDF | V3 | R1 | R2 | R3 | R4 | R5 | R6 (V6) | R7 | **R8** | R9 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tal sacrifices | 4.2 | 4.1 | 2.8 | 5.9 | 2.0 | 3.9 | 6.2 | 2.4 | 3.2 | **4.2** | 2.1 |
| Maia panic traps | 3.8 | 7.0 | 6.6 | 6.1 | 4.4 | 4.0 | 4.7 | **3.5** | 4.2 | 5.4 | 4.8 |
| Multi-pin & battery nets | 5.1 | 1.4 | 2.0 | 2.6 | 2.3 | 2.2 | 2.3 | 2.3 | 3.2 | **4.5** | 1.7 |
| Underpromotions / fake-outs | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.1 | 0 |
| Zero-retreat / e.p.# setups | 3.1 | 10.7 | 9.1 | 8.8 | 5.3 | 6.3 | 6.2 | **3.5** | 7.5 | 9.2 | 6.0 |
| Judas / Zombie / 0-check | 2.8 | 2.2 | 2.7 | 4.0 | 2.9 | 2.4 | 3.5 | 4.1 | 2.9 | **2.6** | 3.1 |
| Score vs SF 2685 (PDF 4.8/10) | 4.8 | **5.0** | 4.0 | 3.5 | 2.0 | 2.0 | 2.0 | 1.5 | 4.0 | 3.0 | 1.5 |

The best style match is round 8 (`evidence/omega/calibration/style_round8.json`):
- **Within ±30% of the PDF:** 3 of 6 categories (Tal 4.2 exact, pins 4.5, Judas 2.6).
- **Out of range:** panic traps at 1.4×, zero-retreat at 3×, underpromotion near 0.
- **Score:** 3/10.

Round 7 drew 8 of 10 games. Round 9 overshot. Calibration is noisy at 10 games per round.

- Rounds 3–5 pushed contempt to −360 cp. That was a mistake: no fewer draws, and a worse score.
- V6 (round 6+) adds:
  - a conversion guard: when winning by at least +5 with the halfmove clock at 60 or more, style-extreme motifs pause and progress moves get a bonus;
  - anti-liquidation knobs.
- Rounds 7–9 are finished. Start any further calibration from `style_round8.json`.

Other targets:
- **Latency:** median 294 ms per ply offline (V4), against the PDF's 105–205 ms. Reply searches, Maia and the Skeptic are included and not cut.
- **Head-to-head projections** vs Tal, Harmon, Fischer, Carlsen and Nakamura: non-executable, and arithmetic is inconsistent in 5 of 6 rows (`canon/PDF_CONTRADICTIONS.json` C-ARITH-6.3).

---

## 5. All games played (all legal; 0 illegal moves)

Time control 60+0.6. Elo is relative to the opponent only, never FIDE.

| Run | Games | W-D-L | Elo [95% CI] |
|---|---|---|---|
| WHOLE_MIND (native search) vs frozen V8 | 16 | 0-0-16 | −597 |
| NO_MOTIFS / NO_MEMORY / NO_CREATIVE / NO_NEURAL vs V8 | 8 each | 0-1-7 / 0-0-8 / 0-0-8 / 0-0-8 | ~ −470 |
| WHOLE_MIND vs SF 2000 | 8 | 1-3-4 | −137 [−470, 95] |
| PDF_FAITHFUL vs SF 2685 | 10 | 0-6-4 | −147 [−512, 59] |
| PDF_FAITHFUL vs V8 | 8 | 0-3-5 | −255 |
| **PDF_FAITHFUL_V3 vs SF 2685** | 10 | **2-6-2** | **0 [−252, 252]** |
| **PDF_FAITHFUL_V3 vs V8** | 8 | **4-2-2** | **+89 [−156, 470]** |
| Calibration rounds 1–6 vs SF 2685 | 60 | see section 4 | |

Diagnosis behind the PDF_FAITHFUL switch: NO_MOTIFS also lost (0-1-7), so the native-search runtime starved its own search. The PDF architecture (Stockfish as tactical truth) fixed that.

---

## 6. What was built (files)

**Source documents**
- `canon/pdf_sources/`: both PDFs (SHA-256 recorded) plus layout text.

**Registers** (`canon/`)
- `PDF_REQUIREMENTS_220.json`
- `PDF_SOURCE_MANIFEST.json`
- `PDF_CONTRADICTIONS.json` (19 entries: truncated PDF code, 3 wrong FEN examples, Stockfish 19 / maia3-uci / cutechess unavailable, arithmetic, definitions)
- `PDF_REQUIREMENTS_CROSSWALK.json` (23 CODEX220↔CORE167 links)
- `PDF_BENCHMARKS.json`
- `IMPLEMENTATION_STATUS.json`

**Runtime** (`chimera/omega/`)
- `config.py`: presets; profiles WHOLE_MIND, ablations, PDF_FAITHFUL, V3, V4, PDF_STYLE_V5
- `features.py`: includes the 5 helpers missing from the PDF
- `motifs.py`: 177 motifs and 15 archived entries
- `construct.py`: level-2 construction potentials
- `openings.py`
- `backend.py`: native, Stockfish tactical, parallel reply workers, Skeptic verifier, process supervisor
- `mind.py`: gate, contempt arbitration, routing, Artist, arbitration with traces, Skeptic veto loop, conversion guard
- `uci.py`: UCI, StyleFile, BookFile, low-clock fallback

**Tools** (`tools/omega/`)
- `build_pdf_registry.py`, `build_status.py`, `build_registers.py`, `check_codex220.py` (new checker; 0 errors)
- `build_fixtures.py`, `integration_campaign.py`
- `pdf_characteristics.py`, `calibrate.py`, `artistry.py`, `interactions.py`, `annotate_pgn.py`

**Tests**
- `tests/test_omega.py`:
  - PDF examples as negative regressions, plus verified replacements for #186, #192 and #201
  - real-game fixture replay
  - colour-reversal invariance
  - restriction guards
  - UCI robustness
- `tests/test_omega_controls.py`

**Evidence** (`evidence/omega/`)
- every pre-registration (`PREREG_*.md`)
- gauntlet PGNs, summaries and traces
- calibration rounds
- `integration_campaign*.json`

**Earlier history**
- `CHIMERA_FULL_REPORT.md` and `STATUS_V13.md`: V7–V13, the native engine and the 167-idea canon (preserved separately, CORE167 namespace)

---

## 7. Known defects and limitations (honest list)

1. 17 motifs have not yet fired in the runtime, and 4 fired but never played (section 2).
2. Pins, batteries and underpromotions are below the PDF's per-game figures. Draw rate is 30–60%; the PDF says 17%.
3. Latency is 294 ms; the PDF says 105–205.
4. Parallel depth probes hung inside python-chess when run on worker threads. They are disabled (`probes=False`); probes now run sequentially on high-leverage positions only.
5. A python-chess `InvalidStateError` was seen once when a search outlived its deadline. The fallback now returns a legal move, but the root cause is not fixed.
6. Style profiles from the older native path do not act under `go nodes` (post-search probes abort).
7. `tests/test_omega.py UciRobustness` and `test_omega_controls test_gate / test_polyglot_book` start engines; run them only when nothing else is using the CPU.
8. Samples are small (8–16 games per run). Every result above has a wide CI; nothing is validated.

---

## 8. Rules Codex must keep

- $0 spending.
- Commit and push only to `ccr-9399d410-lphg3o`, inside `projects/chimera-chess/`.
- The 15 restricted IDs stay non-executable.
- Never edit `lab/04_check_completion.py`.
- Pre-register before every experiment.
- Run equal-time matches with nothing else running.
- Report failures as failures.
- Commit trailers: `Co-Authored-By: ...` and `Claude-Session: ...` (see git log).

---

## 9. Resume here (exact commands)

```sh
cd projects/chimera-chess
# 0. dependencies: python-chess 1.11.2, numpy, onnxruntime 1.29.0; /usr/games/stockfish (16); models/maia3_5m.onnx (tools/fetch_models.sh)
sh native/build.sh
python3 tools/omega/check_codex220.py
python3 -m unittest tests.test_omega.G0Sources tests.test_omega.PdfExamples tests.test_omega.FixtureReplay tests.test_omega.Restrictions
# 1. finish calibration rounds 7-9 if not done (resumable; skips finished rounds)
python3 tools/omega/calibrate.py 4 evidence/omega/calibration/style_v6_start.json 6
# 2. drive the 17 never-fired motifs through the runtime
python3 tools/omega/integration_campaign.py /tmp/puzzles16.csv evidence/omega/integration_campaign.json 7,63,98,125,137,144,188,189,192,194,195,201,203,204,205,207,213
#    (puzzles: curl -r 0-16000000 https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -d > /tmp/puzzles16.csv, partial stream ok)
# 3. rebuild evidence ledger
python3 tools/omega/build_fixtures.py 'evidence/omega/**/trace*.jsonl' tests/fixtures/omega_fixtures.json
python3 tools/omega/build_status.py && python3 tools/omega/check_codex220.py
# 4. measure the PDF character of any new run
python3 tools/omega/pdf_characteristics.py out.json evidence/omega/calibration/trace_roundN.jsonl evidence/omega/calibration/roundN_vs_sf2685.summary.json
# 5. play: python3 -m chimera.omega.uci  (setoption name Profile value PDF_STYLE_V5)
```

**Next priorities**, in order:
1. Close the 17 unfired motifs: Artist candidates for #98/#188, constructed positions for rare finishes, `state.last_only_move` for #137.
2. Raise pins and batteries (tactic group) and underpromotion steering (#176) toward the PDF figures without losing soundness.
3. Bring latency down toward 205 ms: fix the parallel depth probes, and investigate batching the Maia evaluations.
4. Run larger confirmation matches (50 games, as in the PDF) for the best style profile.
5. Make a checkpoint ZIP and verify it by clean extraction (V13 recipe in `RESUME_HERE.md`).
