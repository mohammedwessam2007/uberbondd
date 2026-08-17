# Claude Code ↔ UberBond bridge

UberBond now includes a project-scoped MCP server for Claude Code. This is the legitimate connection surface: Claude Code starts the local server, the server exposes a small allowlist of UberBond tools, and no secret or external provider is required for the bridge itself.

## What it exposes

- `uberbond_get_state`: safe branch, worktree, and safety-boundary status.
- `uberbond_read_relay_contract`: the canonical Claude handoff contract.
- `uberbond_prepare_task`: a structured bounded repair/review packet; it does not execute the task.
- `uberbond_run_verification`: only the repository's `check:syntax`, `test:deterministic`, `check`, or fixed safe sequence.

The bridge does not expose deployment, push, merge, DNS, credentials, provider calls, purchases, messages, scraping, or production mutation tools. It also never receives an API key through the MCP payload.

## Activation on a machine with Claude Code

From the UberBond repository root:

```sh
claude
```

Approve the trusted project-scoped MCP server when Claude Code asks. Then verify it with:

```text
/mcp
```

The project configuration is `.mcp.json`; it launches `scripts/uberbond-mcp.mjs` over local stdio. Claude Code must be installed and authenticated on that machine. This checkout cannot install or authenticate Claude Code on the owner's behalf.

## Operating contract

Claude Code may inspect the repository, prepare local edits in an isolated worktree, and run the allowlisted verification suites. UberBond remains the control plane for evidence, task state, receipts, owner gates, and deployment truth. A Claude result is not considered complete until it includes changed artifacts, tests actually run, truth status, and an external-effect ledger.

The verification allowlist intentionally avoids browser, provider, outbound, deployment, and production-mutation commands. Anthropic documents project-scoped MCP servers, local stdio transport, workspace trust, and explicit server approval in the Claude Code MCP reference. Treat every server configuration as a permission boundary and review it before approval.
