# Pre-registration: single-candidate focused verification (RootHint = Maia3 top-1), written 2026-11-24T10:31:45Z
Suite: evidence/v12/headroom_suite_v12.json (salt 'v12fresh', built at fixed 600k nodes, excludes every earlier suite id,
discovery-pool id and their games). Never used by any method before this run.
Method: native search with RootHint=Maia3 top-1 (searched first, +1 ply), wall clock 1000 ms per position with Maia time charged;
baseline: plain native search 1000 ms. Both on an otherwise idle machine (background jobs suspended).
Primary (FRESH split): hinted_solved - plain_solved >= +3 AND only_plain <= 1. Secondary: recall vs selection decomposition.
Run once; DEV split reported alongside (not decisive).
