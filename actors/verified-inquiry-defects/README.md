# Verified Inquiry-Path Defects

**Pay only for findings that re-verify at delivery.**

Give this Actor a list of business websites, for example from a Google Maps scraper run. It returns contact-path defects you can show the business owner, each with a 30-second way to check it on their own phone.

| Defect | What it means for the business |
|---|---|
| Call button dials the wrong number | The button shows one number and dials another, confirmed in a real browser after call-tracking scripts run. Callers reach the wrong line. |
| Business schema discarded | The LocalBusiness structured data is invalid JSON, so Google and AI assistants ignore its name, phone, address and hours. The exact one-line fix is included. |
| Form posts nowhere | An inquiry form submits to a hostname that no longer exists. |

## How the pricing works

- Every finding is checked twice: once when discovered, and again by an independent probe when delivered.
- You pay one `verified-finding` event only for findings that reproduce the second time.
- Questions the engine cannot assert, unreproducible findings, and sites behind bot challenges are never charged.
- The same finding is never charged twice to you on the same day, even across runs that overlap. Each charge first reserves that finding in a shared billing ledger. If the ledger is unavailable, the run stops before checking any site and charges nothing.
- Your run's spending limit is checked before each chargeable finding is delivered. When it is reached, the run stops delivering chargeable findings.

## What the billing fields mean

Each result row has a `billing.status` showing what was known when the row was written:

- `PENDING_PROVIDER_CONFIRMATION`: a charge was attempted after the row was delivered.
- `NOT_CHARGED`: the row is free. `billing.reason` says why, for example `ALREADY_CHARGED_TODAY`.

A row never says it was paid. The final outcome of every charge is in the run's `SALE_RECEIPT` record:

- `CONFIRMED`: Apify accepted the charge.
- `REFUSED`: nothing was billed.
- `UNKNOWN`: Apify gave no reliable answer. The finding is never charged again, and the run stops charging.

## Limits of the evidence

- The Actor reads public pages only, respects robots.txt, and never submits forms or contacts anyone.
- A finding describes the page at the time it was checked.
- It is not a test call, and it is not proof of lost revenue.
