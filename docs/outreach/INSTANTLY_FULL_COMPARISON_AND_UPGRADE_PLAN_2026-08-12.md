# UberBond vs Instantly: detailed comparison and upgrade plan

Status checked: 2026-08-12.

This is a capability and operating-model comparison, not a claim that UberBond is an Instantly API-compatible replacement. Instantly is a mature outbound platform with a sender network, lead/data products, CRM, automation and AI agents. UberBond is a self-hosted, owner-only revenue operating system. The goal of this loop is to make UberBond materially better at the owner’s evidence-to-payment workflow while keeping provider-scale gaps visible.

## Executive result

The existing owner-use-case scorecard gives UberBond the advantage when the objective is a truthful, authorized path from observed website issue to accepted work, cleared payment and recurring continuity. The broader functional matrix still gives Instantly the advantage in sender infrastructure, lead supply, placement scale and agency operations. Those results are compatible: they measure different jobs.

| Decision lens | Instantly | UberBond | Practical conclusion |
|---|---:|---:|---|
| Owner revenue-loop scorecard | 2.63 | 4.48 | UberBond wins the local evidence-to-cash workflow |
| Functional platform matrix | 3.21 | 4.05 | UberBond wins governance, research and commercial continuity; Instantly wins infrastructure |
| Industry-fit matrix | 3.39 | 4.25 | UberBond is strongest for evidence-led, high-trust service work |
| High-volume sender operation | Strong | Deliberately bounded | Instantly is the better commodity sending network |
| One-owner audit, approval and recovery | Partial/provider-oriented | Strong | UberBond is the better controlled operating surface |

The scores are the repository’s transparent decision model; they are not independent market benchmarks.

## Detailed functional comparison

| Aspect | Instantly capability | UberBond capability after this upgrade loop | Winner for the job | UberBond improvement |
|---|---|---|---|---|
| Product objective | Cold-outbound infrastructure, CRM and AI-assisted sales execution | Evidence-first website audits, owner-approved outreach, paid reports and recurring monitoring | Depends on objective | Keep the owner objective explicit instead of optimizing opens alone |
| Lead discovery and supply | SuperSearch advertises 450M+ B2B leads, filters, waterfall enrichment and a web researcher | Local discovery, website research, contact verification and evidence-ranked search; no external lead index | Instantly for breadth; UberBond for observed evidence | Evidence-supply queue, provenance and “no invented contact” policy |
| Website visitor intelligence | Website Visitors identifies qualifying US traffic profiles and related page/referrer context | Not implemented; no identity provider or visitor claim is fabricated | Instantly | Keep as a named gap; only add with a consent-aware provider adapter |
| Sequence design | Multi-step campaigns, scheduling, subsequences on higher plans, templates and campaign controls | Up to 12 bounded steps, minute/hour/day delays, conditional steps, merge tags, conditionals, Spintax and deterministic previews | Instantly for breadth; UberBond for bounded review | Added provider-shaped controls without weakening owner approval |
| Variants and optimization | Up to 26 A/Z variants, analytics and auto-optimization | Up to 26 variants, owner revenue-weighted analytics and recommendation/apply plan; applying changes resets approval | Tie on basic A/Z; UberBond on consequence weighting | Preserve revenue and cleared-payment metrics above vanity metrics |
| New-lead volume controls | Max new leads, prioritization, account selection and daily limits | Normalized `maxNewLeadsPerDay`, prioritization, portable mapping and a pre-reservation campaign gate | Tie for local controls; Instantly for scale | Campaign caps now block at the real send path and show reasons in a control plan |
| Company-level limits | Limit emails per company and stop-company-on-reply options | Normalized company daily limit; local control plan and actual send admission | Tie for owner-safe execution | Count active reservations/messages/events and block at the company boundary |
| Scheduling and cadence | Business-hour windows, daily limits, minimum gaps and random gaps | Recipient-window planning, IANA timezone handling, minimum gaps and normalized random-gap mapping | Instantly for mature scale; UberBond for transparent planning | Expose the controls in the editor, export and plan; keep provider-specific timing explicit |
| Sender accounts and rotation | Unlimited accounts on paid email plans, account rotation, inbox rotation and matching | Bounded Gmail sender slots, sticky routing, ESP matching, health ranking and capacity holds | Instantly | Improve routing and explain blocked reasons without claiming a mailbox fleet |
| Warmup | Unlimited warmup/account infrastructure is part of the paid outbound surface | Conservative observed-signal ramp plan; no proprietary warmup network | Instantly | Show ramp and hold decisions while preserving “not a warmup network” truth |
| Inbox placement | Inbox Placement tests inbox/spam outcomes, authentication, blacklists and recurring alerts | Local authentication/copy preflight; provider placement is explicitly `not-run` unless an adapter is configured | Instantly for placement measurement | Never turn a heuristic into an inbox-placement guarantee |
| Unified inbox and CRM | Unibox plus CRM inbox, calls, SMS, tasks, opportunities, pipeline and reports | Owner Unibox with thread context, reply classification, drafts, labels, snooze, opportunities and revenue continuity | Instantly for channel breadth; UberBond for evidence context | Keep the original claim, evidence, route and commercial state beside the reply |
| Automations | Triggers, HTTP actions, conditional AND/OR branches, delays, integrations and history | Owner-local event automations, idempotent runs, blocked HTTP actions, now with explicit AND/OR condition mode | Instantly for integrations; UberBond for bounded mutations | Add OR parity without allowing external HTTP or autonomous commercial claims |
| AI assistance | AI writer, inbox manager, Reply Agent and AI Sales Agent, including optional autopilot | Owner copilot ranks evidence, classifies replies, drafts and stops; send, negotiate and payment assertions remain gated | Instantly for autonomy; UberBond for accountable assistance | Make the safe action surface fast while keeping high-impact actions owner/V9-gated |
| Analytics | Opens, replies, clicks, opportunities, CRM pipeline and campaign reports | Revenue-weighted funnel, accepted delivery, cleared revenue, recurring continuity and variant analytics | UberBond for the business objective | Make cleared money and continuity first-class outputs |
| Provider events and integrations | Webhooks, API, integrations, MCP and provider-side event schema | Signed normalized webhook ingestion, idempotency, reply materialization, provider contract endpoint and explicit send boundary | Instantly for ecosystem; UberBond for local authority | Publish a deliberate integration contract instead of implying compatibility |
| Portability | Provider APIs/integrations and campaign/lead workflows | Provider-neutral campaign export with Instantly mapping, evidence/contact provenance and `doNotSend` safety flags | Tie for export intent; UberBond for re-approval safety | Export never becomes send authorization; owner reapproval is required |
| Governance and recovery | Provider settings and account controls; exact downstream authority is provider-oriented | Prior-contact protection, suppression, evidence binding, exact approvals, durable reservations, V9 admission and uncertain-effect reconciliation | UberBond | Keep every high-impact action auditable and recoverable |
| Economics | Official plans include paid outreach, credits, CRM and placement add-ons | Single-owner/free-core workspace; no billing, credits or agency-seat claim | Instantly for SaaS scale; UberBond for owner cost | Treat missing billing/agency scale as deliberate scope, not hidden debt |
| Agency and multi-seat operations | Agency view, workspaces/team, account and volume operations | Single-owner command center | Instantly | Do not add multi-seat mutation until authority, tenant boundaries and billing are real |

