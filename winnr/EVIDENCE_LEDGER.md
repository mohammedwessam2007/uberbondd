# Winnr Evidence Ledger

Updated: 2026-10-02

| Claim | State | Evidence / interpretation |
|---|---|---|
| $9/month three-mailbox pilot | VERIFIED | Payment and entitlement both verified |
| cedarpointdomains.com | VERIFIED | Provider-leased pilot domain |
| 3 mailbox credentials imported | VERIFIED | Exact export inventory |
| 3 SMTP + 3 IMAP runtime rows | VERIFIED | Encrypted custody |
| Credential storage | AES-256-GCM | Plaintext logging false |
| IMAP | 3/3 VERIFIED | Live production transport |
| SMTP | 3/3 VERIFIED | Final blind-tunnel activation receipt |
| Final activation messages | 2 owner-controlled | Ordinal 1 was already confirmed |
| Prospect messages | ZERO | Prospect-send authority remains frozen |
| Runtime Gmail delivery | 3/3 DELIVERED | External receiving-provider observation |
| Runtime Gmail Inbox placement | 0/3 | All three runtime probes classified Spam |
| Earlier Winnr web reply | INBOX | Useful contrast, not enough to promote |
| SPF/DKIM/DMARC | PASS on inspected runtime message | Authentication alignment is not the red gate |
| Reply canaries | 2/2 INGESTIBLE | Ordinals 2 and 3 independently found through IMAP |
| Render direct TCP/465 | BLOCKED/TIMED OUT | Source-network path issue |
| Fixed-host blind tunnel | ACTIVE / REQUIRED | Current Render-to-Winnr SMTP path |
| Startup $69 plan | NOT PURCHASED | Pilot must earn expansion |
| Paid Winnr warming | NOT PURCHASED | No fake-engagement substitute |
| Placement | RED | Current active frontier |

## Supersession

Historical state `SMTP 1/3, IMAP 3/3` is superseded by `SMTP 3/3, IMAP 3/3`.

Historical reply state `transport-capable, database receipt pending` is superseded by live `WINNR_REPLY_CANARIES_INGESTIBLE`, found ordinals [2,3].

Current promotion state:
`TRANSPORT_GREEN -> REPLY_LOOP_GREEN -> PLACEMENT_RED -> PROSPECT_SEND_FROZEN`.

## Placement phenotype delta — 2026-10-02

| Observation | Result |
|---|---|
| One-shot phenotype sends accepted | 3/3 |
| Gmail Inbox | 2/3 |
| Gmail Spam | 1/3 |
| SPF | pass on 3/3 |
| DMARC | pass on 3/3 |
| aligned cedarpointdomains.com DKIM | pass on 3/3 |
| Amazon SES DKIM | pass on 3/3 |
| additional `dkim` selector | fail on 3/3 |
| Prospect sends | 0 |

The new 2/3 Inbox result supersedes the earlier assumption that the runtime path is uniformly spam-routed, but does not supersede the quarantine gate because ordinal 3 remains Spam and the sample is one Gmail inbox.
