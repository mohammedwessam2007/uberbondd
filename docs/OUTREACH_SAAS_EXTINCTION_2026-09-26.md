# UberBond Outreach SaaS Extinction Ledger

## 2026-10-01 supersession addendum: UberWarm²

This historical 2026-09-26 ledger remains preserved, but one procurement assumption is superseded by newer source.

**Old assumption:** the external sender substrate had to supply outbound transport, inbound replies **and provider warm-up**.

**Current assumption after UberWarm²:** the mandatory physical substrate needs authorized outbound SMTP plus inbound IMAP/replies/forwarding. Provider warm-up is an optional supplier feature because UberBond now owns the evidence-ramp control plane through UberWarm² + UberPlacement + UberWarm + UberQuality.

New donor/provenance record: `docs/UBERWARM2_CAPABILITY_DONOR_SYNTHESIS_2026-10-01.md`.  
Current purchase gate: `docs/WINNR_PREPURCHASE_GATE_2026-10-01.md`.

This does **not** claim that reputation can be fabricated internally. Real recipient-network placement, elapsed history and provider/customer outcomes remain external evidence.

Date: 2026-09-26  
Branch: `feat/outreach-saas-extinction-20260926`  
Truth class: SOURCE IMPLEMENTATION + EXTERNAL ACTIVATION BLOCKERS. No provider purchase, DNS mutation, credential entry, or real message send is claimed by this document.

## Mission

Remove recurring outreach SaaS spend wherever the underlying capability is software that UberBond can lawfully own.

This is not a promise that infrastructure, reputation, recipient permission, regulated activity, proprietary datasets, or recipient-network acceptance can be cloned. Those remain external reality.

The target boundary is:

`BUY ONLY SCARCE EXTERNAL SUBSTRATE -> UBERBOND OWNS THE CONTROL PLANE AROUND IT`

## Reconciled capability map

| Market product/job | UberBond-owned replacement | Current boundary |
|---|---|---|
| Apollo search / target lists | `lead-generation.mjs`, `uberbond-native-lead-ops.mjs`, saved target profiles, one-account dedupe, public discovery | Does not fabricate proprietary contact data |
| Clay waterfalls | `budgeted-enrichment-waterfall.mjs`, enrichment budget/evidence planners | Paid/licensed datasets remain optional BYOK donors |
| Hunter / ZeroBounce-style hygiene | contact hygiene + verification evidence gates | No mailbox probing or guessed private addresses |
| Ocean-style lookalikes | UberLookalike candidate expansion | Similarity is not contact permission |
| Instantly / Smartlead / Lemlist sequencing | Outreach Workbench + automation/governance + reservations + follow-up state | External transport still required |
| Instantly campaign variants | 12-step/26-variant workbench, deterministic allocation and variant analytics | Optimization needs real observations |
| Instantly unified inbox / AI inbox | message/reply collections + workbench inbox + **UberIMAP** + **UberReply** taxonomy | A real inbound/forwarding mailbox still has to exist physically |
| AI personalization SaaS | evidence-backed copy + **UberTruth** PASS/REVIEW/DENY claim firewall | Model access, if used, is a replaceable compute supplier |
| AgentMail | **UberMail** + Stalwart foundry/control plane | Public mailbox hosting still needs compute/network substrate |
| Mailforge / Inframail mailbox control | UberInboxes + **UberFleet** + sending mailbox registry | Mailbox reputation and provider authorization remain external |
| Maildoso dashboard/API operator work | **UberMaildoso** governed REST adapter | Maildoso itself remains a candidate physical/reputation supplier |
| ClayInbox provisioning/operator work | **UberClayInbox** + **UberSubstrate** | Google app-password custody is donor-proven; Azure high-density auth remains unproven |
| Generic SMTP client | **UberSMTP** | Requires an authorized relay/account |
| SMTP fleet credential manager | **UberFleet** encrypted AES-256-GCM account custody | Founder/provider must supply the real credentials |
| Mailbox assignment / sender rotation | UberFleet + sender-infrastructure mesh | Never rotates to evade enforcement or reset reputation |
| DNS setup dashboard | UberDNS + domain registry + verification | Registrar/provider authority and DNS propagation remain external |
| Warm-up manager | UberWarm + UberQuality + warm-up registry | No fake engagement network; time and real reputation cannot be cloned |
| Inbox-placement dashboard | **UberPlacement** seed-test compiler + provider observations + UberWarm | Real owner-controlled seed inboxes on recipient networks remain external substrate |
| Blacklist/reputation dashboard | provider/route/domain/mailbox health receipts + circuit breakers | Third-party reputation observations remain observations |
| CRM | prospect/opportunity/order/subscription state + lead OS | No extra CRM subscription required for first cash |
| Forms / inbound intake | first-party lead intelligence and public intake | No extra forms SaaS required |
| Website visitor first-party event tracking | Lead Intelligence `visitor_event` | Anonymous identity enrichment remains optional external data |
| Scheduling / workflow automation | canonical scheduler/queue/automation plans | No Zapier/n8n subscription required for this lane |
| Analytics | workbench revenue analytics + **UberEconomics** stage/unit-cost ledger | Unknown cost remains unknown |
| Payment truth | existing order/revenue/payment-proof spine | Payment processor and transaction fees are external |
| Provider abstraction | UberRelay + UberFleet + provider adapters | Provider authorization is never inferred from an API key |

