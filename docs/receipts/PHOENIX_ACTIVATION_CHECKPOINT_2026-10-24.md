# PHOENIX activation checkpoint — 2026-10-24

Verdict: PARTIALLY_WORKING. Independent ChatGPT PHOENIX MCP registration and a fresh-chat native tool invocation remain unverified.

## Exact source and recovery
- Refreshed main: 3a7a0b7a5ece796e617c0c363118d4b1618bf9c1.
- PR #1545 initial observed head: fd4041bbd602ec7ea3c22f5e5f2cf9cbfccf9dd4; open, unmerged.
- Recovered positive-fixture commit: a260746f196059b110a7043ad7c5e2e65844347f (all 18 direct/inventory tests pass).
- Source repair: 29bce56aecf3f6ef3e957964321489546a437a3f. UTF-8 byte budgets, buffered HTTP decoding, hostile HTTP tests, dedicated MCP CI.
- Isolated worktree: /workspaces/uberbondd/.phoenix-activation-verified-20261024. Dirty root and unrelated worktrees untouched.
- Git CLI writes were denied to uberbond2007; repository-owner GitHub connection successfully advanced the existing PR branch without force.

## Verified execution
- 34/34 focused source/gateway/inventory tests passed.
- 6/6 MCP integration tests passed: real in-memory protocol, subprocess stdio, authenticated loopback HTTP, all 15 positive fixtures, exact catalog equality, repeat determinism, process restart, unknown tools/atoms, malformed/oversized inputs, HTTP denial and token requirements.
- Full 15 actual MCP response objects, inputs, source hashes, observation time, tested source SHA and response digests: artifacts/phoenix-activation-verification/native-mcp-receipts.json.
- Genuine founder receipt: sha256:966f9f41688e2843e0644aa2236e2884fd892e680e7bd40ec26b96e597f7f795. Empty queue, selectedCount=0, NO_FOUNDER_EXCEPTION_REQUIRED.
- These are MCP protocol calls performed inside the Codespace via Chat On Steroids, NOT standalone ChatGPT-connected phoenix_invoke_native calls.

## CI reconciliation
- Initial head core-verification and deterministic failures were actual canon-freshness failures: readiness named local-only f412cdbc1310, absent from the uploaded PR history.
- Canonical npm run readiness regenerated files against the repository-visible source repair SHA; freshness tests pass locally. Required exact-final-head CI still governs merge.
- Both Vercel status failures point to account deployment blocked; do not classify them as fixed.
- No merge performed while required verification remains unresolved.

## Integration and account reality
- Existing Chat On Steroids executes commands successfully in the Codespace; no tunnel repurposed or restarted.
- Existing PHOENIX Capability Bridge 0.1.0 is installed (ChatGPT Plugins UI), but exposes one skill, not eight MCP tools.
- Signed-in Mohamed Wessam Plus account visibly offers Plugins -> Add -> Add custom MCP server -> Tunnel. Earlier plan-ineligibility assertion is superseded by this live UI evidence.
- Independent Platform tunnel settings redirect to Platform login. No independent tunnel ID/key created or recovered, no new persistent credential or public endpoint exposed.
- Registration dialog supports Tunnel ID; final trust/connection confirmation remains pending after runtime setup.
- Eight server tools: phoenix_status, phoenix_waves, phoenix_catalog, phoenix_search, phoenix_wave_page, phoenix_mission_contract, phoenix_route, phoenix_invoke_native.
- Production deployment and independent ChatGPT connector: NOT VERIFIED / NOT ACTIVATED.

## Preservation and next actions
- Full 1,560 exact source IDs preserved in docs/PHOENIX_ALL_1560_CAPABILITIES_EXPLAINED.md and per-wave documents, backed by artifacts/research/phoenix-ten-wave-intake/original-genomes/.
- Original 890 founder ideas remain separate, addressed by docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md and artifacts/research/founder-moonshot-literal-corpus/manifest.json. No claim of all-chat recovery.
- Next: finish final-head CI; authenticated Platform session -> create separate PHOENIX tunnel using official client -> register connector -> independently discover and invoke status/catalog/founder atom in a fresh ChatGPT conversation.
- Owner-only gate currently observed: Platform authentication; any new security-sensitive connection grants must be reviewed at the actual confirmation screen.
- New purchases, outreach, model inference, production deploys and spend: zero.
