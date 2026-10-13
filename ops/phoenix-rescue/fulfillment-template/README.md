# Unprovisioned fulfillment template
No customer folder or customer data exists here. On a real authorized order, instantiate a PRIVATE folder keyed to the canonical order ID:
00-intake-and-permissions;01-scope-and-payment-evidence;02-site-1-evidence;03-site-2-evidence;04-site-3-evidence;05-reproducibility-and-QA;06-white-label-delivery;07-client-acceptance;08-retest;09-reconciliation.
Do not commit client data/screenshots/credentials to public GitHub. Use authorized private storage and approved retention.
Reuse canonical Evidence Kernel/Proof Factory/order/payment/acceptance IDs; do not create a parallel customer truth store.
Gate order: client acceptance and actual account collection readiness -> canonical payment/delivery authorization -> permitted tests -> QA -> delivery -> client-origin acceptance -> retest/reconciliation.
No external message, financial obligation, invoice issue, charge or provider mutation is created by this template.
