# Outreach Activation Card

Prepared from the current owner handoff on 2026-08-25. This card records the
exact external targets now known; it does not claim that either domain,
mailbox, provider, or DNS record has been verified by UberBond.

## Current truth

| Item | State |
|---|---|
| Outreach domain 1 | `uberbond.agency` — owner-supplied target; provider/registrar receipt not connected |
| Outreach domain 2 | `uberbond.cloud` — owner-supplied target; provider/registrar receipt not connected |
| Provider account | None connected |
| Mailboxes | 0 verified |
| MX/SPF/DKIM/DMARC | Not provider-issued or verified |
| Warm-up | Not started |
| Live outbound | Disabled |
| Commercial truth | 0 customers; $0 cleared revenue; 0 accepted deliveries; 0 retained customers |

## Provider decision

The initial provider candidate is **Maildoso monthly SMTP infrastructure**,
using the two existing GoDaddy domains. It is the smallest-fit candidate found
for this canary because its public documentation says that existing domains can
be connected, SPF/DKIM/DMARC are automated, accounts can be exported to a
sequencer, and cold sending is capped at 15 messages per mailbox per day. Those
are provider claims, not independent deliverability proof. The exact two-mailbox
checkout price is only exposed inside the provider account.

Sources reviewed:

- [Maildoso product and existing-domain setup](https://maildoso.ai/)
- [Maildoso current pricing and limits](https://maildoso.ai/pricing)
- [Maildoso API documentation](https://developers.maildoso.com/)

Google Workspace/Gmail API is not selected for generic cold outreach. UberBond's
provider-policy boundary restricts Gmail API to solicited, consented, or
requested-information routes; a public business address is not consent. The
same boundary remains in force after a mailbox provider is connected.

## One owner gate

Authorize **one monthly Maildoso SMTP subscription for exactly two mailboxes**
on `uberbond.agency` and `uberbond.cloud`, with a hard ceiling of **$15 USD per
month**, no annual or quarterly commitment, and no domain purchase. If checkout
shows more than that, stop; do not substitute a larger package. After checkout,
provide the provider API credential through the protected deployment secret
channel, never in chat or a repository file.

This is the only current owner action for the mailbox lane. UberBond can perform
the subsequent reversible preparation and verification itself once
authenticated.

## Automatic continuation after the gate

1. Connect both exact domains to the provider.
2. Read the provider-issued DNS requirements; never invent DKIM or SPF values.
3. Apply only the exact required GoDaddy records when registrar authority is
   available, then verify public MX, SPF, DKIM, DMARC, and alignment.
4. Create one sender mailbox per domain and persist only redacted provider
   receipts.
5. Start provider warm-up and record its real status and caps.
6. Add the provider adapter/credential binding to UberBond's governed sender
   path; keep the Gmail API route separate.
7. Run a zero-send dry run and hostile recovery checks.

No live message may be sent until DNS authentication, mailbox identity,
provider terms/route authorization, suppression, caps, V9 admission, and a
bounded canary approval all have durable evidence. Warm-up is not proof of
deliverability, and a provider dashboard is not proof of revenue.

## Forbidden shortcuts

- Do not attach either domain to Vercel or a public website.
- Do not buy extra domains or a 30/300/1,000-mailbox package for this canary.
- Do not place credentials in source, task payloads, receipts, or chat.
- Do not turn a provider's claimed limit or deliverability score into UberBond
  truth.
- Do not send to a guessed personal address or bypass suppression/consent and
  jurisdiction gates.
