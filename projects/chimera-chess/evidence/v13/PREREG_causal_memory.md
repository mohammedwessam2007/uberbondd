# PREREG V13 D2 — causal memory channel intervention (registered before the measured run)
Tool: tools/causal_memory.py; engine native/chimera with PlanBias/PlanCorrupt (V13). Positions: every 11th ply (<80) of
archived V9 match games, shuffled seed 13, first N=60 usable. Nodes: 150,000 per search, TT cleared (Hash re-set) before the
measured search. Oracle: lab/oracle.py (SF16 T1 fresh hash, 300k nodes, cached).
Hypotheses:
H1 channel is causal: decision(correct) != decision(disabled) in >= 10% of positions.
H2 incorrect memory hurts: mean loss(wrong) - loss(disabled) > 0 with 95% bootstrap CI excluding 0.
H3 irrelevant prior narrative is rejected: status RESET in >= 95% and decision(irrelevant) == decision(none) in >= 90%.
H4 benefit (exploratory, not expected to pass at n=60): loss(correct) < loss(disabled), CI excludes 0.
Any outcome is recorded; failing H1 => the channel is NOT causal at this node budget.
