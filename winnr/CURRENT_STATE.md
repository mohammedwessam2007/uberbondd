# Winnr Current State

Terminal re-observation `2026-10-04T12:27:08.908Z`: current IMAP3/3healthy, one attempt each, recent historical canaries absent, no commercial reply or new SMTP/placement proof. Exact implementation `a80bec3cd92c153cca4c4b01a00bda8355c67d66` / `dep-db14bjdg1s2s738gghhg`; final documentation-publication deploy is in newest issue#1188 terminal comment. Quarantine and all custody preserved.

Updated: 2026-10-04

Canonical newest reconciliation: `winnr/LIVE_RECONCILIATION_2026-10-04.md`.

## Current production truth — 2026-10-04

Latest verified production runtime:
- Render service: `uberbond-control-plane`
- service id: `srv-dali9vijnfac739m4vcg`
- live source: `a80bec3cd92c153cca4c4b01a00bda8355c67d66`
- live deploy: `dep-db14bjdg1s2s738gghhg`
- deploy status: live
- store backend: PostgreSQL
- normal build command: `npm install --omit=dev`
- web + worker started successfully
- OMNIA outbound integration mode: `off`

Current Winnr IMAP receipt:
- status: `WINNR_IMAP_TRANSPORT_HEALTHY_CANARIES_NOT_OBSERVED_IN_RECENT_WINDOW`
- transport healthy: true
- canary presence observed in current recent window: false
- IMAP accounts checked: 3
- account probes: 3/3 `UBERIMAP_FETCH_CONFIRMED`
- attempts: 1 each
- current found historical canary ordinals: []
- expected historical canary ordinals: [2,3]
- message bodies logged: false
- sender addresses logged: false
- credentials logged: false

The Oct 4 incident was a parser bug, not a credential/provider-auth failure. Empty `* SEARCH` became numeric UID `0`, causing the invalid command `UID FETCH 0 (BODY.PEEK[])`. PR #1198 fixed UberIMAP v1.2 to accept only positive safe-integer UIDs. The live result after the repair is 3/3 healthy IMAP probes.

PR #1199 now separates current transport health from recent-window historical-canary presence. The Oct 2 bounded evidence that reply canaries [2,3] were actually observed remains valid historical evidence, but it is not falsely presented as a fresh Oct 4 observation.

## Commercial state

- Provider: Winnr.
- Pilot: three provider-leased pre-warmed mailboxes.
- Provider-leased domain: `cedarpointdomains.com`.
- Recurring price: $9/month for the three-mailbox pilot.
- No base plan.
- No paid Winnr warming add-on.
- No new infrastructure purchase was required for final SMTP transport.
- Core UberBond domains remain outside this pilot.
- Technical activation: complete.
- Campaign activation: `NOT_ACTIVATED`.
- Prospect sends from the activation/repair work: 0.

## Custody

- Three mailbox credential records were imported into UberBond.
- Runtime created six encrypted account rows: three SMTP plus three IMAP.
- Credential storage receipt: `AES_256_GCM_ENCRYPTED`.
- Plaintext credential logging: false.
- One-time sealed bootstrap payload was consumed and its canonical private-key state erased after success.
- Oct 4 IMAP repair changed no credentials and performed no new import.

## Durable transport evidence

The consumed Oct 2 bootstrap receipt remains historical evidence:
- `WINNR_RUNTIME_TRANSPORT_VERIFIED`
- SMTP confirmed: 3/3
- IMAP confirmed: 3/3
- mailbox 1 SMTP: previously confirmed
- mailbox 2 SMTP: accepted
- mailbox 3 SMTP: accepted
- final activation owner-controlled messages sent: 2
- prospect messages sent: 0

The newer Oct 4 live receipt independently confirms current IMAP transport 3/3 after the UID-zero parser repair.

## Why the tunnel exists

Render direct TCP/465 to Winnr became source-network blocked/timed out even though IMAP/993 remained reachable.

Independent credential-free probes showed Winnr SMTP itself remained reachable from other cloud egress.

PR #1149 introduced a fixed-host blind TLS tunnel. The relay is restricted to the exact Winnr SMTP host and port 465. Render performs the inner TLS handshake with Winnr and validates Winnr's certificate. SMTP credentials and message plaintext remain inside the end-to-end inner TLS session rather than being exposed to the relay.

The temporary public connectivity probe was retired. The authenticated blind tunnel remains because it is currently required by the Render -> Winnr path.

## Reply loop — evidence lineage

Historical Oct 2 bounded reply receipt:
- status: `WINNR_REPLY_CANARIES_INGESTIBLE`
- expected reply ordinals: [2,3]
- found reply ordinals: [2,3]
- IMAP accounts checked: 3
- message bodies logged: false
- sender addresses logged: false
- credentials logged: false

This established independently observed ingestibility for the bounded owner-controlled reply canaries at that time.

Current Oct 4 live receipt:
- current transport health: green 3/3
- old canary subjects in current recent polling window: not observed
- no inference that old canaries disappeared from mailbox storage
- no claim that the Oct 2 canaries were freshly re-observed