## New source in this branch

### UberMaildoso

`src/ubermaildoso.mjs`

A governed adapter over Maildoso's documented REST surfaces for domains, accounts, forwarding, warm-up services, statistics, sequencer export and billing reads.

Properties:

- bearer PAT remains runtime-only;
- secret-shaped fields in provider responses are redacted;
- read operations do not imply mutation authority;
- every mutation requires an explicit scoped owner authorization receipt;
- a thrown provider mutation is `OUTCOME_UNCERTAIN`, never automatically retried;
- provider marketing does not become permission or capacity evidence.

### UberFleet

`src/uberfleet.mjs`

The canonical encrypted SMTP fleet bridge.

- credentials are AES-256-GCM encrypted using the existing UberBond token key;
- registry/audit receipts remain secret-free;
- arbitrary mailbox slots replace the legacy A/B-only assumption for SMTP fleets;
- a healthy sticky sender is preserved;
- non-paused accounts are balanced by observed usage, never by quota-evasion logic;
- actual sends reuse `UberSMTP`;
- SMTP 250 acceptance is provider acceptance only, not inbox placement.

The live Pipeline can now select an arbitrary encrypted `smtp-relay` sender and submit through UberSMTP. Gmail and owned Postal behavior remain unchanged.

The 100K runtime can also resolve credentials from the same encrypted UberFleet account store, so scale no longer requires one environment-variable pair per mailbox.

### UberMaildoso Evidence Sync

`src/ubermaildoso-evidence-sync.mjs`

Resident read-only reconciliation closes the last provider-dashboard dependency.

- when Maildoso is configured, the canonical scheduler queues a reconciliation every 15 minutes;
- it reads domains, accounts, warm-up services, forwarding state and aggregate stats through the governed adapter;
- exact Maildoso account addresses are bound only to exact locally known UberFleet addresses;
- explicit provider health/warm-up facts can enter mailbox receipts;
- provider domain presence never becomes DNS authentication by inference;
- provider account presence never becomes inbox placement, legal eligibility or send authority;
- the sync performs no DNS mutations, sends or purchases.

### UberIMAP

`src/uberimap.mjs`

Read-only inbound bridge for provider forwarding inboxes.

- forwarding inbox credentials are AES-256-GCM encrypted at rest;
- remote plaintext IMAP is refused;
- polling uses BODY.PEEK so reading does not mark messages seen;
- replies are rebound to original sends through Message-ID / In-Reply-To / References when available;
- ambiguous or unmatched inbound messages do not become prospect replies by inference;
- Maildoso's forwarding mailbox remains physical provider substrate, while reply ingestion/classification stays UberBond-owned.

### UberReply

`src/uberreply-taxonomy.mjs`

Bounded reply classes:

`optout | positive | negative | objection | referral | wrong_person | out_of_office | automatic | neutral`

Deterministic high-confidence classification runs before optional model assistance. Model output is clamped back into the bounded taxonomy.

### UberTruth

`src/ubertruth-outreach.mjs`

Final message claim firewall.

It refuses or reviews:

- unsupported personal-name usage;
- invented revenue-loss claims;
- unsupported quantified performance promises;
- invented client history;
- fake familiarity;
- missing/weak website evidence.

