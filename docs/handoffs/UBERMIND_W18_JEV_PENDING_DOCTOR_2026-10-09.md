# UberMind W18: blocked paid Jev claim observability

Date: 2026-10-09. Parent W17 executable main 2ba64ff7efe64b336efa5b2951b06e0451a2c28e.

W17 introduced durable exact-identity predispatch claims to stop two workers from paying for the same public Jev question. A crash could leave the claim held indefinitely, and until W18 the worker lacked a separate read-only monitor.

W18 binds new pending claim receipts to their deterministic native Jev call identity. A protected-store-only doctor compares pending claims against the existing native cognition budget call ledger, reports only bounded aggregate counts for RESERVED, DISPATCHED, SETTLED, missing proof and unknown status, and distinguishes fresh vs stale holds. No raw claim IDs, task bodies, credentials or provider payloads leave protected state. The existing worker zero-spend hourly UberMind proof monitor emits changed or pending-risk status as UBERMIND_JEV_PENDING_CLAIMS. W18 never clears an uncertain reservation, retries a model, creates paid-call authority or claims economic cost savings. Six hostile tests cover this boundary.

Economic 33333x remains UNKNOWN: no independent new quality benchmark or provider bill was generated. All 890 original founder ideas and old E1/E3/Jev source and cost receipts remain recoverable. The risk this fixes is operational blindness and silently stranded paid-call claims, not a new model equivalence claim.

Require native Node tests and exact-SHA Render deployment before calling LIVE.

PHOENIX UBERMIND-W18-20261009-UNRESOLVED-DURABLE-PROVIDER-CLAIMS-INSPECTION.
