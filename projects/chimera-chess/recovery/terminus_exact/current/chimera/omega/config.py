"""CHIMERA Ω∞ configuration (manual §5.1 / codex §5), reconciled with the existing native engine.

PDF values are kept verbatim (target_ipr, softmax_temp, soundness_floor_cp, max_cp_drop, anti_draw_contempt_cp, presets).
Engineering differences (recorded in canon/PDF_CONTRADICTIONS.json):
 * STOCKFISH_PATH selects the verifier and hybrid tactical executable. The convergence runs pin SF16 for historical comparisons and SF19 for source-version smoke tests.
 * CSSLab maia3-uci is unavailable (repo unreachable, not on PyPI) -> Maia3-5M ONNX port (chimera/maia.py, parity 61/61).
 * enable_clock_delay is ALWAYS False: artificial delays to imitate human timing are restricted (#28 #53 #80 #210).
 * target_ipr is kept as a label of the preset; nothing in the runtime optimises screening statistics (#179 restricted part).
"""
import os
from dataclasses import dataclass, field, asdict
from typing import Dict, List

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@dataclass
class ChimeraConfig:
    stockfish_path: str = os.getenv("STOCKFISH_PATH", "/usr/games/stockfish")
    native_path: str = os.path.join(ROOT, "native", "chimera")
    net_file: str = os.path.join(ROOT, "nnue", "v12", "eval_v4_residual.bin")
    maia3_cmd: List[str] = field(default_factory=lambda: ["maia3-uci", "--model", "5m", "--use-uci-history", "--elo", "2600"])  # PDF value, unavailable
    target_ipr: int = 2685
    maia_elo: int = 2600
    sf_time_sec: float = 0.12
    sf_multipv: int = 16
    maia_multipv: int = 6
    softmax_temp: float = 0.28
    soundness_floor_cp: float = -45.0
    max_cp_drop: float = 135.0
    anti_draw_contempt_cp: float = -120.0
    enable_clock_delay: bool = False      # PDF: True. Restricted (fabricated timing); hard-disabled.
    seed: int = 42
    # ---- runtime / ablation switches (WHOLE_MIND = all True)
    use_motifs: bool = True
    use_maia: bool = True
    use_memory: bool = True              # native Architect PlanMemory + PlanBias causal channel
    use_creative: bool = True            # Artist: Maia + motif-constructive extra candidates
    use_neural: bool = True              # native residual NNUE (EvalVersion 3, x0.5) + Maia
    verifier: str = "stockfish"          # Skeptic backend for sacrifice verification: stockfish | native | none
    deterministic: bool = True           # argmax (reproducible); False = #25 Boltzmann sampling with seed
    style_extreme: bool = True           # surrealist/extreme style motifs (opt-out)
    motif_scale: float = 0.35            # pawn units of motif utility -> pawn units of utility (arbitration, see mind.py)
    root_nodes: int = 120000
    reply_nodes: int = 20000
    verify_nodes: int = 300000
    reply_k: int = 4
    root_multipv: int = 16               # PDF sf_multipv; V2 runtime uses 4 (see PROFILES WHOLE_MIND_V2)
    artist_scan: int = 999               # how many non-root legal moves the Artist scans for motif-constructive candidates
    artist_nodes: int = 60000
    group_scale: dict = field(default_factory=dict)   # PDF-characteristic style calibration per motif group / '#id'
    tactical: str = "native"             # native (CHIMERA C++ search) | stockfish (PDF-faithful tactical ground truth)
    sf_threads: int = 1
    root_time_frac: float = 0.0          # >0: root search gets this fraction of the move's time budget (V2 budget fix)


ELO_PRESETS: Dict[str, Dict[str, float]] = {
    "Club_1350": {"target_ipr": 1350, "maia_elo": 1300, "softmax_temp": 0.72, "soundness_floor_cp": -160.0, "max_cp_drop": 240.0},
    "Intermediate_1720": {"target_ipr": 1720, "maia_elo": 1650, "softmax_temp": 0.54, "soundness_floor_cp": -110.0, "max_cp_drop": 190.0},
    "Tournament_2120": {"target_ipr": 2120, "maia_elo": 2050, "softmax_temp": 0.40, "soundness_floor_cp": -75.0, "max_cp_drop": 160.0},
    "Master_2480": {"target_ipr": 2480, "maia_elo": 2400, "softmax_temp": 0.32, "soundness_floor_cp": -55.0, "max_cp_drop": 145.0},
    "Trauma_GM_2685": {"target_ipr": 2685, "maia_elo": 2600, "softmax_temp": 0.28, "soundness_floor_cp": -45.0, "max_cp_drop": 135.0},
}

