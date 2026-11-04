# XPay independent evidence checkpoint — 2026-10-05

Truth class: implemented/tested local component; NOT live provider proof.

Continues draft PR #1242. `src/xpay-provider-evidence.mjs` independently reads
the fixed XPay API origin using GET /account and GET /checkout/sessions/{id}.
No arbitrary origin, redirects, writes, purchases, payment creation, credentials
creation, webhook registration, production activation or deployment.

Validates a server-owned intent binding (never provider/user metadata), merchant,
key mode/type, live approval, session/intent/charge identity chain, exact integer
minor-unit economics and currency, complete+paid, successful full capture, and
explicit absence of refund/dispute/hold. Unknown reversal state fails closed.
Deadline covers requests and response JSON. Returned evidence excludes raw
customer details, client secrets, bearer tokens and arbitrary thrown messages.

28 component tests pass, including injected network responses and timeout.
No real XPay API call performed. Synthetic live fixture does NOT prove account
approval. All results remain `cleared:false`, no canonical receipt, no fulfilment
authority. The reader is deliberately not enabled in production dispatch.

## Remaining implementation (not owner work)

- Durable server-owned XPay intent/session binding and exact offer allocation.
- Atomic canonical order/audit/revenue witnesses using existing store, including
  charge-key idempotency across completed and async-success event identities.
- Reversal/dispute invalidation and refresh; current checkout-only webhook intake
  does not handle charge/refund lifecycle. No static clean-sale witness may silently
  survive later reversal.
- Provider-scoped worker composition and exact-head CI/merge/deployment verification.

## External gates preserved

Latest authenticated dashboard evidence: IN REVIEW 86%, live disabled. Provider
approval and bank settlement eligibility remain unproved. Protected key/webhook
setup absent. Exact outreach legal route remains uncleared. Do not buy Winnr.

Sources inspected directly: official XPay /api-reference/account/getAccount,
/api-reference/checkout-sessions/getCheckoutSession,
/api-reference/objects/checkout-session. Strict contract may refuse incomplete
provider expansions; do not weaken on guessed shapes. This is read-only evidence
preparation, not full integration completion.
