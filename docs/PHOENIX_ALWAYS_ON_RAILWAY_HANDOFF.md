# PHOENIX Always-On Hosting (Railway-compatible, owner-controlled)

Status: source-only deployment preparation. **No Railway service has been created or deployed by this change.** Do not disable or modify the verified Codespace tunnel until the replacement passes an independent live ChatGPT test.

## Security architecture

- Container installs pinned MCP dependencies from `apps/phoenix-mcp/package-lock.json`. It does not start a shell-capable agent or any business/external effect.
- The server uses Railway's injected `PORT`, binds `0.0.0.0` **only** when `PHOENIX_MCP_HOST=0.0.0.0`; defaults to loopback elsewhere.
- `/healthz` is public **minimal process health only**. It is NOT an MCP readiness or database health attestation. **All** `/mcp` POSTs require a strong bearer secret, ≥32 characters, including read-only list calls. Keep this token out of GitHub, chat, logs and browser URLs.
- Never turn off bearer auth or widen the existing 15-atom allowlist to make a connection work.
- A public HTTPS domain is transport, not authorization. Configure matching bearer credentials on the authorized MCP client side; if a ChatGPT custom connector cannot transmit the required Authorization header, **stop**, and use a secure supported tunnel/proxy instead, without bypassing auth.

## Deploy through Railway UI only after reviewing existing paid/free quota

1. Inspect existing Railway projects, usage, spending limits and current plan. Do not add a paid resource unless explicitly approved. A continuously running server consumes metered resources even when idle.
2. Create a **new isolated service**, not a replacement for existing production services. Select GitHub source `mohammedwessam2007/uberbondd`, branch containing this feature **after merge**. Choose Dockerfile path `apps/phoenix-mcp/Dockerfile` and **repository root** as build context (the Dockerfile copies `src/`, `artifacts/`, `docs/` and `scripts/`).
3. Set required secret **inside Railway's secure Variables UI**: `PHOENIX_MCP_BEARER_TOKEN` (cryptographically random 32+ characters, recommend 64 hex characters). Do not paste value into ChatGPT. `PHOENIX_MCP_HOST=0.0.0.0` is in Dockerfile. Railway injects `PORT` automatically.
4. Set healthcheck path `/healthz`. For Railway public access generate an HTTPS service domain and ensure it points at the correct `PORT`.
5. Before ChatGPT onboarding, test publicly: unauthenticated POST `/mcp` must return **401**; authenticated MCP client must complete initialize, list **exactly 8** tools, call `phoenix_status` and `phoenix_invoke_native` with `founder.exception-prioritize`, `{\"exceptions\":[]}`; verify receipt and no external effects. Use only synthetic inputs.
6. If permitted in the actual ChatGPT account/workspace, add the HTTPS MCP endpoint `https://<your-domain>/mcp` and configure supported bearer authentication. Verify from a fresh ChatGPT conversation. If auth is not supported, do NOT strip it to force success.
7. Check deployment replica state, cost budget, provider restart behavior and idle policy; ensure service sleep is disabled if 24/7 availability is required. Keep rollback instructions and original Codespace tunnel.

## Important limits

Always-on service availability is **not** always-on ChatGPT model inference. Scheduled work requires a queue, scheduler and independently authorized execution substrate; none is part of this 8-tool read-only interface. ChatGPT subscriptions must not be treated as unrestricted automation/model API licenses. No polling loop or artificial keep-alive is a substitute for legitimate paid/approved hosting.

## Focused tests

```sh
npm ci --prefix apps/phoenix-mcp --ignore-scripts --no-audit --no-fund
npm --prefix apps/phoenix-mcp test
```

## Handoff to Work (browser is last mile)

Inspect Railway plan, quota, and existing workloads in the UI, obtain owner approval before any new billable deploy, connect new isolated service to this GitHub commit once verified/merged, supply secret through Railway UI, verify HTTP bearer denial and real MCP calls, then configure the separate ChatGPT plugin if auth is supported. Preserve PR/SHA, Railway service/environment/deployment IDs, healthcheck, billing evidence and final direct ChatGPT execution digest. Do not disclose secrets.