PASS creates no send authority. It only says the rendered claim set matches the evidence supplied to this layer.

### UberPlacement

`src/uberplacement.mjs`

Provider-neutral placement-test logic now lives inside UberBond.

- builds balanced test plans across owner-controlled seed inboxes;
- assigns unique probe identities without authorizing a send;
- ingests observed inbox/spam/missing folder evidence;
- reports placement by sender and recipient provider;
- exports observed placement rates directly into UberWarm;
- never treats a seed test as population-wide deliverability proof.

Google/Microsoft/Yahoo seed inboxes are external identities on those networks. Their existence/reputation cannot be cloned, but the placement dashboard/orchestration around them no longer needs a paid SaaS.

### UberEconomics

`src/ubereconomics-outreach.mjs`

Tracks cost per:

- verified contact;
- draft;
- provider-confirmed send;
- positive reply;
- qualified conversation;
- cleared payment.

No-cost evidence is explicitly distinguished from proven zero cost.

## The irreducible external layer

After this branch, the Month-1 outreach stack should not require another sequencing, CRM, mailbox-control, personalization, warm-up-dashboard, reply-classification, analytics, DNS-dashboard, forms, or automation SaaS subscription.

The remaining scarce substrate is:

1. **Domain ownership.** Already purchased: 30 outreach domains.
2. **General compute/control-plane hosting.** Already purchased: the current OVH server can host orchestration/control-plane work, subject to its provider policy.
3. **One provider-authorized, reputation-bearing sending substrate.** Current low-cash candidates are evaluated by UberSubstrate. ClayInbox Google has a proven direct credential path; ClayInbox Azure has much higher advertised density but remains yellow until its direct auth/custody contract is observed. Maildoso remains a fallback candidate.
4. **A payment rail after a buyer agrees to pay.** No additional monthly outreach SaaS is required; processor transaction costs remain real.
5. **Regulatory/provider/account approvals that cannot be synthesized in code.** These are not software subscriptions.

## Egypt legal reality discovered during this wave

Do not erase this blocker to make the launch dashboard green.

As of 2026-09-26, Egypt's PDPC publicly describes the PDPL + Executive Regulations No. 816 of 2025 as requiring prior valid explicit consent for electronic direct marketing to a data subject, plus an Electronic Direct Marketing license/permit regime.

The PDPC also defines a data subject as a **natural person**. That creates a potentially material distinction between a personal work address identifying a natural person and a genuinely non-personal corporate role inbox, but this branch does **not** invent a legal conclusion from that distinction.

Current safe policy:

- permissioned/solicited canaries may use an authorized SMTP relay;
- `PUBLIC_BUSINESS_CONTACT` and `CONSPICUOUS_PUBLICATION` remain fail-closed for the small canary path until a precise provider + legal evidence path is encoded;
- suppression always dominates;
- provider terms and recipient-jurisdiction rules remain independent gates.

This is a legal/activation question, not a missing SaaS.

## First-month purchase ledger

### Already paid / owned

- 30 outreach domains.
- Current OVH subscription.

### Candidate new paid item

**One authorized sending/mailbox substrate.**

Current evidence sheet: `docs/UBERCLAYINBOX_PROVIDER_EVIDENCE_2026-09-26.md`. `UberSubstrate` must rank actual integration evidence above advertised mailbox density.

Do not buy another sequencer, CRM, AI inbox, enrichment orchestrator, mailbox dashboard, warm-up dashboard, DNS dashboard, analytics tool, or AgentMail-style API merely to launch this lane.

### Not a purchase, but still required before a real send

- provider account approval and exact current policy fit;
- provider credentials;
- domain authentication;
- elapsed warm-up/ramp required by the provider/policy;
- owner legal/business postal identity in protected settings;
- recipient eligibility evidence;
- exact canary authorization;
- a real provider forwarding/inbound mailbox, which UberIMAP can ingest once activated;
- live payment path before collecting money.

## Truth boundary

This branch reduces software subscription dependence. It does **not** prove:

- Maildoso's advertised trial will be granted;
- a particular mailbox count exists;
- a particular safe daily send volume;
- inbox placement;
- recipient legality;
- PDPC license approval;
- recipient replies;
- customers;
- cleared revenue.

Those become true only from external receipts and outcomes.


## Verification receipt — 2026-09-26 exact-head wave

Source verification was performed without claiming unavailable CI execution.

