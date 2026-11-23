# CHIMERA: The Sixth Instinct | neural chess research scaffold v0

**Date:** November 23, 2026. **Status:** ORIGINAL TESTED RESEARCH PROTOTYPE. No historical chess PGNs, Maia-3 weights, Stockfish model, or trained player policies are included. This is **not yet a playable, strong or evaluated chess engine**. It is a small working neural architecture and supervised training interface.

## Research hypothesis

A human-like chess brain can combine situational learning from five creative masters with continuous strategic memory, opponent-centered practical difficulty estimates and an objective tactical verification stage. A sixth expert should only be activated when separately trained/evaluated on previously unseen positions. Style mixing alone is not a unique invention: Frisoni et al. (2026), *Mixture of Masters*, https://arxiv.org/abs/2602.04447, already studies it.

Five reference styles: Nezhmetdinov (sustained initiative), Tal (practical complexity), Basman (unfamiliar structure), Shirov (concrete tactical conversion), Dubov (modern experimentation). These are *training hypotheses*, not extracted measured traits.

## What is implemented

- `chimera.py`: a 64-square transformer encoder, candidate-move scoring neural policy, five trainable residual style heads, context-dependent mixture gate, 16-dimensional recurrent plan state and a sixth **disabled/untrained** head; legal move padding mask; optional learned manual preference bias.
- `data_adapter.py`: optional legal PGN → board/candidate/target examples, separated by player to move. Validity and legal generation use `python-chess` if installed.
- `train.py`: bounded supervised imitation baseline, deterministic game-level hash split; no hidden dataset, no pre-trained weights, no claims of GM strength.
- `guarded_choice()`: accepts externally provided WDL for all candidate moves and selects a high-policy-probability candidate only within a maximum expected-score cost. The selector does not independently verify supplied WDL and labels them accordingly. It **does not generate** those WDLs; externally measured probabilities must be comparable and side-to-move relative. If absent it labels the result UNVERIFIED.
- `test_chimera.py`: 8 unit tests (shape, mask, gradient, recurrent state, safety gate, invalid input).

## Run tests

Python 3.10+ and PyTorch required:

```bash
python -m unittest -v test_chimera.py
```

## Train an imitation pilot on authentic user-supplied PGNs

Install `python-chess` in your own environment after reviewing its license; put PGNs in `../pgn_inputs/`:

```bash
python -m pip install torch python-chess
python train.py --pgn-folder ../pgn_inputs --max-games 100 --epochs 2 --batch-size 16
```

The previous `CHAOS_FIVE_CHESS_RESEARCH_KIT_2026-11-23.zip` discovered relevant PGN archives but **did not contain validated full game-score corpora**. Running this training script with empty PGN folders intentionally fails, rather than fabricating examples.

## Important limitations

1. No off-the-shelf Maia-3 backbone is wired in. This testable architecture starts with random weights and needs actual data. Best pragmatic upgrade: use the *official Maia-3* (Chessformer, ICLR 2026) as a pretrained trunk, train small player-specific residual heads and preserve its license. Official: https://github.com/CSSLab/maia3.
2. The recurrent plan state has structural support but no sequence-based training in v0. Training one static position at a time does NOT show genuine plan coherence.
3. Opponent belief, novelty discovery, tactical tree search, personal style evaluation, external WDL search and self-play are roadmap items, not built.
4. Imitation accuracy cannot establish strength, inventiveness or truly novel ideas. Evaluate those independently and against simpler baselines.
5. The split hashes game header identity; duplicate recordings with different metadata and games between two target players need source-specific dedup before publication-quality research.
6. Legal-move correctness and training with actual PGNs remain untested here if `python-chess` isn't available. Tests validate model tensors and selection logic, not chess legality.
7. Intended for disclosed bot play, analysis, simulation, and coaching. Never disguise an engine as a human in competitions that prohibit assistance.

## Originality beyond Mixture of Masters: proposed, not yet implemented

**Psychological counterfactual arena:** estimate candidate moves' likely human responses using rating-conditioned Maia-3 and learn tactical response hardness from held-out human decisions, **not cheating detection** or false certainty about opponents' thoughts.

**Plan continuity memory:** model ongoing strategic commitment over full games; add a penalty when a new choice abandons a promising existing plan without evidence.

**Novelty laboratory:** search for viable, low-frequency positions by matching against an actual reference database and evaluating objectively, while measuring whether the move creates new useful strategic affordances, not just weird appearances.

**Emergent sixth instinct:** after five experts are calibrated, distill their productive interactions into a separate head and improve via strength-bounded self-play and held-out testing. Compare sixth-enabled and sixth-disabled at fixed search budgets.

## Falsification and acceptance

- Style test: each expert predicts **held-out** player moves better than an equal-capacity shared-only baseline at comparable strength. If not, style transfer isn't demonstrated.
- Quality test: at the same number of engine nodes, the hybrid must not suffer an unacceptable match-score loss versus a strong baseline.
- Practical complexity test: rating-stratified human agents make more wrong replies to the hybrid's viable plans than to matched baseline positions. Must be empirically measured, not assumed.
- Novelty test: out-of-book positions stay competitive in WDL and are not merely common transpositions.
- Six-head test: enabling the emergent expert must improve a pre-registered objective over five-head controls. Otherwise it remains disabled.

## Independent references

- Official Maia-3 repository: https://github.com/CSSLab/maia3
- Chessformer ICLR 2026: https://openreview.net/forum?id=2ltBRzEHyd
- Mixture of Masters 2026 preprint: https://arxiv.org/abs/2602.04447
- Individual style embeddings 2026 preprint: https://arxiv.org/abs/2606.25176
- Lc0 neural evaluation + PUCT search: https://lczero.org/dev/wiki/technical-explanation-of-leela-chess-zero/
