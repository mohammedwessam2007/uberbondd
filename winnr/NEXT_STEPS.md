# Winnr Next Steps

This file is executable continuation state, not a generic wishlist.

## Completed

- [x] Winnr policy/commercial pre-purchase reconciliation.
- [x] $9 three-mailbox pilot purchased and provisioned.
- [x] Provider-leased domain acquired through Winnr.
- [x] Three mailbox credentials exported.
- [x] Encrypted custody implemented.
- [x] Six SMTP/IMAP account rows persisted.
- [x] IMAP verified 3/3.
- [x] SMTP verified 3/3.
- [x] Render direct-465 failure diagnosed as egress/source-network specific.
- [x] Fixed-host blind TLS tunnel implemented and activated.
- [x] Owner-controlled runtime canaries delivered 3/3.
- [x] Gmail placement observed for all three.
- [x] Owner-controlled replies sent for final canaries.
- [x] Reply canaries independently found through IMAP: 2/2.
- [x] Temporary failed/fallback experiments cleaned up.
- [x] Prospect outreach remained at zero during activation.

## Active frontier

1. Run a bounded owner-controlled placement phenotype experiment using the existing three senders.
2. Observe Gmail folder placement and authentication for each exact probe.
3. Compile the result through UberPlacement semantics.
4. If placement materially improves, run a provider-diverse owner-controlled seed test when such seeds are genuinely available.
5. If placement remains red, diagnose/repair or replace the Winnr inventory rather than increasing volume.
6. Only after placement promotion, unlock a tiny cold cohort under existing legal/provider/suppression gates.
7. Measure qualified positive replies, opportunities, cleared revenue, sender health and founder minutes.
8. Scale only from evidence. The $69/50-mailbox Winnr Startup route remains unpurchased until the pilot earns expansion.

## Explicit non-actions

Do not:
- buy Startup merely because transport works;
- raise volume while placement is red;
- contact prospects from this pilot yet;
- create fake engagement;
- expose mailbox passwords/tokens;
- remove the blind tunnel while Render direct TCP/465 remains blocked;
- treat Neon as the production store merely because the Neon plugin is installed;
- repeat the purchase/export/import work.

## Fresh-chat command

When the founder says "continue Winnr", recover `winnr/README.md` and continue from **placement recovery**, unless newer live evidence supersedes this file.

## Placement experiment result — 2026-10-02

The bounded human-readable phenotype test has now run. All three messages were accepted; Gmail placed ordinals 1 and 2 in Inbox and ordinal 3 in Spam. SPF and DMARC passed on all three; an aligned domain DKIM signature and Amazon SES DKIM passed, while a second domain selector named `dkim` failed on all three.

Next frontier:
1. Diagnose the redundant failing DKIM selector without changing working authentication blindly.
2. Treat ordinal 3 as sender-specific red until independent evidence improves it.
3. Obtain provider-diverse owner-controlled seed evidence when genuinely available.
4. Do not contact prospects yet from this pilot.
5. If provider-diverse evidence and sender-specific evidence clear the gate, promote only a tiny cohort under existing 2/day/mailbox and suppression/legal controls.
