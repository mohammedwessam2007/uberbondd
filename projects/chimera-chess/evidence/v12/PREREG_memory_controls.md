# Pre-registration: memory controls at equal nodes (written 2026-11-24T10:07:14Z, before running)
Conditions per position: correct history (PlanMemory ON_TRACK), FEN reset, irrelevant other-game history then FEN.
Expected if memory is useful: mean SF cp-loss(correct) < mean cp-loss(reset) by >= 5cp over >= 40 positions.
Robustness requirement: the irrelevant-history condition must report RESET (or NONE) status in >= 95% of positions and
make the SAME decision as reset in >= 95% (irrelevant narrative must not contaminate decisions).

## 3-condition result: bars met (correct 54.2 vs reset 62.3; irrelevant -> RESET 60/60, same decision 58/60).
## Confound: 'correct' also carries a warm TT. Added (before re-running) condition 4: correct history, PlanMemory OFF.
Attribution rule: plan memory is credited only with the part of the gain present in 'correct' but not in 'correct, plan off'.
