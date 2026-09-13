# Domain and Mailbox Readiness

This file records mailbox/runtime readiness only. Asset-existence truth lives in `docs/EXTERNAL_ASSET_REALITY.md`.

## Canonical domain facts

- `uberbond.agency` is already an owned UberBond outreach root.
- `uberbond.cloud` is already an owned UberBond outreach root.
- Domain acquisition is complete and must not be resurfaced as an unresolved founder action.
- Both roots are outreach identities, not website roots.

## Runtime readiness boundary

Domain ownership is separate from mail-runtime readiness. The following must still be derived from actual provider/runtime evidence when queried: provider registration, mailbox authentication, MX/SPF/DKIM/DMARC alignment, warm-up state, sender health, and delivery evidence.

UberBond already contains the domain/mailbox registries, DNS verifier, warm-up orchestration, circuit breakers, provider adapter contract, activation gate, control center, UberDoso control-plane work, and hostile tests for these paths. Future agents should continue from the narrowest missing runtime/evidence layer rather than re-opening domain acquisition.

## PayPal clarification

PayPal is already an implemented UberBond payment path. A missing LIVE settlement/recovery receipt must be described as that exact reality cut, not as 'no payment provider'. Sandbox or configured access is not a LIVE settlement observation.

## Secret-storage guarantee

Sending-domain/mailbox state continues to reject secret-shaped fields from durable receipts. Credentials belong only in protected runtime secret channels and must never be persisted in source, task payloads, audit receipts, or chat.