## Placement

The earlier diagnostic runtime phenotype produced 3/3 Spam.

A subsequent bounded human-readable phenotype experiment preserved the explicit display identity `Wessam Solomon | UberBond` and sent one owner-controlled message per sender.

Observed Gmail placement:
- ordinal 1: Inbox
- ordinal 2: Inbox
- ordinal 3: Spam

All three showed SPF pass, DMARC pass, two DKIM passes and the same additional failed DKIM signature.

The evidence therefore supports sender-level quarantine rather than a domain-wide shutdown.

## Promotion state

Current conservative state:
`TRANSPORT_GREEN -> HISTORICAL_REPLY_CANARY_PROOF_PRESERVED -> PERSONAL_SEED_3_OF_3_INBOX -> ORDINAL_3_SMTP_QUARANTINE_PRESERVED -> PROSPECT_CAMPAIGN_NOT_ACTIVATED`

Prospect campaign authority remains separate. Nothing in the Oct 4 IMAP repair grants send authority.

The Oct 2 final activation receipt is `winnr/FINAL_ACTIVATION_2026-10-02.md`.

## Placement phenotype experiment — 2026-10-02

The bounded one-shot human-readable phenotype experiment completed with provider acceptance for all three senders.

Gmail external observation:
- ordinal 1 / Tara: Inbox
- ordinal 2 / Nadia: Inbox
- ordinal 3 / Dana: Spam
- phenotype Inbox rate: 2/3

This materially improves over the earlier diagnostic runtime sample of 0/3 Inbox and demonstrates that message phenotype/context contributes to placement. It does not prove population-wide deliverability and does not clear the remaining sender-specific red signal.

Authentication on all three phenotype messages:
- SPF: pass
- DMARC: pass
- at least one aligned cedarpointdomains.com DKIM signature: pass
- Amazon SES DKIM: pass
- an additional cedarpointdomains.com selector named `dkim`: fail

Because DMARC passes and another aligned cedarpointdomains.com DKIM signature passes, the extra failed selector is a diagnostic item, not evidence that authentication as a whole failed. Preserve it for provider/header investigation.

Historical promotion statement from this experiment:
`TRANSPORT_GREEN -> REPLY_LOOP_GREEN -> PHENOTYPE_PLACEMENT_2_OF_3_INBOX -> ONE_SENDER_RED -> PROSPECT_SEND_STILL_FROZEN`.

## DKIM differential diagnosis — 2026-10-02

Raw Gmail headers for all three human-phenotype canaries were compared. All three share the same authentication pattern: an aligned `cedarpointdomains.com` DKIM signature with selector `no56qfuwjhifplhcglecser6tx7warhe` passes; Amazon SES DKIM passes; SPF passes; DMARC passes; and a second `cedarpointdomains.com` signature using selector `dkim` fails. Tara and Nadia still reached Inbox while Dana reached Spam.

Therefore the redundant failing `s=dkim` signature is not a sender-3-specific explanation for Dana's Spam placement. Do not mutate working DNS blindly. Winnr's current documentation says provider-hosted domains have Winnr-managed DKIM, so the redundant signature should be treated as a provider/header diagnostic until Winnr explains or repairs it.

The older UberBond Gmail placement truth remains: Tara Inbox, Nadia Inbox, Dana Spam. It is preserved alongside the later personal-seed result rather than overwritten.

## Live sender quarantine

Latest production startup receipt preserves:
- `WINNR_PLACEMENT_QUARANTINE_APPLIED`
- paused ordinals: [3]
- reason: `GMAIL_PLACEMENT_RED`
- scope: `SMTP_FLEET_SELECTION_ONLY`
- IMAP custody changed: false
- prospect send authority granted: false

## Personal inbox completion — 2026-10-02

The founder reported normal personal Inbox delivery. A fresh bounded runtime test independently verified all three senders in the connected personal Gmail INBOX, with SPF pass, aligned DKIM pass and DMARC pass on all three. Source: PR #1162 / `61a6b553035db760f5627bf87b02916fad2cf27b`; completed 2026-10-02 around 16:30Z. Receipt and message IDs: `PERSONAL_INBOX_RECONCILIATION_2026-10-02.md`.

The personal Inbox result adds a second Gmail receiving context and supersedes any interpretation that ordinal 3 is uniformly Spam-routed. It does not erase the earlier UberBond Gmail Spam result or authorize prospect volume. Ordinal 3 remains paused in fleet selection; all three IMAP accounts remain under encrypted custody. The personal-canary, old phenotype and old plaintext-bootstrap sending flags are off. No additional credential import, purchase or automatic canary replay was required by the Oct 4 repair.

## Oct 4 repair effects

- new spend: $0
- credentials changed: 0
- provider configuration changed: no
- prospect messages: 0
- owner canary messages: 0
- outbound authority added: none
- ordinal-3 SMTP quarantine released: no

Use `winnr/LIVE_RECONCILIATION_2026-10-04.md` as the newest runtime receipt and the Oct 2 artifacts as preserved historical evidence.
