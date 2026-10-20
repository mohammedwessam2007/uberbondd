# Canonical ingress reconciliation — 2026-10-20

## Independently observed live facts

- Refreshed main: f4f95d566987d443d169905a122a0cd44e1175b5.
- Supabase receiver version 4 deployed from that exact merged source. Independent deployed-file readback matched; HTTP200 health includes adverseEventCount=0. Unsigned POST HTTP401. Private SQL: one genuine provider test.ping, zero adverse events, zero ingress suppressions. No real bounce/complaint proved.
- Vercel webhook and unsubscribe URLs HTTP402 DEPLOYMENT_DISABLED. READY metadata does not mean serving.
- Authenticated Winnr read: existing webhook c9a55j1XPPu86ioRR0zv disabled, zero failures. Exact mailbox connect@uberbond.site active, provider daily_send_limit=50; no sender-specific no-hold field observed.
- Restored Railway SSH using existing registered task identity. Read-only psql against the operational service database railway returned exactly uberwarm2_operational_receipts, uberwarm2_receiver_bindings, uberwarm2_seed_probe_claims. **No public.suppressions or public.winnr_webhook_events table.**
- Therefore source comments describing an existing canonical stop list on Railway are architectural intent, not live table-presence proof. Restored historical logical databases are isolated rehearsals, not authorized production cutovers.

## Bounded source addition

reconcileCanonicalIngress requires a complete fresh snapshot from an authenticated private-ledger reader, exact pinned ingress source, valid adverse event IDs/types/recipient digests and explicit expected database identity. A health count alone is rejected. Before any suppression write it independently queries database identity, primary state and both existing canonical tables. It never creates a new empty stop list.

Every bounded batch uses one PostgreSQL transaction: immutable event identities, append-only canonical suppressions, readback, then commit. Replay repairs a missing suppression; conflicting identity aborts. Earlier opt-out reasons are preserved. Output has no recipient or credential and grants no outbound authority.

The module has no credential, networking, scheduler, provider mutation or schema-creation path. It is deliberately not wired to the public health endpoint. A sanctioned authenticated private snapshot adapter and verified canonical database remain required before live reconciliation.

## Remaining external boundaries

No raw database credentials were moved across providers and the earlier protected-transfer denial was not retried. No billing changes, paid warming, webhook enablement, sender clearance, email submission or customer payment occurred. Runtime wiring must not substitute an aggregate-only health response, silently create a blank canonical store, or mark a historical rehearsal current. Diagnostic authorization must be current and exact when all safety gates are actually satisfied.
