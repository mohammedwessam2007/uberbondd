# UberBond cloud relay: ChatGPT to Claude Code

> **Canonical document:** [docs/LIVE_BRIDGE_HANDOFF.md](LIVE_BRIDGE_HANDOFF.md) is the single
> handoff document for the ChatGPT ↔ Claude Code bridge. This file is narrower
> or older; where the two disagree, the canonical document wins.

## Deployed HTTP ingress

A separate Vercel project now hosts the bounded GitHub-Issues ingress:

- Production URL: https://uberbond-relay.vercel.app/api/agent-relay
- Vercel project: `uberbond-relay`
- Deployment: `dpl_9ox6CB71AdLeSHVaEfv8oq1ukBZ9` (`READY`)
- Current state: `RELAY_NOT_CONFIGURED` until the owner adds `UBERBOND_RELAY_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_REPOSITORY` in Vercel project secrets.

The endpoint is not a public unauthenticated bridge. It fails closed before any GitHub request when configuration is incomplete, and then requires the relay bearer token. The existing GitHub Issue transport remains the proven fallback and audit trail.


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

Requests to any /api/agent-relay/* route are additionally bounded by a
sliding one-minute-per-caller-IP rate limit (config.agentRelay.rateLimitPerMinute,
default 120/min), reached only after the bearer token has already been
verified.

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

See `docs/ARGUS_RELAY_TRUTH.md` for the full truth-reconstruction, real
proof obtained (real local HTTP + MCP stdio E2E, real embedded-PostgreSQL
concurrency), defects found and fixed, and the honest status of every
Wave (ChatGPT connector, device-off execution, Vercel/CI) from the most
recent reconciliation wave.

## Using the bridge today (no host, no deploy, no spend)

The HTTP transport above needs a deployed UberBond host, which does not exist
yet. A second transport does work today and has carried a real task end to end
(issue #30): **GitHub Issues as the wire.** See `src/github-relay.mjs`.

### To send Claude Code a task

Open an issue in this repository with the label `agent-relay:task` and a fenced
`uberbond-task` block. The minimum viable packet:

    ```uberbond-task
    {
      "taskId": "my-task-1",
      "objective": "Run the deterministic verification suite",
      "originAgent": "chatgpt",
      "targetAgent": "claude-code",
      "constraints": ["suite:deterministic"],
      "requiredOutputs": ["outcome"],
      "acceptanceTests": ["the suite runs to completion"],
      "evidenceRefs": ["task:my-brief"],
      "consequenceClass": "LOCAL_PREPARATION"
    }
    ```

`evidenceRefs` entries must be prefixed with one of `evidence: audit: test:
doc: outcome: signal: task: proposal: mission: receipt:` -- the packet compiler
rejects anything else.

### To read the answer

The worker posts a `uberbond-result` comment on the same issue, adds
`agent-relay:done`, and closes it. The issue thread is the durable receipt --
real ids, real timestamps, real author identity, permanently addressable.

### Getting ChatGPT to drive it

ChatGPT does not need a custom connector for this. Any of these work:

- ChatGPT's GitHub connector, if enabled on the account, can open and read issues directly.
- Ask ChatGPT to write the packet, then paste it into a new issue yourself.
- Any GitHub automation (Zapier, a webhook, `gh issue create`) can open the issue.

The relay does not care which of these produced the issue, because the packet
is validated on read regardless of author.

### What runs the worker

- **Today:** an interactive Claude Code session with GitHub access (this is how issue #30 was answered).
- **Unattended:** `.github/workflows/agent-relay-worker.yml` fires on `issues: opened/labeled` plus an hourly cron and runs `scripts/github-relay-worker.mjs` on GitHub's infrastructure -- no device, no session. It is staged and syntax-checked but has never executed, because GitHub Actions on this account is currently failing at the infrastructure level (see `docs/ARGUS_RELAY_TRUTH.md`). It should start working on its own once Actions billing is restored.
- **Anywhere else:** `GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/github-relay-worker.mjs` on any host or cron.

The worker only ever runs three allowlisted npm scripts (`check:syntax`,
`test:deterministic`, `check`). It reports `UNSUPPORTED_OBJECTIVE` for anything
else and never executes free text from an issue body -- otherwise "anyone who
can open an issue" would mean "anyone who can run code in CI."

## Proof boundary

- QUEUED means the relay stored the task; it does not mean Claude ran.
- CLAIMED means a worker lease was granted; it does not mean the work succeeded.
- RECEIVED means UberBond accepted a structurally valid result under the lease; it does not prove a customer outcome or revenue.
- A worker result with any nonzero external-effect field is rejected.
- Provider access, deployment, real payment, customer acceptance, and revenue remain external proof requirements.
