"""CHIMERA neural chess policy scaffold. Research software, not a trained engine.

Original code. Accepts legal candidate moves and encoded boards; the move generator
must supply legal moves (e.g. python-chess). Never feed arbitrary illegal candidates.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
import torch
from torch import nn
from torch.nn import functional as F

PLAYERS = ("Nezhmetdinov", "Tal", "Basman", "Shirov", "Dubov", "Emergent")


@dataclass
class PolicyOutput:
    logits: torch.Tensor        # [B, M], legal moves only after masking
    base_logits: torch.Tensor   # [B, M]
    expert_logits: torch.Tensor # [B, 6, M], sixth untrained initially
    gates: torch.Tensor         # [B, 6] mixture probabilities
    plan_state: torch.Tensor    # [B, 16] internal continuation state


class Chimera(nn.Module):
    """Candidate-scoring transformer + six residual style heads + plan memory.

    Board planes: [B,18,8,8], 12 pieces, side, four castling, en-passant.
    Moves: [B,M,3], from, to (python-chess squares 0..63), promotion 0..4.
    Features: [B,M,4] capture, check, castling, promotion, normalized 0..1.
    Mask: [B,M] true if legal, false if padding. All rows must contain legal moves.

    Emitted scores are NOT trustworthy chess evaluations until trained.
    """
    def __init__(self, width=96, layers=2):
        super().__init__()
        self.width = width
        self.square_stem = nn.Linear(18, width)
        self.square_pos = nn.Embedding(64, width)
        layer = nn.TransformerEncoderLayer(
            width, nhead=4, dim_feedforward=width * 2,
            dropout=0.0, batch_first=True, activation="gelu", norm_first=True
        )
        self.trunk = nn.TransformerEncoder(layer, num_layers=layers,
                                           enable_nested_tensor=False)
        self.plan_gru = nn.GRUCell(width, 16)
        self.gate = nn.Sequential(nn.Linear(width + 16, 96), nn.GELU(),
                                  nn.Linear(96, 6))
        self.promotion = nn.Embedding(5, 16)
        self.move_stem = nn.Sequential(nn.Linear(width * 2 + 16 + 4, 128),
                                       nn.GELU(), nn.Linear(128, 128), nn.GELU())
        self.base = nn.Linear(128, 1)
        self.experts = nn.ModuleList([
            nn.Sequential(nn.Linear(128, 64), nn.GELU(), nn.Linear(64, 1))
            for _ in range(6)
        ])
        # Emergent head is initially zero; do not enable before independent training.
        nn.init.zeros_(self.experts[5][-1].weight)
        nn.init.zeros_(self.experts[5][-1].bias)
        self.emergent_enabled = False

    def forward(self, boards, moves, features, legal_mask,
                previous_plan: Optional[torch.Tensor] = None,
                style_bias: Optional[torch.Tensor] = None) -> PolicyOutput:
        if boards.ndim != 4 or tuple(boards.shape[1:]) != (18, 8, 8):
            raise ValueError("Board input must be [B,18,8,8]")
        B = boards.shape[0]
        if moves.ndim != 3 or moves.shape[0] != B or moves.shape[2] != 3:
            raise ValueError("Moves must be [B,M,3]")
        M = moves.shape[1]
        if features.shape != (B, M, 4) or legal_mask.shape != (B, M):
            raise ValueError("Move features/mask shape mismatch")
        if not legal_mask.bool().any(dim=1).all():
            raise ValueError("Each row needs at least one legal candidate")
        if (moves[..., :2] < 0).any() or (moves[..., :2] > 63).any():
            raise ValueError("Square index outside 0..63")
        if (moves[..., 2] < 0).any() or (moves[..., 2] > 4).any():
            raise ValueError("Promotion index outside 0..4")
        squares = boards.permute(0, 2, 3, 1).reshape(B, 64, 18)
        pos = self.square_pos(torch.arange(64, device=boards.device))
        tokens = self.trunk(self.square_stem(squares) + pos.unsqueeze(0))
        context = tokens.mean(dim=1)
        if previous_plan is None:
            previous_plan = context.new_zeros((B, 16))
        if previous_plan.shape != (B, 16):
            raise ValueError("Previous plan must be [B,16]")
        plan = self.plan_gru(context, previous_plan)
        gate_logits = self.gate(torch.cat([context, plan], -1))
        if style_bias is not None:
            if style_bias.shape != (B, 6):
                raise ValueError("Style bias must be [B,6]")
            gate_logits = gate_logits + style_bias
        if not self.emergent_enabled:
            gate_logits = torch.cat([gate_logits[:, :5],
                                      gate_logits.new_full((B, 1), -1e4)], dim=1)
        gates = gate_logits.softmax(dim=1)
        f_idx = moves[:, :, 0].long()
        t_idx = moves[:, :, 1].long()
        fi = tokens.gather(1, f_idx.unsqueeze(-1).expand(-1,-1,self.width))
        ti = tokens.gather(1, t_idx.unsqueeze(-1).expand(-1,-1,self.width))
        mv = self.move_stem(torch.cat([fi, ti,
                            self.promotion(moves[:, :, 2].long()), features], -1))
        base = self.base(mv).squeeze(-1)
        expert_scores = torch.stack([h(mv).squeeze(-1) for h in self.experts], dim=1)
        expert_scores = expert_scores.masked_fill(~legal_mask.bool().unsqueeze(1), -1e9)
        score = base + (expert_scores * gates.unsqueeze(-1)).sum(dim=1)
        logits = score.masked_fill(~legal_mask.bool(), -1e9)
        return PolicyOutput(logits,base,expert_scores,gates,plan)


def supervised_loss(output: PolicyOutput, targets: torch.Tensor,
                    player_ids: torch.Tensor) -> torch.Tensor:
    """Behavioral imitation, expert specialization and contextual routing.

    Player IDs 0..4 denote whose actual historical move is the supervised target.
    This is NOT strength optimization; it imitates decisions only.
    """
    B = targets.shape[0]
    if player_ids.shape != (B,) or not ((player_ids>=0)&(player_ids<5)).all():
        raise ValueError("Known historical player IDs 0..4 required")
    local = output.expert_logits[torch.arange(B, device=targets.device), player_ids]
    overall = F.cross_entropy(output.logits, targets)
    expert = F.cross_entropy(local, targets)
    # Encourage routing to coherent experts, instead of average-mode collapse.
    routing = F.nll_loss(output.gates[:, :5].clamp_min(1e-12).log(), player_ids)
    return overall + 0.4 * expert + 0.08 * routing


def guarded_choice(logits, candidate_names, wdl=None, max_expected_score_loss=0.03):
    """Choose highest-ranked policy move among WDL-tolerable candidates.

    WDL input: iterable of (win,draw,loss) for SAME side to move, already
    objectively evaluated by an external engine at a common search budget.
    No WDL means no objective tactical guard; returns a labeled decision.
    This selector is not a substitute for search, tablebases, or legality checks.
    """
    scores = torch.as_tensor(logits, dtype=torch.float32).flatten()
    if len(candidate_names) != scores.numel() or not candidate_names:
        raise ValueError("Candidate/scores mismatch")
    if wdl is None:
        j = int(scores.argmax().item())
        return {"move": candidate_names[j], "guard_applied": False,
                "external_wdl_verified": False,
                "reason": "No external search/WDL provided"}
    if len(wdl) != len(candidate_names):
        raise ValueError("WDL/candidate mismatch")
    expected = []
    for triple in wdl:
        if len(triple) != 3:
            raise ValueError("Each WDL has three components")
        w,d,l=map(float,triple)
        if min(w,d,l) < 0 or abs(w+d+l-1) > 0.02:
            raise ValueError("WDL must be normalized to 1")
        expected.append(w+0.5*d)
    best=max(expected)
    safe=[i for i,x in enumerate(expected) if best-x<=max_expected_score_loss+1e-12]
    j=max(safe,key=lambda i:float(scores[i]))
    return {"move":candidate_names[j], "guard_applied":True,
            "external_wdl_verified": False,
            "reason":"Selected from provided WDL; original estimates not independently validated",
            "expected_score":expected[j], "best_available_expected_score":best,
            "allowed_score_loss":max_expected_score_loss}
