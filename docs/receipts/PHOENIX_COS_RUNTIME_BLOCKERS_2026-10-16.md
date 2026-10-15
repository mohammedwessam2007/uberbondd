# PHOENIX CoS checkpoint 2 — real runtime blockers

Date: 2026-10-16 Africa/Cairo. Follows PHOENIX_COS_RUNTIME_CHECKPOINT_2026-10-16.md.

## Additional verified evidence
- Bootstrap dependency fix committed as 9d74e1ddf691c24233354c80de72189bc449f6f2 and pulled into existing Codespace with git pull --ff-only.
- bash -n scripts/cos-codespace/bootstrap.sh passed. COS_BOOTSTRAP_SKIP_APT=1 invocation passed with expected skip message. git status --short remained empty at that revision.
- dpkg-query confirms chat-on-steroids 2.1.39, gh 2.23.0+dfsg1-1, google-chrome-stable 155.0.8059.84-1.
- Runtime GitHub API /user/codespaces confirmed name automatic-fortnight-gx6xxpjjp5pjcwxq9, billable_owner uberbond2007, state Available. Optional gh codespace ports command hung; it was interrupted from a second terminal with pkill -x gh. Private port state was independently verified through VS Code Ports UI.
- Private noVNC endpoint opened successfully and displayed Fluxbox. No ChatGPT or other account was signed into this desktop. Initial VNC configuration has NOT yet been hardened; do not log accounts into it first.

## CoS actual launch failures (not installation failure)
1. Launch from installed /opt/Chat On Steroids/chat-on-steroids failed: LaunchProcess failed to execvp /opt/Chat; Zygote process exited prematurely with exit code 127.
2. Created /opt/cos-runtime as a hard-linked copy of the installed verified package (sudo cp -al), preserving original binaries and sandbox helper, to avoid spaces in subprocess path.
3. /opt/cos-runtime/chat-on-steroids progressed further but failed: Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted. Zygote exited with code 1. chrome-sandbox is root-owned setuid; kernel unprivileged_userns_clone returned 1. Container namespace restrictions remain.
4. No --no-sandbox flag, security setting relaxation, privileged container change, or public port exposure was applied. Any isolation-reducing workaround requires explicit authorization. Prefer a working sandbox-preserving path if available.

## Authentication frontier
ChatGPT web sign-in was requested through secure browserAuth. User selected Apple, submitted identifier and password through secure forms, then Apple device verification. Apple visibly returned Incorrect verification code. ChatGPT login is not complete. No password, OTP, cookie, auth URL or token recorded here. Resume via secure/manual browser authentication, not chat secrets.

## Unverified gates
Exact numeric remaining free quota; hardened VNC; successful CoS GUI launch; secure Linux credential store; Chrome extension pairing; ChatGPT custom MCP creation entitlement; matching Secure Tunnel workspace and restricted key; actual Core pwd and git status calls correlated with CoS local history; worker execution; Compact & Resume. Host terminal success is NOT Core evidence.

## Scope and continuation
No production changes, outreach, purchases, paid overage activation or merge to main. All repository writes confined to ops/cos-codespaces-20261016 using primary connector authority. Reuse this Codespace after authentication and sandbox decision; do not create another. Preserve zero-dollar Codespaces budget and private ports. Compute stop is requested separately through GitHub UI; verify state rather than inferring it from this file.
