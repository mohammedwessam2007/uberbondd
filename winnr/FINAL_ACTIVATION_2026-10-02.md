# Winnr Final Activation Receipt — 2026-10-02

## Result

The Winnr pilot is technically activated with **two placement-green SMTP senders and one quarantined SMTP sender**.

This receipt does not authorize a prospect campaign by itself. Campaign/message/recipient/legal/suppression gates remain independent.

## Verified substrate

- purchased/provisioned mailboxes: 3
- encrypted SMTP accounts: 3
- encrypted IMAP accounts: 3
- SMTP transport confirmed: 3/3
- IMAP transport confirmed: 3/3
- bounded reply canaries ingestible: 2/2
- plaintext credential logging: false
- prospect messages sent during activation: 0

## Gmail placement experiment

Earlier diagnostic runtime phenotype:
- delivered: 3/3
- Inbox: 0/3
- Spam: 3/3

Human-readable phenotype used after sender display-name preservation:
- subject: neutral human-readable note
- display identity: `Wessam Solomon | UberBond`
- recipient class: owner-controlled UberBond Gmail only
- provider acceptance: 3/3
- Gmail Inbox: 2/3
- Gmail Spam: 1/3

Per-sender result:
- ordinal 1: ACCEPTED -> INBOX
- ordinal 2: ACCEPTED -> INBOX
- ordinal 3: ACCEPTED -> SPAM

## Authentication comparison

All three human-phenotype messages showed the same high-level Gmail authentication pattern:
- SPF: pass
- DMARC: pass
- DKIM: two pass signatures plus one additional failed signature

Because the Spam sender did not differ on these high-level authentication outcomes, the current evidence points toward sender/reputation/classification variance rather than a simple SPF/DKIM/DMARC break.

## Runtime decision

- ordinal 1: placement-green for this owner-controlled Gmail experiment
- ordinal 2: placement-green for this owner-controlled Gmail experiment
- ordinal 3: `GMAIL_PLACEMENT_RED` -> quarantine from SMTP fleet allocation
- IMAP for ordinal 3 remains intact so reply visibility is not amputated
- prospect campaign authority remains separate

## Evidence limitations

This is one Gmail receiving account, not population-wide deliverability proof.

Two Inbox placements justify preserving the two green senders as candidates for the next bounded cohort. They do not justify high volume, the $69 Startup purchase, or automatic cold outreach.

The quarantined sender must not be reintroduced until new external placement evidence supersedes the red state.


## Live production closure

Merged source:
- PR #1158
- main commit: `c04f0f35ec6f5c899ca1e14af95d6be690ab3ea0`

Render activation:
- service: `uberbond-control-plane`
- deploy: `dep-davtfm1srm7s73dar680`
- startup receipt: `WINNR_PLACEMENT_QUARANTINE_APPLIED`
- appliedAt: `2026-10-02T16:13:11.670Z`
- pausedOrdinals: `[3]`
- reason: `GMAIL_PLACEMENT_RED`
- scope: `SMTP_FLEET_SELECTION_ONLY`
- imapCustodyChanged: false
- prospectSendAuthorityGranted: false

The same live startup also reconfirmed:
- `WINNR_RUNTIME_TRANSPORT_VERIFIED`
- SMTP 3/3
- IMAP 3/3
- `WINNR_REPLY_CANARIES_INGESTIBLE`
- reply ordinals [2,3]

This closes the Winnr infrastructure activation mission at a truthful split state: two candidate-green SMTP senders, one placement-red SMTP sender quarantined, all three IMAP paths retained.
