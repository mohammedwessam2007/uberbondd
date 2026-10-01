# Crown financial reconstruction — 2026-10-01

## Scope and truth boundary
Financial attribution only. No old response, hidden task or Crown admission is recovered by this receipt. The old retained exact callId-to-generation binding is absent. Attribution is reconstructed from a single-dispatch execution trace and the sole matching provider generation; it is explicitly labelled FORENSIC_SINGLE_DISPATCH_WINDOW, retainedExactBinding false. It must never be represented as retained cryptographic linkage.

## Independent source observations
Original private command SHA256: 736e1222b20aa7bc0055c0da9258e97d7d5e3b33197508b3fc5948279eb28a14. Its claim fixes the call order and call IDs. Existing claim snapshot: sha256:cdaaf3398ee5c78f5e95b44bd45325b3545464aefb8ff3616a4aae97345dcafa. The first candidate is Opus. Original ledger records that first call DISPATCHED and the other three RESERVED.

Render build trace:
- 2026-09-30T22:39:24.822759651Z SEALED_REQUEST_BOUND: Opus, 2218 body bytes, no tools.
- 2026-09-30T22:39:33.938125970Z SEALED_CROWN_RESULT: uncertain-charge-or-identity-stop-no-retry, paidCalls 1, automaticRetryAllowed false.
- Earlier 22:37 attempt stopped at pricing with paidCalls 0.

OpenRouter's complete visible 24-hour generation inventory was refreshed on October 1 at approximately 22:00Z. Exactly one UberBond Infinite Opus generation matches the original execution window; surrounding generations are the later Gemini custodian attempts, later v7 Opus, and the separately recorded earlier MiMo canary.

Matching bill: gen-1790807964-m6HWX42a5VtncUFVBpL1.
Provider request: req-1790807964-Ve3fJIrYt0PXl3LqGRb0.
Created 2026-09-30T22:39:24.829Z, 6.24 ms after the request-bound log.
Observed anthropic/claude-opus-5.5-20260921, Amazon Bedrock, native 681 input / 425 output tokens, USD0.011224. Provider usage and upstream usage agree, one provider response HTTP200, no fallback, session_id null.

## Bounded repair
Before any replacement inference, reread this generation through the runtime's existing private key and require exact generation/request identity, timestamp, pinned model/provider, native token counts and charge. Require the unchanged original claim snapshot and exact four ledger statuses. Settle the first call at observed 11224 microusd and release only three provably undispatched reservations. Preserve every original failed attempt. Add a financial-only reconstruction receipt with explicit provenance; no semantic promotion.

Replay is idempotent. Contradictory bills, changed claim, provider/model drift or another dispatched reservation refuse atomically. No provider secret, task prompt, rubric or model answer appears here.

## Replacement authority
The owner answered “Finish it all” at 2026-10-01T21:51:58Z immediately after a precise request for one replacement sealed evaluation up to USD0.45 under the existing USD20 monthly key cap. This is recorded as the bounded approval requested, not new monthly consent or unlimited spend.
Attempt key: infinite_opus_crown_replacement_20261001_r1.
The old v7 failed key is preserved and never reset. One atomic claim, no automatic retry, existing sealed custodian/candidate/blind evaluator/adjudicator, encrypted checkpoint including evaluator output, exact provider revision, strict ZDR/no fallback/no unsupported temperature. Existing October runtime authorization is reused.
Protected key headroom must remain at least USD15 after the USD0.45 ceiling.

## Validation
40 focused local tests pass, zero failures: existing 24 and 16 financial/replacement refusal, replay, tampering, reserve and concurrent-trigger tests. These are source verification, not model quality evidence. CI verification and live activation are not claimed by this source receipt.
