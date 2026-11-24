# PREREG V13 #050 Petrosian-Tal transform (state-conditioned)
Positions: first 120 rows of lab/human_v13.jsonl (fresh; not used for any tuning). Equal nodes 100k; StyleMarginCp 30.
H1 soundness: mean oracle loss(transform) <= loss(attack-only) + 2cp.
H2 restraint phase: in high-opponent-mobility states (>28), opponent mobility after transform's move < after attack-only's.
H3 attack phase: in low-mobility states (<=28), king pressure after transform's move >= restraint-only's.
PASS requires H1-H3. Thresholds 28/6 were fixed in code before any data was seen (TRANSFORM_MOB/TRANSFORM_ATT).
