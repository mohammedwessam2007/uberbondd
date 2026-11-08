# XPay canonical seam — 2026-10-05

Implemented opt-in adapter over existing transactional orders/auditLog/revenueEvents.
Uses independently retrieved account/session/intent/charge evidence. Requires
exactly one durable server-owned XPAY_SESSION_INTENT row and separate canonical
write authorization. Live fixture writes atomically; test evidence never writes
canonical sales. Deduplication is charge-based across lifecycle event IDs.
Replays compare all three witness identities/economics; concurrent retries tested
with actual JsonStore serialization. Intent reassignment checked inside transaction.
Uncertain or refunded evidence invalidates previous order usability; no fabricated
negative revenue or automatic revival from replay. Fulfilment remains unauthorized.

Seven additional transaction/replay tests pass. This is a deterministic fixture
seam, not completed production integration. Production dispatch intentionally
unchanged. No real key read, provider API call, canonical sale, webhook registration,
merge, deployment, customer message or spend occurred.

Fresh authenticated browser recheck this continuation: XPay IN REVIEW86%, disabled
live-mode switch. Developer hub displays existing masked test standard keys and
one Test Restricted Key with six permissions. No key revealed or copied and no
new key created. Do not assume those permissions satisfy the integration.

Remaining: protected test credential provisioning/permissions verification,
server-owned session creation/binding pipeline, charge/refund lifecycle inbox
and refresh scheduling, audited reversal economics, downstream freshness/usability
gates, Postgres/exact-head CI and deployment. These are NOT all external blockers.
Provider live approval, bank eligibility and legal-route clearance remain external.
Do not claim LIVE_READY or Winnr purchase readiness.
