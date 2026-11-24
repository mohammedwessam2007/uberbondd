# Pre-registrations (written 2026-11-24T03:35:53Z, before the runs). Equal clock 10s+0.1, 24 openings x 2 colours, jobs 1, vs frozen V8 ref:2.
C memory-as-computation: native default (TT/history/plan persist across moves) vs native:2:stateless (wiped before every move).
  Hypothesis: carried state is worth Elo at equal clock. Success: point estimate > +20.
D attack profile in games: native:2:style=attack vs ref:2. Success (no-regression bar): point estimate >= -30 (MultiPV-4 cost charged).
G governor hand rule (extend when best move changed last iteration, stop early when stable; lab/governor_changed_rule.txt) vs ref:2.
  Success: point estimate > +20. (The learned 6-feature model failed offline: holdout AUC 0.50, evidence/v11/governor_fit.json.)

## D variant 2 (added 2026-11-24T04:08:58Z): attack profile without MultiPV, null-window margin probes on top-6 alternatives.
Same bar: native:2:style=attack vs ref:2 at 10+0.1, point estimate >= -30. (Variant 1 failed: -293; MultiPV-4 control -243.)
