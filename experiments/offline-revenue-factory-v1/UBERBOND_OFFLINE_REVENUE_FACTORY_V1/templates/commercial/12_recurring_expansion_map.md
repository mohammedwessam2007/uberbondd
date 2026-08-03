# Recurring / expansion map — [LANE]

How a one-off delivery could become a recurring or multi-lane
engagement, if and only if the buyer wants that — this system does
not initiate, suggest to, or contact the buyer about upsells on its
own; this is an internal planning document.

## Recurring within the same lane
| Lane | Natural cadence driver | Why |
|---|---|---|
| msft_csp | Per-incident, as outages occur | Each incident is a discrete evidence-desk run; no fixed calendar cadence. |
| hospital_mrf | Re-run when `last_updated_on` approaches the 365-day staleness threshold, or after any known MRF republish | Staleness finding will flag automatically once the threshold is crossed. |
| agency_rfp | Per-RFP, plus a re-run on every amendment | Amendment reconciliation is already built (`_process_amendment`); each new amendment is a natural re-engagement trigger. |
| accessibility | Re-run when `scanned_at` approaches the 90-day staleness threshold, or after a site redesign | Staleness finding will flag automatically once the threshold is crossed. |
| lead_path | Re-run after any funnel/form change, or periodically to re-check drop-off against a fresh visit log | No staleness threshold is built in for this lane; cadence is buyer-driven. |

## Expansion to other lanes
A buyer engaged on one lane may have a real need in another (e.g. an
agency running `agency_rfp` engagements may also want `accessibility`
evidence packs for the same government buyers). Do not pitch this
without evidence the buyer actually has that need — use
`10_buyer_partner_qualification.md` for the new lane before quoting.

## What does NOT change with recurrence
- Every mandatory disclaimer, exclusion, and QA gate applies identically to run #1 and run #100. Recurrence never earns a shortcut past QA, claim-safety, or human-review requirements.
- Pricing for a recurring engagement should reference `11_pricing_hypothesis_worksheet.md` with updated (increasingly observed, less assumed) inputs, not simply extrapolate run #1's price.
