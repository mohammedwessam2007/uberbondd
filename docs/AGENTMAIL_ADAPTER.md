# AgentMail Adapter

UberBond contains a clean-room, provider-neutral adapter for AgentMail in
src/agentmail-adapter.mjs. It targets the documented AgentMail API base URL
(https://api.agentmail.to/v0) and does not copy provider source, branding,
credentials, or private implementation details.

## Supported surface

The adapter translates the documented AgentMail primitives into UberBond's
provider boundary:

- inbox inventory and one-inbox-per-request provisioning;
- inbox reads, message listing/get, thread listing/get;
- approved message send and reply calls;
- domain creation, domain DNS-record reads, and approved domain verification;
- webhook listing/creation when the provider-documented request body is
  supplied.

Inbox provisioning is sequential and uses both an UberBond idempotency key and
AgentMail's client_id. A timeout or 5xx after a write becomes
EXTERNAL_OUTCOME_UNKNOWN; the caller must reconcile before retrying.

## Configuration

Only the server environment supplies the API key:

- AGENTMAIL_API_KEY
- AGENTMAIL_BASE_URL (optional; defaults to https://api.agentmail.to/v0)
- AGENTMAIL_TARGET_PLAN (optional; defaults to startup as a planning ceiling,
  not a billing assertion)

The provider is considered configured only when AGENTMAIL_API_KEY is present.
A key's presence does not prove that it is valid, paid, domain-verified, or
authorized for sending.

## Plan ceiling

The adapter records the public target-plan ceiling for bounded planning. The
default startup target is 150 inboxes, 150 custom domains, 15,000 emails/day,
and 1,500 emails per five minutes. planLimits() marks these values
observed: false and liveUsableCapacity: false until authenticated
organization/usage receipts and UberBond reconciliation exist.

The code does not activate or purchase a plan. Paid activation remains an
owner action and must be separately approved.

## Safety boundary

Every provider mutation requires scoped owner approval and a durable
idempotency key. Provider responses are redacted before receipts are exposed;
mailbox credentials are never requested or returned. The adapter does not
create cold-send authority, skip DNS/SPF/DKIM/DMARC checks, manufacture
reputation, or override UberBond's V9/effect gates.

Before any live campaign use, UberBond still needs authenticated provider
inventory, custom-domain DNS verification, mailbox health/warm-up evidence,
suppression and complaint handling, route authorization, and the existing
campaign/effect gates.
