# UberBond | Chat On Steroids (CoS) Codespace activation

**2026-10-16. Truth class:** Prepared and static-validated setup files. Not evidence of a Codespace running, MCP entitlement, successful desktop boot, tunnel pairing, or executable Core calls.

## Host / ownership
- Branch: `ops/cos-codespaces-20261016` in `mohammedwessam2007/uberbondd`.
- Codespace login: `uberbond2007`, so the secondary *personal* GitHub quota pays for compute/storage (subject to the account's remaining allowance and billing settings).
- Source checkout: primary UberBond repository. The secondary account currently has *read only* access to that repository. Use a fork/worktree or a primary-authorized PR route before proposing code changes.
- No Codespaces creation tool was exposed in this chat. The owner must create the Codespace in GitHub's UI, or use Work mode with computer/browser actions to do it.

## Launch on iPad (the only necessary browser handoff)
1. Sign in to GitHub as **uberbond2007** on Safari; open https://github.com/codespaces/new?hide_repo_select=true&ref=ops%2Fcos-codespaces-20261016&repo=1300996174 . Check repository and branch are correct on the actual creation screen. Select the smallest 2-core machine and do not enable paid overages.
2. Wait for devcontainer creation; `postCreateCommand` prepares Chrome and desktop dependencies. It adds the Microsoft-maintained `ghcr.io/devcontainers/features/desktop-lite:1` GUI on `DISPLAY=:1`.
3. In Codespaces **Ports**, confirm **6080** visibility is **Private**. Open 6080 in browser and load `/vnc.html`. Initial desktop password in the feature is `codespaces`; **change it in the Codespace terminal** using `vncpasswd` and restart the VNC desktop before signing in to any accounts.
4. In Codespaces terminal, execute `bash scripts/cos-codespace/install-cos.sh`. It downloads the official upstream Linux x64 DEB and requires a matching release checksum, or `COS_EXPECTED_SHA256` obtained from the official release notes. It refuses to install unverified binaries.
5. In browser-accessible desktop, launch Google Chrome, then CoS from application menu. CoS > **Settings > Setup** shows its unpacked extension folder. Open `chrome://extensions` in Chrome, Developer Mode > **Load unpacked**, select that folder and pair.
6. In CoS choose `/workspaces/uberbondd` (check actual `pwd`) as its project folder. Configure file and terminal permissions. Start with read-only; allow writes only to isolated working copy/branch for the first test.
7. ChatGPT on **web**, not the iPad native app: open https://chatgpt.com/plugins . If the account UI offers **Add > Add custom MCP server**, continue. Otherwise **stop** at the real entitlement gate; do not attempt to get around an account authorization restriction.
8. For the private route: use https://platform.openai.com/settings/organization/tunnels to create a Secure MCP Tunnel associated with the right ChatGPT workspace. Creation needs Tunnels Read + Manage; runtime restricted key needs Tunnels Read + Use. Keep key in the Codespace OS secure store. CoS Settings > Setup > OpenAI Secure Tunnel: set tunnel ID and restricted key, connect. Add `Chat On Steroids Core` in ChatGPT by selecting Tunnel and correct ID.
9. Tool truth test: in a new ChatGPT web conversation explicitly select the Core plugin. Ask it to read `AI_START_HERE.md`; then run a harmless `pwd` and `git status --short` through the Core tool. Independently confirm the corresponding local tool result in CoS's history. A named plugin appearing without callable tools is NOT a pass.
10. Only if Core is proven: test one worker and Compact & Resume. Keep Loop and autonomous message submission off for the first test. Stop the Codespace when not in use.

## Fallbacks / current known obstacles
- **OpenAI published entitlement, October 2026:** full custom MCP write support is documented for Business and Enterprise/Edu; Plus-specific success reports exist in CoS issues, but do not prove every Plus account has that entitlement. Only a live callable-tool test resolves it for this account.
- A Cloudflare quick tunnel can replace network transport but **cannot grant account permission to create an MCP plugin**.
- The browser companion automates ChatGPT's browser UI, not a public browser automation API; do not use workers or account switching to evade rate limits or provider safety decisions.
- Codespaces is not 24/7 free hosting: monthly personal quota and idle stop apply. The second account currently has zero owned repositories through the connected GitHub app but can read public UberBond. No actual Codespace launch was observed.
- There is no native shell-execution tool on the GitHub connector here for launching a Codespace. Existing ChatGPT Work + GitHub is the fallback execution lane until CoS Core has a successful real terminal/tool call.

## Proof/receipt ledger
| Gate | Current status |
|---|---|
| Secondary GitHub auth | Verified, `uberbond2007` |
| Primary repo branch staged | GitHub branch + file receipts required |
| Desktop devcontainer build | NOT RUN |
| CoS Linux package SHA verification | NOT RUN |
| Tunnel credentials/setup | NOT RUN |
| ChatGPT MCP create entitlement | UNVERIFIED |
| Core tool call | NOT RUN |
| Worker call/continuity | NOT RUN |

## External references
- CoS setup: https://github.com/totec448-spec/chat-on-steroids/blob/main/docs/setup.md
- CoS security: https://github.com/totec448-spec/chat-on-steroids/blob/main/SECURITY.md
- Desktop-lite: https://github.com/devcontainers/features/tree/main/src/desktop-lite
- ChatGPT custom MCP: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- OpenAI Secure MCP Tunnel: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- Codespaces quota: https://docs.github.com/en/billing/concepts/product-billing/github-codespaces
- Coordination: UberBond issue #1188 is broader and is not modified by this setup-only branch.
