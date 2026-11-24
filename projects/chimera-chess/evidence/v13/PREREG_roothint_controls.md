# PREREG V13 B2 RootHint controls + #038 sparse activation (registered before the suite is frozen)
Suite: evidence/v13/headroom_v13.json (resumable miner, oracle-best NOT in V8 600k top-3 and V8 loss >= 100cp), dev/confirm by sha.
Equal nodes 200,000. Oracle loss at 1.5M nodes (deterministic). Solved := loss <= 30cp.
H1 (verifier capacity): oracle-hint solves >= 50% (upper bound) -> if NOT, the bottleneck is verification, not proposal.
H2 (Maia beats random control): solved(maia) - solved(random) > 0 on confirm split.
H3 (learned proposer): solved(learned) >= solved(maia) on confirm split.
H4 (#038): gate038 expected loss < random routing at the same fire rate, and <= always-on.
