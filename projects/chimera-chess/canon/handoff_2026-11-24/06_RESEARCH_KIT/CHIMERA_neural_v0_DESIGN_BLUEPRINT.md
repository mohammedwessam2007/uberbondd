# CHIMERA: The Sixth Instinct | Design Blueprint

## 0. Core principle

**Don't average historical masters. Train creative instincts, then learn when each is useful.**

History is demonstration data, not truth: a famous sacrifice can be objectively inferior even if it won. The bot must learn from a clear distinction between the *observed historical move* and the *verified quality of the move*. Never equate a human player's identity with a fixed tactical trait.

## 1. Proposed processing loop

```text
LEGAL POSITION + LAST MOVES
          |
   A. Representation brain (pretrained Maia-3 or original transformer)
          |
   B. Five historical residual heads
      Nezhmetdinov | Tal | Basman | Shirov | Dubov
          |
   C. Contextual instinct router + persistent plan state
          |
   D. Candidate imagination laboratory
      unfamiliar structures, sound sacrifices, king dynamics,
      positional provocation, endgame ideas
          |
   E. Counterfactual response arena
      human reply distribution + expected difficulty by skill
          |
   F. Objective verifier (Stockfish/Lc0/search/tablebase)
      reject forced losses and budget WDL downside
          |
   G. Selected move + updated state + training evidence
          |
   H. Sixth emergent adapter (OFF until pre-registered experiments pass)
```

**What works in v0:** A, B, C architecture and a selection API for externally supplied F estimates. The response arena, candidate novelty sampler, objective engine integration and emergent self-play are designs only.

## 2. Novelty and ethics boundary

The purpose of human-like choices is a genuinely creative, expressive AI for disclosed play, analysis, research and coaching. Nothing here is a method of evading anti-cheating systems or impersonating a human during rated events.

## 3. Separate objective functions rather than a single personality score

For a move `a` in position `s`, future prototype can estimate:

- `Q(s,a)` = empirically calibrated expected result under search; optimize strongly.
- `C(s,a)` = expected opponent decision difficulty under a *calibrated human reply model*; optimize subject to valid evidence.
- `N(s,a)` = novelty as a held-out reference-database frequency/structural surprise, not just rare opening names.
- `P(s,a)` = continuation consistency: whether this move advances an explicit planned structure.
- `R(s,a)` = reversible risk budget conditioned on match score, clock, game phase, opposition.
- `D(s,a)` = measurable tactical depth and forcing lines, estimated from legal continuations/search.

One falsifiable candidate objective is to maximize expected-score-conditioned practical difficulty and novelty **inside** an acceptable expected-result loss envelope. Rarity and surprise never independently prove chess quality.

## 4. Training stages

**Stage 1: Validated corpus.** Obtain full PGNs from trusted sources, verify legality, deduplicate moves and games, preserve source and chess time control. The previous November 23 archive research kit is a source map, not downloaded full games.

**Stage 2: Shared pretrained baseline.** Use published Maia-3 or a licensed comparable policy, evaluate master move prediction on held-out games. Treat Maia-3's UCI WDL as behavioral estimates rather than searched tactical ground truth.

**Stage 3: Five residual personalities.** Freeze the backbone; train small subject-specific adapters on each player's decisions. Split *by whole games, chronological and event aware*, compare with a shared-only baseline. Preserve differences in label quality, time controls and historical opponent strength.

**Stage 4: Situation-aware routing.** Train the context gate to choose experts only where it improves held-out loss or wins calibrated tournaments. Compare against naive equally-weighted and randomly routed five-expert baselines.

**Stage 5: Cognitive pressure.** Use human-move prediction to model realistic *responses*, not psychographic profiling. Test on separate consenting human groups or public datasets and calibrate by skill/time control.

**Stage 6: Search and novelty.** Let five experts propose candidate plans beyond top-N conventional search. Verify with Stockfish or Lc0 and match outcome distributions using the same compute budget for all methods. Use tablebases when possible.

**Stage 7: Emergent sixth instinct.** Train a **separate** adapter by distillation from empirically useful cross-expert innovations and controlled self-play. Hold out positions and openings unseen during training, compare six vs five with paired colors and matched budgets.

**Stage 8: Personal evolution.** Maintain a memory of its own game themes, successes and failed ideas. Update only between authorized benchmark runs, not blindly from one lucky win.

## 5. Experiments that can kill the hypothesis

| Claim | Fair falsifier |
|---|---|
| Historical adapters really learn player style | No held-out prediction benefit over equal-capacity shared model |
| Routing improves chess | Equal mixture or simple context heuristic performs as well under paired matches |
| Novelty is useful | Higher novelty coincides with lower search WDL without human-response advantage |
| Psychological complexity is real | Independent human agents respond just as accurately as to a baseline |
| Long-term intent improves planning | Removing plan memory does not worsen end-to-end game goals |
| Sixth instinct is an actual improvement | No Elo/WDL/practical-win gain over five heads at fixed compute and data |

A lone lucky game does not count. Report sample size, confidence intervals and match conditions. Compare to not building a new network: simple Stockfish multiPV re-ranking can serve as a cheap baseline.

## 6. Potential standalone practical deployment

For the first useful version, run Maia-3 5M (official CPU preset) plus custom adapters as a **separate UCI program** for disclosed bot matches and analysis. Keep a neural model as the core decision maker and use Stockfish as a verifier, not as the personality generator. Verify licenses before code combination: official Maia-3 carries AGPL-3.0 and Stockfish GPL-3.0. A user-supplied `python-chess` legal-move library must also be licensed and reviewed appropriately.

Do not claim a local mobile version before benchmarking inference throughput and heat on the intended device. On-device small-model inference is plausible, but measured battery/latency/thermal claims are required.

## 7. Ultimate successful behavior

A conventional engine searches for the highest-value move. CHIMERA should *first* imagine candidate plans using a learned, evolving chess aesthetic, then test whether those ideas stand up to calculation. The proof is not whether a move looks weird. It is whether creative variation produces robust, competitive moves that change how people and other engines need to think.
