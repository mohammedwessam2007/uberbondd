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
- ordinal 1: `1a0fd560d2c27caa`, Inbox;
- ordinal 2: `1a0fd5a343fb35d8`, Inbox;
- ordinal 3: `1a0fd5c1f61eb4a6`, Spam.

The connected personal Gmail search found no matching cedarpointdomains.com messages at recovery time. This is a retrieval result, not a denial of the founder's observation. Gmail category PERSONAL and folder INBOX are distinct observations; preserve the exact labels.

## Bounded next experiment

One separate seed experiment is implemented in the existing placement module, using the connected founder personal Gmail address only. It permits at most one SMTP attempt per sender; no arbitrary target, no prospect message, no change to the quarantine. The durable reservation is created atomically before effects. In-flight, interrupted or uncertain outcomes require reconciliation and cannot be replayed by subsequent startup.

The experiment is disabled unless `WINNR_PERSONAL_INBOX_CANARY_ONCE=1`. Its persistent setting key is `winnrPersonalInboxCanary20261002`. No mailbox password or API credential is included in this document.

Source validation: syntax checks passed; 14 focused tests passed, including target refusal, secret omission, concurrent-start reservation and uncertain-send non-replay. The repository-wide reachability test reports 16 pre-existing unclassified modules outside this change; that baseline is not represented as green.

New receiving-provider evidence must be appended here before any placement decision changes. Even all three Inbox outcomes in a second Gmail account would not prove Microsoft/Yahoo placement or authorize high volume.
