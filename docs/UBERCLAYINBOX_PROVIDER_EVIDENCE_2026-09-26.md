# UberClayInbox Provider Evidence — 2026-09-26

Truth class: CURRENT PUBLIC PROVIDER CLAIMS + INDEPENDENT LIVE-PROBED API DONOR + SOURCE IMPLEMENTATION.  
No ClayInbox purchase, API-key validation, mailbox creation, DNS mutation, SMTP send, IMAP connection, warm-up observation, or inbox-placement result is claimed here.

## Why this exists

UberBond's first-cash outreach lane needs to buy only what software cannot synthesize: authorized reputation-bearing mailbox/transport substrate.

ClayInbox is currently interesting because its public positioning combines:

- cold-email mailbox infrastructure;
- per-mailbox or high-density Azure pricing;
- warm-up and monitoring;
- API/MCP control;
- credential/app-password export;
- bring-your-own domains.

The purpose of this file is to keep those public claims separate from what UberBond can actually integrate today.

## Current public ClayInbox claims observed 2026-09-26

Source pages observed:

- `https://clayinbox.ai/`
- `https://clayinbox.ai/pricing`
- `https://clayinbox.ai/glossary`

Provider-stated facts/claims:

| Product | Public price | Provider-stated capabilities | Evidence class |
|---|---:|---|---|
| Google Workspace | $2.50/mailbox/month | full admin access, included warm-up, credentials/app-password exports, API/MCP, unified inbox, monitoring | provider public claim |
| Pre-warmed Google | $4.50/mailbox/month | established sending history; provider says it skips the normal 14–21 day ramp | provider public claim |
| Microsoft 365 | $2.50/mailbox/month | OAuth + app-password export, included warm-up | provider public claim |
| Azure | $25/domain/month | up to 100 mailboxes/domain, dedicated Azure tenant, warm-up, API/MCP | provider public claim |
| Dedicated IMAP/SMTP | $45 / 2 domains/month | 10 mailboxes/domain, dedicated IP/server, full SMTP credentials, advertised 500 emails/domain/day | provider public claim |

The public site also states:

- no platform/setup tier is required for the mailbox products;
- warm-up is included;
- API/MCP is included;
- warmed mailboxes can be exported with credentials/app passwords;
- SMTP/IMAP can work with non-native tools;
- ClayInbox positions itself explicitly as cold-email infrastructure.

These are useful provider statements, not independent proof of deliverability, safe send volume, policy eligibility, or account approval.

## Independently live-probed API donor

Clean capability donor:

- project: **Assay**
- repository: `developerinlondon/assay`
- license: **Apache-2.0**
- donor observation date: **2026-09-04**
- donor files:
  - `crates/assay/stdlib/clayinbox.lua`
  - `crates/assay/tests/clayinbox/main.rs`

Assay's tests say the ClayInbox response shapes were probed from the live API and anonymized.

The donor independently pins:

- authentication via `x-api-key`;
- account-scoped base/API behavior;
- mailbox list response with full address from `username`;
- domain list response with provider-observed SPF/DKIM/DMARC/MX flags;
- BYO-domain mailbox order via `POST /order`;
- `import: true` on BYO order so the provider does not also buy the domain;
- full email addresses in the order payload;
- wallet read before purchasing;
- Google app-password retrieval at `/mailbox/{id}/app-password`;
- app password may be temporarily absent after mailbox activation and must be treated as `not_ready`, not as a bad SMTP password;
- Cloudflare can return an HTML block page under HTTP 200, which must not become an empty-fleet observation.

## UberBond implementation

`src/uberclayinbox.mjs`

### Proven integration path: Google Workspace

UberBond can:

1. list exact ClayInbox domains/mailboxes;
2. keep provider DNS flags as provider observations rather than independent DNS truth;
3. place owner-approved BYO-domain mailbox orders only with a recorded quote and spend ceiling;
4. reconcile uncertain provider outcomes rather than blindly retrying a possibly executed purchase;
5. wait for the provider app password;
6. pass that password directly into encrypted UberFleet SMTP and UberIMAP custody;
7. return no plaintext app password from the import result;
8. use standard Gmail SMTP/IMAP endpoints only after route authorization and current provider-terms evidence are separately present.

The result is a direct ClayInbox -> UberFleet/UberIMAP bridge. No Instantly, Smartlead, Lemlist or other sequencer is required for the credential path.