### Executed evidence

- all changed/new outreach runtime modules and their new test files passed transformed V8 syntax parsing;
- `server-core.mjs` also parsed after preserving its module-only top-level-await/import-meta semantics in the checker;
- UberReply behavior probe: opt-out, positive, out-of-office, wrong-person and objection classifications matched the bounded taxonomy;
- UberTruth behavior probe: an evidence-bound message passed while an invented quantified revenue-loss claim was denied;
- UberEconomics behavior probe: positive-reply and cleared-payment contribution accounting reconciled;
- UberPlacement behavior probe: owner-controlled Gmail/Microsoft seed observations produced bounded inbox/spam rates without sending anything;
- UberBuy behavior probe: with 30 domains and control-plane compute already owned, the only possible mandatory new outreach purchase is the authorized sender substrate; a complete already-acquired substrate yields zero mandatory outreach-SaaS purchases;
- UberFleet behavior probe: SMTP credentials remained encrypted at rest, decrypted only at dispatch, and a healthy sender could be selected;
- UberSMTP behavior probe: a provider-accepted fixture produced a confirmation receipt and generated Message-ID on the real sender domain rather than `uberbond.local`;
- UberIMAP behavior probe: reply From/In-Reply-To parsing and encrypted forwarding-inbox custody worked through an injected reader with zero real network traffic;
- warm-up orchestration behavior probe: provider account identity, owner approval and idempotency reached the provider mutation boundary and reconciliation used the provider reference rather than a local-only mailbox id;
- canonical Maildoso provider-adapter behavior probe: account inventory normalized a provider-observed daily limit, warm-up state promoted only explicit matching observations, DNS requirements remained unsupported instead of guessed, and unapproved mutations caused zero provider calls;
- direct UberMaildoso behavior probe: an unapproved mutation caused zero calls, an approved fixture mutation executed once, and secret-shaped provider response fields remained redacted.

### CI / deployment evidence

GitHub Actions workflows on the exact head reported failure **with zero job steps executed** across deterministic, browser, Postgres, exact-head, Postal-focused and verification jobs. Therefore those runs provide no source-test evidence either way.

The two Vercel status contexts reported `build-rate-limit`. That is deployment-provider capacity/billing evidence, not a source assertion failure.

### External-effects ledger for this verification wave

- real outreach messages sent: 0
- real provider mutations: 0
- real DNS mutations: 0
- real Maildoso account creations: 0
- real IMAP connections: 0
- new spend: 0

All provider/network behavior probes used injected fixtures. A real provider account, DNS state, reputation, inbox placement, legal eligibility, replies and cleared payment remain external evidence.


## Post-merge runtime receipt — 2026-09-26

PR **#1004** merged to `main` as squash commit:

`7b6ce73328571564e217cb99a843ada4e2c152cf`

Live Vercel inspection after the merge showed:

- `uberbondd` production deployment `dpl_CHYo7WGqXrFNS3DkFEuEhaMP5Fs8` reached the build step and failed with `BUILD_UTILS_SPAWN_2`: `node scripts/vercel-command-center-build.mjs` exited with code 2.
- The immediately preceding `main` deployment at `c922b43310881a696378672a59f2752734555145` failed with the **same command and same error class/code**. Therefore this failure signature predates #1004.
- `uberbondd-lite-private` production deployment `dpl_4xfLn1daW4C435APmAutkScPYLiV` reached the build step and failed with `BUILD_UTILS_SPAWN_2`: `node scripts/build-visual-cortex.mjs` exited with code 2.
- The immediately preceding `main` lite deployment at `c922b43310881a696378672a59f2752734555145` also failed in the same `build-visual-cortex.mjs` command. Therefore that failure signature also predates #1004.
- Earlier healthy production deployments exist in both Vercel projects, so deployment infrastructure itself is not universally unavailable; the current source lineage carries pre-existing build-gate debt.

Truth classification:

- **source merge:** confirmed on `main`;
- **new outreach source regression from #1004:** not established;
- **production deployment success:** not established;
- **current production build debt:** real and pre-existing;
- **live Maildoso activation / DNS / reputation / sending / replies / cleared revenue:** still not established by this work.

Do not reinterpret the merged source as a successful cloud activation. Do not reinterpret the pre-existing Vercel build failure as evidence that the SaaS-extinction source is broken.
