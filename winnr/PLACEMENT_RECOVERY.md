# Winnr Placement Recovery Protocol

Status: **PHASE A COMPLETED / NEXT-STAGE VALIDATION ONLY**

Phase A ran on 2026-10-02: ordinals 1 and 2 reached UberBond Gmail Inbox; ordinal 3 reached Spam and is quarantined from SMTP fleet selection. The earlier 0/3 diagnostic phenotype remains historical comparison evidence. Do not rerun Phase A or discard its durable send ledger. See `FINAL_ACTIVATION_2026-10-02.md` and `LIVE_RECONCILIATION_2026-10-02.md`.

Goal: determine whether the current 3/3 Spam runtime sample reflects sender/domain reputation, message phenotype, test-context artifacts, or a combination, without manufacturing engagement or weakening anti-abuse controls.

## Rules

- Owner-controlled seed inboxes only until promotion.
- No fake opens, fake replies, fake threads, artificial warm-up conversations, or anti-abuse manipulation.
- No prospect send while placement is red.
- No inference from SMTP 250 alone.
- Preserve sender health, provider limits, suppression/unsubscribe controls, truthful identity and evidence-backed content.
- Record receiving-provider folder observation as the promotion evidence.

## Phase A — Gmail controlled phenotype test

Use the three existing Winnr senders.

Send at most one new owner-controlled placement probe per sender in the experiment window.

Use a neutral, human-readable message phenotype rather than diagnostic jargon such as "runtime canary". Keep the content non-promotional and truthful. Do not ask the owner to interact with the message to influence classification.

For every probe preserve:
- sender ordinal;
- probe id;
- send timestamp;
- provider acceptance receipt;
- Gmail message id if observed;
- Gmail folder classification;
- SPF/DKIM/DMARC result;
- evidence reference.

## Phase B — compare with prior evidence

Compare:
1. prior Winnr web reply that reached Inbox;
2. prior runtime canaries that reached Spam;
3. new controlled phenotype probes.

Do not declare population-wide deliverability from one Gmail inbox.

## Phase C — provider-diverse seeds

If owner-controlled Microsoft/Yahoo seed inboxes become available, use UberPlacement's balanced seed plan to measure provider-specific placement. Do not create deceptive seed identities or buy engagement.

## Promotion criterion

A promotion decision must be evidence-driven and conservative. At minimum:
- transport remains confirmed;
- no authentication regression;
- owner-controlled placement evidence materially improves from the current 0/3 Gmail inbox result;
- no bounce/complaint/provider-policy signal indicates sender harm;
- reply ingestion remains healthy.

The current experiment materially improved placement to 2/3 Inbox. That satisfies the improvement observation, not automatic campaign authority. Ordinals 1 and 2 remain candidates for bounded next-stage validation; ordinal 3 remains quarantined. Prospect campaigns must independently satisfy their legal/provider/suppression/content/consequence gates. Current pilot action remains `DO_NOT_SEND_PROSPECTS`.

## If placement remains red

Do not increase volume to "warm through" the problem.

Diagnose:
- sender/domain reputation;
- content phenotype;
- link/tracking footprint;
- headers and identity consistency;
- provider-specific reputation;
- complaint/bounce history if available;
- Winnr inventory/reputation quality.

Then either repair, replace the provider-leased inventory under applicable Winnr remedies, or keep the pilot quarantined.
