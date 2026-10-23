# WhatsApp AI support agent — Phase 1 (n8n)

Built for one real, dated buyer request, then kept generic so it can be reused for the next buyer with the same need.

- **Buyer:** n8n Community topic [323862](https://community.n8n.io/t/n8n-expert-needed-ai-whatsapp-support-agent-hindi-english/323862), posted 23 Oct 2026 04:25 UTC by an Indian D2C wellness brand selling a one-time digital product.
- **Scope covered:** the buyer's Phase 1 (steps 1–4).
- **Not built:** Gmail drafted replies (step 5) and the weekly report (step 6). They are scoped as Phase 2.

**Status: delivery capability verified against mocks. Not deployed, not sold, no buyer has accepted it.**

## What it does

| Customer says | What happens |
|---|---|
| A product, access or policy question | OpenAI answers **only from the brand's FAQ text**. A low-confidence or "needs human" answer escalates. |
| A message with a `pay_…` or `order_…` id, or a payment question | Razorpay lookup. The reply states paid, failed, refunded or processing. Private fields (email, phone, card) are never repeated. |
| A payment question with no id | Asks for the `pay_` id instead of guessing. |
| A wrong-length `pay_` id | Says the id wasn't found; never sends it to the FAQ model. |
| "refund", "paisa wapas", "रिफंड" | Row appended to the Refunds sheet as `PENDING_APPROVAL`, posted to `#refund-approvals`, then acknowledged. The acknowledgement goes out **only after the sheet write succeeds**. |
| Anger, dispute, "human", "scam", "consumer court" | Escalates to Slack immediately with the recent conversation and a masked phone number. The model is not called. |
| Razorpay or OpenAI error | Escalates to a human instead of guessing. |
| WhatsApp retries the same webhook | Ignored by message-id dedupe (48-hour window). |
| Delivery/read status callbacks | Ignored. |

Hindi (Devanagari), Hinglish and English are detected per message, and the reply uses the customer's language.

## Files

| File | Purpose |
|---|---|
| `workflow-phase1.n8n.json` | Importable workflow, 17 nodes. Generated; do not edit by hand. |
| `logic.mjs` | All decision logic as plain functions. The build copies them verbatim into the Code nodes. |
| `build-workflow.mjs` | Generates the workflow (`node build-workflow.mjs`). |
| `e2e/run-e2e.mjs` | Starts a real n8n plus mocked WhatsApp, OpenAI, Razorpay, Slack and Sheets, then runs 14 scenarios. |
| `e2e/evidence.json` | Result of the last end-to-end run. |
| `../../../tests/whatsapp-support-agent-logic.test.mjs` | 12 unit tests over `logic.mjs`. |

## Verification

- **Unit:** `node --test tests/whatsapp-support-agent-logic.test.mjs` passes 12/12.
- **End to end:** `node e2e/run-e2e.mjs <n8n-bin> <scratch>` passed **14/14 on n8n 2.15.1**, with zero real providers contacted.
- **Bugs caught by the end-to-end run and fixed before delivery:**
  - "When do I get access?" was misrouted to a payment lookup.
  - A malformed `pay_` id fell through to the FAQ model.

  Both are now regression tests.
- **Production import:** `workflow-phase1.n8n.json` imports and exports cleanly in n8n 2.15.1.
- **Deviation:** the mock run swaps the native Google Sheets node for an HTTP call, because Google OAuth can't be mocked locally. The native node is checked by import only.

## Setup in the buyer's n8n (about 1–2 hours with access)

1. Import `workflow-phase1.n8n.json`.
2. Create credentials:
   - **OpenAI** API key.
   - **Razorpay** as HTTP Basic Auth: user = key id, password = key secret. A read-only key is enough.
   - **WhatsApp** as HTTP Header Auth: name `Authorization`, value `Bearer <permanent system-user token>`.
   - **Slack** bot token with `chat:write`.
   - **Google Sheets** OAuth.
3. In every Code node's `SETTINGS`, set the brand name, the verify token and the FAQ/policy text. Then rebuild with `build-workflow.mjs` rather than editing four copies by hand.
4. Create a Refunds sheet with headers `received_at, customer_name, whatsapp, payment_id, order_id, language, customer_message, status, message_id`.
5. In Meta's app, point the WhatsApp webhook to `https://<n8n-host>/webhook/whatsapp-support`, use the same verify token, and subscribe to `messages`.
6. Publish the workflow, then send test messages from a second phone.

## Running cost for 50–100 queries a day

Estimates, not quotes.

| Item | Estimate | Note |
|---|---|---|
| WhatsApp Cloud API | ≈ ₹0 for replies | Since 1 Jul 2025, free-form replies inside the 24-hour customer-service window are free. Only template messages outside it are charged (utility ≈ ₹0.115, marketing ≈ ₹0.86, plus 18% GST; third-party figures, check Meta's rate card). |
| OpenAI `gpt-4o-mini` | ≈ US$2–6 a month | FAQ questions only; payment, refund and escalation paths make no model call. |
| n8n hosting | Self-hosted ≈ US$5–10 a month | Each status callback (sent, delivered, read) is also an execution, so ~100 chats a day is ~12,000 executions a month. That is above n8n Cloud Pro's 10,000 (≈ €60 a month), so self-hosting is the honest recommendation at this volume. |

## Known limits (Phase 1)

- The Hindi reply strings were written without a native Hindi reviewer. Have a Hindi speaker read them before go-live.
- Razorpay's `authorized` state means the bank approved but the merchant has not captured the payment; Razorpay refunds it automatically if it is not captured within the capture window. Razorpay's own pages disagree on the number (the payments and capture-settings pages give 3 days as the default maximum, configurable down to 12 minutes; the late-authorisation pages say 5 days), so the agent says "usually 3 days" rather than promising completion or a hard deadline.

- Conversation history and dedupe live in n8n workflow static data. That is fine for one instance at this volume; move to Postgres or Redis for multi-instance or high volume.
- No outbound template messages. The agent only replies inside the 24-hour window.
- The Gmail channel and the weekly report are Phase 2.
