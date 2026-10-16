# CoS keyring handoff — 2026-10-16

Continues PHOENIX_COS_NATIVE_REPAIR_AND_TUNNEL_2026-10-16.md. Owner explicitly approved displayed Chrome terms, companion extension, seven-day tunnel-only key and private Core plugin in this chat.

## Verified actions
- Resumed the same secondary-owned 2-core Codespace; no new host or paid-overage activation.
- Accepted displayed Chrome and ChromeOS Additional Terms of Service after specific owner approval. Disabled default-browser selection and usage/crash telemetry in initial Chrome prompt; used a signed-out isolated Chrome profile.
- Chrome startup --load-extension did not install the companion. Installed bundled /opt/cos-runtime/resources/extension through chrome://extensions > Developer mode > Load unpacked.
- Live Chrome Extensions UI verifies `Chat On Steroids browser extension 2.1.39`, enabled, service worker present, ID `omigjhoefhbokggdiblekfcblbdnciai` (screen transcription; re-read before relying on exact ID).
- Created `UberBond CoS tunnel-only` key: seven-day expiry, Default project, Restricted, exactly Tunnels Read + Use. Tracking ID key_1vfImQZH0p52RIYR. No model capability permissions. Literal credential was copied privately in browser runtime memory, never emitted to chat, shell, logs or repository. It has not yet been entered into CoS.
- CoS Setup explicitly refused pairing: `Secure credential storage is unavailable, so the extension cannot pair safely.` Did not enable plaintext fallback.
- Verified gnome-keyring, dbus-x11 and libsecret-1-0 were already installed. Corrected runtime session rather than downgrading storage protections.
- Relaunched with: `DISPLAY=:1 nohup dbus-run-session -- sh -c 'gnome-keyring-daemon --start --components=secrets; exec /opt/cos-runtime/chat-on-steroids --no-sandbox --disable-gpu --password-store=gnome-libsecret' > /tmp/cos-secure-session.log 2>&1 &`.
- Live desktop now displays OS dialog: `Choose password for new keyring`, new `Default Keyring`, Password + Confirm + Continue. No new password entered by agent.

## Genuine owner action
New credential creation requires user handoff under browser policy. User must choose and enter the keyring password twice and click Continue in the live noVNC desktop. Do not send this password in chat or store it in receipts. Existing sandbox, Chrome terms, extension, tunnel key and private plugin approvals remain valid; do not request them again.

Codespace intentionally remains active for this short manual handoff; existing $0 spending cap must remain. Stop compute after the owner interaction and verification if not actively used. Startup after a stop may require unlocking the encrypted keyring; never replace this with plaintext storage.

## Remaining
After keyring initialization, verify secure storage and extension pairing; approve only /workspaces/uberbondd; configure existing tunnel tunnel_6ad250c716588191b4b6f96ba1656f23 and restricted key securely; prove polling, add approved private Core plugin, perform actual AI_START_HERE.md/pwd/git status tool calls and correlate local history, then one bounded worker + Compact & Resume. No Core call, worker call or tunnel polling is proven yet. No outreach, production change, main merge or revenue claim.

All previous canon/890-idea pointers remain inherited without modification. Current task is isolated CoS setup, not a replacement project.
