# PHOENIX Direct MCP Connector (real tools)

This is an actual MCP server for the UberBond PHOENIX capability subsystem. It
connects to the existing first-party `scripts/phoenix-cos-operator.mjs` runtime,
not to an invented catalog or a generic shell. This is **separate** from the
skill-only `phoenix-capability-bridge` plugin created earlier.

## Eight callable MCP tools

- `phoenix_status`: source-linked inventory and runtime admission counters.
- `phoenix_waves`: Waves 3–10 source integrity, unrecovered Wave 1–2 notice.
- `phoenix_catalog`: 15 first-party deterministic zero-effect atom descriptors.
- `phoenix_search`: bounded PHOENIX corpus search (1,560 proposals).
- `phoenix_wave_page`: browse exact original IDs and source pointers.
- `phoenix_mission_contract`: compile one research proposal into test-first contract.
- `phoenix_route`: route a mission to verified existing native atoms.
- `phoenix_invoke_native`: invoke an approved native zero-effect atom using structured input.

**Not claimed:** 1,560 active programs, independent external vendors, production
model access, email sending, payment processing, supplier license clearance,
cloud deployment, or a connector already installed in your ChatGPT account.

## Local installation and real tests

```bash
npm ci --prefix apps/phoenix-mcp --ignore-scripts --no-audit --no-fund
npm --prefix apps/phoenix-mcp test
node apps/phoenix-mcp/server.mjs --stdio
```

The stdio command implements the MCP protocol, not a human-readable CLI. A
conforming client discovers the eight tools through `tools/list` and calls
them through `tools/call`. The test suite exercises in-memory, real subprocess
stdio, and real authenticated stateless streamable HTTP transports.

## Private remote connection to ChatGPT

For the ChatGPT iPad/web workflow, launch this MCP server through **a separate
Secure MCP Tunnel**. The existing Chat On Steroids tunnel belongs to that
plugin; do NOT repurpose its tunnel ID or disrupt its session.

1. Create a NEW tunnel associated with the target ChatGPT workspace in
   [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels).
   Only an authorized owner/admin can do this. Obtain a runtime key through
   Platform key settings using secure local entry; never paste keys in chat.
2. Configure the official tunnel client with the new tunnel ID and the stdio
   command above, using the active full Codespace path, and run its `doctor`.
   Keep the tunnel connected; a sleeping or deleted Codespace cannot serve calls.
3. In ChatGPT **web**, Plugins > Add custom MCP server > Tunnel, select the NEW
   tunnel, review the discovered eight real tools, and install the resulting
   private app. On a subsequent chat, select `@PHOENIX` and invoke one read-only
   tool to verify end-to-end callability. Custom MCP connection creation is
   currently documented for ChatGPT web, not the iOS app.

Do not call this setup complete until ChatGPT itself has discovered and invoked
a tool. This app has no external spend permission; a new paid host or API call
requires separate owner approval.

## Optional independently hosted HTTP transport

For an existing approved host with a stable HTTPS reverse proxy, set a
cryptographically random 32+ character `PHOENIX_MCP_BEARER_TOKEN` through a
secrets manager, then run `node apps/phoenix-mcp/server.mjs --http` bound to
`127.0.0.1:${PHOENIX_MCP_PORT:-3887}`. Reverse proxy `/mcp` using HTTPS and
preserve the Authorization header. Do not expose unauthenticated PHOENIX
source access publicly. `GET /healthz` contains only minimal status; `/mcp`
requires bearer authentication and accepts POSTs only.
