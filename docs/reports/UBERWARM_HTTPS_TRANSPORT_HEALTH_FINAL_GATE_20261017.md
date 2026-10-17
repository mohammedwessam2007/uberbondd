# UberWarm: signed HTTPS transport health gate, 17 October 2026

**Truth class:** implemented and locally tested source on current main descendant. **Not a production send approval, probe, Inbox placement, or continuous warming claim.**

## What changed

- `createUberWarm2TrustedHealthSupplier` has an explicit `transportMode` switch. Default `SMTP` preserves all existing hard requirements and behavior. Exact `WINNR_INBOX_HTTPS_API` mode selects only `readVerifiedHttpsTransport`; it does not borrow an old SMTP AUTH receipt.
- An HTTPS transport observation must be current, exact sender/domain bound, signed and independent, authenticate the sender identity, prove provider write scope and secure transport and compatible terms, and explicitly limit purpose to `OWNER_CONTROLLED_PLACEMENT_PROBE`. Provider mailbox Active, account read or DNS presence is insufficient.
- Local holds, quarantine, DNS alignment and current consent remain mandatory, as do signed exact-batch approval, durable one-shot PostgreSQL claim and independent receiving placement confirmation. Missing or unsupported modes fail closed. No new network effect is added by this change.
- `createUberWarm2ProtectedWinnrRuntime` and the protected activation wiring carry the selected transport mode and read callback into the same existing preflight and executor.

## Runtime facts recovered before this change

- Repository main: `ce853f7500fcb3d7475d44f91da54f8397cdce8c` merged PR #1460.
- Railway Hobby `ample-vibrancy`, `uberwarm-runtime` service `e6241537-b5b5-4c0c-ad25-2677a1aa0d20`, deployment `e4253138-5d24-4fd8-a8c8-bdb8dc4994e5` succeeded at exact `ce853f75`.
- Live monitor: 53 Winnr mailboxes, 11 domains, persisted PostgreSQL receipt and authenticated read-only encrypted receiver. Its state remains `BLOCKED_FOR_SENDING`, with zero new sends and `probeConsentEstablished=false`.
- No real provider-side, independently signed HTTPS send-permission attestation is currently bound to the protected preflight. No owner-signed, unexpired exact seed approval is supplied. No new Message-ID/Inbox/Spam receipt exists.

## Test receipts

- Source syntax: three changed modules passed `node --check`.
- Focused: 25/25 passed.
- `node --test tests/uberwarm2-*.test.mjs`: 215 tests; 213 passed, 0 failed, 2 skipped after `npm ci --ignore-scripts --no-audit --no-fund`.
- Two skipped tests are database-integration cases requiring a separately provided real PostgreSQL integration environment, not a claim they ran.
- Generated readiness artifacts produced by official `npm run readiness`; this is local source-identity metadata, not a cloud deployment receipt.

## Exact remaining authority/external observations

1. Independently obtain a **fresh scoped signed HTTPS transport observation** from a qualified provider/credential-holding operator. It must reflect actual Winnr sender write permission, TLS, and approved one-probe purpose; never synthesize signed booleans from a token or provider Active status.
2. Record a real current owner-controlled receiving address's explicit consent for **one exact probe**, suppression clear, unexpired owner signature covering the immutable batch and message. Read-only authenticated IMAP does not constitute consent.
3. Run a single bounded seed probe with PostgreSQL reservation; record provider Message-ID and independently matched Inbox/Spam result, including uncertain outcomes without automatic replay. Only afterward consider an independently approved recurring schedule. Do not send to prospect addresses, manufacture replies, or pay for provider warming without new authority.

**Safety:** `SEND_SET=[]` and outbound probe authority remain held. Zero new sends, purchases, changes to live Railway environment, or production migrations from this branch.
