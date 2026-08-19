# UberBond cloud relay: ChatGPT to Claude Code

This document describes the bounded transport added in the cloud-agent-relay wave.

## What it does

UberBond stores a task packet in the existing durable jobs collection with type prometheus.agent.relay.

The flow is:

    ChatGPT or an approved research worker
            |
            | POST /api/agent-relay/tasks
            v
    UberBond cloud relay (authenticated)
            |
            | Claude Code MCP: poll -> claim
            v
    Claude Code performs local repository work
            |
            | MCP submit -> POST /api/agent-relay/tasks/:taskId/result
            v
    UberBond stores the result and receipt
            |
            | GET /api/agent-relay/tasks
            v
    ChatGPT or an approved reviewer reads the result

This is task/result communication, not an unbounded autonomous conversation. Every task is bounded by the existing agent-relay contract, a target agent, a lease, acceptance outputs, a consequence class, and a zero-external-effect ledger.

The relay does not call a model provider, send outreach, spend money, deploy, push, merge, change credentials, change DNS, or mutate production.

## Endpoints

All endpoints require an Authorization: Bearer token. There is no public relay endpoint.

- GET /api/agent-relay/health
- POST /api/agent-relay/tasks
- GET /api/agent-relay/tasks?targetAgent=claude-code&status=queued&limit=20
- POST /api/agent-relay/tasks/claim
- POST /api/agent-relay/tasks/:taskId/heartbeat
- POST /api/agent-relay/tasks/:taskId/result

The relay reuses the existing jobs queue, so normal workers exclude relay jobs and cannot steal a Claude Code lease. Claiming is atomic in the JSON transaction store and PostgreSQL store. Result submission requires the exact active lease owner.

## Cloud environment

Set these in the cloud runtime's secret/environment-variable store. Never commit the token or place it in a task packet, log, client bundle, or document.

    AGENT_RELAY_ENABLED=true
    UBERBOND_AGENT_RELAY_TOKEN=<long-random-owner-generated-token>

The relay remains unavailable when either setting is missing.

## Claude Code environment

In the local checkout's uncommitted environment (or the Claude Code process environment), set:

    UBERBOND_AGENT_RELAY_ENABLED=true
    UBERBOND_AGENT_RELAY_URL=https://<your-uberbond-host>
    UBERBOND_AGENT_RELAY_TOKEN=<same-owner-generated-token>
    UBERBOND_RELAY_AGENT=claude-code

Then start Claude Code from the repository root, approve the project-scoped UberBond MCP server, and use:

- uberbond_relay_poll
- uberbond_relay_claim
- uberbond_relay_heartbeat
- uberbond_relay_submit

The MCP server never returns the bearer token through uberbond_get_state.

## ChatGPT side

The HTTP API is the ChatGPT-facing interface. A connected ChatGPT tool, an approved MCP/HTTP adapter, or a separate OpenAI API worker can create tasks and read results.

This repository change does not silently grant the current ChatGPT conversation a persistent network connector. That connection requires an explicit platform/connector approval and a reachable deployed URL. Until then, GitHub or a manually approved HTTP adapter remains the handoff path.

## Proof boundary

- QUEUED means the relay stored the task; it does not mean Claude ran.
- CLAIMED means a worker lease was granted; it does not mean the work succeeded.
- RECEIVED means UberBond accepted a structurally valid result under the lease; it does not prove a customer outcome or revenue.
- A worker result with any nonzero external-effect field is rejected.
- Provider access, deployment, real payment, customer acceptance, and revenue remain external proof requirements.
