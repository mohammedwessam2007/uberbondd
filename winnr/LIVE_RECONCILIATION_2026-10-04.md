# Winnr Live Reconciliation — 2026-10-04

Terminal re-observation `2026-10-04T12:27:08.908Z`: current IMAP3/3healthy, one attempt each, recent historical canaries absent, no commercial reply or new SMTP/placement proof. Exact implementation `a80bec3cd92c153cca4c4b01a00bda8355c67d66` / `dep-db14bjdg1s2s738gghhg`; final documentation-publication deploy is in newest issue#1188 terminal comment. Quarantine and all custody preserved.

## Purpose

This receipt supersedes stale interpretations of the Winnr IMAP runtime while preserving all earlier Oct 2 transport, reply-canary, placement and personal-inbox evidence.

It records current production truth after the Revenue Singularity closure and the subsequent Winnr IMAP repair. It does not claim campaign activation, population deliverability, fresh re-observation of the Oct 2 canary replies, or prospect-send authority.

## Exact production runtime

- Render service: `uberbond-control-plane`
- service id: `srv-dali9vijnfac739m4vcg`
- exact deployed source: `a80bec3cd92c153cca4c4b01a00bda8355c67d66`
- deploy id: `dep-db14bjdg1s2s738gghhg`
- deploy status: `live`
- deploy finished: `2026-10-04T12:27:08.908Z`
- store backend: PostgreSQL
- build command: `npm install --omit=dev`
- web + worker started successfully
- OMNIA outbound integration mode: `off`

## Incident and root cause

During Oct 4 restarts, all three Winnr IMAP probes began reporting `IMAP_COMMAND_REJECTED` even though the same reader/verifier blobs and the same Node.js 26.10.0 runtime had previously worked.

A bounded protocol-stage diagnostic established that connection, LOGIN, SELECT and SEARCH all succeeded. A subsequent exact-semantic probe reported `SEARCH_EMPTY`.

The production parser then exposed the actual defect: an empty IMAP response line `* SEARCH` was transformed through `''.split(...).map(Number)` into numeric UID `0`. The reader consequently issued the invalid command `UID FETCH 0 (BODY.PEEK[])`, which the provider correctly rejected.

PR #1198 fixed the parser so only positive safe-integer UIDs are fetchable. Empty SEARCH now remains an empty UID set. Regression coverage proves no `UID FETCH 0` call is emitted and valid positive UIDs still fetch normally.

The live result after the repair was three of three account probes returning `UBERIMAP_FETCH_CONFIRMED` in one attempt each.

## Diagnostic lineage

- PR #1196 added a bounded one-account protocol-stage diagnostic after `IMAP_COMMAND_REJECTED`. It exposes only stage/status/standard response-code metadata and never raw provider text, addresses, bodies, subjects, UIDs or credentials.
- PR #1197 extended that diagnostic through the production FETCH semantics while keeping message bytes and UIDs private.
- PR #1198 fixed the empty-SEARCH-to-UID-zero parser defect and advanced UberIMAP to v1.2.
- PR #1199 split current transport health from historical canary presence so an expired recent-message window cannot masquerade as transport failure.

## Current reply-path truth

Latest live startup receipt:

- status: `WINNR_IMAP_TRANSPORT_HEALTHY_CANARIES_NOT_OBSERVED_IN_RECENT_WINDOW`
- `transportHealthy`: true
- `canaryPresenceObserved`: false
- IMAP accounts checked: 3
- account 1: `UBERIMAP_FETCH_CONFIRMED`, attempts 1
- account 2: `UBERIMAP_FETCH_CONFIRMED`, attempts 1
- account 3: `UBERIMAP_FETCH_CONFIRMED`, attempts 1
- expected historical canary ordinals: [2,3]
- found in current recent window: []
- message bodies logged: false
- sender addresses logged: false
- credentials logged: false

Interpretation: current IMAP transport is live and healthy. The old Oct 2 reply-canary subjects were not freshly re-observed because they are outside the current recent polling window. The earlier bounded Oct 2 evidence that ordinals [2,3] were actually ingested remains historical evidence and is not erased; it is simply not being re-labeled as a fresh observation.

## Preserved historical evidence

The Oct 2 receipts remain valid historical evidence that:

- SMTP transport was confirmed 3/3;
- IMAP transport was confirmed 3/3;
- the bounded owner-controlled reply canaries for ordinals [2,3] were observed and ingested at that time;
- the human-readable placement phenotype was Inbox for ordinals 1 and 2 and Spam for ordinal 3 in the UberBond Gmail context;
- a separate personal Gmail seed later observed all three senders in Inbox;
- authentication passed SPF, aligned DKIM and DMARC on all three personal seed messages.

Historical evidence is preserved but does not override newer runtime evidence.

## Quarantine and authority

Latest startup quarantine receipt remains:

- paused ordinal: 3
- reason: `GMAIL_PLACEMENT_RED`
- scope: `SMTP_FLEET_SELECTION_ONLY`
- IMAP custody changed: false
- prospect send authority granted: false

The IMAP repair did not alter the sender quarantine, credentials, provider configuration, spend, campaign activation or outbound authority.

## Commercial effect truth

- new spend from this repair: $0
- provider plan changed: no
- credentials changed: no
- prospect messages sent by this repair: 0
- campaign activation: `NOT_ACTIVATED`
- automated material reply authority: none
- live prospect-send authority added: none

## Supersession rule

For Winnr runtime health, use this evidence order:

1. newest live Render startup/probe receipt;
2. this Oct 4 reconciliation;
3. Oct 2 durable activation/reply/placement/personal-inbox receipts;
4. older planning documents.

Do not interpret the absence of old canary subjects from a recent polling window as a transport outage. Do not interpret current transport health as fresh proof that the old canaries were re-observed.
