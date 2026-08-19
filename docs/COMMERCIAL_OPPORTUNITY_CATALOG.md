# Commercial Opportunity Catalog

This catalog turns the three highest-ranked opportunities from the dated Business Model Radar into reviewable UberBond preparation contracts.

## Truth boundary

The catalog records public buyer-signal evidence and explicit hypotheses. It does not claim a worldwide census, a customer, a payment, a live provider integration, or proven profitability.

Every lane compiles to local preparation only. Provider calls, external messages, purchases, ad spend, deployments, credential changes, and production mutations remain disabled. The primary economic metric is CLEARED_PAYMENT, and payment status remains EXTERNAL_PROOF_REQUIRED until a real payment provider receipt exists.

## Included lanes

1. paid-media-revenue-assurance — paid media and conversion-tracking audit for agencies, operators, and local businesses.
2. ai-automation-reliability-pilot — bounded workflow automation reliability pilot for SMB and agency operators.
3. conversational-funnel-reliability-audit — audit and repair plan for chat-based lead and booking funnels.

## Runtime integration

The catalog is exposed through two local job handlers:

- prometheus.commercial.catalog compiles and logs all three lanes.
- prometheus.commercial.opportunity.prepare compiles one named lane.

The all-lane handler is scheduled only behind the existing cfg.autopilot and cfg.prometheus.schedulingEnabled gates, at most once per day. It does not enqueue external work.

## Evidence labels

- BUYER_SIGNAL means a public request or official documentation indicates a problem or workflow, not that UberBond has a customer.
- HYPOTHESIS marks pricing, recurrence, margin, and conversion assumptions that require testing.
- ESTIMATE marks test cost and time-to-cash ranges that are planning assumptions.
- EXTERNAL_PROOF_REQUIRED marks payment, customer, live access, revenue, and platform outcomes that cannot be proven locally.

## Next step

Use the compiled packets to prepare three small owner-reviewed experiments. Do not send, spend, deploy, or contact anyone until exact authority, route, payload, identity, time, and budget bounds are separately approved and all existing V9 and deliverability gates pass.
