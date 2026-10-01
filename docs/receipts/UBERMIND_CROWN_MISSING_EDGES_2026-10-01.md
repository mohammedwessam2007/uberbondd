# Crown missing edges — 2026-10-01T23:40Z

## Verified recovery
PR #1132 merged at 1a2afcb3e750c21335cc0d223030b6bdc19fcf2b. LIVE normal deploy dep-davdj1egekts73dl9hig finished 22:08:14Z. Independent concurrent work merged #1127 at 3691160aa54a3b8714c22e517e9aea2e90c43706; preserved. Diagnostic-only normal deploy dep-daver1u7bikc73dpsjng is LIVE on that main, finished 23:33:35Z.

Read-only PostgreSQL evidence at 23:33:27Z proves original call SETTLED at 11224 microusd with its explicit forensic provenance, three undispatched calls RELEASED, ledger version 6. Retained exact old call-generation binding remains false. No old semantic promotion.

## Paid replacement outcome
Attempt infinite_opus_crown_replacement_20261001_r1 stopped FAILED_NO_AUTOMATIC_RETRY at 22:09:46.245Z.
Reason: model-identity-drift:openai/gpt-6.1-sol-pro:openai/gpt-6.1-sol-pro-20260929.
Observed spend USD0.06503775:
- custodian gen-1790892485-fQko2TrlRCNPUJ3SD9EO, google/gemini-2.5-pro, Google, USD0.01053375
- first Opus gen-1790892512-UbTWrlnGj57GXlT32paI, anthropic/claude-opus-5.5-20260921, Amazon Bedrock, USD0.03676
- first Sol gen-1790892555-BOCiTbz8qFX9HAnXIRR3, openai/gpt-6.1-sol-pro-20260929, Azure, USD0.017744

All three generation IDs and costs are durably journaled. No uncertain new charge remains. Last Sol bill is RECONCILED_INVALID_EVIDENCE under the then-current alias-only check. Raw Sol response was not saved before refusal; it cannot be counted as retained quality evidence.

Checkpoint encrypted and present. Task commitment sha256:f94ea677f0c335badff2ac12205d2c6cf6ba9c4a9e2f34b42cf5421a24826f66. Hidden tasks and first Opus answer remain inside runtime, never emitted to optimizing agent. Total Crown-related provider charges recovered so far: USD0.223063, excluding the earlier MiMo transport canary. All-in runtime cost remains UNKNOWN.

## Minimum continuation, prepared without spend
Pin only observed exact Sol revision plus Azure, refuse any different revision/provider. Save candidate provider response encrypted before identity refusal so future paid evidence cannot be lost in this way.

Read and authenticate the existing checkpoint privately, recompute task commitment, validate retained first-Opus answer hash/model/provider, reread all three prior bills before paid continuation, and preserve source failed state.
Exactly four missing calls: first Sol answer (lost after billing), second Opus answer, second Sol answer, blind evaluator. Zero new custodian calls and zero regeneration of retained first Opus.
Separate atomic attempt infinite_opus_crown_resume_20261001_r2; no automatic retry. Incremental ceiling USD0.30; evaluation including prior USD0.06503775 remains at most USD0.36503775 and below original USD0.45. Existing monthly key cap USD20 and protected Crown reserve unchanged.

OWNER_GATE: a distinct explicit authorization is required to resume these four edges after a failed paid state. No R2 owner receipt has been minted or installed. Monthly October runtime authorization already exists and is not the missing permission.

## Source verification
51 focused local tests pass, zero failures, including an end-to-end synthetic continuation that dispatches only the four missing edges and then refuses replay. Synthetic trial outputs grant zero live Crown authority. CI still has no executed verification steps.
Crown unadmitted; TypingMind unsaved; no production E2E request or production economics settled.
Fresh full-context modeled 1.0118806695078688x; certified residual modeled 14.161946017994001x; compiled recurrence benchmark 33,333.345x; production realized UNKNOWN.

## Authentication
Secure Render browser sign-in timed out. The gateway bearer was not revealed, replaced or rotated. A fresh signed-in Render browser is still required to securely configure the existing bearer in TypingMind. Do not ask for credentials in chat.
