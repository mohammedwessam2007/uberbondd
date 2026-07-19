# Automatic Discovery

UberBond discovers public business records through OpenStreetMap Overpass. The provider-independent pipeline remains dry-run by default and live outbound remains a separate, disabled safety boundary.

## Campaign-driven batches

Validated campaigns provide `discoveryCategories`, `countries`, `cities`, `boundingBoxes`, and `dailyDiscoveryCap`. Bounding boxes are processed as small resumable batches. The country and city at a given array index describe the box at the same index; a single country or city value is reused for every box.

The bundled disabled demonstration campaign includes city boxes for UAE, Saudi Arabia, Qatar, Kuwait, the UK, and Australia. Supported selectors cover clinics, dentists, medical businesses, dermatology, cosmetic and fertility clinics, healthcare agencies, professional-services agencies, and selected OSM-tagged B2B companies.

## Data gate

A record is imported only when it has:

1. A public business name and valid OSM element identity.
2. A finite public location from the element or its center.
3. A website stored in `contact:website`, `website`, `url`, or `contact:url`.
4. A syntactically valid public HTTP or HTTPS business domain.
5. A domain that is not UberBond-owned, internal, reserved, a social/directory host, known parking infrastructure, or already stored.

The normalized domain, campaign-domain key, source-record key, discovery timestamp, location, provider, source URL, ODbL licence reference, and attribution are stored with every accepted prospect. Content-based parking detection remains part of the subsequent crawl qualification stage; the discovery gate rejects known parking infrastructure without pre-crawling every website.

## Dry-run first

Dry runs call Overpass and save a maximum 20-record preview plus safe rejection counts, but import and queue nothing. Disabling discovery dry-run requires an explicit JSON `false` at the API boundary or `DISCOVERY_DRY_RUN=false` in worker configuration. This setting does not enable email sending.

## Resumption and capacity

After a successful import and crawl-queue reservation, the worker stores the next bounding-box index in `discoveryCursor:<campaignId>`. A retry can safely revisit a box: normalized-domain, campaign-domain, and source-record checks make import idempotent, while the crawl job has a deterministic per-campaign/day/batch key.

PostgreSQL and JSON stores reserve capacity atomically against both:

- the system `DISCOVERY_DAILY_CAP`, limited to 100; and
- the campaign `dailyDiscoveryCap`, also limited to 100.

Discovery, audit, and draft capacity never imply live-send capacity. Email caps and approval gates are separate.

## Bounding boxes

Use `[south, west, north, east]` in campaign JSON or four comma-separated values for a manual override. Each box must be city-sized and no wider than `DISCOVERY_MAX_BBOX_SPAN` degrees per side.

## Scheduled mode

Scheduled discovery runs only when `AUTOPILOT_ENABLED=true` and `DISCOVERY_ENABLED=true`. If `DISCOVERY_CAMPAIGN_ID` is empty, the scheduler selects enabled campaigns with positive discovery capacity, categories, and bounding boxes. `DISCOVERY_BATCHES_PER_RUN` controls bounded progress and `DISCOVERY_MAX_CAMPAIGNS_PER_RUN` limits each scheduler pass.

Every stored prospect is queued through the existing durable `research.batch` path using explicit prospect IDs. Browser crawling does not run in Vercel serverless handlers.

## Export

The authenticated admin CSV export includes campaign, normalized domain, location, source provider, source URL, source record ID, licence, attribution, and discovery timestamp. The JSON export preserves the full stored records and discovery run history is available from `/api/discovery-runs`.

## Safety boundaries

This adapter does not scrape Google Maps, LinkedIn, Instagram, personal social accounts, purchased lists, or protected marketplaces. It does not bypass CAPTCHAs or access private data. Configure UberBond-owned domains in `DISCOVERY_EXCLUDED_DOMAINS`; the working Lite domain is excluded by default.
