# Winnr Execution Lineage

This is a compact no-amputation history. Superseded states remain recorded so future recovery does not repeat failed work.

## Procurement and pre-purchase

1. UberBond researched sender-substrate options after Cold Mail Server payment/entitlement failure and the netcup AUP mismatch.
2. Winnr support confirmed the described lawful B2B route subject to its mailing practices, truthful identity, unsubscribe/suppression and legal compliance.
3. Winnr support confirmed Egypt availability, standard SMTP/IMAP export, REST/MCP automation, sole-proprietor/trade-name use, and the three-address pre-warmed pilot.
4. Historical 90-day-minimum documentation conflicted with current docs. Support resolved the contradiction: the minimum was removed in August 2026 and the current pilot is cancel-anytime.
5. Purchase selected `cedarpointdomains.com`, three existing addresses, $9/month, no base plan, no paid warming add-on.
6. At purchase, Winnr showed nine blocklist checks passing and a vendor health score of 96/100, but only 14 days of warming. The 14-day live inventory evidence supersedes older generic "months warmed" implications for this exact inventory.

## Provisioning and custody

7. Payment and actual mailbox entitlement were both verified. This avoided repeating the earlier "payment != provisioning" failure.
8. Default credential export contained exactly three rows for the purchased domain with SMTP/IMAP material.
9. A read-only Winnr API token was created and stored in protected runtime configuration. Write authority was deliberately not granted.
10. Plaintext credential transfer through ordinary Render environment-variable tooling was refused.
11. UberBond implemented a one-time sealed-envelope bootstrap using a runtime-generated public key.
12. The sealed payload was consumed in production and written as six encrypted SMTP/IMAP account rows.
13. No plaintext credential was committed to Git or logged.

## Transport diagnosis

14. Direct local SMTP/IMAP tests were initially inconclusive because one workspace could not resolve/reach the Winnr transport host.
15. Winnr web inbox roundtrip proved provider-side receive/reply behavior and authentication alignment.
16. Direct Render IMAP became 3/3 green.
17. Render SMTP initially confirmed mailbox 1, then fresh TCP/465 attempts for mailboxes 2/3 timed out before SMTP authentication.
18. Diagnostics were hardened so transport failures were preserved without leaking credentials.
19. Stateful ordinal reconciliation prevented duplicate owner canaries.
20. Independent cloud probes reached Winnr:465, isolating the failure to source-network/egress behavior rather than bad mailbox credentials.
21. Railway fallback was rejected because its trial was expired; no paid upgrade was made.
22. Replit development fallback did not produce a stable executable preview; it was not published.
23. A generic sandbox path that would have required decrypting mailbox credentials outside the approved custody boundary was refused and cleaned up.
24. Supabase provided a credential-free TCP reachability proof.
25. PR #1149 added the fixed-host blind TLS tunnel. Render retained credential custody and the relay carried only opaque inner TLS bytes.
26. Final runtime activation reached `WINNR_RUNTIME_TRANSPORT_VERIFIED`: SMTP 3/3, IMAP 3/3.

## Placement and reply evidence

27. All three owner-controlled runtime canaries reached UberBond Gmail.
28. All three runtime canaries were classified Spam.
29. Prospect sending remained frozen.
30. Owner-controlled Gmail replies were sent to Winnr mailboxes 2 and 3.
31. PR #1151 added a sanitized one-shot reply verifier.
32. Its first deployment exposed an import-newline syntax defect.
33. PR #1152 repaired the syntax defect.
34. Live Render then logged `WINNR_REPLY_CANARIES_INGESTIBLE` with found ordinals [2,3], three IMAP accounts checked, and no body/address/credential logging.

## Current supersession

Earlier state "SMTP 1/3, IMAP 3/3, replies pending" is superseded.

Current state is:
`SMTP 3/3 + IMAP 3/3 + REPLIES 2/2 INGESTIBLE + RUNTIME PLACEMENT 0/3 INBOX`.

The only activation gate still red is placement.
