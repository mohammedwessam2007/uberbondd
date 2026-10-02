# Winnr Transport Reconciliation Receipt — 2026-10-02

## Evidence boundary

This receipt records the verified live state of the bounded three-mailbox Winnr canary. It contains no mailbox passwords, API tokens, encryption keys, message bodies, or prospect data.

## Current source/runtime identity

- Source base at reconciliation: `9d9722a9ac702778ff2c297bf975ac6becdbefe3`
- Render service: `uberbond-control-plane`
- Live deploy: `dep-davs4p1mgk9c73c6c4vg`
- Region: Frankfurt
- Winnr pre-warmed domain: `cedarpointdomains.com`

## Provisioning and storage

- Purchase/provisioning: 3 provider-leased pre-warmed mailboxes, $9/month, no base plan, no paid warming add-on.
- Credential import: 3 mailboxes -> 6 SMTP/IMAP account rows.
- Credential storage: AES-256-GCM encrypted.
- Plaintext credentials logged: false.
- IMAP/993: 3/3 confirmed from production runtime.

## SMTP canary truth

- Mailbox ordinal 1: previously owner-controlled SMTP canary confirmed. The runtime now preserves this as `PREVIOUSLY_CONFIRMED` via `WINNR_SMTP_CONFIRMED_ORDINALS=1`; later retries must not duplicate it.
- Mailbox ordinals 2 and 3: not confirmed.
- Current production failure for 2/3 occurs before SMTP authentication: IPv4 TCP connect to Winnr SMTP port 465 times out; IPv6 route is unavailable from the runtime.
- Therefore this is not evidence of bad mailbox credentials and is not a recipient-side bounce.
- No prospect outreach was sent by this reconciliation.

## Provider escalation

A support reply was sent in the existing Winnr thread asking Winnr to check whether Render Frankfurt shared outbound ranges are blocked and to unblock/allow them for the affected cluster. Gmail message id: `1a0fd124b6b457b9`.

Winnr's current public docs specify SMTP port 465 over SSL/TLS for Winnr mailboxes and note that sending-tool IP blocking is a rare possible cause of connection/auth trouble. No unsupported alternate SMTP port is assumed.

## Immediate alternative discovered

Winnr's current API/MCP supports sending email from the Winnr inbox over HTTPS. That path requires Write permission. UberBond's existing Winnr API token is deliberately read-only, so it cannot be used for a send. No broader token was silently created and no authority was widened.

## Promotion state

**NOT PROMOTED FOR PROSPECT OUTREACH.**

Promotion requires either:
1. direct SMTP transport confirmation for ordinals 2 and 3, or
2. an explicitly authorized Winnr HTTPS/MCP send route with equivalent delivery/reply evidence,
followed by owner-controlled delivery/authentication checks and durable reconciliation.

The canary remains bounded. Ordinal 1 is preserved as confirmed. Ordinals 2 and 3 remain unsent from the current production runtime until transport is dependency-satisfied.