Instantly-side facts above are grounded in its [product overview](https://help.instantly.ai/en/articles/6221655-what-is-instantly), [plans overview](https://help.instantly.ai/en/articles/10273259-instantly-plans-overview), [email-plan comparison](https://help.instantly.ai/en/articles/7920548-email-outreach-plans-comparison), [campaign options](https://help.instantly.ai/en/articles/6222396-campaign-options), [A/Z testing](https://help.instantly.ai/en/articles/6661549-a-z-testing-how-to-create-email-variants), [Inbox Placement](https://help.instantly.ai/en/articles/10147177-inbox-placement-feature), [CRM dashboard](https://help.instantly.ai/en/articles/9064602-getting-started-with-the-crm-dashboard), [automation integration](https://help.instantly.ai/en/articles/13645175-pipedrive-integration-in-automations), [AI Sales Agent](https://help.instantly.ai/en/articles/14299661-ai-sales-agent), [SuperSearch](https://help.instantly.ai/en/articles/11364248-supersearch), [Website Visitors](https://help.instantly.ai/en/articles/9502519-getting-started-with-the-website-visitors-feature), [webhook events](https://developer.instantly.ai/guides/webhook-events), and [MCP](https://help.instantly.ai/en/articles/12980002-instantly-mcp-model-context-protocol).

## Current pricing and operating-model contrast

Instantly’s official plans page currently lists email outreach Growth at $47/month for 1,000 contacts and 5,000 emails, Hyper Growth at $97/month for 25,000 contacts and 125,000 emails, and higher tiers/add-ons; credits and CRM/placement features are separately metered or tiered. See the [official plans overview](https://help.instantly.ai/en/articles/10273259-instantly-plans-overview) for the live catalog.

UberBond does not claim equivalent sender capacity, lead credits, CRM channel breadth, agency seats or paid placement testing. Its economic advantage is a focused owner surface: it can run the research, evidence, approval, report and continuity loop without pretending that provider scale exists.

## What changed in UberBond

### 1. Campaign controls now have an execution path

The sequence editor and normalizer now support:

- maximum new leads per day;
- prioritization of new leads;
- emails-per-company daily limit;
- random-gap mapping;
- delivery-mode mapping;
- the existing stop rules, provider matching, minimum gap and owner optimization settings.

`evaluateCampaignSendControls()` runs before durable outbound reservation when campaign caps are configured. It combines active reservations with local messages and normalized provider events, de-duplicates known reservation identities, returns explicit block reasons, and leaves the durable reservation as the final idempotency authority.

### 2. The owner can inspect the decision before sending

New owner-authenticated endpoints:

| Endpoint | Purpose | External effects |
|---|---|---:|
| `GET /api/outreach/campaigns/:id/control-plan` | Due queue, sender route, evidence/suppression gates, company and daily limits | 0 |
| `POST /api/outreach/campaigns/:id/preflight` | Local copy/authentication checks per sender | 0 |
| `GET /api/outreach/campaigns/:id/portable-export` | Provider-neutral sequence plus conservative Instantly mapping | 0 |
| `GET /api/outreach/provider-spec` | Signed webhook contract, event mapping and send boundary | 0 |

The sequence editor exposes Control plan, Deliverability preflight and Portable export actions. Provider placement remains visibly `not-run` unless a deliberate provider adapter is added.

### 3. Deliverability is more honest and more useful

The preflight checks subject/body bounds, bounded trigger language, link density, uppercase ratio, evidence binding, opt-out signal and observed SPF/DKIM/DMARC state. It reports provider placement separately instead of converting local heuristics into a guarantee.

### 4. Automation parity gained OR logic without gaining unsafe authority

Automation plans now persist an explicit `conditionMode` of `all` or `any`. HTTP actions remain represented but blocked. External effects, charging, negotiation and payment-cleared assertions remain outside autonomous automation.

### 5. Export is portable but not permissive

The portable export includes the sequence, Instantly-shaped settings, evidence URL/title/excerpt, contact provenance, sequence state and `doNotSend` flags. Suppressed, bounced, missing-contact and missing-evidence records are blocked. Importing into another provider still requires owner reapproval and the V9 route.

## Priority backlog after this loop

| Priority | Gap | Safe next increment | Keep out of scope until proven |
|---|---|---|---|
| P0 | Provider placement evidence | Deliberate adapter with signed result, provider identity and replay-safe storage | Inbox guarantee from local heuristics |
| P0 | Multi-provider send adapter | One provider at a time behind the same V9 consequence gate | Account fleet or autonomous rotation claims |
| P1 | Contact/data breadth | Import an owner-supplied list with provenance and evidence joins | Buying or inferring private contacts |
| P1 | Revenue analytics depth | Add accepted-delivery and payment receipt joins to campaign views | Counting a reply or opportunity as cash |
| P2 | AI reply assistance | Owner-review drafts with evidence/claim diff and exact approval | Autonomous negotiation, quote or payment state |
| P2 | Portable import | Dry-run importer that revalidates suppression, evidence and sender route | Provider upload as implicit send authorization |
| P3 | Agency mode | Design tenant/role/approval/billing model first | Copying a multi-seat UI without authority boundaries |

## Sector fit

UberBond’s strongest current sectors are website agencies and digital studios, medical/healthcare website work, local clinics, legal/finance and other regulated professional services, solo consultants, and productized website QA/release-readiness services. Instantly is the stronger default for SaaS SDR volume, recruitment, e-commerce partner campaigns, multi-client outbound agencies, real estate partner distribution and hospitality/travel distribution.

The edited Innovate By Day application remains a prior-contact artifact. It is not recreated, resent or treated as a new outbound opportunity. The edited email block remains the source of truth for any future owner-reviewed documentation.

## Verification evidence

- `tests/outreach-upgrades.test.mjs`: campaign controls, preflight, signed provider contract and safe portable export.
- `tests/outreach-automation.test.mjs`: default AND semantics and explicit OR semantics.
- `src/pipeline.mjs`: cap admission before `reserveOutboundSend()`.
- `public/outreach.html` and `public/outreach.js`: owner controls and review surfaces.
- `docs/outreach/INSTANTLY_PARITY_LEDGER_2026-08-12.md`: compact parity ledger.
- `docs/outreach/MULTI_SECTOR_COMPARISON_2026-08-12.md`: functional and industry scorecards.

No comparison row creates live provider authority. Generic unsolicited commercial Gmail outreach remains denied by the existing provider-policy boundary.
