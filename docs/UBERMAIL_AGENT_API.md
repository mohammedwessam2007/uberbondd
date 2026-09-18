# UberMail Agent API

Status: **clean-room private AgentMail-like control plane implemented for UberBond**. This is not AgentMail source code, branding, infrastructure or an impersonation of the AgentMail service. It is an independent capability-equivalent API surface built over UberBond's owned mail substrate.

## Why this exists

UberBond already owns the lower mail stack: UberDoso's pinned Postal topology, DNS/authentication contracts, UberSMTP submission, Postal effect evidence, sender registries, suppression/health logic and UberCel/UberLit runtime controls. Rebuilding another MTA would duplicate capability. UberMail adds the missing developer-facing mailbox API above those organs.

The design target was the publicly documented AgentMail workflow surface as observed in September 2026: inbox lifecycle/search, messages/reply/forward, threads/search, drafts/scheduling, attachments, webhooks, custom domains/subdomains, pods, scoped API keys, allow/block controls, usage metrics and realtime-style event consumption.

Official donor references:

- https://www.agentmail.to/docs/integrations/cli
- https://www.agentmail.to/docs/api
- https://github.com/agentmail-to/agentmail-plugins

## Owned modules

- `src/ubermail-agent-api.mjs` — mailbox/application state machine and authorization model.
- `src/ubermail-agent-http.mjs` — AgentMail-shaped `/v0` HTTP compatibility facade.
- `src/ubermail-file-repository.mjs` — atomic `0600` persistence adapter for a single-writer UberLit cell.
- `src/ubermail-uberdoso-bridge.mjs` — authority-preserving transport bridge into a governed UberDoso dispatcher.

Existing UberMail organs are reused rather than duplicated:

- `src/ubermail-foundry.mjs` — compiles owned Stalwart mailbox identities over the exact UberDoso roots without pretending identity count is delivery capacity.
- `src/ubermail-jit-provisioning.mjs` — compiles persistent, owner-authorized provisioning plans and rejects disposable identity rotation.
- `src/ubermail-capacity-exchange.mjs` — reconciles only observed, authorized, terms-compatible transport capacity; it never creates send authority.

## Implemented capability surface

| Surface | UberMail |
| --- | --- |
| API keys | bootstrap, create/list/get/update/revoke, bearer keys, scoped permissions, inbox/pod scope, expiry, one-time secret display |
| Pods | create/list/get/delete plus pod-scoped resource routes |
| Domains | create/list/get/update/verify/delete through an evidence-producing verifier, optional verified subdomain inboxes |
| Inboxes | create/list/search/get/update/delete, metadata, pause state, pod/domain binding |
| Messages | send/reply/forward/list/get/search/label-update/delete |
| Threads | list/get/search/label-update/delete |
| Drafts | create/list/get/update/delete/send, scheduled sends, reply-draft and forward-draft constructors |
| Attachments | message/thread/draft storage and retrieval |
| Webhooks | create/list/get/update/delete, inbox/pod scopes, HMAC signatures, write-only custom-header values, delivery metrics |
| Lists | inbox/pod allow/block entries for send/receive/reply directions |
| Inbound | normalized received-message ingestion with block-list enforcement and thread linking |
| Realtime-style state | durable cursor event log plus abortable async event stream; SSE/WebSocket transport can layer over the same feed |
| Metrics | organization or scoped resource counts; scoped credentials cannot read cross-scope telemetry |
| Persistence | repository contract + atomic local-file implementation |
| Transport | pluggable; UberDoso bridge requires an authoritative governed dispatcher receipt |
| Mailbox foundry | existing Stalwart foundry/JIT plan/capacity-exchange organs remain the physical-account/capacity layer |

## Security and authority invariants

1. API keys are stored only as hashes. Raw key material is returned once. Idempotent replays never return a secret again.
2. Webhook signing secrets are derived from a server-side master secret, stored only as digests, and returned once. Custom webhook header **values** are write-only; public responses expose names only.
3. Inbox- and pod-scoped API keys are enforced on direct lookups, lists, searches, metrics, webhooks and event consumption. A scoped key cannot escape its resource boundary by omitting a filter.
4. Message send requires both an API permission **and** an independent effect approval. An HTTP header cannot self-create that approval.
5. The UberDoso bridge accepts only a dispatcher response that says the operation was authorized, executed and accepted, with a provider reference. Uncertain results stay uncertain.
6. Default relationship classes are limited to `TRANSACTIONAL`, `USER_INITIATED`, and `EXPLICIT_OPT_IN`. This API does not grant cold-outreach permission.
7. No provider credential, DNS authority, reputation, physical host, campaign authorization, or delivery outcome is manufactured by the API.
8. Durable local state is written atomically with mode `0600`. The adapter is intended for a single-writer UberLit process; a database repository should replace it for multi-writer cells.
9. Attachment bytes and raw secrets are excluded from normal public snapshots/list responses.
10. UberMail deliberately does **not** fake AgentMail/AgentID-specific provider public-key credentials as bearer tokens. UberBond's own authority model replaces that external-provider identity layer; only bearer API keys are implemented here until a real signature-verification contract exists.

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
- `POST /v0/inboxes/:id/messages/:message_id/reply-draft`
- `POST /v0/inboxes/:id/messages/:message_id/forward-draft`
- `GET|PATCH|DELETE /v0/inboxes/:id/threads/:thread_id`
- `GET|POST /v0/inboxes/:id/drafts`
- `PATCH|DELETE /v0/inboxes/:id/drafts/:draft_id`
- `POST /v0/inboxes/:id/drafts/:draft_id/send`
- `GET|POST /v0/webhooks`
- `GET|PATCH|DELETE /v0/webhooks/:id`
- `GET|POST /v0/inboxes/:id/webhooks`
- `GET|POST /v0/pods/:id/webhooks`
- `GET|POST /v0/domains`
- `POST /v0/domains/:id/verify`
- `GET|POST /v0/pods`
- `GET /v0/pods/:id/inboxes|domains|threads|drafts`
- `GET|POST /v0/api-keys`
- `GET|POST /v0/inboxes/:id/api-keys`
- `GET|POST /v0/pods/:id/api-keys`
- `GET|POST /v0/list-entries`
- `GET /v0/events`
- `GET /v0/metrics`

## Runtime composition

Conceptually:

`UberMail /v0 API -> UberBond authority/effect gate -> UberDoso governed dispatcher -> pinned Postal/authorized SMTP -> external mail reality`

Inbound is the reverse:

`Postal authenticated route/webhook -> UberBond verifier/normalizer -> UberMail ingestReceivedMessage -> thread/event/webhook state`

Mailbox-account provisioning and capacity are separate physical layers:

`UberMail Foundry/JIT plan -> owner/domain/provider authority -> observed account/DNS/egress receipts -> UberMail API resources`

A software-complete clone is not the same as a live mail cell. A live UberDoso node still needs the physical host, public IP/PTR, inbound/outbound SMTP reachability, Postal boot, verified DNS/DKIM and owner-authorized runtime receipts required by the existing UberDoso activation compiler.

## Deterministic tests

The dedicated tests exercise secret non-replay, scoped-key isolation, pod/domain/inbox lifecycle, subdomain rules, searches, message send/reply/forward, attachments, threads, reply/forward drafts, scheduling, webhook header privacy, lists, inbound ingestion, durable persistence, HTTP scoped routing, realtime cursor/abort behavior, metric isolation, relationship refusal and governed transport ambiguity.

Current dedicated result for this slice: **23/23 passed**.

No test sends mail or calls a live provider.
