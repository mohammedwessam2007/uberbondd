# PREREG V13 #050 Petrosian-Tal transform (state-conditioned)
Positions: first 120 rows of lab/human_v13.jsonl (fresh; not used for any tuning). Equal nodes 100k; StyleMarginCp 30.
H1 soundness: mean oracle loss(transform) <= loss(attack-only) + 2cp.
H2 restraint phase: in high-opponent-mobility states (>28), opponent mobility after transform's move < after attack-only's.
H3 attack phase: in low-mobility states (<=28), king pressure after transform's move >= restraint-only's.
PASS requires H1-H3. Thresholds 28/6 were fixed in code before any data was seen (TRANSFORM_MOB/TRANSFORM_ATT).

## AMENDMENT (after an invalid first run, before any valid data)
The first run (100k nodes) was INVALID: 0/120 moves changed by any profile and no style trace was printed. Cause: the style
null-window probes run after the main search and abort immediately once a node limit is exhausted (engine limitation,
recorded). Re-run at fixed depth 8 (same as the V11 style lab). Hypotheses H1-H3 unchanged. The invalid output is kept as
evidence/v13/style/transform_120_INVALID_nodes.json.
