"""Maia3-5M human-move policy prior (real pretrained network, ONNX Runtime, CPU, offline).

Weights: UofTCSSLab/Maia3-5M (Chessformer, ICLR 2026), as converted to ONNX in the
MIT-licensed maia3-js 0.2.0 package / huggingface.co/cemoss17/maia3-onnx. Pinned
SHA-256 below; the loader refuses any other file. Encoding is a Python port of
maia3-js dist/encoding.js (itself a port of maia3/dataset.py): 8 history slots of a
64x12 one-hot board, each slot mirrored to the side to move, left-padded with the
earliest slot; move vocabulary = data/moves.json (4352 entries); black moves are
looked up mirrored. Value logits are [loss, draw, win] for the side to move.

Fetch with tools/fetch_models.sh. The file is not committed (22.5 MB; upstream
weight licence is stated as "see repo" by the publisher, code is AGPL-3.0).
"""
from __future__ import annotations

import hashlib
import json
import os
from typing import Dict, List, Optional, Tuple

import chess
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.environ.get("CHIMERA_MAIA", os.path.join(HERE, "models", "maia3_5m.onnx"))
MOVES = os.path.join(HERE, "models", "maia3_moves.json")
MODEL_SHA256 = "f7bd01b3e41dceb5e93eb9f4c61e9c4db8b35411effd1d8c984b006cd74bb804"
HISTORY = 8


def _sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tokenize(board: chess.Board) -> np.ndarray:
    b = board.mirror() if board.turn == chess.BLACK else board
    t = np.zeros((64, 12), dtype=np.float32)
    for sq, p in b.piece_map().items():
        t[sq, (p.piece_type - 1) + (0 if p.color == chess.WHITE else 6)] = 1.0
    return t


def history_tokens(board: chess.Board) -> np.ndarray:
    boards: List[chess.Board] = []
    b = board.copy()
    boards.append(b.copy(stack=False))
    while b.move_stack and len(boards) < HISTORY:
        b.pop()
        boards.append(b.copy(stack=False))
    boards.reverse()  # oldest -> current
    per = [tokenize(x) for x in boards]
    slots = [per[0]] * (HISTORY - len(per)) + per
    return np.concatenate(slots, axis=1)  # (64, 96): square, slot*12+channel


def _mirror_uci(u: str) -> str:
    return u[0] + str(9 - int(u[1])) + u[2] + str(9 - int(u[3])) + u[4:]


class MaiaPolicy:
    def __init__(self, path: str = MODEL, verify: bool = True):
        import onnxruntime as ort
        if verify and _sha(path) != MODEL_SHA256:
            raise ValueError(f"refusing unpinned Maia3 model at {path}")
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        self.session = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
        self.index: Dict[str, int] = {u: i for i, u in enumerate(json.load(open(MOVES)))}

    def predict(self, board: chess.Board, elo: int = 2200, oppo_elo: Optional[int] = None
                ) -> Tuple[Dict[str, float], Tuple[float, float, float]]:
        tok = history_tokens(board)[None]
        out = self.session.run(None, {"tokens": tok, "self_elo": np.array([elo], np.int64),
                                      "oppo_elo": np.array([oppo_elo or elo], np.int64)})
        logits, value = out[0][0], out[1][0]
        mirrored = board.turn == chess.BLACK
        legal = []
        for m in board.legal_moves:
            u = m.uci()
            idx = self.index.get(_mirror_uci(u) if mirrored else u)
            if idx is not None:
                legal.append((u, logits[idx]))
        xs = np.array([l for _, l in legal], dtype=np.float64)
        xs = np.exp(xs - xs.max())
        xs /= xs.sum()
        probs = {u: float(p) for (u, _), p in zip(legal, xs)}
        v = np.exp(value - value.max())
        v /= v.sum()
        return probs, (float(v[2]), float(v[1]), float(v[0]))  # win, draw, loss
