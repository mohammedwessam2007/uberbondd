# Social automation boundary

Signal automates public website research, email operations, reply handling, analytics, and the creation of social tasks.

It does not:

- scrape logged-in LinkedIn, Instagram, Threads, or X sessions;
- bypass CAPTCHAs, rate limits, or platform controls;
- send unsolicited automated social DMs;
- automate LinkedIn connections, profile views, comments, or likes;
- impersonate employees or rotate burner accounts.

Permitted extensions may use official APIs to publish the operator's own content, retrieve replies to the operator's content, or respond to users who initiated or explicitly opted into the interaction. Review the current platform terms before enabling any adapter.

## Mission 3 unattended outbound boundaries

Automatic email sending is fail-closed. It requires all of the following at the same time:

- `OUTBOUND_ENABLED=true` and `OUTBOUND_DRY_RUN=false`.
- A system country allowlist and a matching campaign country allowlist.
- A valid postal business address and signed unsubscribe links.
- A contact email published on the company website or positively verified as `valid` by the configured verifier.
- The contact domain must match the prospect website domain. Free-mail and risky system mailboxes are rejected.
- A high-confidence, same-domain evidence finding above the campaign score threshold.
- A resolvable recipient time zone and weekday business hours.
- An authenticated, healthy sender account with capacity remaining.
- A durable idempotency reservation before Gmail dispatch.

Unknown provider outcomes are marked `uncertain` and are never retried automatically. One complaint, two hard bounces in a day, or three uncertain sends pauses the sender by default. The global outbound emergency stop is independent from the worker pause.
