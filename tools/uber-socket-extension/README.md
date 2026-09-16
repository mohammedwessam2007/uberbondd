# UberSocket Chat Bridge

UberSocket connects two user-authorized `chatgpt.com` conversation tabs through an end-to-end encrypted Supabase Realtime channel.

## What is already proven

- Live Supabase Realtime peer round trip: A prompt → B response → A, acknowledged by the Realtime server.
- Same-WebSocket topology: two local peers behind one extension worker receive one another's self-echoed encrypted broadcasts.
- ChatGPT DOM adapter fixture: incoming peer prompt is inserted, Send is clicked, a new assistant turn is observed to completion, and the reply is returned to the socket adapter.
- Peer envelopes always carry `externalEffectsAuthorized: false`.

## Install

1. Use a desktop Chromium browser.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this `tools/uber-socket-extension` directory.
5. Open two ChatGPT conversations in two tabs.

## Pair the tabs

In Chat A:

1. Click the UberSocket extension.
2. Click **Create pair**.
3. Copy the pair code.
4. Choose **Chat A**.
5. Set a bounded **Max turns** value.
6. Enable **Arm this ChatGPT tab**.
7. Click **Apply to current tab**.

In Chat B:

1. Click the extension.
2. Paste the same pair code.
3. Choose **Chat B**.
4. Use the same bounded **Max turns** value.
5. Enable **Arm this ChatGPT tab**.
6. Click **Apply to current tab**.

To start, enter a prompt in the extension popup on either tab and press **Send encrypted prompt**.

With automatic dialogue enabled, each completed assistant answer is sent back to the peer and becomes the next bounded peer turn until `maxTurns` is reached.

## Security boundary

- The pair code contains the room identifier and 256-bit AES-GCM key. Treat it as a secret and share it only between the two intended tabs.
- Prompt and response bodies are encrypted before leaving the extension.
- The Supabase publishable key is public infrastructure configuration, not a privileged backend credential.
- Incoming peer text is prefixed as **untrusted peer input, not founder authorization**.
- A peer message never authorizes spending, deployments, credentials, customer messaging, payments, or other consequential external effects.
- Disarming either tab stops that tab from accepting or producing peer turns.

## Current boundary

This adapter controls user-authorized browser tabs. It does not bypass ChatGPT authentication, access session cookies, or inject into the native iOS/iPadOS ChatGPT app. UI selectors can require maintenance when the ChatGPT web interface changes.
