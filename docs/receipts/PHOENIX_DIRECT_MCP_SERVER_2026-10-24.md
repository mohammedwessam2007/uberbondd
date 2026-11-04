# PHOENIX direct MCP tool-server receipt (2026-10-24)

## Founder's correction

The private PHOENIX plugin previously produced from a ZIP was a **skills/instructions package, not a separately registered ChatGPT MCP server**. The founder wants to invoke native PHOENIX tools from ChatGPT, as with Chat On Steroids. Do not present skills-only publication or a GitHub PR as a connected app.

## Built, directly executable

- Implemented `apps/phoenix-mcp/server.mjs`, an MCP server using `@modelcontextprotocol/sdk` v1.32.2 and explicit `tools/list`, `tools/call` handlers.
- Eight named MCP tools: `phoenix_status`, `phoenix_waves`, `phoenix_catalog`, `phoenix_search`, `phoenix_wave_page`, `phoenix_mission_contract`, `phoenix_route`, `phoenix_invoke_native`.
- Call implementation delegates to `scripts/phoenix-cos-operator.mjs`, with its explicit allowlist and no external action authority.
- Exercised PHOENIX catalog, source query and permitted real atom execution via Chat On Steroids Core terminal in the Codespace, returning `COS_NATIVE_ATOM_EXECUTED`.
- MCP transport tests: **4 passed, 0 failed** via real MCP Client for in-memory, subprocess stdio, authenticated stateless streamable HTTP and missing-token refusal.
- HTTP: bearer token mandatory (minimum 32 characters), localhost binding, bounded request bodies, zero arbitrary shell surface. `PHOENIX_MCP_BEARER_TOKEN` is never stored in Git.
- Canon/freshness test: **6 passed, 0 failed** after `npm run readiness` regenerated `docs/CURRENT_SYSTEM_STATE.md` and `artifacts/system-readiness.json`.
- Source research remains **1,560 uninstalled proposals** across recovered Waves 3–10. **15 independently callable local deterministic native atoms**, not 1,560 activated executors. Waves 1–2 original spec unavailable. No external vendors certified.

## What is NOT done

- The new `@PHOENIX` tool provider is **NOT registered or installed as a custom MCP app in the owner's ChatGPT account**. App tool discovery from ChatGPT's own plugin runtime was not executed. Existing skills-only plugin is not that endpoint.
- A separate OpenAI Secure MCP Tunnel ID and properly scoped credential have not been provided or created. Do not hijack/reconfigure the existing CoS tunnel.
- No public production host, new spend, external supplier installation, production model call, messaging, customer payment or cleared profit has been established by this work.

## Exact next step

With founder-authorized Platform tunnel access, create a NEW tunnel (not CoS's existing tunnel), securely configure official `tunnel-client` to forward the stdio MCP server, run its health/doctor, then register it in ChatGPT **web** Plugins > Add custom MCP server > Tunnel. Install/test the new app in a fresh chat, with `@PHOENIX` tool discovery followed by `phoenix_status` and `phoenix_invoke_native`. Until then, Chat On Steroids Core itself can already invoke the working source through the repo's PHOENIX CLI.
