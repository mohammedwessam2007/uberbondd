# PREREG V13 discovery-pool probes (registered before the oracle run; the learner-only #032/#018 smoke on the same folds
# was seen first: general 0.825 / quiet-head-on-quiet 0.873 / general-on-quiet 0.732 / Maia-on-quiet 0.752; failure-aug 0.829 vs 0.825)
Subset: 150 pool items with smallest sha256('v13probe'+id). Oracle lab/oracle.py 300k (and 60k) nodes.
- #022 originality: PASS impossible for source-originality (puzzle-derived pool); report human-novelty share (Maia rank>=3).
- #104 genius audit: report confirmed share (<=30cp at 300k) and persistent-gap share; PASS if confirmed share >= 0.8.
- #003 delayed revelation: PASS if quiet-family mean rise > 0 with CI excluding 0 AND > forcing-family mean rise.
- #029 mutation robustness: descriptive; robust share and per-family.
- #011 generator: PASS if >= 10 generated verified counterintuitive positions (yield reported).
- #032 quiet head: PASS if quiet-head-on-quiet > general-on-quiet in >= 4/5 folds (sign test) — smoke already seen, so this is
  CONFIRMATORY only on a fresh pool (queued); V13 status capped at BOUNDED_TRIAL.
- #018 failure augmentation: PASS if failure_aug > base in >= 4/5 folds; else VERIFIED_FAIL_VARIANT.
