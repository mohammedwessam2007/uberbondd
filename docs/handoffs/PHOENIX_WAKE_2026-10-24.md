# PHOENIX wake checkpoint — 2026-10-24

## Actual result

Source built and isolated tests passed; external deployment and stopped-to-MCP-READY verification remain blocked. This is not a working published one-tap control yet.

Canonical main inspected through GitHub: `8c796ed9c29350ebbd08cd3034abd6b088e83e3a`, tree `026a25f6599922bec1910b772b28f8b9ae00c742`.
Donor PR #1543 remains OPEN/UNMERGED at `45df16c1acc8677d82845ef259865bddafaef31b`; its scripts and devcontainer are absent from main. The supervisor below reuses that donor, with required lock/session utilities, owned process-group shutdown, input validation and loopback-only health probes. No competing tunnel identity was created.

## Live browser evidence

- GitHub Codespaces lists one Codespace, owned by **uberbond2007**, associated with canonical repository **mohammedwessam2007/uberbondd**.
- Exact Codespace: `automatic-fortnight-gx6xxpjjp5pjcwxq9`, 2 cores / 8 GB RAM / 32 GB; dirty HEAD. No root or existing worktree modified.
- Billing: GitHub Free; October two-core compute 22.4 hours, gross $4.03, billed $0. Storage displayed 2.41 GB-hr, gross $0.17, billed $0.
- Account Codespaces budget: $0/$0, **Usage blocked**. No cap was changed. GitHub Free includes 120 core-hours (60 two-core runtime hours); 37.6 runtime hours nominally remain using displayed compute, subject to reporting lag and storage eligibility. This is not a continuous-uptime guarantee.
- Opening the existing Codespace in browser succeeded after checking the $0 hard cap. VS Code reported remote connection Done. Starting the terminal presented workspace-trust confirmation; it was NOT accepted.
- CoS tool returned `tunnel_client_not_seen` (300 seconds), existing identity `tunnel_6ad250c716588191b4b6f96ba1656f23`. PHOENIX status returned `Session terminated`. No new execution receipt/digest exists.
- Railway list-projects returned reauthentication required. No Railway deployment, provisioning or account fallback was attempted.
- No evidence establishes the causal process-level tunnel fault; host inactivity and absent startup config are hypotheses until inspected. No credentials or process command lines were exposed.

## Implementation

`scripts/codespace/wake-controller.mjs` is an independent, zero-dependency Node controller suitable for an existing HTTPS reverse proxy, outside the Codespace. It pins owner/name/repository, uses GitHub GET then POST start, coalesces wake requests, throttles starts, records secret-free action events and refuses identity mismatch. Server-only environment: `GITHUB_CODESPACES_TOKEN`, `WAKE_OWNER_KEY` (32+ characters), `WAKE_ORIGIN` (exact HTTPS origin), optional `PORT`. Bind is loopback; retain an existing protected HTTPS proxy. Do not expose it directly or invent a free host.

The page provides owner unlock, a large WAKE UBERBOND button, bounded status polling, real provider states, last successful verification and Safari Home Screen instructions. Sessions use random HttpOnly Secure SameSite=Strict host cookies; mutation requires exact Origin plus custom CSRF header, bounded bodies and rate limits. The owner key is not persisted by the frontend. GitHub credentials never reach the browser.

No live credential was created or installed. Obtain the Codespace owner's supported GitHub credential with only documented endpoint permissions through a secure owner flow; repository GitHub App access alone is not Codespaces-start authority. Never enter it in chat or Git.

The executable entry point deliberately has NO MCP verifier configured. Available therefore returns RECONNECTING, never READY. A future protected adapter must perform harmless authenticated calls through BOTH existing connector identities and provide fresh server/tunnel/tool evidence plus receipt digest. Injection exists only as a server-side adapter/test dependency; HTTP clients cannot submit evidence. Tests use mocks; their READY result is not external proof.

