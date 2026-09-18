# UberMail Agent API

Status: **clean-room private AgentMail-like control plane implemented for UberBond**. This is not AgentMail source code, branding, infrastructure or an impersonation of the AgentMail service. It is an independent capability-equivalent API surface built over UberBond's owned mail substrate.

## Why this exists

UberBond already owns the lower mail stack: UberDoso's pinned Postal topology, DNS/authentication contracts, UberSMTP submission, Postal effect evidence, sender registries, suppression/health logic and UberCel/UberLit runtime controls. Rebuilding another MTA would duplicate capability. UberMail adds the missing developer-facing mailbox API above those organs.

The design target was the publicly documented AgentMail workflow surface as observed in September 2026: inbox lifecycle/search, messages/reply/forward, threads/search, drafts/scheduling, attachments, webhooks, custom domains, pods, API keys, allow/block controls and realtime-style event consumption.

Official donor references:

- https://www.agentmail.to/docs/integrations/cli
- https://www.agentmail.to/docs/api
- https://github.com/agentmail-to/agentmail-plugins

## Owned modules

- `src/ubermail-agent-api.mjs` — mailbox/application state machine and authorization model.
- `src/ubermail-agent-http.mjs` — AgentMail-shaped `/v0` HTTP compatibility facade.
- `src/ubermail-file-repository.mjs` — atomic `0600` persistence adapter for a single-writer UberLit cell.
- `src/ubermail-uberdoso-bridge.mjs` — authority-preserving transport bridge into a governed UberDoso dispatcher.

## Implemented capability surface

| Surface | UberMail |
| --- | --- |
| API keys | bootstrap, create/list/get/update/revoke, bearer/public-key classes, scoped permissions, expiry |
| Pods | create/list/get/delete |
| Domains | create/list/get/update/verify/delete through an evidence-producing verifier |
| Inboxes | create/list/search/get/update/delete, metadata, pause state, pod/domain binding |
| Messages | send/reply/forward/list/get/search/label-update/delete |
| Threads | list/get/search/label-update/delete |
| Drafts | create/list/get/update/delete/send, scheduled sends |
| Attachments | message/thread/draft storage and retrieval |
| Webhooks | create/list/get/update/delete, scoped events, HMAC signatures, delivery metrics |
| Lists | inbox/pod allow/block entries for send/receive/reply directions |
| Inbound | normalized received-message ingestion with block-list enforcement and thread linking |
| Realtime-style state | durable event log + cursor polling; a WebSocket server can layer over the same event feed |
| Metrics | sent/received/draft/webhook and resource counts |
| Persistence | repository contract + atomic local-file implementation |
| Transport | pluggable; UberDoso bridge requires an authoritative governed dispatcher receipt |

## Security and authority invariants

1. API keys are stored only as hashes. Raw key material is returned once. Idempotent replays never return a secret again.
2. Webhook signing secrets are derived from a server-side master secret, stored only as digests, and returned once.
3. Message send requires both an API permission **and** an independent effect approval. An HTTP header cannot self-create that approval.
4. The UberDoso bridge accepts only a dispatcher response that says the operation was authorized, executed and accepted, with a provider reference. Uncertain results stay uncertain.
5. Default relationship classes are limited to `TRANSACTIONAL`, `USER_INITIATED`, and `EXPLICIT_OPT_IN`. This API does not grant cold-outreach permission.
6. No provider credential, DNS authority, reputation, physical host, campaign authorization, or delivery outcome is manufactured by the API.
7. Durable local state is written atomically with mode `0600`. The adapter is intended for a single-writer UberLit process; a database repository should replace it for multi-writer cells.
8. Attachment bytes and raw secrets are excluded from normal public snapshots/list responses.

## HTTP compatibility examples

The facade accepts normal bearer auth and an application-provided `effectApproval` object at the trusted call boundary.

- `GET /v0/inboxes`
- `GET /v0/inboxes/search?q=...`
- `POST /v0/inboxes`
- `PATCH|DELETE /v0/inboxes/:id`
- `GET /v0/messages/search?q=...`
- `POST /v0/inboxes/:id/messages/send`
- `POST /v0/inboxes/:id/messages/:message_id/reply`
- `POST /v0/inboxes/:id/messages/:message_id/forward`
- `GET|PATCH|DELETE /v0/inboxes/:id/threads/:thread_id`
- `GET|POST /v0/inboxes/:id/drafts`
- `PATCH|DELETE /v0/inboxes/:id/drafts/:draft_id`
- `POST /v0/inboxes/:id/drafts/:draft_id/send`
- `GET|POST /v0/webhooks`
- `GET|PATCH|DELETE /v0/webhooks/:id`
- `GET|POST /v0/domains`
- `POST /v0/domains/:id/verify`
- `GET|POST /v0/pods`
- `GET|POST /v0/api-keys`
- `GET|POST /v0/list-entries`
- `GET /v0/events`
- `GET /v0/metrics`

## Runtime composition

Conceptually:

`UberMail /v0 API -> UberBond authority/effect gate -> UberDoso governed dispatcher -> pinned Postal/authorized SMTP -> external mail reality`

Inbound is the reverse:

`Postal authenticated route/webhook -> UberBond verifier/normalizer -> UberMail ingestReceivedMessage -> thread/event/webhook state`

A software-complete clone is not the same as a live mail cell. A live UberDoso node still needs the physical host, public IP/PTR, inbound/outbound SMTP reachability, Postal boot, verified DNS/DKIM and owner-authorized runtime receipts required by the existing UberDoso activation compiler.

## Deterministic tests

The dedicated tests exercise secret non-replay, scoped keys, pod/domain/inbox lifecycle, searches, message send/reply/forward, attachments, threads, drafts and scheduling, webhooks, lists, inbound ingestion, durable persistence, HTTP routing, event/metric accounting, relationship refusal and governed transport ambiguity.

No test sends mail or calls a live provider.
