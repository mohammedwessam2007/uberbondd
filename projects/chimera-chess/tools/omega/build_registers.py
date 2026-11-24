"""Writes canon/PDF_CONTRADICTIONS.json, canon/PDF_REQUIREMENTS_CROSSWALK.json and canon/PDF_BENCHMARKS.json.
Every entry keeps ORIGINAL vs ENGINEERING INTERPRETATION vs CORRECTED IMPLEMENTATION vs ACTUAL RESULT vs REMAINING DIFFERENCE.
Usage: python tools/omega/build_registers.py"""
import json, os

A, B = "document A (codex)", "document B (manual)"
C = [
 {"id": "C-CODE-01", "where": f"{B} §5.2-5.4 pp.7-10; {A} §5 p.18", "original": "'complete, production-ready multi-module codebase ... free of placeholder stubs'",
  "actual": "Rendered pages show every module truncated at a page break: features.py imports 5 helpers never defined; MotifScoringEngine.evaluate_move has no body; uci.py stops inside _analyze_stockfish; chimera_uci.py stops after ForensicMatchState.",
  "resolution": "Fragments preserved verbatim in canon/pdf_sources/*.layout.txt; missing bodies reconstructed in chimera/omega/{features,motifs,mind,uci}.py and marked as reconstructions.", "remaining": "reconstructions are engineering interpretations, not recovered originals"},
 {"id": "C-EX-186", "where": f"{B} §6.1 test_underpromotion_taunt_186", "original": "8/6P1/8/8/8/5K2/8/7k w: g7g8n scored above g7g8q 'while completely winning'",
  "actual": "g7g8n leaves K+N vs K = insufficient material (immediate draw); python-chess is_insufficient_material() == True",
  "resolution": "kept as NEGATIVE regression (motif must not fire); #186 predicate requires sufficient material; verified positive replacement 8/Q5P1/7k/7p/8/8/6R1/4K3 w g7g8n#", "remaining": "none"},
 {"id": "C-EX-201", "where": f"{B} §6.1 test_en_passant_checkmate_override_201", "original": "3r4/2pk4/8/3pP3/2B2B2/8/8/4K3 w - d6: e5d6 e.p. is checkmate",
  "actual": "FEN status invalid (en-passant square inconsistent with the board); after exd6 there is no check and no mate",
  "resolution": "NEGATIVE regression; verified replacement 8/1R6/2k5/2bpP3/8/3R4/6Q1/4K3 w - d6: exd6 e.p.#", "remaining": "none"},
 {"id": "C-EX-192", "where": f"{B} §6.1 test_castling_checkmate_override_192", "original": "3k4/8/3K4/8/8/8/8/R3B3 w Q: O-O-O mates",
  "actual": "White king is on d6, not e1: castling rights invalid (STATUS_BAD_CASTLING_RIGHTS); e1c1 is not a legal move",
  "resolution": "NEGATIVE regression; verified replacement 8/8/8/P2BQ3/8/3k4/8/R3K3 w Q: O-O-O#", "remaining": "none"},
 {"id": "C-DEP-SF19", "where": "both documents", "original": "Stockfish 19 (MultiPV=16)", "actual": "Stockfish 19 is officially released (stockfishchess.org lists 19) but its binaries/sources are served from github.com, which this environment's proxy refuses (HTTP 403).",
  "resolution": "verifier = installed Stockfish 16 (Ubuntu 16-1build1); tactical core = CHIMERA's own native search", "remaining": "owner action: allow github.com or supply a Stockfish 19 binary; all SF-based numbers are SF16"},
 {"id": "C-DEP-MAIA3", "where": "both documents", "original": "CSSLab/maia3 via maia3-uci (--model 5m --use-uci-history --elo), MultiPV=6, go nodes 1",
  "actual": "CSSLab/maia3 repository unreachable (403) and no 'maia3' package on PyPI. A UCI wrapper's ranked MultiPV list would not be a probability distribution anyway.",
  "resolution": "Maia3-5M ONNX (MIT maia3-js weights, sha f7bd01b3...) run directly: genuine softmax probabilities with legal masking, history tokens, rating conditioning (chimera/maia.py, argmax parity 61/61 vs JS reference)", "remaining": "not the maia3-uci executable; same model family/size"},
 {"id": "C-DEP-CUTECHESS", "where": f"{B} §6.2 / §7 step 3", "original": "cutechess-cli 50-game gauntlet", "actual": "cutechess-cli not available (not in apt, github blocked)",
  "resolution": "tools/match.py: python-chess legality, harness-owned clocks, paired openings, colour reversal, PGN + JSONL traces", "remaining": "not cutechess itself"},
 {"id": "C-ARITH-6.3", "where": f"{A} §6.3", "original": "Tal 4.4/10 (4-1-5); Harmon 5.3 (5-1-4); Fischer 3.8 (3-1-6); Carlsen 2.6 (2-2-6); Nakamura 3.5 (3-1-6); Stockfish 4.8 (4-2-4)",
  "actual": "W-D-L imply 4.5, 5.5, 3.5, 3.0, 3.5, 5.0: five of six scores disagree with their own W-D-L", "resolution": "preserved unchanged; matchups against historical/fictional players are non-executable projections", "remaining": "n/a"},
 {"id": "C-DEF-MM", "where": f"{A} §2.1 vs {B} §3.1", "original": "MM% = exact #1 engine move (A) vs E_best - E_played <= 5 cp (B); TM% 0.00-0.05 pawns (A) vs <= 10 cp (B)",
  "actual": "two documents define the same statistic differently", "resolution": "restricted screening statistics: archived, not implemented", "remaining": "n/a"},
 {"id": "C-THRESH-181", "where": f"{A} §2.2 table", "original": "'best_cp − median_cp < 15 30 cp' (garbled) vs '< 30 cp' in #181 row", "actual": "ambiguous threshold", "resolution": "#181 restricted; archived verbatim", "remaining": "n/a"},
 {"id": "C-26-29", "where": f"{A} #26/#29 vs {B} §4.1/§5.4", "original": "jitter 80-160 ms (A) vs 0.12 s x U(0.75,1.30)=90-156 ms (B); critical extension 250-400 ms (A) vs 300 ms (B)", "actual": "numerically inconsistent",
  "resolution": "#26 restricted (anti-forensic purpose); #29 implemented as a node-budget extension (2x nodes for the top 3 when top-2 swing > 120 cp)", "remaining": "time-based form not used (node budgets keep tests deterministic)"},
 {"id": "C-217", "where": f"{A} #217 vs {B} §4.4", "original": "+3.80 x streak (A) vs +3.80 x (1 + streak) (B)", "actual": "inconsistent", "resolution": "document A form implemented (streak counts the current move)", "remaining": "B form not used"},
 {"id": "C-215", "where": f"{A} #215 vs {B} §4.4", "original": "+2.40 x (blocks - 2) over all 8 ring squares (A) vs 'enemy pieces blocking >= 3 squares' (B)", "actual": "compatible: A form with blocks >= 3", "resolution": "implemented A; the PDF's own test (7.2) passes", "remaining": "none"},
 {"id": "C-001", "where": f"{A} #1 vs {B} §4.1", "original": "-120 cp (A) vs -12.0 to -25.0 utility (B)", "actual": "units differ (cp vs utility)", "resolution": "-1.20 pawn units (A); #177 escalates to -2.50 after move 30", "remaining": "B magnitudes not used"},
 {"id": "C-032", "where": f"{A} #32", "original": "'every legal opponent reply drops eval_cp by at least 80 cp'", "actual": "under minimax the searched value of a move already equals the opponent's best reply, so the literal rule is vacuous",
  "resolution": "interpretation: every searched reply is >= 80 cp worse for the opponent than the static (depth-1) evaluation of the resulting position", "remaining": "interpretation, not the literal rule"},
 {"id": "C-205", "where": f"{A} #205", "original": "delay mate until halfmove_clock == 99 then +30.0", "actual": "deliberately walking to the 99th half-move risks a 50-move draw claim if any step is miscounted; it also conflicts with #1/#177 anti-draw",
  "resolution": "implemented only as a reward for a mate that happens exactly at halfmove 99 inside the soundness gate (mate obligation keeps mating moves); no forced delay", "remaining": "the 'delay' half is not implemented (forced mate obligation wins arbitration)"},
 {"id": "C-REGAN", "where": f"{A} §2, §6.2; {B} §3, §6.2", "original": "Regan Z/MM%/ASD/IPR governors and targets (Z 0.15-0.95, MM 53-58%, ASD 0.125-0.165)",
  "actual": "optimising against fair-play screening is anti-detection", "resolution": "archived verbatim; #26 #28 #53 #73-#78 #80 #84 #148 #161 #181 #210 non-executable", "remaining": "by design"},
 {"id": "C-IPR", "where": f"{B} §3.1", "original": "IPR_est = 2685 - 420 (ASD - 0.139) + 18 (MM% - 55.5)", "actual": "a linear formula anchored at the target itself; not Regan's published model", "resolution": "archived", "remaining": "n/a"},
 {"id": "C-2685", "where": "both titles", "original": "Target Ceiling ~2685 IPR; v18.0 ~2685", "actual": "no measurement exists; Stockfish UCI_Elo is not FIDE", "resolution": "aspiration only; actual strength reported from games vs ref/Stockfish anchors", "remaining": "unmeasured"},
]

