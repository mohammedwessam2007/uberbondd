# PHOENIX | UberWarm zero-paid scheduled one-shot bridge | 2026-10-20

## Actual founder objective

The Winnr Startup purchase already supplies 50 regular mailboxes, in addition to the 3 old pilot mailboxes. No extra paid warming subscription, artificial engagement, borrowed account inboxes, bulk self-replies, or unsupported release claims. The only valuable goal of this change is connecting the **existing** working five-minute Railway monitor to the **existing** authorized protected one-shot executor without another paid service, while leaving every independent sender/recipient health gate intact.

## Implemented bridge

`src/uberwarm2-zero-paid-cycle-gate.mjs` and `scripts/uberwarm2-zero-paid-cycle.mjs`, packaged in the **separate** `Dockerfile.uberwarm-one-shot`. The existing five-minute Railway read-only monitor image and scheduler are deliberately unchanged. An independently scheduled or explicitly launched **protected** one-shot operator image can use this wrapper as follows:

1. Execute the current read-only `uberwarm2-railway-read-monitor.mjs` and parse its bounded JSON receipt.
2. Abort protected execution if the monitor fails, PostgreSQL is not the primary, the durable probe ledger is unavailable, or the authenticated Winnr inventory has no provider receipt. Preserve monitor's historical `BLOCKED_FOR_SENDING` status rather than changing it to a fabricated green verdict.
3. Unless **both** `UBERWARM_CADENCE_ENABLED=true` and the already-existing `UBERWARM_ONE_SHOT_EXECUTION_ALLOWED=true` are set, refuse the one-shot path with zero provider submissions.
4. Require exact sender, distinct recipient, approved probe ID, sealed evidence path, HMAC verification key, provider mailbox ID, token and PostgreSQL binding. Prohibit general commercial sends.
5. On the authoritative primary, read the exact `probe_id` claim count before any attempt. Any existing claim, including a pending or uncertain one, prevents rerun.
6. Invoke the **unchanged** `operator-tools/uberwarm2-execute-approved-once.mjs`. That operator independently verifies the exact immutable owner-signed batch and six real separately pinned fresh source receipts (or pre-existing tightly scoped delegated source custody), current sender/recipient status, provider identity, and atomic one-shot ledger. Missing proofs deny. No automatic retry after an uncertain send.
7. Emit only redacted status, count and reason codes. Never print provider credentials, signed evidence, private recipient data or raw manifest.

This does **not** run automatically if only the Winnr API token is set. There is no paid warm-up API call and no sender/quarantine release. The new separately runnable wrapper is only a protected activation *connection*, not a network of genuine recipients or an assertion of delivered placement.

## Observed execution boundary as of this receipt

- Latest Winnr authenticated GET: 53/53 active provider mailbox identities, 11/11 provider DNS complete. Fifty accounts were created October 13; three prewarmed pilots on October 2. Provider daily cap 50/mailbox is NOT authorized volume.
- Railway operational service has five-minute cron, the protected `UBERWARM_ONE_SHOT_*` variables are not configured. Neon exact sender `connect@uberbond.site` remains paused (`UBERWARM_INCOMPLETE_CURRENT_SENDER_CLEARANCE`), with current hold clearance, suppression continuity and message alignment UNKNOWN. Recipient owner consent for one exact test verified by authenticated Gmail, expiring October 22 at 21:00Z absent withdrawal. No Winnr provider Message-ID or independent Inbox/Spam placement receipt exists.
- The existing canonical Railway callback's `currentSuppressionContinuityVerified` remains false; neither accepting a code PR nor a successful read-only provider GET authorizes a send.
- The genuinely external challenge for qualifying the full fleet remains acquisition of willing independent receiving inboxes or legitimate traffic to real contacts; sending 50 accounts mutual synthetic messages does not create genuine engagement reputation.

## No-retry and cost safety

No new Railway services, no paid add-ons, no mailbox purchases, no prospect outreach, and no new provider write scope were introduced. The unrelated staged `dump-runner` Railway patch must not be accepted as part of this change. Existing project `main` auto-deploys the separate read-monitor service from GitHub; this change does NOT alter that service’s read-only Dockerfile or its cron command, and cannot run a sender from its image.

## Acceptance

Local focused and security tests + Docker build + no-credential Docker smoke + merged exact-head GitHub checks. The protected image has NOT been attached to a production scheduler or provisioned with secret approvals; no live Railway sender redeployment is claimed. Separately, any actual one-shot requires a real qualified sender, exact owner/recipient approval, attached signed source attestations, and an accepted provider Message-ID followed by independently observed placement. A source merge can close software wiring; **it cannot claim 53 warmed mailboxes, real send, or production sender clearance**.
