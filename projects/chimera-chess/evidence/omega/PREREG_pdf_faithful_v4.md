# PREREG PDF_FAITHFUL_V4 (registered before any V4 game; V3 seen: vs sf2685 2-6-2, vs V8 4-2-2, 6/8 draws by repetition in
# objectively equal (0.00) positions; median 724 ms/ply)
Changes: (1) explicit #1/#177-vs-#151 arbitration: if every gated move walks into a draw while eval >= -80, the gate admits
non-drawing moves down to the contempt value (-120 cp, -250 cp after move 30) -- PDF contempt now actually reachable;
(2) latency: Stockfish root fixed at the PDF's 0.12 s, root search overlapped with Maia + Artist scan, reply searches on parallel
Stockfish workers (#159), Maia prior once per move, Artist 15k nodes, reply_k 2 / 6k nodes, Skeptic 100k nodes.
Offline latency on 25 traced positions: p50 294 ms (V3 617 ms). All executable motifs enabled.
Run: V4 vs sf:2685, 60+0.6, 10 games, then V4 vs ref:2, 8 games, isolated.
H1 draw rate vs sf2685 <= 40% (PDF target 14-20%); H2 score >= 4.8/10 (PDF claim); H3 traced p50 ms <= 350; H4 0 illegal/forfeits.
