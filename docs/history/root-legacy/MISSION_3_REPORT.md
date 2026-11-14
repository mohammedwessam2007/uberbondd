# Mission 3 Report: Unattended Send Safety Gate

## Objective

Upgrade the approved Version 1.3 durable system so it can reserve and send personalized outreach unattended only after strict contact, evidence, policy, timing, capacity, idempotency, unsubscribe, and sender-health checks.

## Delivered

### Database

Migration `004_unattended_send_safety.sql` adds:

- durable outbound reservations with a unique message-step idempotency key
- sender-health state and pause fields
- outbound operational events
- indexes for capacity and status queries

### Send policy

`src/send-safety.mjs` implements:

- system and campaign country allowlists
- country and timezone normalization
- local business-hour enforcement
- first-party-published or positively verified contact acceptance
- rejection of free-mail, risky-role, catch-all, unknown, unverified, mismatch, and suppressed contacts
- evidence, confidence, same-domain, and score gates
- durable logical message-step keys
- bounce, complaint, and automatic-response classification

### Reservation and provider safety

The Store now transactionally:

- checks global and sender pauses
- reserves hourly and daily capacity
- enforces minimum sender spacing
- rejects duplicate idempotency keys
- records state before provider dispatch
- tracks success, dry run, failure, and uncertainty

The pipeline marks a reservation as dispatching before Gmail is called. An ambiguous result becomes `uncertain` and is not retried automatically.

### Unsubscribe and suppression

- signed expiring unsubscribe tokens
- public unsubscribe GET and POST flow
- body unsubscribe URL
- RFC `List-Unsubscribe`
- RFC one-click unsubscribe header
- immediate suppression for unsubscribe and negative responses

### Sender health

- hard-bounce and complaint counters
- configurable automatic sender pause thresholds
- sender-specific pause and resume
- global outbound pause and resume
- admin visibility for sender health and outbound events

### Operations

- outbound queue processor
- scheduled outbound processing
- separate worker and outbound pause controls
- campaign allowed-country input
- status visibility for uncertainty, bounce, complaint, and suppression
- production fail-closed validation for identity, allowlist, OAuth, encryption, unsubscribe secret, and business hours

## Verification

- 51 automated tests passed
- 33 discovery adversarial probes passed
- 22 outbound adversarial probes passed
- audit/revenue smoke passed
- discovery smoke passed
- PostgreSQL smoke passed
- PostgreSQL application smoke passed
- durable queue smoke passed
- separate Web/Worker smoke passed
- outbound safety smoke passed and was repeated independently
- desktop and mobile visual QA passed
- production dependency audit reported 0 vulnerabilities

## External items not tested

- real Gmail provider delivery
- real inbox-provider one-click unsubscribe behavior
- real bounce and complaint feedback
- live SPF, DKIM, and DMARC configuration
- live payment provider
- deployed Web and Worker infrastructure
- legal suitability of any chosen jurisdiction or campaign

## Approval

Approved as the canonical Mission 3 engineering baseline for staged deployment with `OUTBOUND_ENABLED=false` and `OUTBOUND_DRY_RUN=true`.
