# UberBond MailHub provider-adapter layer

Status: implemented in the integration branch; no provider credential is configured and no external call, purchase, DNS mutation, mailbox creation, warm-up purchase or outbound message was performed by this work.

## What is now owned by UberBond

`src/provider-http-adapters.mjs` implements tested, provider-neutral HTTP adapters for the documented infrastructure surfaces of:

- Icemail (`icemail`)
- Mailforge (`mailforge`)

`src/mailhub-control-plane.mjs` composes those adapters with the existing domain registry, mailbox registry, DNS verification, warm-up orchestration, circuit breakers and deliverability gate.

The layer provides:

- authenticated, bounded provider reads;
- workspace/domain/mailbox inventory;
- domain-availability checks;
- provider DNS snapshots;
- mailbox health and provider-reported capacity observations;
- provisioning plans;
- approval-scoped domain/mailbox mutations;
- idempotency keys for every mutation;
- no-blind-retry recovery classification;
- provider payload minimization;
- credential retrieval blocking;
- infrastructure webhook normalization, quarantine and replay identity;
- monotonic out-of-order event folding;
- deterministic ready-sender ranking.

## What remains external

UberBond does not manufacture:

- Google Workspace or Microsoft 365 accounts;
- domains, DNS authority, provider billing credits or KYC;
- warm-up network participants;
- IP/domain reputation or inbox placement;
- provider permission to send a specific campaign;
- lawful consent or customer demand.

Those remain provider- and reality-level evidence. A provider API response is an infrastructure receipt, not revenue, customer acceptance or a deliverability guarantee.

## External-effect boundary

All provider mutations require:

1. an exact provider/capability scope;
2. an unexpired owner approval;
3. a durable idempotency key;
4. an optional approved spend ceiling when a cost estimate exists.

A timeout or server error after a mutation is `EXTERNAL_OUTCOME_UNKNOWN`; the adapter never retries it blindly. The caller must reconcile provider state by returned resource identifiers before deciding whether another operation is safe.

Mailbox credentials are never returned through the adapter and secret-shaped request fields are rejected. The existing V9, suppression, evidence, reservation and final-send boundaries remain authoritative.

## Provider-specific scope

Icemail's documented API exposes workspaces, domains, DNS records, mailboxes, pre-warm, exports and webhooks. The adapter supports those documented routes, but pre-warm purchases and exports remain approval-gated and provider-payload-driven. UberBond does not guess a billable request body.

Mailforge's documented public API exposes workspaces, domain availability, domains, DNS, mailboxes and forwarding. Its public API guide describes warm-up as a separate Warmforge/Salesforge concern; therefore the Mailforge adapter reports that warm-up is a separate provider dependency rather than pretending Mailforge itself can warm a mailbox.

Official references used for the route contract:

- [Icemail API documentation](https://docs.icemail.ai/)
- [Icemail API overview](https://icemail.ai/icemail-api)
- [Mailforge API guide](https://www.mailforge.ai/blog/mailforge-api)

## Activation state

The source code is ready for a real provider credential to be added server-side, but that is not the same as activation. The current environment still has no configured provider credential, and the repository's hosted GitHub Actions runner remains blocked by the separate GitHub billing lock. No claim of live mailbox readiness is made until actual provider and DNS receipts exist.