X = [  # CODEX220 <-> CORE167: manually assessed overlaps (shared mechanism, separate requirement contracts)
 ("CODEX220-145", "CORE167-166", "SAME_CONCEPT", "Anti-Fortress Demolition (identical title); CODEX predicate = rook-for-minor sac in reduced material with eval >= +50"),
 ("CODEX220-178", "CORE167-120", "SHARED_MECHANISM", "best-defence value + human-response value combined (0.72/0.28 vs two-world critic)"),
 ("CODEX220-128", "CORE167-009", "SHARED_MECHANISM", "Maia reply distribution x searched reply losses (EBG) vs temptation research"),
 ("CODEX220-216", "CORE167-009", "SHARED_MECHANISM", "phantom-threat quiet moves use the same reply-loss evidence"),
 ("CODEX220-109", "CORE167-131", "SHARED_MECHANISM", "only-move defense counting (viable replies) vs only-move diagnostic"),
 ("CODEX220-137", "CORE167-134", "RELATED", "clock-burn maze vs clock-drain study (CORE is offline research only)"),
 ("CODEX220-180", "CORE167-123", "SHARED_MECHANISM", "high-leverage routing of extra compute vs sparse deliberation gate"),
 ("CODEX220-029", "CORE167-123", "RELATED", "critical-branch extension"),
 ("CODEX220-011", "CORE167-002", "SHARED_MECHANISM", "verification of candidate sacrifices (Skeptic / RootHint verification)"),
 ("CODEX220-151", "CORE167-002", "SHARED_MECHANISM", "soundness gate"),
 ("CODEX220-001", "CORE167-128", "RELATED", "anti-draw contempt (CORE: transparent WDL utility)"),
 ("CODEX220-177", "CORE167-128", "RELATED", "escalating contempt"),
 ("CODEX220-017", "CORE167-129", "RELATED", "central tension holder vs anti-simplification tension lock"),
 ("CODEX220-142", "CORE167-129", "RELATED", "clutter densifier vs tension lock"),
 ("CODEX220-138", "CORE167-158", "SHARED_MECHANISM", "quiet move that cuts all counterplay vs quiet-move finale detector"),
 ("CODEX220-188", "CORE167-164", "RELATED", "multiple pieces en prise vs multi-sacrifice composition"),
 ("CODEX220-213", "CORE167-156", "RELATED", "double exchange sac vs burn-the-ships double-piece sac"),
 ("CODEX220-183", "CORE167-156", "RELATED", "offensive king march vs king-walk"),
 ("CODEX220-193", "CORE167-149", "RELATED", "false-hope mirage vs false-rescue baiting"),
 ("CODEX220-175", "CORE167-130", "RELATED", "convex risk-reward vs sword-edge variance"),
 ("CODEX220-027", "CORE167-157", "RELATED", "offbeat opening router vs anti-theory openings"),
 ("CODEX220-144", "CORE167-160", "RELATED", "humiliation finish ranker vs aesthetics score"),
 ("CODEX220-033", "CORE167-132", "RELATED", "named mating-pattern recognisers vs CQL-style tactical anchors"),
]