PROFILES = {  # gauntlet ablations (section 16 of the mandate)
    "WHOLE_MIND": {},
    "NO_MEMORY": {"use_memory": False},
    "NO_CREATIVE": {"use_creative": False},
    "NO_MOTIFS": {"use_motifs": False},
    "NO_NEURAL": {"use_neural": False, "use_maia": False},
    # engineering correction (not a PDF preset): same motifs, max_cp_drop 40 instead of 135 -- tests the flaw found in the
    # gauntlet (motif arbitration overrode the objective best on 130/250 moves). Pre-registered in evidence/omega/PREREG_sound.md
    "WHOLE_MIND_SOUND": {"max_cp_drop": 40.0},
    # V2 budget fix (gauntlet diagnosis: NO_MOTIFS also lost 0-1-7 -> search starvation, not motifs): every motif active,
    # native root search owns 60% of the clock with MultiPV 4; Artist/motif evidence/Skeptic share the rest.
    # PDF-faithful architecture: Stockfish MultiPV=16 at sf_time_sec (0.12 s, scaled by the clock) as tactical truth,
    # Maia3 human policy, all motifs + arbitration + Skeptic deciding the move (document A §1, manual §1).
    "PDF_FAITHFUL": {"tactical": "stockfish", "root_multipv": 16, "root_time_frac": 0.0, "reply_k": 4, "reply_nodes": 40000, "verify_nodes": 300000},
    # V3 iteration after the PDF_FAITHFUL benchmark (0-6-4 vs sf2685, 6/6 draws by repetition, overrides on 52% of moves):
    # anti-draw fixed (repetition entry, cp units) and motif scale 0.35 -> 0.15 so motifs arbitrate among near-equal sound moves.
    "PDF_FAITHFUL_V3": {"tactical": "stockfish", "root_multipv": 16, "root_time_frac": 0.0, "reply_k": 3, "reply_nodes": 30000, "verify_nodes": 300000, "motif_scale": 0.15},
    # V4: contempt/gate arbitration + latency (root fixed at the PDF's 0.12 s, Maia prior once per move, lighter replies/Skeptic)
    "PDF_FAITHFUL_V4": {"tactical": "stockfish", "root_multipv": 16, "root_time_frac": -1.0, "reply_k": 2, "reply_nodes": 6000, "verify_nodes": 100000,
                        "motif_scale": 0.15, "artist_scan": 12, "artist_nodes": 15000},
    # V5 style calibration toward the PDF §6.1 motif profile (V3 measured: tal 4.1/4.2, panic 7.0/3.8, pins+batteries 1.4/5.1,
    # underpromotion 0/2.4, zero-retreat+e.p. setups 10.7/3.1, judas/zombie/0-check 2.2/2.8)
    "PDF_STYLE_V5": {"tactical": "stockfish", "root_multipv": 16, "root_time_frac": -1.0, "reply_k": 2, "reply_nodes": 6000, "verify_nodes": 100000,
                     "motif_scale": 0.15, "artist_scan": 12, "artist_nodes": 15000,
                     "group_scale": {"tactic": 2.5, "style-extreme": 2.0, "construction": 2.0, "human": 0.6, "#209": 0.4, "#172": 0.6,
                                     "#215": 1.5, "#217": 1.5, "#220": 1.5}},
    # Resource-limited variant for the 205 ms host development benchmark.
    "PDF_FAST_EXPERIMENT": {"tactical": "stockfish", "root_multipv": 12, "sf_time_sec": 0.08,
                            "root_time_frac": -1.0, "reply_k": 2, "reply_nodes": 6000,
                            "verify_nodes": 60000, "motif_scale": 0.15, "artist_scan": 12, "artist_nodes": 12000},
    "WHOLE_MIND_V2": {"root_multipv": 4, "root_time_frac": 0.6, "reply_k": 3, "reply_nodes": 15000, "verify_nodes": 150000},
}


PROFILES["PDF_REFERENCE"] = PROFILES["PDF_FAITHFUL_V4"].copy()
PROFILES["PDF_FAST"] = PROFILES["PDF_FAST_EXPERIMENT"].copy()


def make(preset: str = "Trauma_GM_2685", profile: str = "WHOLE_MIND", **kw) -> ChimeraConfig:
    c = ChimeraConfig()
    for k, v in {**ELO_PRESETS[preset], **PROFILES[profile], **kw}.items():
        setattr(c, k, type(getattr(c, k))(v))
    c.enable_clock_delay = False
    return c


def as_dict(c: ChimeraConfig) -> dict:
    return asdict(c)