### Not yet proven: Azure credential custody

ClayInbox publicly advertises:

- $25/domain;
- up to 100 Azure mailboxes/domain;
- API access for all accounts;
- warm-up included.

But the currently available independently live-probed donor has **no Azure/Microsoft credential fixture or token shape**.

Therefore UberBond currently classifies Azure as:

`AFFORDABLE_IF_BUDGET_STRETCHED_BUT_DIRECT_CUSTODY_UNPROVEN`

Do not convert "100 mailboxes" into "100 UberFleet senders" until a real provider response or documented auth contract proves how UberBond receives/refreshes authorization for those accounts.

### Warm-up truth

ClayInbox publicly states that normal mailboxes include isolated warm-up and that pre-warmed mailboxes can skip the normal 14–21 day ramp.

UberBond does **not** currently have an admitted ClayInbox API route that independently reports warm-up completion/state.

Therefore:

- `warmup included` = provider claim;
- `mailbox is actually warm enough for X/day` = UNKNOWN until provider/account/runtime evidence;
- mailbox count never becomes send-capacity evidence.

## Month-1 budget geometry

Model assumption from the founder's current budget discussion:

- total first-month infrastructure budget: approximately **$30/month**;
- already-committed OVH control plane: approximately **$8/month**;
- modeled remainder: **$22/month**.

This is a planning model, not a bank receipt.

At the currently published ClayInbox prices:

| Route | Modeled monthly cost | Fits $22 remainder? | Max advertised mailbox count within model | Direct UberBond credential path |
|---|---:|---:|---:|---|
| Google standard | 8 × $2.50 = **$20** | yes | 8 | **proven by donor + UberClayInbox** |
| Google pre-warmed | 4 × $4.50 = **$18** | yes | 4 | **proven by donor + UberClayInbox** |
| Google pre-warmed | 5 × $4.50 = **$22.50** | $0.50 over | 5 | **proven by donor + UberClayInbox** |
| Azure | **$25/domain** | $3 over | provider advertises up to 100 | **not yet proven** |
| Dedicated IMAP/SMTP | **$45 / 2 domains** | no | 20 total | provider advertises raw SMTP credentials |

No row above is assigned a safe cold-send/day number unless observed from the actual provider account/runtime.

## Current decision boundary

### Green enough to integrate after purchase/activation

**ClayInbox Google Workspace path**, subject to:

- current provider ToS/AUP evidence;
- actual ClayInbox account/API key;
- exact owner-approved quote/purchase;
- provider-observed mailbox activation;
- app-password availability;
- UberDNS public authentication verification;
- owner-account/ramp evidence before raising send caps.

### High-upside but yellow

**ClayInbox Azure $25/domain / up to 100 mailboxes.**

This could dominate Month-1 mailbox density if its direct auth/custody path is proven. Until then it is not allowed to outrank the smaller Google path in UberSubstrate merely because 100 is a larger number.

### External things still not cloneable

- provider account approval and billing;
- real Google/Microsoft/Azure identities;
- mailbox-provider and recipient-network reputation;
- elapsed warm-up/history;
- current provider policy compatibility;
- independent DNS propagation;
- safe empirical send caps;
- inbox placement;
- recipient/campaign legal eligibility;
- real replies and cleared customer money.

## Zero-effects receipt

This research/implementation wave performed:

- real ClayInbox purchases: 0
- real ClayInbox API calls: 0
- real mailbox creations: 0
- real DNS changes: 0
- real sends: 0
- new spend: $0


## Source verification receipt

Exact branch verification before PR:

- changed runtime/test files parse under transformed V8 syntax checks;
- UberClayInbox fixture behavior passes for:
  - x-api-key + browser User-Agent;
  - secret redaction;
  - HTTP-200 HTML/Cloudflare block refusal;
  - bounded pagination;
  - provider-observed DNS flags staying non-authoritative;
  - BYO full-address/domain validation;
  - observed quote + owner approval + idempotency gates;
  - wallet preflight;
  - import:true on BYO order;
  - mutation uncertainty / no blind retry;
  - missing app password => CREDENTIAL_NOT_READY;
  - Google app-password -> opaque UberFleet/UberIMAP custody with no plaintext escape;
  - Microsoft/Azure refused from the donor-proven Google path;
  - missing initial admin-password custody refused before any provider call;
