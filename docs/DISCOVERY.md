# Automatic Discovery

UberBond Revenue Engine 1.1 can discover public business records through the OpenStreetMap Overpass API.

## Data gate

A record is accepted only when it has:

1. A public business name.
2. A website stored in `contact:website`, `website`, `url`, or `contact:url`.
3. A valid HTTP or HTTPS website.
4. A domain not already present in the prospect vault.

Records without websites are discarded before they reach the audit queue.

## Dry-run first

Every new city/category combination should begin as a dry run. Dry runs save a preview in the discovery log but import nothing.

## Bounding box

Use four comma-separated values:

```text
south,west,north,east
```

Keep the box city-sized. The application rejects boxes wider than `DISCOVERY_MAX_BBOX_SPAN` degrees per side.

## Scheduled mode

Scheduled discovery runs only when both `AUTOPILOT_ENABLED=true` and `DISCOVERY_ENABLED=true`.

It also requires:

- an approved campaign ID,
- a configured bounding box,
- at least one supported category,
- and daily capacity remaining.

## Attribution

Every imported record stores:

- the OSM element type and ID,
- a direct OpenStreetMap source URL,
- coordinates when present,
- the website tag used,
- and `© OpenStreetMap contributors` attribution.

## Safety boundaries

This adapter does not scrape Google Maps, LinkedIn, Instagram, or protected marketplaces. It does not bypass CAPTCHAs or access private data.
