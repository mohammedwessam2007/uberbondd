# Winnr Personal Inbox Reconciliation — 2026-10-02

## Founder evidence

The founder reported: “the emails landed in my personal inbox normally.”
Truth class: `OWNER_REPORTED_PLACEMENT`. The reported messages, senders and receiving address were not specified. Preserve this as useful evidence without silently rewriting the earlier inspected Gmail folder results.

## Independently refreshed truth

Main recovered at `a41c3787444bcf1b02e2cbc770ce68b1c9481000`.
Render live deploy `dep-davtfm1srm7s73dar680` runs source `c04f0f35ec6f5c899ca1e14af95d6be690ab3ea0` with canonical build command `npm install --omit=dev`.

Live receipts confirm:
- encrypted custody: 3 SMTP + 3 IMAP rows;
- transport: SMTP 3/3 and IMAP 3/3;
- replies: expected ordinals [2,3] independently found through production IMAP;
- ordinal 3 paused for SMTP fleet selection, with IMAP retained;
- no prospect-send authority granted.

The fresh UberBond Gmail search found the human-readable probes at:
- ordinal 1: private receiving-message reference, Inbox;
- ordinal 2: private receiving-message reference, Inbox;
- ordinal 3: private receiving-message reference, Spam.

The connected personal Gmail search found no matching cedarpointdomains.com messages at recovery time. This is a retrieval result, not a denial of the founder's observation. Gmail category PERSONAL and folder INBOX are distinct observations; preserve the exact labels.

## Bounded next experiment

One separate seed experiment is implemented in the existing placement module, using the connected founder personal Gmail address only. It permits at most one SMTP attempt per sender; no arbitrary target, no prospect message, no change to the quarantine. The durable reservation is created atomically before effects. In-flight, interrupted or uncertain outcomes require reconciliation and cannot be replayed by subsequent startup.

The experiment is disabled unless `WINNR_PERSONAL_INBOX_CANARY_ONCE=1`. Its persistent setting key is `winnrPersonalInboxCanary20261002`. No mailbox password or API credential is included in this document.

Source validation: syntax checks passed; 14 focused tests passed, including target refusal, secret omission, concurrent-start reservation and uncertain-send non-replay. The repository-wide reachability test reports 16 pre-existing unclassified modules outside this change; that baseline is not represented as green.

New receiving-provider evidence must be appended here before any placement decision changes. Even all three Inbox outcomes in a second Gmail account would not prove Microsoft/Yahoo placement or authorize high volume.

## Live experiment result — COMPLETE

PR #1162 merged at `61a6b553035db760f5627bf87b02916fad2cf27b`.
Deploy `dep-davtng8u01pc73848i50` ran the bounded test and became live.
Production receipt `WINNR_PERSONAL_CANARY_SENT` reported three accepted messages between 16:29:53Z and 16:29:59Z.

| Sender ordinal | Private evidence reference | Observed folder | Authentication |
|---|---|---|---|
| 1 | private receiving-message reference | INBOX; CATEGORY_UPDATES; not SPAM | SPF pass; aligned DKIM pass; DMARC pass |
| 2 | private receiving-message reference | INBOX; CATEGORY_UPDATES; not SPAM | SPF pass; aligned DKIM pass; DMARC pass |
| 3 | private receiving-message reference | INBOX; CATEGORY_UPDATES; not SPAM | SPF pass; aligned DKIM pass; DMARC pass |

All three were independently read through the connected personal Gmail metadata API. No folder labels were changed to obtain this result. The additional failing domain DKIM selector remains common to all three, while aligned DKIM, SPF and DMARC pass. The receiving MX observed Amazon SES as the downstream delivery hop; this does not change the approved custody or fixed-host SMTP route.

The next boot logged `WINNR_PERSONAL_CANARY_ALREADY_COMPLETED` at 16:31:05Z, proving that the persisted effect reservation prevented another send. The one-shot flag was then set to `0`; the old runtime-import and phenotype-send flags are also `0`. Reply verification and ordinal-3 SMTP fleet quarantine remain separate controls.

Interpretation: the founder's report now has independently observed supporting evidence from a fresh personal-inbox experiment. Ordinal 3 is not uniformly Spam-routed across Gmail accounts. Earlier adverse evidence remains valid for its own recipient and phenotype. Neither experiment establishes Microsoft/Yahoo placement, population delivery rates or prospect-send authority.

## Final scope decision

`WINNR_TECHNICAL_INTEGRATION_COMPLETE`:
- encrypted custody: complete;
- SMTP and IMAP: 3/3 verified;
- reply ingestibility: verified;
- personal Gmail delivery and Inbox placement: 3/3 verified;
- bounded personal experiment: completed, durably non-replayable and switched off;
- prospect campaigns: not started;
- ordinal 3: fleet pause retained pending a separately governed promotion decision;
- additional spend: zero.

Expanded Winnr validation: 48 focused tests passed. A pre-existing provider-contract test omitted the explicit zero-cent spend ceiling required by the unchanged production gate; the fixture now supplies that ceiling and separately proves missing budget, expired approval and wrong scope are refused. No production approval rule was relaxed.

Final live deployment with sending-experiment flags disabled: `dep-davto8v9nhgc738av1rg`, source `61a6b553035db760f5627bf87b02916fad2cf27b`, LIVE at 16:32:38Z. Normal build command remains `npm install --omit=dev`.

Receiving-message identifiers are retained in the founder-private `WINNR_PRIVATE_LIVE_RECONCILIATION_2026-10-02.md` record, outside this public repository. The separate read-only recheck confirmed all three Inbox labels and passing aligned authentication without sending another message. See `winnr/CURRENT_STATE.json`.
