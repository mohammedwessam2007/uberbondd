# Halfteck supplier release-evidence worksheet — independent draft

Public service source retrieved 3 October 2026: https://www.halfteck.com/services.html . The company describes generative-AI evaluation/integration, software APIs and workflow automation, automated testing and managed operations. These are company descriptions, not an independent audit of a deployed agent or evidence of defects.

Offer fit: AI Agent Production Release Gate. Supplier overview must use a subject containing Suppliers, as required by https://www.halfteck.com/contact.html .

| Release boundary | Bounded acceptance case | Evidence to retain |
|---|---|---|
| Evaluation to deployment | Candidate passes aggregate evaluation but fails a critical tool-action holdout | Per-case results, critical-case refusal and exact model/tool revision |
| API permission | Workflow receives wrong-tenant or insufficient-scope credentials | Tenant binding and closed refusal; no automatic permission expansion |
| Evidence integrity | Retrieved document contains instructions to take external actions | Source treated as evidence, not authority; source reference retained |
| Retry after timeout | An API write may have succeeded before acknowledgment | Reconcile operation identity before retry; one durable effect receipt |
| Managed change | Model, integration or routing changes after approval | Invalidate old acceptance; re-evaluate changed participants |
| Human acceptance | Delivery pack contains uncertain assumptions | Visible unknowns, reviewer decision and exact accepted scope |

This worksheet defines an independent supplier artifact: a small critical-case evaluation pack, acceptance matrix and release receipt. It does not claim Halfteck lacks these controls, has failed them, lost revenue, or requested this exact worksheet. No application was tested and no message was sent.
