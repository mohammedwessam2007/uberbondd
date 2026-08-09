# OMNIA V9 Gmail Self-Test Owner Approval

**Status: NOT APPROVED. This is an unfilled template.** No live Gmail send has occurred or will occur under this mission. Per this mission's explicit instruction, this card must be filled in and explicitly approved by Mohamed before any live self-test runs -- this document existing in template form is not itself an approval.

## What this authorizes, if and when filled in and approved

Exactly one automated self-test email, sent from an owner-controlled Gmail account to another owner-controlled mailbox (or the same account), for the sole purpose of empirically verifying whether Gmail preserves and exposes a caller-supplied `Message-ID:` header via the `rfc822msgid:` search operator -- the one fact [`V9_GMAIL_RECONCILIATION_REPORT.md`](./V9_GMAIL_RECONCILIATION_REPORT.md) identifies as unverified.

## Approval card (to be completed by Mohamed, not by this mission)

```
Sender mailbox:              <exact owner-controlled Gmail address>
Recipient mailbox:            <exact owner-controlled Gmail address -- same account or another Mohamed-controlled mailbox>
Message count:                1 (maximum, no exceptions)
Attachments:                  none
Exact subject:                "OMNIA V9 Gmail reconciliation test — no action required"
Exact body:                   <final text, e.g. "This is an automated OMNIA V9 self-test verifying email delivery reconciliation. No action is required. This message was sent to a mailbox the sender controls.">
Purpose:                      Empirically verify Message-ID preservation and rfc822msgid: searchability
Expected cost:                $0 (standard Gmail send, no paid API tier required)
Expiry:                       <exact ISO 8601 timestamp -- this approval is void after this time, unused or not>
Prospect/customer contact:    NONE -- explicitly prohibited by this approval
Production activation:        NONE -- this remains a test/integration branch action only
Follow-up:                    NONE -- no reply automation, no second message under this approval
Additional messages:          NONE -- exhausted after the one message send, regardless of outcome
Approved by:                  <Mohamed's name, explicit and dated>
Approval date:                <date>
```

## What happens if this card is not filled in and approved

Per this mission's instruction, the process stops here: `GMAIL_LIVE_TEST_AWAITING_OWNER_AUTHORIZATION`. No send occurs. The offline work (adapter implementation, static safety tests, mocked contract tests, mutation tests, the real-dispatcher/recovery integration tests against a fake transport) is complete and does not depend on this approval -- only the one live empirical test does.

## What happens after approval, if credentials are also available

Per the credential gate ([`V9_GMAIL_ADAPTER_SPEC.md`](./V9_GMAIL_ADAPTER_SPEC.md)'s "additive changes" section describes the adapter's credential inputs), a Gmail OAuth client (`clientId`/`clientSecret`/`redirectUri`) and a sealed, valid account token set would need to be present in the environment, supplied by Mohamed through the existing `src/gmail.mjs` OAuth flow (`googleAuthUrl`/`exchangeCode`) -- never hardcoded, never committed, never logged. This mission found no such credentials present in its environment at the time of this report; see [`artifacts/omnia-v9/gmail-preflight-report.json`](../../artifacts/omnia-v9/gmail-preflight-report.json)'s `credentialGate` field.

If the self-test does run under a future, properly approved and credentialed execution, the exact procedure section 14/15/16 of the originating mission brief specifies applies: send once, record every identifier (execution ID, pre-generated Message-ID, Gmail message ID, thread ID, dispatch timestamp, search query, reconciliation result), then simulate response loss by discarding the locally-returned Gmail message ID and recovering purely via `reconcile()` -- proving whether reconciliation alone (never a second send) can recover the message. Any ambiguous or multi-match result during that test must resolve to `AMBIGUOUS` and stop, never a heuristic pick.
