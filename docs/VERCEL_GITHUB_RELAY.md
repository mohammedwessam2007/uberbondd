# Vercel GitHub relay ingress

This repository now contains a Vercel-compatible HTTP ingress at
`/api/agent-relay`. It wraps the canonical `src/github-relay.mjs` transport;
it does not create a second task schema or an autonomous model loop.

## Required Vercel environment variables

Set these only in the Vercel project secret store:

```text
UBERBOND_RELAY_TOKEN=<owner-generated bearer token>
GITHUB_TOKEN=<least-privilege token that can manage issues in the relay repo>
GITHUB_REPOSITORY=mohammedwessam2007/uberbondd
UBERBOND_RELAY_GITHUB_TIMEOUT_MS=10000
```

The values are never returned by the health endpoint, included in task packets,
or written to logs. The endpoint fails closed with `RELAY_NOT_CONFIGURED` until
all three values exist.

The optional GitHub timeout is bounded to 25-30,000 milliseconds and defaults
to 10,000. Request bodies are capped at 250,000 UTF-8 bytes whether Vercel
delivers them as a stream, string, or already-parsed object. Oversized and
malformed bodies are rejected before any GitHub operation.

## Operations

Every request requires `Authorization: Bearer <UBERBOND_RELAY_TOKEN>`.

```text
GET  /api/agent-relay?op=health
GET  /api/agent-relay?op=poll&targetAgent=claude-code&limit=10
GET  /api/agent-relay?op=read&issueNumber=30

POST /api/agent-relay  {"operation":"create","input":{...}}
POST /api/agent-relay  {"operation":"claim","issueNumber":30,"workerId":"claude-code"}
POST /api/agent-relay  {"operation":"heartbeat","issueNumber":30,"workerId":"claude-code"}
POST /api/agent-relay  {"operation":"submit","issueNumber":30,"workerId":"claude-code","status":"COMPLETED","result":{...}}
```

`create` compiles and secret-scans the canonical task packet before creating a
GitHub issue. `submit` uses the same result validator and rejects non-zero
external effects. A queued or received packet is not proof of code execution,
payment, revenue, customer acceptance, or a deployment.

## Deployment boundary

The Vercel function is a bounded relay ingress only. It does not:

- run Claude, GPT, browser automation, or arbitrary shell commands;
- send outreach, spend money, publish content, change DNS, change credentials,
  deploy production, or mutate customer data;
- replace the existing GitHub Issue worker or the full PostgreSQL queue.

The existing Lite project remains the public customer-facing Vercel app. Deploy
this relay function as a separate project rooted at the repository root, or add
the equivalent function to a separately controlled serverless project. Do not
change the Lite project's root directory or production environment while
testing this ingress.

## Local evidence

The focused contract suite covers configuration redaction, fail-closed startup,
bearer authentication, polling delegation, malformed issue rejection,
non-zero-effect result rejection, parsed-body size enforcement, malformed JSON,
and bounded upstream timeout behavior. The canonical cloud relay suite remains
the source of truth for task idempotency, lease ownership, heartbeat, and result
replay behavior.
