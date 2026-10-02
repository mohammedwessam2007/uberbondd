# Winnr SMTP canary approval repair — 2026-10-02

Truth class: SOURCE REPAIR + LOCAL HANDLER VERIFICATION. This receipt is not a send, warm-up activation, or campaign promotion.

The authenticated dashboard reports `CANARY_BLOCKED`: no exact route/payload approval, outbound disabled, dry-run enabled, and no saved physical postal identity. The existing public-contact prospects do not supply consent or a direct request for the offered service. SMTP ordinal 3 remains paused; IMAP custody remains intact.

The approval endpoint previously rejected `smtp-relay` even though canary prerequisites, route governance, and the dispatch adapter already supported it. It also required legacy sender slots A/B, rejecting the fleet's exact mailbox slots.

The endpoint now accepts SMTP under its existing permissioned canary policy and checks the stored sender through the existing fleet allocator. A missing, paused, disconnected, unauthorized, or provider-mismatched sender is refused; approval never silently substitutes another sender. The exact recipient, route, payload, signature, expiry, idempotency, suppression, final dispatch and domain/mailbox readiness gates remain in force.

Validation: 42 focused tests pass across the authenticated approval handler, route governance, canary dispatch, fleet allocation, operator and admin surfaces. Tests cover a permissioned SMTP approval with zero provider calls, all sender refusal cases, denial of an unsolicited public-contact route, and tampered/replayed payload protection.

Changed runtime/test files pass `node --check`. The repository-wide syntax check scans 2,583 files and fails on three existing test fixtures: `durable-decision-franchise-vault`, `infinite-opus-receipt-court-runtime`, and `infinite-opus-worker-context-vault`. Each failing file is byte-identical to baseline main; no production source parse failure was reported. Full-repository syntax is therefore not claimed green.

Next execution gate: obtain a complete owner-authorized publishable postal identity and actual recipient permission evidence. Re-research stale drafts under the current offer and actual SMTP assignment before exact approval. Do not label conservative cap configuration or a compiled UberWarm² plan as scheduled warm-up or delivered outreach.

New spend: $0. New owner seed messages: 0. New prospect messages: 0.
