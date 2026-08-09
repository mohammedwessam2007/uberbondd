# OMNIA V9 Real Operational Sample Plan

## Current state, reported honestly

`REAL_OPERATIONAL = 0` in this environment, exactly as every prior mission (reality-shadow, zero-consequence canary) has reported. This mission did not change that, and this document does not hide it. As found and re-confirmed in [`V9_ZERO_CONSEQUENCE_CANARY_REPORT.md`](./V9_ZERO_CONSEQUENCE_CANARY_REPORT.md):

- `data/db.sample.json` is an empty schema skeleton.
- `sample-prospects.csv` has exactly one row, explicitly labeled `"Replace with a real target"` -- a template placeholder, never populated, referenced nowhere in the codebase.

## Why this mission does not manufacture data to fill that gap

Building a dataset by browsing and recording real organizations' identities for a security-sensitive execution/authority canary risks being indistinguishable from assembling a targeting list for future real outreach -- exactly what this mission's own prohibitions guard against ("do not contact anyone," "do not use production credentials," "do not enable live outbound"). Given a genuinely empty operational dataset and no in-scope way to safely acquire real public input inside this mission's boundaries, the honest and conservative choice, repeated from prior missions, is to report zero rather than acquire data whose provenance and reuse risk cannot be fully controlled.

## The smallest lawful path to 25-50 real operational shadow candidates, without sending anything

This section designs the path; it does not execute it. Every step below is a **read-only, non-contacting, design-time** data-acquisition decision that a human (not this mission) would need to explicitly authorize before any of it runs.

1. **Source: already-existing project research artifacts.** If UberBond's own prior campaign research (not scraped fresh, not purchased) already contains a list of real, public business identities considered as prospects -- names, public website URLs, publicly listed business contact addresses -- that existing artifact is the only in-scope source this plan considers. This mission found none in the repository (`sample-prospects.csv` is a placeholder, `data/db.sample.json` is empty); if such an artifact exists outside this repository, a human would need to identify and provide it explicitly.
2. **Source: public business directories, read-only, minimal fields.** If no existing artifact exists, the next smallest lawful step is fetching a small number (25-50) of already-public business listings from a source that explicitly permits automated read access (e.g. an API with published terms allowing this use, not a scrape of a site whose terms prohibit it) -- recording only what is already publicly displayed (business name, public website, public general-inquiry contact address), never inferring private information, never recording anything about the individual humans behind a business.
3. **What gets recorded, and what does not.** For each of the 25-50 candidates: a stable identifier (e.g. a hash of the public business name + domain), the public business name, the public website URL, the public general-inquiry contact address if displayed, and nothing else. No personal names, no phone numbers unless already publicly listed as the business's own general line, no inferred demographic or firmographic data beyond what the business itself publishes.
4. **What never happens under this plan.** No email is sent to any of these 25-50 candidates by this plan. No candidate is contacted, called, or messaged. The dataset exists purely to give the zero-consequence canary and this mission's own null-sink-based execution protocol a `REAL_PUBLIC_INPUT`-labeled sample to exercise *its decision and execution-tracking logic* against -- never to exercise a real send.
5. **Labeling discipline.** Every candidate acquired this way is labeled `REAL_PUBLIC_INPUT`, never `SYNTHETIC`, and never silently relabeled. If step 2's directory access cannot be confirmed to comply with the source's own terms of service, that source is not used, and the dataset stays at whatever smaller number (possibly zero) can be lawfully acquired -- the honest number is always preferred over an artificially inflated one.

## Why this remains a plan, not an action, in this mission

Section 32's own instruction: "Design only if data acquisition requires external actions not permitted in this mission." Both candidate sources above (an existing project artifact this mission did not find, and a live directory fetch this mission did not attempt) require either information this mission does not have access to, or an external network action beyond what "do not contact anyone" and this mission's read-only research posture permit. This document therefore stops at the design boundary, exactly as instructed.
