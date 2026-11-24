# Pre-registration: nonlinear Sixth-Instinct student (written 2026-11-24T10:05:06Z, before running)
Same 448-discovery pool and the same leave-one-family-out (LOFO) protocol that the V11 linear student failed (beat Maia3 on 1/5).
Success (transfer): MLP top-1 > Maia3 top-1 on >= 3 of 5 held-out families (the 'promotion' family has n=1 and is skipped).
Failure -> no nonlinear transfer at this data scale; preserved.

## Result: FAIL (0/5). Variant 3 (added 2026-11-24T10:05:41Z, before running): residual-on-Maia linear student
score = 10*maia_logp (= Maia log-probability) + X.w (maia feature excluded from w), L2 in {0.01, 0.1, 1.0} chosen on the
TRAINING families only by inner leave-one-family-out; same LOFO test. Success: beats Maia top-1 on >= 3/5 families.
