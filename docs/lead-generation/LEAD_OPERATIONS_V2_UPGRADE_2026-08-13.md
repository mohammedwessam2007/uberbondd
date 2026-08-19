# UberBond Lead Operations V2 — comparison and implementation

Date: 2026-08-13

This loop upgrades UberBond from a local lead search plus enrichment-plan surface into a lead-operations control tower. Lead Intelligence V3 now adds first-party intake, account-safe visitor activity, typed local enrichment, owner SLAs and outcome attribution; see [LEAD_INTELLIGENCE_V3_2026-08-13.md](./LEAD_INTELLIGENCE_V3_2026-08-13.md). It does not create a vendor contact database, scrape protected networks, infer private email addresses, call an external provider, send an external message, or spend money.

## Current market patterns used as references

| Operator job | Strongest current reference | Pattern UberBond adopts | UberBond boundary |
|---|---|---|---|
| ICP search and reusable targeting | [Apollo search filters](https://knowledge.apollo.io/hc/en-us/articles/4412665755661-Search-Filters-Overview) and [prospect/enrich](https://www.apollo.io/product/prospect-and-enrich) | Target profiles, structured filters, saved profile records and explicit account/lead goals | Local corpus or owner-authorized source only |
| Field-level enrichment waterfalls | [Clay waterfalls](https://university.clay.com/docs/building-a-data-waterfall) | Per-field routes, stop rules, provider status and best/worst attempt estimates | BYOK plan; no provider call in local mode |
| Search → enrich → handoff | [Instantly SuperSearch](https://help.instantly.ai/en/articles/11364248-supersearch) and [waterfall enrichment](https://help.instantly.ai/en/articles/11364341-waterfall-enrichment) | Handoff remains an owner-plan transition into existing evidence, suppression and V9 gates | No automatic campaign enrollment or send |
| Signal fusion and explainable scoring | [Common Room signals](https://www.commonroom.io/product/signals/) and [lead scoring](https://www.commonroom.io/product/lead-scoring/) | Account-level stacked signals, recency, source trust, diversity and why-now context | Signals retain source and authority; no opaque vendor score is asserted |
| Buying stage and committee visibility | [6sense predictive analytics](https://6sense.com/platform/predictive-analytics/) and [buying groups](https://6sense.com/guides/b2b-buying-groups/) | Required persona groups, missing-role gaps and account-level coverage | Missing personas remain a review queue, not a reason to invent contacts |
| Inbound capture and routing | [HubSpot lead capture](https://www.hubspot.com/products/marketing/lead-capture), [lead scoring](https://www.hubspot.com/products/marketing/lead-scoring) and [Breeze capture/qualification](https://www.hubspot.com/products/artificial-intelligence/use-cases/capture-and-qualify-sales-leads) | Coverage bottlenecks and local next-action routing | External reply or meeting booking still requires an explicit adapter and owner action |
| Public professional-email provenance | [Hunter Domain Search](https://hunter.io/domain-search) and [public-source guidance](https://help.hunter.io/en/articles/2085802-are-the-emails-found-in-the-email-finder-publicly-sourced) | Field-level source URL, observed time, source type, license note, confidence and verified state | Inferred or non-exact contacts are blocked |
| Lookalike account discovery | [Ocean GTM Intelligence](https://www.ocean.io/) | Explainable feature similarity against owner-selected seed accounts | No proprietary model, database or protected graph is copied |

## Implemented in this loop

### Target profiles

`POST /api/leadgen/target-profiles` saves a reusable local target profile through the existing `leadSearches` persistence surface. A profile contains:

- query and ICP filters;
- target account and eligible-lead goals;
- required personas;
- required signal types;
- required enrichment fields;
- freshness and segmentation rules.

### Lead control tower

`GET /api/leadgen/control-tower` joins:

- account and lead coverage against the profile goal;
- evidence, contact and verified-contact coverage;
- stacked-signal coverage and missing why-now signals;
- owned/suppressed exclusions;
- exact bottlenecks and recommended next actions;
- buying-group/persona gaps;
- field-quality samples and conflict counts;
- provider preflight for the requested field set;
- a priority queue of local next conversations.

The control tower is a decision surface. It does not claim that more records are better when evidence, contact authority or freshness is missing.

### Provenance and conflict ledger

`POST /api/leadgen/field-ledger` produces a ledger for selected prospects. Each field can show:

- source type and source kind;
- source URL and license/authority note;
- observed time and age;
- confidence and verification;
- exact versus inferred status;
- conflict state and owner-resolution requirement.

The `contact.email` field becomes a handoff blocker when it is inferred or marked non-exact. Conflicting field observations remain visible rather than being silently overwritten.

### Buying-group gap plan

The control tower classifies available contact titles into economic buyer, champion/marketing owner, operational owner, technical evaluator and daily user groups. It reports missing groups per account and suggests the next owner-controlled research step.

### Explainable lookalikes

`POST /api/leadgen/lookalikes` compares owner-selected seed accounts with local candidates using explicit features: industry, geography, technology, tags, observed issue and approximate company-size bucket. Every match returns the features that contributed to similarity. Suppressed and already-owned records remain excluded from an eligible recommendation.

### Provider preflight

`POST /api/leadgen/provider-preflight` reports:

- requested fields and provider routes;
- local fallback availability;
- configured versus not-configured BYOK providers;
- best-case and worst-case attempts;
- owner caps and blocking reasons;
- an explicit unknown-cost statement until a provider tariff/credit schedule is supplied.

`safeToRun` is false when the plan depends on unconfigured external providers or exceeds the owner attempt cap. The endpoint itself always reports zero provider calls and zero external effects.

## API and UI surfaces

| Surface | Purpose |
|---|---|
| `GET /api/leadgen/control-tower` | Combined coverage, quality, buying-group and preflight state |
| `GET /api/leadgen/target-profiles` | Saved owner target profiles |
| `POST /api/leadgen/target-profiles` | Save a target profile |
| `POST /api/leadgen/lookalikes` | Plan local, explainable lookalikes from selected seeds |
| `POST /api/leadgen/field-ledger` | Inspect provenance and conflicts |
| `POST /api/leadgen/provider-preflight` | Estimate provider attempt exposure without calling providers |
| Lead Intelligence UI | Target profile form, coverage metrics, bottlenecks, buying-group gaps, field quality, lookalike plan and provider preflight |

## Honest comparison after the upgrade

UberBond still does not own the commodity data-plane advantages of Apollo, Instantly, Clay, ZoomInfo, Cognism, 6sense, Common Room or HubSpot. It does not have their contact volume, proprietary intent networks, visitor identity graphs, provider marketplace, warmup infrastructure or autonomous external action.

UberBond is stronger for the specific owner-controlled job when the success definition is:

`source-backed opportunity → qualified account → exact contact authority → reviewable route → governed outreach plan → cleared payment → repeatable service`

The defensible advantage is the control tower that joins these states and refuses to conceal missing evidence, stale fields, conflicts, suppression history or incomplete buying-group coverage.

## Verification contract

- Focused lead and operations suite: 31 tests passed, 0 failed.
- Lead Intelligence V3 suite: 8 tests passed, 0 failed.
- Server and client syntax checks passed.
- HTTP smoke passed for control tower, target-profile save, provider preflight, V3 intake/queue/enrichment and static assets.
- Local smoke used a temporary JSON store.
- Provider calls: `0`.
- External effects: `0`.
- The edited Innovate By Day email remains unchanged, prior-contact protected and unsent.