- UberSubstrate behavior probe:
  - $30 modeled total minus $8 committed = $22 remainder;
  - Google standard $2.50/unit => 8 modeled units / $20;
  - unknown safe send capacity remains null rather than being coerced to zero;
  - Azure density cannot outrank a direct-custody-proven path merely because it advertises 100 mailboxes;
- UberBuy behavior probe confirms direct IMAP reply access satisfies the inbound substrate requirement without buying a forwarding SaaS.

External effects during this verification: zero provider calls, zero purchases, zero sends, zero DNS changes, zero new spend.


## 2026-09-27 live verification delta

Newest external verification does **not** justify weakening any gate above.

### Source/repository truth

- PR #1006 is already merged on current `main` as `87d90e2b03d7d1679fb7c04fd0f34ebe53739981`.
- UberClayInbox + UberSubstrate are therefore canonical source, not pending branch-only work.
- The Google app-password -> encrypted UberFleet SMTP + UberIMAP path remains the strongest independently evidenced direct-custody route.
- Azure remains yellow. Public product copy still advertises up to 100 Azure mailboxes/domain for $25, but no independently observed Azure mailbox credential/token fixture, refresh contract, or inbound-reply contract was found.

### Current public-provider verification

On 2026-09-27 the public ClayInbox site still explicitly positions the service as cold-email infrastructure and continues to advertise:

- Google Workspace / Microsoft 365 at $2.50 per mailbox/month;
- pre-warmed Google at $4.50 per mailbox/month;
- Azure at $25 per domain/month for up to 100 mailboxes;
- dedicated IMAP/SMTP at $45 for 2 domains / 20 mailboxes;
- warm-up, monitoring, API/MCP and credential/app-password export as provider features.

These remain provider claims until account/runtime evidence reconciles them.

The public site exposes a Terms link in its footer, but the current web-observable route did not yield retrievable ToS/AUP text. Direct attempts to fetch the obvious terms/legal paths also did not produce a current policy document. Therefore:

`termsCompatibility = UNKNOWN`

must remain the canonical state. Explicit cold-email marketing is **not** promoted into policy permission.

Current company/founder public posts also advertise a free trial, but the retrieved public evidence does not establish its exact duration, included mailbox products, mailbox count, geographic/account eligibility, or whether a payment method is required. Therefore no zero-dollar capacity is booked into UberSubstrate.

### Provider clarification requested

On 2026-09-27 a direct support inquiry was sent to ClayInbox asking for:

1. the current ToS/AUP URL and the exact rule governing compliant cold B2B outreach;
2. the exact credential/authorization contract for the $25 Azure product;
3. whether Azure credentials/tokens can be exported/refreshed through API/MCP;
4. the Azure inbound-reply mechanism;
5. current provider/recommended per-mailbox/domain/tenant outbound limits;
6. exact free-trial scope and duration.

No provider reply was observed at the time this receipt was written.

### First-month decision boundary after verification

With the founder's current planning model of approximately $30 total and approximately $8 already committed to OVH:

1. **If the authenticated ClayInbox account exposes a genuine zero-dollar trial** whose product, policy and credential contract pass UberBuy/UberClayInbox evidence gates, that trial becomes the first economic candidate.
2. Otherwise the cheapest currently direct-integrable strict-budget configuration remains **8 standard Google mailboxes at $20/month**, leaving the modeled total around $28 including the existing OVH spend.
3. **4 pre-warmed Google mailboxes at $18/month** remain a speed-oriented alternative if the actual account proves their warm/history state; the provider marketing label alone is not sufficient.
4. Azure may outrank these only after direct credential/token custody + reply semantics + policy compatibility are observed and the founder accepts the modeled $3 budget stretch to $25 for the sender substrate.
5. No route receives a safe cold-send/day number from mailbox density or provider marketing. Runtime/account evidence must establish the canary cap.

### Owner-action minimization

No additional outreach SaaS purchase is justified by current evidence.

The next genuine owner boundary is limited to authenticated ClayInbox account access plus explicit authorization of the exact trial/order/quote after current terms are visible. API keys, passwords and mailbox credentials must enter protected runtime custody and must not be pasted into chat, Git, ordinary logs or screenshots.

After that boundary, UberBond should own the routine continuation: provider reconciliation, BYO-domain provisioning, credential import, independent DNS verification, reputation/warm-up evidence, reply-path proof, safe-cap measurement and the smallest governed revenue canary.
