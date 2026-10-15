# PHOENIX H09 | repeated identical DSN evidence must not authorize hard bounces

**Independent review source:** H02 verified donor head `4071fe42fce2abccbeb3c0234d6323b86677281f` of #1433; separate High descendant only, no edits to Claude/H01/H02 owned branches.

## WE HAVE DONE
Added precise fail-closed change to `src/uberimap.mjs` so duplicate identical Final-Recipient, Action or Status occurrences in the `message/delivery-status` segment are preserved, not silently de-duplicated by `Set`. The existing `src/pipeline.mjs` requires each evidence array length exactly 1, so a report with repeated same-valued machine recipient records is held for operator review rather than automatically charging/suppressing a sender. Added hostile synthetic cases for repeating each field and whole recipient triplets while retaining the valid single-DSN baseline. No real provider effect path changed.

## VERIFIED
Changes reviewed against exact original parser/test source Git blobs `38dc4bc59cb9d689a1c319990b6ac1cca7ddd6da` and `003241b2a302da64e450c33bde647a9b75cb7591`. This initial receipt describes authored changes only: **no hosted tests yet credited**. Dedicated no-provider push workflow runs exact source and withheld-effect guard tests. A later checkpoint must record actual run/job outcomes and remote readback.

## WHAT IS LEFT / NEXT
Run hosted focused tests and assess full combined CI/Night after review, then independent H01 source collision audit. Source-current Render backup with original key, isolated restore/app startup/writer continuity before 2026-10-16T23:22:29Z is still the P0 operational dependency. Winnr real import, lawful named recipient/send digest, and real clearance outcomes are separately controlled. Never treat byte-safe historic snapshot as current production.

**SAFETY:** No sending, charges, DNS/allowlist changes, provider or database production writes, secret access, deploy or cutover. SEND_SET=[].
