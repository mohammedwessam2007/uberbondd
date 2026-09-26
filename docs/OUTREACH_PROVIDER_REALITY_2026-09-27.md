# Outreach Provider Reality — 2026-09-27

**Truth class:** first-party public policy/pricing observations + exact-main source review + account/reply/DNS/legal activation unknowns. This receipt does not claim a purchase, provider login, credential, mailbox, DNS change, message send, reputation result, or send capacity.

## Current decision

**No provider is purchase-ready for the intended automated cold-B2B first-touch route.** OutInfra is excluded by its own current Terms, which prohibit unsolicited bulk email. ClayInbox Google is technically the strongest integration path, but Google's current Workspace acceptable-use policy prohibits generating or facilitating unsolicited bulk commercial email. ClayInbox's own retrievable current terms/AUP are still unavailable, so its cold-email marketing cannot clear that upstream policy gate. ClayInbox Azure remains yellow because account credentials, token refresh, inbound replies, and policy terms have not been observed.

For recipients who have explicitly requested contact or otherwise qualify outside the prohibited unsolicited-bulk use, ClayInbox Google remains only a *conditional* low-cost substrate candidate. That does not clear UberBond's sender-jurisdiction, recipient, source-provenance, identity, DNS, reputation, suppression, or campaign authorization gates.

## Live facts and evidence classes

### OutInfra

First-party public sources checked on the mission date:

