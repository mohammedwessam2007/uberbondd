# PHOENIX CoS repaired graphical runtime — 2026-10-16

## Scope and truth
Continuation of Operation Steroids, isolated branch `ops/cos-codespaces-20261016`; existing secondary-owned Codespace `automatic-fortnight-gx6xxpjjp5pjcwxq9`. No main merge, production changes, outreach, purchase, or paid-overage activation. Earlier receipt: `PHOENIX_COS_RUNTIME_BLOCKERS_2026-10-16.md`. User explicitly authorized the previously explained `--no-sandbox` workaround. This is graphical runtime progress, **not Core or worker completion**.

## Observed fixes and validation
- Recovered existing checkout at e2307f4f0eda87b614430909708b293df649dec4 and refreshed setup branch.
- Vendor CoS 2.1.39 runs Electron 44.3.0 / Node 24.20.0. Debian 12 has libstdc++ 12.2; vendor tree-sitter native addon failed with missing GLIBCXX_3.4.31.
- Rebuilt the exact npm tree-sitter@0.25.1 with the existing Debian compiler. Electron successfully required it: `TREE_SITTER_ELECTRON_LOAD_OK`.
- Installed replacement only in /opt/cos-runtime; retained original as `tree-sitter.node.vendor`. Vendor /opt/Chat On Steroids installation remains a rollback source. Avoid overwriting shared hardlinks.
- Started `DISPLAY=:1 /opt/cos-runtime/chat-on-steroids --no-sandbox --disable-gpu`. Live noVNC screenshot shows CoS Setup and Workspace interfaces. Main-process dependency exception resolved. D-Bus warnings do not prevent the observed interface.
- Committed repeatable repair at ddc844b3404decfc77e3cab1b84a94c1581ff9c9: `scripts/cos-codespace/repair-native-addon.sh`.
- Pulled that commit on the Codespace; `bash -n` passed and a full replay completed in 24 seconds with the same Electron load marker and native SHA-256:
  `880bf22aa38283fccd696a71288de087d022158246cbddc144e8507d570736a7`.
- VS Code Ports UI independently showed both 6080 (noVNC) and 8765 (CoS, listening 127.0.0.1) as **Private**.
- Browser/desktop tool access and sub-agent exposure were switched off in CoS. Folder allowlist remained empty at last inspection. Do not infer folder approval or safe final permissions from UI defaults.

## Account and transport state
- OpenAI Platform sign-in completed through browserAuth saved-account selection; signed-in Tunnels page verified.
- Created private tunnel `tunnel_6ad250c716588191b4b6f96ba1656f23`, name `UberBond CoS isolated Codespace`.
- Associated Platform Personal organization `org-X2G9Wmn7ZYkvHiEfCcagJeSj` and available ChatGPT workspace `9bf9ee6c-eb44-44e1-a408-561fd6225c9a`. No tunnel client connected yet.
- Runtime key creation form is prepared, **not submitted**: `UberBond CoS tunnel-only`, Default project, 7-day expiry, Restricted, exactly Tunnels Read + Use (two permissions); all model/API resource permissions remain None. No literal key exists from this form or is recorded.
- Prior continuation observed signed-in Mohamed Wessam Plus ChatGPT Plugins > Add custom MCP server, including Tunnel ID input. This proves form availability only, not executable tools.
- Chrome launch from installed official package reached Google Chrome and ChromeOS Additional Terms of Service, last modified September 30, 2025. Cancelled without accepting. Extension manifest 2.1.39 is bundled with the verified CoS installation. Requested --load-extension launch did not complete because terms were not accepted. No extension pairing proven.

## Genuine action-time approval gate
Before final Chrome acceptance, restricted key creation, companion extension pairing, and private Core plugin access, obtain specific confirmation of those concrete legal/security-sensitive actions under the browser confirmation policy. Broad continuation authorization is preserved; do not repeat the already granted sandbox approval. Keep key out of chat/logs/repository and use secure local input/store. If secure storage is unavailable, do not silently use plaintext persistence.

## Resume exactly here
1. Accept displayed Chrome terms only after specific confirmation; load bundled official companion in isolated browser; verify pairing. Approve only /workspaces/uberbondd, initially file read plus necessary terminal access; review actual toggles. No production credentials.
2. Submit prepared restricted tunnel-only key only after confirmation; securely configure CoS tunnel ID and key, validate secure storage and active polling. Keep desktop ports private. Verify workspace association by actual plugin discovery.
3. Add private Chat On Steroids Core plugin with same Tunnel ID; read AI_START_HERE.md, execute harmless pwd and git status --short through actual Core, correlate with CoS local history.
4. Only after Core passes, test one bounded worker and Compact & Resume. Loop/autonomous message submission stays off.
5. Commit exact results and stop Codespace while not in use. $0 Codespaces spending cap from earlier receipt must remain; numeric remaining quota is still unverified in this continuation.

## Preserved wider project context
This isolated tool-installation mission does not supersede UberBond/Wessam Singularity canon, current engineering or commercial missions, or founder ideas 0001–0890. Canonical corpus pointers remain `docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md` and `artifacts/research/founder-moonshot-literal-corpus/manifest.json`. No unseen chats or complete corpus recovery claimed.

## Remaining unverified
Chrome completion, extension pairing, hardened VNC password, secure credential storage, tunnel polling, callable Core, worker execution, Compact & Resume, numeric remaining free quota. No claims of operational company readiness or revenue.
