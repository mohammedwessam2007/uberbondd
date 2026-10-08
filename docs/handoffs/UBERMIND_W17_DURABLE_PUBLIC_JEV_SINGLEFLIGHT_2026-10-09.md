# UberMind W17: Durable Jev predispatch single-flight

Date: October 9, 2026 Cairo. Additive to W16, preserves all 890 founder originals and prior decisions and receipts.

## Observed vulnerability and repair

W16 reuses the same previously billed public Jev advisory answer after the first batch finishes, but two worker processes could both miss the cache concurrently and each dispatch a paid model call. W17 adds a transaction-lock-protected claim to the same existing protected reuse ledger. The claim binds the precise public tenant, credential scope, source/version digest, quality contract, typed questions, input ceiling, price/model route and valid authorization. A competing same-identity worker is refused before any paid provider call. A process crash leaves a durable hold, never an automatic retry; a confirmed zero-call response may release the claim only for the owning operation. A completed billed and validated result may finalize and remove the claim only for that owner. Tampered claims and mismatched identity refuse.

Changes: src/jev-public-answer-reuse.mjs; src/jev-shared-state-tensor.mjs; src/jev-governed-runtime-service.mjs. Five hostile direct claim tests and an independent two-worker concurrency integration test use local mocked provider calls and explicitly serialized protected-state transactions.

## Truth and economics

This fixes concurrent double-spend for EXACT SAME eligible PUBLIC Jev advisory request. It does not reduce distinct inference workload, create Crown authority or independent quality admissions, make an open-ended model equivalent to Opus, or establish an observed provider invoice reduction. Real measured all-in 33333x remains unknown. Pending/unknown dispatches require explicit reconciliation; no automatic lease-expiry retry.

## Proof frontier

Only declare verified live after actual Node suite and exact SHA Render deployment. Existing Jev and provider authorization rules remain in force. No new provider charge, customer outreach, subscription, or model spending is authorized by this change.

PHOENIX: UBERMIND-W17-20261009-DURABLE-JEV-SINGLEFLIGHT-NO-SECOND-UNCERTAIN-CHARGE.
