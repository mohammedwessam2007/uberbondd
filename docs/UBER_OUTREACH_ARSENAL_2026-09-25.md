# UberBond outreach arsenal — full inventory

Date: 2026-09-25 · Source: branch `claude/uberbond-night-war-launch-glgsqc` over `main` `aa037a0` · Method: every `src/uber*` module, every outreach/lead module, docs, and PR history #806–#993.

**Verified tonight:**
- 107 `src/uber*` modules; about 100 outreach and lead modules in total, `Uber*` and not.
- **1,083 of 1,083 tests pass** across the 162 outreach, lead and `Uber*` test files.
- Nothing in this inventory has sent a real message. Deployment state on Render comes from PR receipts, not from this session (the host is egress-blocked here).

All 30 owned domains are outreach domains (founder, 2026-09-25).

## The machine, layer by layer

| Layer | UberBond organ(s) | Clean-room replacement for | Main PRs | State |
|---|---|---|---|---|
| Lead discovery | Public discovery (OpenStreetMap), `uberlead-launch-fusion`, `public-signal-harvester`, website auditor (`audit-rules`, `durable-audit-scan`) | Apollo search, Google Maps scrapers (without scraping) | #873, #874, #920 | Source + tests; wired into the control plane (#920) |
| Lead OS | `uberbond-native-lead-ops` (identity, dedupe, target profiles, lead lists, enrichment plan, capacity, CSV), `lead-generation`, `lead-operations` v2, `lead-intelligence-v3` (first-party intake, typed enrichment, owner action queue, attribution) | **Apollo** (lists, filters, dedupe), HubSpot intake | #874, #920, #929, #930 | Source + tests + migration `106_lead_intelligence_collections` |
| Enrichment | `enrichment-cost-tier-composer`, `prospect-enrichment-planner`, `prospect-enrichment-budget-gate`, `prospect-evidence-reconciliation` | **Clay** waterfalls with cost ceilings | #920 | Plans only; paid providers are BYOK-gated and never called silently |
| Lookalikes | `uberlookalike-account-expander` | **Ocean.io** | #868 | Candidate generation only, no contact data |
| Contact hygiene | `uberverify-contact-hygiene`, `contact-validate-email` | **ZeroBounce / NeverBounce / Hunter** verification | #868 | No mailbox probing; evidence gate |
| Prospect portfolio | `uberprospect-forge` (2,000 → 4 × 500 offer lanes), `prospect-import`, `prospect-identity-ledger/repository`, `prospect-qualification-*`, `first-cash-prospect-completion` | Apollo lists + Instantly lead lists | #909, #911 | Requires evidence-bearing legal eligibility (tonight) |
| Benchmark | `lead-generation-benchmark` (48 aspects, 22 winning vendors: Apollo, Clay, Instantly SuperSearch, Ocean, UserGems, Common Room, Bombora, 6sense, RB2B, Warmly, HubSpot, Hunter, ZeroBounce, Dropcontact, Cognism, LeadIQ, ZoomInfo, Demandbase and others) | — | — | Research map; UberBond wins "one lead per account" dedupe |
| Sequencing & inbox | `outreach-automation`, `outreach-workbench`, `outreach-operator`, `outreach-upgrades`, `outreach-governance`, `outreach-provider-events`, `unsubscribe`, `deliverability-guard`, `warmup-orchestrator` | **Instantly / Smartlead / Lemlist** | parity ledger 2026-08-12 | 12-step campaigns, 26 A/Z variants, unified inbox, OOO/bounce/complaint/unsubscribe handling; website visitor ID not built |
| Governed send | `outreach-launch-gate`, `governed-outreach-dispatch`, `outbound-operator-summary`, send-safety | Instantly send engine, with idempotency and no blind retry | #871, #934, #950 | Fake-adapter canary verified; 0 real sends |
| Mail servers | **UberDoso** (pinned Postal 3.3.7 cell: kernel, activation, DNS contract, job handler, one-paste bootstrap), UberCloud Contabo cell actuator/preflight | **Amazon SES / Postmark** as owned infrastructure | #806, #810, #811, #947–#950 | Software ready; no host bought |
| Mailboxes | **UberInboxes** (8 founder aliases per root, 16 on the two roots), **UberInbox Factory** (capacity planner), scale profiles, `sending-mailbox-registry`, domain-mailbox gate/circuit breaker/control center, `sender-infrastructure-mesh` | **Mailforge / Mailreef / Icemail / Inframail** | #868 | Planning; Icemail and Mailforge adapters in `provider-http-adapters` |
| Mail API | **UberMail** (foundry on Stalwart, agent API, capacity exchange, JIT provisioning, runtime, UberDoso bridge), `agentmail-adapter`, `mailhub-control-plane`, **UberSMTP** submission adapter, `postal-live-send` | **AgentMail** | #903 | Clean-room API surface; no live mailbox |
| IP / egress | **UberEgress** topology | Dedicated-IP management (Mailreef-style) | #868 | Planning |
| DNS | **UberDNS** control plane + GoDaddy v3 adapter; UberDoso DNS publication (tonight) | Mailforge's automatic DNS setup | #909, #910 | TXT-safe reconciliation fixed tonight; 0 records written |
| Sender legal identity | **UberPostal** | The CAN-SPAM footer every sequencer asks for | #909 | Waiting on founder address |
| Warm-up & reputation | **UberWarm** (evidence-first ramp, no fake traffic), **UberQuality** capacity governor, UberReputation credentials, domain circuit breaker | **Warmforge / Instantly warm-up** (without fake engagement) | #868 | Planning; needs real traffic |
| Replies & offers | **UberReply** four-offer genome + tournament (4 lanes, 25,000/day target each), `revenue-offers`, `offer-compiler` | Lemlist/Instantly reply handling + offer testing | #892, #911, #925 | Four offers wired: Lead-to-Booking Leak Audit, AI Agent Release Gate, Client ROI Proof Sprint, Bilingual Booking Leak Audit (prices come from config) |
| Strategy research | **UberOutbound** genome v2.2, policy registry (jurisdiction matrix), promotion gate, research import | Gong / 30MPC / Lavender / Woodpecker research turned into policy | #870 | Policy compiler; jurisdictions now executable (tonight) |
| 100K scale | Outreach 100K (artifact preparer, corpus materializer, launch contract, packet compiler/corpus, runtime bundle/control) | Instantly "unlimited sending" dashboards | #886–#888 | Certificate `WAIT_EXTERNAL_EVIDENCE`: 100,000 short |
| Launch | **UberLaunch** (one-button, closure, runtime evidence), founder button | — | #873–#876, #907, #909 | Stops at external gates |
| Beyond SMTP | **UberReach** (control plane v1.4, universal transport over email/web contact/Matrix/ActivityPub/Nostr/XMTP/business APIs, objective substitution, scale frontier), **UberAttention** (recipient-issued permits + stake ledger), **UberZero** substitution engine, **UberGrant** zero-cost registry, free-first outreach router, UberSwarm edge fabric | New, not clones | #903–#905 | Research/runtime canaries |
| Other channels | `distribution-control-plane` (portfolio with concentration gates), contracts: omnichannel, booking, CRM sync, forms, signatures, social scheduling, voice/telephony, browser action, web extraction, receivables, accounting export | Chatwoot, Cal.com, Twenty, Formbricks, Documenso, Postiz, n8n patterns | — | Provider-neutral contracts |
| Fleet | `outreach-domain-fleet` (28 names + 2 roots = 30), fleet DNS observatory (tonight) | — | #970 | 30/30 observed; 0 authenticated |