BM = [
 ("BM-STRENGTH-2685", "~2685 IPR target ceiling", "ASPIRATION", "measured relative to frozen V8 and Stockfish UCI_Elo anchors only; see evidence/omega/gauntlet"),
 ("BM-GEN-6.1", "§6.1 per-generation peak IPR / MM% / Z / draw rate / motif output", "PROJECTION", "not executable as written (no generations rebuilt); motif output per game measured by tools/omega/artistry.py"),
 ("BM-PRESET-6.2", "§6.2 preset win scores (94/91/87/76/52.5%), ASD bands, Z", "PROJECTION + RESTRICTED_SCREENING", "presets implemented; win scores unmeasured (no rated human pools); ASD/Z archived"),
 ("BM-H2H-6.3", "§6.3 10-game matchups vs Tal/Harmon/Fischer/Carlsen/Nakamura/Stockfish 19", "NON_EXECUTABLE_PROJECTION", "historical/fictional opponents cannot be played; Stockfish 19 unavailable (C-DEP-SF19)"),
 ("BM-DRAW-17", "draw rate 14-20% (~17%) vs peer pool, 50 games", "MEASURABLE", "measured in the gauntlet pools (ref:2, sf:2000) at 60+0.6"),
 ("BM-LAT-105-205", "per-ply compute 105-205 ms (excl. #210 delay)", "MEASURABLE", "measured with the full WHOLE_MIND pipeline (root search, Maia, replies, Skeptic) in traces field ms"),
 ("BM-MM-ASD-Z", "MM% 53-58, ASD 0.125-0.165, Z < 1.0", "RESTRICTED_SCREENING", "archived; not measured or optimised"),
 ("BM-ARTISTIC", "motif frequencies (e.g. '2.8 Judas / Zombie / 0-check mates')", "MEASURABLE", "tools/omega/artistry.py: available/recognised/investigated/selected/constructed/refuted per motif"),
]


