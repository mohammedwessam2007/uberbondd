# External Asset Reality

Current canonical owner-supplied assets and integration truth for UberBond.

## Outreach domains

- `uberbond.agency` is an owned UberBond outreach root.
- `uberbond.cloud` is an owned UberBond outreach root.
- Both roots are canonical outreach identities, not website roots.
- Domain acquisition is complete and must not be reopened as an owner task.
- Mail-provider activation, mailbox authentication, SPF/DKIM/MX alignment, warm-up, and provider-specific delivery evidence are separate runtime states and must not be collapsed into domain ownership.

## PayPal

- PayPal is already an implemented UberBond payment path.
- The repository contains PayPal order, capture, webhook, sandbox-adapter, portable bridge, and payment-truth modules.
- `PAYPAL_LIVE_API` and `PAYPAL_SANDBOX_API` are distinct in the payment-truth core.
- Previously authorized sandbox credentials/configuration are not equivalent to a LIVE settlement or LIVE recovery receipt.
- Do not report 'no payment provider' merely because the live-settlement reality cut is still unproven.

## Execution law

When a future handoff or doctor encounters stale documents that say the domains are only candidate names or that PayPal is absent, this file takes precedence for those asset-existence facts. Remaining blockers must be stated at the narrower layer that is actually missing: provider runtime, DNS/mail authentication, live payment settlement/recovery, or other cut-specific evidence.