## The lead generator

The "Apollo-style Lead OS" is the chain:

**public discovery → Lead OS → UberProspect → eligibility → one-button launch**

It went live in the control plane with #920 (2026-09-17) and got its quality surfaces in #929/#930.

What makes it strong:
- one lead per account;
- evidence and provenance on every field;
- typed results (found / partial / missing / blocked / needs verification);
- lookalike expansion;
- cost-ceilinged enrichment plans;
- an owner action queue with SLAs.

What it deliberately does not do: guess email addresses, scrape protected networks, or call paid data providers without a key.

## Infrastructure clones outside outreach

UberCel (deploy control plane), UberLit (runtime), UberCloud (placement and evacuation), UberOcean (compute fabric), UberStatic (static release plane), UberSocket (project mesh), UberSkills, UberOS, UberWatt (Windows compute node), UberDePIN gateway, UberSwarm, UberWorm, UberMind (cognition exchange), UberDNA (software genome), and the sovereign stack and orchestration control plane.

## Where tonight's work overlaps what already existed

I built these before reading every organ above. The honest reconciliation:

| Tonight | Existing organ | Overlap | What is genuinely new | Consolidation |
|---|---|---|---|---|
| Consent receipts | **UberAttention** permits | Both model recipient permission with purposes and evidence | Exact-wording hash, double opt-in with token, time-ordered withdrawal, wiring into the public intake | Make a confirmed consent receipt the `authorizationEvidenceRef` of an UberAttention permit instead of running two permission objects |
| Lawful Channel Router | **UberReach** universal transport, `distribution-control-plane` | Both pick a route per recipient; both watch channel concentration | Per-jurisdiction legal state, sender-jurisdiction gate, letters/partners/in-person, cost and budget | Feed UberReach endpoint checks into the router for digital channels; hand concentration limits to the distribution control plane |
| Recipient eligibility engine | UberOutbound legal matrix, `outreach-governance` route evidence | The matrix was data; nothing interpreted it | The interpreter itself | None needed; it consumes the matrix's jurisdictions |
| Evidence Beacon | Website auditor, public report page | Reuses the auditor | Same-domain, fresh, confident filter; "don't invite" when nothing qualifies | None needed |
| Fleet senders / DNS publication | UberDoso, UberInboxes, UberDNS | Extends them | Fleet domains in the cell; bring-up output published as DNS | Next: **UberInboxes should cover all 30 domains**, not only the two roots (16 → up to 30 × N identities) |

## What is still not true

No mail host exists, and no domain is authenticated. No message has been sent to a real prospect. There are no prospects in the live corpus from this session, no customers and $0 cleared revenue.
