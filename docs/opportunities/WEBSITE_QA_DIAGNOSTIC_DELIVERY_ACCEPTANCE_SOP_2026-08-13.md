# Website QA & Release-Readiness Diagnostic — delivery and acceptance SOP

Status: `INTERNAL / OWNER-REVIEWED PROCEDURE`  
Applies to: `offer-website-qa-release-readiness-diagnostic-usd250-v1`  
Default price: **USD 250 fixed**

This procedure turns the frozen offer into a repeatable, evidence-bound delivery. It does not authorize outreach, payment collection, form submission, credentials, or production changes.

## State sequence

```text
OWNER_REVIEW
  → PAYMENT_PENDING
  → INTAKE_PENDING
  → SCOPE_LOCKED
  → TESTING
  → REPORT_DRAFT
  → DELIVERED
  → ACCEPTED
```

Allowed side states are `PAUSED`, `CANCELLED`, `CORRECTION_REQUESTED`, and `DISPUTED`. Do not move to `TESTING` until payment is cleared and the scope is locked.

## 0. Owner and commercial preflight

Before accepting an order, confirm and record:

- the owner approved the exact USD 250 offer and buyer route;
- B2B/legal/payment ability is evidenced for the operating context;
- the buyer is the intended website owner, agency, or delivery lead;
- the payment method and receipt record are available;
- the offer contract, exclusions, acceptance window, and correction boundary were shown to the buyer;
- the work is not being substituted for the blocked Innovate By Day application or any prior-contact route.

If any item is unknown, keep the order in `OWNER_REVIEW` or `PAUSED`.

## 1. Payment gate

Collect or verify payment through an owner-approved payment route. Record:

| Field | Required value |
|---|---|
| Offer ID | `offer-website-qa-release-readiness-diagnostic-usd250-v1` |
| Amount | `USD 250` |
| Payment status | `CLEARED` only after a receipt-backed observation |
| Receipt reference | Provider receipt or owner-entered evidence reference |
| Cleared at | UTC timestamp |
| Buyer | Organization and authorized contact as supplied by the buyer |

An invoice, promise, screenshot without verification, or “payment sent” message is not a cleared payment. Do not begin fulfilment while payment is unresolved.

## 2. Intake and scope lock

Collect only the minimum needed to test the agreed public journeys:

- organization and buyer contact;
- up to three public website URLs;
- priority journeys and the desired release/handoff context;
- target desktop/mobile viewports if the buyer has a required matrix;
- any known safe test account or test address, only when required and explicitly authorized;
- prohibited actions and named environments;
- delivery recipient and preferred HTML/PDF format.

Normalize and record the canonical URLs. Confirm that the URLs are public and unauthenticated. Write the final URL/journey list into the order record and obtain buyer confirmation. New URLs, private areas, credentials, implementation, and retesting require a new scope before work.

## 3. Test safely

For every observation, record UTC time, URL, viewport, browser/device context, preconditions, action, expected behavior, observed behavior, severity rationale, and evidence reference.

Use the following operating boundaries:

- test only the public surfaces named in the scope;
- use benign navigation, layout, keyboard, button, form-validation, and visible user-flow checks;
- do not log in, access admin areas, expose private data, purchase, pay, delete, change settings, or submit a real form without explicit written authorization and a safe test identity;
- stop when a page redirects to a private system, requests credentials, exposes personal data, or presents an ambiguous/destructive action;
- redact personal data and retain only the evidence needed to support the finding;
- do not infer conversion, revenue, security, legal, clinical, or compliance outcomes from a visible defect.

### Severity guide

| Severity | Use when | Example |
|---|---|---|
| P0 Critical | The primary public journey is broadly unavailable or the test reaches an unsafe/destructive effect | The agreed public entry point cannot load at all |
| P1 High | A priority journey is materially blocked, misdirected, or left without a reliable state | A contact journey gives no durable result after an allowed fixture check |
| P2 Medium | The issue degrades clarity, accessibility, trust, or completion likelihood without fully blocking the journey | Mobile CTA or focus behavior becomes difficult at a supported width |
| P3 Low | The issue is local polish or consistency with limited journey impact | Template spacing differs between adjacent pages |

Severity is a review classification, not a legal, security, accessibility, or revenue conclusion.

## 4. Build the report

The report must contain:

1. report ID, buyer, scope, observation window, and environment;
2. a plain-language executive snapshot;
3. the tested pages, journeys, viewports, and exclusions;
4. one finding record per issue with reproduction, expected/observed behavior, severity, evidence, repair guidance, and suggested retest;
5. a prioritized repair queue suitable for a developer or delivery lead;
6. limitations that state what was not tested and what cannot be inferred;
7. a delivery timestamp and the acceptance/correction instructions.

Before delivery, check every claim against the evidence ledger. Remove client-result language, guarantees, invented counts, unsupported browser claims, and any evidence that contains unnecessary personal data.

## 5. Deliver and record

Send or upload the report only through the owner-approved route after the delivery package is complete. The package should contain the report, any redacted evidence references, and the repair queue. Record:

- delivery time in UTC;
- exact file digests where files are used;
- recipient route and owner authorization;
- scope and payment references;
- `DELIVERED` state.

The fictional demonstration report is a sample attachment only. It must remain visibly labeled `FICTIONAL DEMONSTRATION — NOT CUSTOMER WORK`.

## 6. Acceptance and correction

The buyer has two business days to accept or identify a factual omission against the locked scope. Classify the response:

| Buyer response | State | Action |
|---|---|---|
| Explicit acceptance | `ACCEPTED` | Record acceptance and close the diagnostic |
| No response after the stated window | `ACCEPTED_BY_WINDOW` only if the owner contract permits it | Record the window and do not invent a testimonial or outcome |
| Factual omission or inaccurate report field | `CORRECTION_REQUESTED` | Make one in-scope correction and redeliver with a new digest |
| New site, journey, implementation, or retest request | `SCOPE_CHANGE` | Quote and authorize separately before work |
| Disagreement with a finding or finding count | `DISPUTED` | Preserve the evidence; do not rewrite a supported observation just to obtain acceptance |

Acceptance means the contracted report was received and reviewed. It does not mean the website is defect-free, accessible, secure, compliant, high-converting, or revenue-producing.

## 7. Close and learn

At closure, record only receipt-backed facts:

- payment cleared;
- report delivered;
- accepted, corrected, disputed, or cancelled;
- delivery effort and timebox;
- refund or dispute decision, if any;
- buyer permission for any future reference, if explicitly provided.

Do not create a testimonial, case study, conversion claim, or recurring-service upsell from silence. Pause after the first paid diagnostic and review the experiment before adding volume or scope.

## Stop conditions

Immediately move to `PAUSED` or `CANCELLED` when permission, payment, identity, scope, safety, evidence, or delivery feasibility becomes uncertain. Specifically stop for:

- unresolved payment, B2B, or owner authorization;
- credentials, private data, or production access requested without explicit safe authorization;
- destructive, financial, or real-submission action;
- ambiguous test permission or a request to conceal limitations;
- unsupported claims or fabricated results;
- a timebox that cannot be met without silently reducing the agreed scope.

Never blind-retry an external action after an uncertain result. Preserve the record and reconcile through the existing V9 governance path.