`scripts/codespace/phoenix-start.sh` is the startup entry point. It requires explicitly configured `COS_TUNNEL_CMD` and `COS_TUNNEL_AUTOSTART=1`; it does not discover secrets or invent a connector command. After live inspection, compose `bash scripts/codespace/phoenix-start.sh` into the ACTUAL devcontainer postStartCommand, preserving existing hooks. Current patch intentionally does not replace the live unknown devcontainer or install Claude CLI. Keep original tunnel IDs. Startup script launches a detached single-instance supervisor; STARTED means requested, not callable.

Supervisor logs remain private under XDG_STATE_HOME/uberbond. Foreground command is trusted operator configuration; never interpolate user input. Manual repeat of phoenix-start is lock-idempotent. No unauthenticated remote repair endpoint was added; inspect supervisor and owned process groups before live repair. Process crash recovery and owner signal cleanup are locally tested; full service restart/tunnel identity recovery remains unverified.

## Verification

`node --test tests/phoenix-wake-controller.test.mjs tests/phoenix-wake-supervisor.test.mjs`: **12 passed, 0 failed**, isolated scratch source. Includes request coalescing, cooldown, identity mismatch, provider 401/403/404/429/503, stale/future/bad evidence, both-connector requirements, CSRF/auth, login limiting, shell parsing, config refusal, exclusive lock, TERM cleanup and bounded restart. No full-repo checks or exact-head readiness regeneration ran. Keep draft; do not merge or deploy on this evidence alone. Draft #1551 unchanged.

## Owner actions (maximum three)

1. Approve VS Code **Trust Folder & Continue** for `/workspaces/uberbondd` so the operator can inspect and restore the existing tunnel in the browser terminal. This enables workspace code execution; approval is required by the browser action policy. The operator should then do the work, not hand commands back.
2. Reauthenticate Railway only if choosing the existing host inspection path. Its cost envelope is unknown; no additional spend authorized.
3. Authorize/install the minimally scoped Codespace-start credential in protected external host storage, or securely configure the iOS Shortcut fallback below. Do not create broader credentials automatically.

## iOS Shortcuts fallback (not installed or tested)

If no zero-incremental-cost host is verified, create a private shortcut named WAKE UBERBOND. Once, securely configure a GitHub owner credential locally; a Shortcut file containing a token must never be shared or committed. Use a trusted local secret manager if available; otherwise ask securely each run instead of claiming one-tap operation.

Actions: retrieve secret locally → Get Contents of URL `https://api.github.com/user/codespaces/automatic-fortnight-gx6xxpjjp5pjcwxq9` with Authorization Bearer secret and GitHub Accept/API-version headers → verify returned owner.login, repository.full_name and name against the values above → if Shutdown, POST the same URL plus `/start` once → if Starting, wait/poll with a finite limit → if Available, show STARTED / MCP UNVERIFIED. For HTTP failures show BLOCKED and provider code. Never label READY without an independently authenticated actual connector probe. Add to Home Screen. This is a precise fallback recipe, not a signed/importable Shortcut or completed deliverable.

## Next operator

Resume browser trust gate, inspect actual running processes/config without printing secret args, configure the donor supervisor around existing commands and identities, add/compose startup hook, verify a harmless PHOENIX and CoS call. Discover and verify independent existing HTTPS host and $0 cost envelope before deployment. Test wake/repeated-wake/forced owned-child crash; only then a stopped-to-ready test. Preserve receipts and source SHAs. No fake activity/keepalive, account rotation, new paid capacity or inference.

GitHub supports 5–240 minute idle timeout and enforces a 12-hour running lifetime even while active. No timeout was changed here. A running tunnel cannot wake a stopped VM. Choose idle period only after verifying its remaining allowance and live settings.

All 890 founder IDs and literal corpus remain untouched. Continuity law was read; literal corpus bytes and complete brain/startup hydration were not recovered in this bounded infrastructure task. This checkpoint makes no completeness or implementation claim for those ideas. No unique source was deleted or superseded.

Official reference: https://docs.github.com/en/rest/codespaces/codespaces ; https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle ; https://docs.github.com/en/codespaces/setting-your-user-preferences/setting-your-timeout-period-for-github-codespaces .
