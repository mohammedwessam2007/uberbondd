# PHOENIX W29 — Measured Direct-Import Reduction, No Source Removal

Date: 2026-10-09. Predecessor: UberMind Omega 8 PR #1356, main `84a6212b63abd33cb9f2eb1bce3e8fed7e4e24ff`.

## Measured change
The original root `CLAUDE.md` had 22 unconditional `@path` imports. Directly named imported source size totaled 568,192 UTF-8 bytes and the root itself 17,514 bytes: 585,706 bytes of root-plus-direct-source material.

Two October 2 first-cash/Winnr long mission documents alone total 234,109 bytes. This PR converts only those two lines from unconditional imports to explicit instructions to **read both complete original files for any active Winnr/outreach/first-cash/commercial mission**. Both originals retain exactly their prior bytes and Git blob IDs:
- `docs/prompts/CLAUDE_OPUS55_WINNR_FIRST_CASH_OPEN_ENDED_MEGA_MISSION_2026-10-02.md`: 134,127 bytes; Git blob `4050c08db846d60fbc10c6e0dfaff8bba3753d69`
- `docs/prompts/CLAUDE_OPUS55_WINNR_FIRST_CASH_MEGA_MISSION_2026-10-02.md`: 99,982 bytes; Git blob `81ef29d41484ff9cdb4f4c714966cbed50aa2db8`

After the narrow edit, root `CLAUDE.md` is 18,257 bytes, there are 20 automatic direct imports (334,083 imported source bytes), and root-plus-direct-source footprint is 352,340 bytes.

**Measured source-byte reduction: 233,366 bytes, 39.84%.** Not a measured reduction in Claude's bill, tokenizer count or usage allowance. Nested imports, auto memory and actual model context are not counted. Per-task demands can and should load the original files on demand. Existing root founder mandate, `AGENTS.md`, terminal North Stars, PHOENIX and original #0001–#0890 corpus are unaltered.

## Verification boundary
`scripts/ubermind-startup-context-audit.mjs` supplies a read-only source-byte-and-hash report. The updated `tests/ubermind-startup-context-audit.test.mjs` asserts both original full files remain reachable and that the root retains the commercial recovery instruction. Its exact Git blob `965bd67ef575b156f0fd1d22015548e047ce619c` ran 4/4 under Node v22 on a synthetic checkout; exact live repository/Render Node suite needs separate verification. No paid model calls, new spend, outreach or account modifications.

Next: run Claude Code `/context` and `/status` before/after matching accepted tasks. Retain rollback to predecessor root blob `c6ace5be78781536b756a06745904407b9a65bff` if actual founder instruction continuity regresses. Never delete original missions or substitute byte percentages for accepted quality-equivalent savings.
