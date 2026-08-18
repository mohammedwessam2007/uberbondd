# Provider Adapter Contract

Full implementation: `src/provider-adapter-contract.mjs`. This document is
the reference for what the contract actually guarantees.

## The 22-capability interface

`identity, authenticationMethod, listMailboxes, mailboxHealth,
dnsRequirements, verifyDns, warmupCapable, startWarmup, pauseWarmup,
warmupStatus, discoverSendingLimit, bounceSignal, complaintSignal,
replySignal, campaignStatus, rateLimits, cancel, receipts,
termsAndAllowedPurposes, dryRunSupported, liveSupported, outageState`.
`validateProviderAdapter(adapter)` checks structural presence of all 22 as
callable functions; it never calls them.

## What is real vs. fixture, per provider, tonight

| Provider | `configured` | Real adapter implemented? | Status |
|---|---|---|---|
| Gmail (existing, separate module) | N/A — not part of this contract | Yes, real, in production use (`src/gmail.mjs`) | `LIVE_VERIFIED` for send/receive; **no warm-up capability exists in the Gmail API**, so it cannot satisfy this contract's `startWarmup` |
| Instantly | `false` (no `INSTANTLY_API_KEY`) | No | `PROVIDER_AUTH_REQUIRED` |
| Google Workspace (Admin/warm-up, distinct from plain Gmail OAuth) | `false` | No | `PROVIDER_AUTH_REQUIRED` |
| Microsoft 365 | `false` | No | `PROVIDER_AUTH_REQUIRED` |

## Why no real Instantly/Workspace-Admin/Microsoft 365 HTTP client exists

Building an HTTP client against a live third-party API with zero credential
to authenticate or test it against would produce **unverified code
masquerading as a real integration** — exactly what this mission's
"do not invent an Instantly API... do not claim an Instantly integration
exists because a module name exists" rule forbids. `createUnconfiguredProviderAdapter()`
is the honest alternative: every one of the 22 capabilities returns a
deterministic `PROVIDER_AUTH_REQUIRED` result, so any caller anywhere in
the system gets an explicit, structural "not connected" rather than a
guess or a silent no-op.

## What "connecting a provider" would concretely take (for the owner)

- **Instantly**: an Instantly account + API key (`INSTANTLY_API_KEY`).
  Likely the fastest real integration to build once a key exists — REST,
  API-key auth, no OAuth dance.
- **Google Workspace** (the Admin/warm-up-capable surface, not plain Gmail
  OAuth): a Workspace admin account + an OAuth app with the relevant
  Workspace Admin/Gmail scopes (`GOOGLE_WORKSPACE_CLIENT_ID`/`_SECRET`).
- **Microsoft 365**: an Entra ID (Azure AD) app registration with Mail.Send/
  Mail.Read application permissions and admin consent
  (`MICROSOFT_365_CLIENT_ID`/`_SECRET`/`_TENANT_ID`).

None of these can be created by this session — account creation, payment,
and OAuth admin consent are all sovereignty-level owner actions.

## Redaction guarantee

`redactProviderReceipt()` strips every secret-shaped key (same pattern list
as the mailbox registry's secret rejection) and caps string length (200
chars) and array length (50 items) before any provider response is ever
persisted. Tested against a deliberately malicious payload carrying an
`apiKey` and an oversized nested string — both are stripped/truncated, not
merely masked.
