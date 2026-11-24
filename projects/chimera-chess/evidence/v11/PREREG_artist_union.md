# Pre-registration: Artist candidate union + focused verification (written 2026-11-24T02:44:07Z, before any run)
Suite: evidence/v11/headroom_suite.json built by tools/build_headroom_suite.py from the CC0 Lichess 16MB slice,
excluding every puzzle id and game used by earlier suites. Kept only if V8 (300 ms) misses SF16-d20's best by >=100cp and
the SF best is not in V8's MultiPV top-3 at 300 ms. Split BEFORE any method run: dev = sha256(id)%2==0, fresh = rest.
Method (equal total wall clock T per position): candidates = V8 MultiPV-3 (0.35T) + Maia3-5M top-3 (elo 2200) + V7 #047
sacrifice-grammar Artist (chimera/creative.artist_candidates); dedupe; each verified by native 'go searchmoves m' with equal
share of the remaining time; choose max verified score. Baseline: native V8 plain search for the whole T.
Primary metric: SF-best match on the FRESH half at T=1000 ms. Success: method - baseline >= +3 solved AND mean SF cp-loss
not worse by >10cp. Dev half is reported but not used to decide. Failure -> not integrated, preserved.

## Result of the registered method: FAIL (fresh 13/43 vs baseline 24/43). Candidate recall 30/43; verification is the bottleneck.
## Variant 2 (added 2026-11-24T03:25:13Z, exploratory, DEV half only because fresh was consumed by the registered test):
conservative switching - plain search 0.6T; candidates = Maia3 top-3 + #047 Artist excluding the base move; each verified with
equal share of 0.4T; switch only if verified score >= base score + 15cp. Reported as DEV-ONLY, not a confirmation.