def main():
    json.dump({"schema": "codex220-contradictions-1", "entries": C}, open("canon/PDF_CONTRADICTIONS.json", "w"), indent=1, ensure_ascii=False)
    core = {r["id"]: r["title"] for r in json.load(open("canon/LEDGER_V13_167.json"))["records"]}
    json.dump({"schema": "codex220-crosswalk-1", "namespaces": {"CODEX220": "canon/PDF_REQUIREMENTS_220.json", "CORE167": "canon/LEDGER_V13_167.json"},
               "rule": "numbers collide across canons (CODEX220-001 Negative Draw Contempt != CORE167-001 Future Sculptor); links are manual assessments, shared implementations keep separate contracts",
               "links": [{"codex": a, "core": b, "core_title": core.get("#" + b.split("-")[1]), "relation": r, "note": n} for a, b, r, n in X]},
              open("canon/PDF_REQUIREMENTS_CROSSWALK.json", "w"), indent=1, ensure_ascii=False)
    json.dump({"schema": "codex220-benchmarks-1", "entries": [{"id": a, "claim": b, "class": c, "status": d} for a, b, c, d in BM]},
              open("canon/PDF_BENCHMARKS.json", "w"), indent=1, ensure_ascii=False)
    print(len(C), "contradictions;", len(X), "crosswalk links;", len(BM), "benchmark claims")


if __name__ == "__main__":
    main()
