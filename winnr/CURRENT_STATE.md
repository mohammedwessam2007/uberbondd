# Winnr Current State

Updated: 2026-10-02

## Commercial state

- Provider: Winnr.
- Pilot: three provider-leased pre-warmed mailboxes.
- Provider-leased domain: `cedarpointdomains.com`.
- Recurring price: $9/month for the three-mailbox pilot.
- No base plan.
- No paid Winnr warming add-on.
- No new infrastructure purchase was required for final SMTP transport.
- Core UberBond domains remain outside this pilot.

## Custody

- Three mailbox credential records were imported into UberBond.
- Runtime created six encrypted account rows: three SMTP plus three IMAP.
- Credential storage receipt: `AES_256_GCM_ENCRYPTED`.
- Plaintext credential logging: false.
- One-time sealed bootstrap payload was consumed and its canonical private-key state erased after success.

## Live transport

Latest verified production runtime:
- Render service: `uberbond-control-plane`
- service id: `srv-dali9vijnfac739m4vcg`
- latest live source at this checkpoint: `859f95e3a99ce9d98b4d0c3fc3cb7da70517a250`
- live deploy observed: `dep-davspif9nhgc738a3030`
- store backend reported by worker: PostgreSQL

Canonical transport receipt:
- `WINNR_RUNTIME_TRANSPORT_VERIFIED`
- SMTP confirmed: 3/3
- IMAP confirmed: 3/3
- mailbox 1 SMTP: previously confirmed
- mailbox 2 SMTP: accepted
- mailbox 3 SMTP: accepted
- final activation owner-controlled messages sent: 2
- prospect messages sent: 0

## Why the tunnel exists

Render direct TCP/465 to Winnr became source-network blocked/timed out even though IMAP/993 remained reachable.

Independent credential-free probes showed Winnr SMTP itself remained reachable from other cloud egress.

PR #1149 introduced a fixed-host blind TLS tunnel. The relay is restricted to the exact Winnr SMTP host and port 465. Render performs the inner TLS handshake with Winnr and validates Winnr's certificate. SMTP credentials and message plaintext remain inside the end-to-end inner TLS session rather than being exposed to the relay.

The temporary public connectivity probe was retired. The authenticated blind tunnel remains because it is currently required by the Render -> Winnr path.

## Reply loop

Latest live Render receipt:
- status: `WINNR_REPLY_CANARIES_INGESTIBLE`
- expected reply ordinals: [2,3]
- found reply ordinals: [2,3]
- IMAP accounts checked: 3
- each IMAP account probe: `UBERIMAP_FETCH_CONFIRMED`
- message bodies logged: false
- sender addresses logged: false
- credentials logged: false

This upgrades the reply path from "transport-capable" to independently observed ingestibility for the bounded owner-controlled reply canaries.

## Placement

All three runtime SMTP canaries reached UberBond Gmail.

Observed Gmail placement:
- canary 1: Spam
- canary 2: Spam
- canary 3: Spam

Authentication evidence on the earlier inspected runtime message:
- SPF: pass
- DKIM: pass
- DMARC: pass

A separate earlier human-style Winnr web reply from the same pilot reached Inbox, so the domain is not proven to be uniformly spam-routed. However, the current controlled runtime placement sample is 3/3 Spam and is the stronger activation-gate evidence.

## Promotion state

`TRANSPORT_GREEN -> REPLY_LOOP_GREEN -> PLACEMENT_RED -> PROSPECT_SEND_FROZEN`

No cold prospect outreach is authorized by this pilot yet.

Provider health score, blocklist status, warming age, SMTP 250 acceptance, and successful IMAP do not override the observed Gmail placement result.