- [Pricing](https://outinfra.com/pricing) advertises $0.25 per active mailbox/month; Starter at $25/month for 100 mailboxes and 1 domain; Growth at $125 for 500/5; Scale at $500 for 2,000/20; no minimum; no card required to explore; payment when deployed; and an end-of-period metered charge. It advertises SMTP/IMAP credentials per mailbox and Azure ACS resource provisioning.
- [Terms](https://outinfra.com/terms), last updated 2026-04-01, describes an M365/Exchange Online provisioning layer and says users may not send “unsolicited bulk email (spam).” It also says subscriptions are billed in advance, renew automatically, and suspended accounts are not refundable.
- [Refund and cancellation policy](https://outinfra.com/refund), last updated 2026-04-01, says purchases are final/non-refundable except for duplicate billing or failure to provision within seven business days; cancellation stops future billing and gives no prorated refund. This conflicts with the pricing page's “risk-free first month” full-refund claim and end-of-period billing description.

Decision: **not eligible for the intended unsolicited-bulk campaign**, even though its headline mailbox price is lowest. Its account-specific minimum, 30-domain allocation, actual credential export, independent reply path, tenant topology, approval/KYC, tax, and deployed plan were not observed. Its advertised mailboxes must not be treated as independent send pipes. Microsoft documents separate per-user and organization-level sending controls for Exchange Online, but those are technical limits, not permission or a safe cap.

The advertised $25/100-mailbox/1-domain plan would be $3 above the strict $22 sender remainder and about $33 including the existing ~$8 OVH. Its 100 identities remain marketing geometry, not verified sender identities or authorized capacity.

### ClayInbox

First-party pages checked on the mission date:

- [Pricing](https://clayinbox.ai/pricing) currently says “Google Admin” starts at $2/mailbox/month.
- [Homepage](https://clayinbox.ai/) still describes Google Workspace at $2.50/mailbox/month, and the Google Workspace product surface also displays $2.50. Treat the actual price as **unresolved: $2.00–$2.50 before tax/fees**, pending an account-visible quote. No checkout, tax, renewal, cancellation, refund, or card requirement was observed.
- The public pages advertise free BYO-domain connection, one isolated Workspace per domain, included warm-up, API/MCP, and credential/app-password export. Those remain provider claims until observed on an authorized account.
- No current retrievable ClayInbox Terms/AUP was found; its linked terms surface did not yield policy text. The already-sent support inquiry (2026-09-26 21:13Z) asked about Azure auth/replies, cold-email policy, limits, and trial scope. Gmail showed the sent inquiry and **no response from support** on this follow-up check. It was not resent.
- The prior authenticated-workflow attempt ended on a blank ClayInbox sign-in/verification view; no authentication, terms acceptance, card entry, or purchase occurred.

Google's current [Workspace Acceptable Use Policy](https://workspace.google.com/terms/use_policy/) prohibits use of Workspace to generate, distribute, or facilitate unsolicited mass email, promotions, advertisements, or other solicitations. Google's [Gmail spam and abuse policy](https://knowledge.workspace.google.com/admin/gmail/spam-and-abuse-policy-in-gmail) applies to users on a Workspace domain. This upstream policy prevents the ClayInbox Google marketing claim from authorizing an unsolicited-bulk campaign. The [Google Workspace sending-limits page](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace) publishes 2,000 messages/user/day on paid accounts and 500/day during a Google Workspace trial, among other recipient limits; the page also states trial limits are lower and paid-limit increases require cumulative domain payment of $100 and may take up to 75 days. These are technical ceilings only, not permission, warm-up, independent-mailbox proof, or practical send caps. A ClayInbox-specific free production trial or quota was not verified.

ClayInbox Azure is still yellow: its advertised up-to-100/domain density does not establish one usable UberFleet credential per identity, OAuth/Graph scopes, token refresh/reconnect, or a real IMAP/Graph inbound-reply path. No production trial scope, ToS/AUP fit, or account limits were observed.

### Microsoft shared controls relevant to OutInfra

Microsoft's [Exchange Online outbound limits guidance](https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-sending-limits-troubleshoot) states limits apply at user and organization levels; the published per-user limit is 10,000 recipients in a rolling 24-hour window and 30 messages/minute, while the Tenant External Recipient Rate Limit scales with tenant licenses (5,000 external recipients/day by default for trial organizations). Microsoft also states Exchange Online is not designed for bulk mailing. These numbers do **not** support an inference that 100 accounts are 100 independent pipes or that any cap is authorized.

## Budget and conditional topology

Existing infrastructure remains approximately $8/month OVH; modeled sender remainder is $22.

| Conditional ClayInbox Google scenario | Identities | Existing domains modeled | Advertised monthly amount | All-in with existing OVH |
|---|---:|---:|---:|---:|
| $2.50 surface | 8 | 8, one per isolated workspace | $20 | ~$28 |
| $2.00 surface | 11 | 11, one per isolated workspace | $22 | ~$30 |

This is an account-unverified arithmetic range, not a purchase recommendation or an authorized cold-email configuration. Up to 30 owned domains are already in the repository's outreach frontier; the provider account has not been observed distributing identities across them. No provider has demonstrated an acceptable, authorized send path for the intended cold-bulk use.

## Volume geometry — RAW only

The ClayInbox matrix below assumes all 8–11 hypothetical Google identities are active from day one, a constant per-identity rate, 22 working days in a 30-day month, zero follow-ups, no warm-up ramp, no deferrals, and no provider/legal/reputation block. It is not safe capacity.

| Sends/mailbox/working day | Raw per working day | Raw per 22-workday month |
|---:|---:|---:|
| 1 | 8–11 | 176–242 |
| 2 | 16–22 | 352–484 |
| 3 | 24–33 | 528–726 |
| 5 | 40–55 | 880–1,210 |
| 7 | 56–77 | 1,232–1,694 |
| 10 | 80–110 | 1,760–2,420 |

For OutInfra's advertised Starter quantity only, raw arithmetic for 100 advertised mailboxes would be 100/200/300/500/700/1,000 per working day and 2,200/4,400/6,600/11,000/15,400/22,000 over 22 workdays at the same six assumed rates. This is excluded from viable capacity: the Starter plan is advertised for one domain, account identity/reply details are unobserved, and the Terms prohibit the intended unsolicited-bulk use.

All first-touch totals above assume an empty follow-up ledger. Any follow-up traffic consumes the same sender/provider limits and must be subtracted from later first-touch slots. Current observed follow-up traffic is zero. No ramp schedule or safe per-mailbox cap has been earned from provider or reputation telemetry.

## UberBond gates still red

The newest repository main at verification was `32af2f554482a1e2184d33d3af6d5323fee74ca5` (PR #1008 merged). Its inherited 2026-09-25 outreach handoff records 0 MX/SPF/DKIM observations across the 30 domains, default DMARC on 30, no eligible prospect corpus, unresolved offer lineage, missing sender legal identity/jurisdiction, and zero sends/purchases. These DNS facts are dated inherited observations, not a fresh DNS probe today.

Current source `src/uberoutbound-recipient-eligibility.mjs` holds Egypt-based senders' cold traffic for legal/regulatory review. The first campaign's exact sender jurisdiction, recipient jurisdictions/types, contact provenance, consent/relationship, and offer are not resolved here. No mailbox geography, domain rotation, or transport choice may be used to bypass that hold.

- **Raw technical geometry:** tables above only.
- **Provider-authorized capacity:** 0 first touches for the intended cold-bulk route.
- **Evidence-earned practical capacity:** 0 first touches; no activated sender, verified DNS, reputation receipt, safe cap, or canary.
- **Follow-ups:** 0 observed; no authorized sequence has begun.
- **New spend / DNS changes / messages / credentials imported:** $0 / 0 / 0 / 0.
- **Owner action:** none now. No exact acceptable provider checkout/authentication boundary exists.
- **Additional SaaS:** none is evidenced as necessary. The current repo's Outreach Workbench, UberFleet, UberIMAP, UberReply, UberWarm, UberPlacement, UberTruth, UberDNS, UberEconomics, scheduler/queue, lead/prospect state, and existing OVH/control plane cover sequencing, CRM, enrichment workflow, personalization, reply ingestion/classification, warm-up orchestration, DNS, placement, monitoring, analytics, scheduling, and webhook automation.

## Source verification

- Live default-branch base: `32af2f554482a1e2184d33d3af6d5323fee74ca5`.
- Latest relevant merged PRs verified: #1004, #1006, #1008.
- Existing Google credential integration: source/donor-proven only; no ClayInbox provider API call or credential import was made.
- OutInfra and ClayInbox pages/terms, Google's Workspace policy and limits, Microsoft's Exchange limits, and the sent support thread were checked read-only.
- This receipt creates no account, accepts no terms, buys no service, changes no DNS, sends no message, and handles no secret.
