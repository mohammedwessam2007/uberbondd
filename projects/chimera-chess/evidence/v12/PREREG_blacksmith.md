# Pre-registration: Counterfactual Blacksmith (written 2026-11-24T09:59:42Z, before the run)
Data: evidence/v9/hard_sac_negatives.json (37 near-identical counterexamples; ground-truth missing ingredient = removed piece).
Primary: Blacksmith pick (preparation ranked by native V8's own 20k-node eval of the position after P, best reply R, sacrifice S)
restores a sound winning S (SF16 d14: S within 30cp of best and >= +100) more often than the expected random-preparation count.
Success: pick_restores >= 2 x expected_random AND pick_restores >= 5. Causal check (reported, not gated): restoring preparations
interact with the removed ingredient's square more often than non-restoring ones.
