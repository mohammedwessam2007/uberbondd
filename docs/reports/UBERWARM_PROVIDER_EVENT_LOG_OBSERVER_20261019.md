# UberWarm read-only provider event-delivery observation

Source: `src/uberwarm2-provider-event-log-observer.mjs`, used by the existing `uberwarm2-live-read-doctor` on the existing Railway read-only five-minute cron.

- Reads existing Winnr webhook endpoint inventory via authenticated **GET**. It never creates a webhook, sends a test event, redelivers a message, enables/disables an endpoint, or purchases anything.
- Rotates one endpoint per five-minute tick. An endpoint's last 25 delivery attempts are observed via authenticated **GET**. No account tokens, endpoint IDs, recipient addresses, event bodies, raw error strings, or private payloads enter the operational PostgreSQL journal.
- Reports bounded delivery **attempt** counts for `email.bounced`, `email.complained`, failed attempts, and existing disabled endpoints. Duplicate deliveries may exist; an attempt is not asserted to be one distinct bounce. A bounded page with zero observed attempts never proves zero historical complaints or bounces, nor absence of messages in other endpoints or times.
- Reports whether its source inventory/delivery GET succeeded; missing, truncated or contradictory information is held as unknown. This is **vendor-reported delivery-log metadata**, not independently verified original event signatures. Its adverse signals require human/operator follow-up, but they cannot clear holds, unsuppress recipients, authorize an outgoing message, or enable recurring sending.
- The existing observer's `sendAuthority=NONE` and the PostgreSQL single-message claim chain are unchanged; all 53 sender rows remain blocked absent independently verified permission. This feature is an operational visibility addition, **not** deliverability proof, placement proof or actual sending.
- Winnr public documentation, verified 2026-10-19: https://winnr.app/help/api-mcp/webhooks.html (maximum ten existing webhook endpoints, delivery-attempt log, event types and signatures). Do not equate a GET delivery log with authenticated receipt of the original signed webhook raw bytes.

Acceptance: new hostile tests, all `tests/uberwarm2-*.test.mjs`, reachability/canon freshness, exact-head CI and authenticated Railway live readback. Any positive live provider-event claim must be taken from the actual postdeploy operational receipt, not inferred from passing tests.
