# PREREG V13 human-cognition probes (registered at n=55 smoke; final analysis on the frozen dataset at the end of V13)
Data: lab/human_v13.jsonl (Lichess 2013-01 CC0, seed 13, one position per game, both players >=1500, base >=180 s).
Error := deterministic-oracle loss >= 100 cp. Bootstrap 1000x over games. A probe PASSES only if its 95% CI excludes the
null in the predicted direction. The smoke run (n=55) is NOT evidence; only the final file counts.
- #154 complexity decay: Spearman(n_good_moves, loss) < 0.
- #014 atlas: descriptive (no pass/fail); reported cells only.
- #081 fragility: AUC > 0.5.   - #086 instability: AUC > 0.5.
- #009 temptation: err(forcing human move) - err(quiet) > 0.
- #012 false safety: err rate in false-safety positions - elsewhere > 0.
- #013 attention conflict: diff > 0.   - #137 backward-best blind spot: diff > 0.
- #007 disagreement: err(Maia != V8) - err(agree) > 0.
- #037 instant regret (V8 2k vs 200k flip, no oracle): AUC > 0.5.
- #005 Maia WDL calibration: report Brier vs oracle logistic and vs constant; PASS if Brier(Maia) < Brier(constant).
- #120 two-world critic: held-out Brier(mix) - Brier(oracle) < 0 with CI excluding 0.
Clock-based #127 (time scramble) is NOT attempted: the 2013-01 PGNs contain no %clk annotations (checked).

## REVISION 1 (before the final dataset; the n=55 smoke of the first-pass definitions had been seen)
Audit against canon method_proposed showed several first-pass probes did not test the registered mechanism. To avoid
relabelling, they were rewritten; the first-pass versions are superseded and NOT reported as results:
- #154 now tests ENGINE (native V8 at 2k/20k/200k nodes) decision loss vs complexity, baseline = branching factor. PASS: Spearman<0 with CI<0 at >=2 budgets.
- #014 held-out atlas AUC vs Maia-entropy baseline. PASS: atlas-minus-entropy CI > 0.
- #081 shallow(60k)-to-deep(300k) value change vs static |eval|. PASS: AUC CI > 0.5 and AUC > baseline.
- #086 legal-reply value dispersion vs policy entropy. PASS: CI(share-minus-entropy) > 0.
- #009 held-out log loss of the human move: Maia3 vs class-frequency vs uniform. PASS: CI(Maia-minus-freq) < 0.
- #012 rating-band-matched false-safety difference. PASS: CI > 0.
- #013 fronts count (no move-agreement proxy) added to |value|+branching+rating logistic. PASS: held-out AUC gain > 0.02.
- #137 motif-of-best-move difficulty added to complexity logistic. PASS: held-out AUC gain > 0.02.
- #007 disagreement records adjudicated by oracle (descriptive; training-on-disagreements NOT done -> capped BOUNDED_TRIAL).
- #037 tiny cheap-feature logistic vs single-flip baseline. PASS: held-out AUC tiny > single flip and > 0.6.
- #005 / #120 unchanged.
- #131 only-move diagnostic (added before final data): PASS if Spearman(viable count, human loss) < 0 with CI < 0.
- #123 deliberation gate (added before final data): PASS if CI(gate - random at matched escalation rate) < 0 (expected-value comparison).
