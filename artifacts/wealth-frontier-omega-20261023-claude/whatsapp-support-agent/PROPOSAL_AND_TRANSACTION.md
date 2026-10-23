# First-cash transaction — WhatsApp agent for n8n buyer 323862

**Status: UNSENT. No message, account action or payment request has been made.** Sending needs the founder's exact approval and the founder's own n8n Community account.

## Buyer facts (read 23 Oct 2026, ~11:15 UTC)

- **Topic:** [323862](https://community.n8n.io/t/n8n-expert-needed-ai-whatsapp-support-agent-hindi-english/323862), "N8n Expert Needed: AI WhatsApp Support Agent (Hindi + English)", posted 04:25 UTC.
- **Poster:** `Danish_Koul_14` ("Danish Koul"). Account created 17 Oct 2026, trust level 1. A second topic by the same poster was deleted.
- **Business:** D2C wellness brand in India with one digital product. Receives 50–100 WhatsApp and email queries a day.
- **Wants:** steps 1–4 first, phased. Asks for pricing (hourly or fixed), Phase 1 and full cost, timeline, maintenance options and running costs.
- **Budget:** not stated.
- **How to reply:** public replies are closed; contact is by direct message (or email or application form, none of which is published).
- **Competition:** expected to be heavy. A comparable n8n post drew 19 priced replies in 9 hours, quoting $60–$650.

## Why this outranks every other route found

| Route | Blocking fact |
|---|---|
| Expensify $250 bounties | Founder is banned on Upwork, Expensify's only payment channel, and has no Mac for iOS testing. **Dead.** A new Upwork account would be ban evasion. |
| Intutiv $100 trial | 4 weeks old, 27 applicants, LinkedIn and Upwork channels. Low expected value. |
| JHipster bounties | The newest $500 bounty is closed to outside contributors. The $500 paid on 7 Oct went to the core maintainer. The rest are stale. |
| HG Studio referral | Founder has no introductions to make. |
| Algora bounties | Stripe Connect's cross-border payouts do not cover Egypt. Global Payouts does (wire, EGP), but Algora's use of it is unverified. |
| **This buyer** | Real, priced-by-request, posted today. **The deliverable already exists and passes 14/14 end-to-end scenarios.** Payment can be a direct bank or Wise transfer, which needs no Upwork, PayPal, Mac or network. |

The edge is that the competitors are pitching while this offer arrives built. The README lists exactly what was tested.

## Channel rules (verified 23 Oct 2026, n8n topic 323896 and the Jobs guidelines)

- **New accounts can't send direct messages yet.** A moderator's guidance: spend 10–15 minutes on the forum reading topics, with no replies needed, to reach the Basic trust level that unlocks DMs. At least one competing supplier was already blocked by this on 23 Oct.
- **The Jobs category forbids AI-generated posts.** Read the draft below, change anything that isn't how you'd say it, and send it as your own private message. Never post it publicly; public replies on the topic are closed anyway.
- If DMs remain unavailable, stop. Do not post publicly or guess an email address.

## Message to send (founder's account, direct message to `Danish_Koul_14`)

> **Subject:** Phase 1 WhatsApp agent — already built and tested
>
> Hi Danish,
>
> Before writing, I built your Phase 1 (steps 1–4) as an n8n workflow. I tested it end to end on n8n 2.15.1 against mocked WhatsApp, OpenAI, Razorpay, Slack and Google Sheets, and 14 of 14 scenarios pass:
> - Hindi, Hinglish and English replies.
> - FAQ answers only from your docs.
> - Razorpay payment status, without ever repeating the customer's email or phone.
> - Refunds logged to Sheets as pending approval, then posted to Slack.
> - Angry or dispute messages going straight to a human with the chat history.
> - WhatsApp's duplicate webhook retries ignored, so nobody gets two replies.
>
> **Phase 1:** US$400 fixed. I set it up on your n8n with your FAQ, Razorpay, Sheet, Slack and WhatsApp number, plus 7 days of fixes, ready 3–4 days after access.
> **Phase 2:** Gmail drafted replies and the weekly report, US$250.
> **Maintenance:** optional, US$60/month.
>
> **Running costs at 50–100 chats a day:**
> - WhatsApp replies inside the 24-hour window are free.
> - OpenAI is about US$2–6 a month.
> - Self-hosted n8n is about US$5–10 a month. WhatsApp's delivery and read callbacks count as executions, which pushes n8n Cloud past its Pro plan.
>
> I'm Mohamed, based in Egypt, building with AI-assisted engineering. I don't have earlier client deployments to show, so this build is my portfolio for your request. Payment could be 30% to start and 70% after you accept it live on your number, by bank transfer or Wise.
>
> Want me to send the workflow file and the test log?

**Approval scope requested:** one direct message, this exact text, from the founder's existing n8n Community account. No attachments in the first message, no follow-up without new approval, and no price change without approval.

## Transaction compiler

`Danish (buyer) → accepts Phase 1 at $400 → 30% deposit → deploy → buyer accepts live → 70% → bank credit → reconcile`

| Money-in-bank question | Answer now | Status |
|---|---|---|
| Who approves payment | Danish Koul or the brand's payer | Buyer-dependent |
| What causes approval | Phase 1 working live on their WhatsApp number against the agreed scenarios | Proven on mocks only |
| What must be delivered | Deployed workflow, configured credentials and FAQ, the 14-scenario acceptance list, 7 days of fixes | Built |
| Receiving account | Founder's Egyptian bank account able to receive a USD SWIFT transfer, or EGP via Wise | **Founder confirms** |
| Fees | Payer's bank or Wise fee; Egyptian receiving bank SWIFT fee, often about US$10–25 (unverified for the founder's bank); FX spread if converted | Unverified |
| Hold | None for a direct transfer; 1–3 business days in transit | Typical, unverified |
| Withdrawable in Egypt | Yes for a domestic bank credit | Founder confirms |
| Tax or documents | Founder has no tax number. An invoice from an individual is still possible; Egyptian registration for freelance income is a compliance item to settle with the ETA or an accountant, not a step to hide | Founder-owned |
| Reversal risk | Bank transfers are hard to reverse; the risk is non-payment of the 70% after handover, capped by the 30% deposit | Disclosed |
| Net positive | $400 − ~$25 transfer fees ≈ **$375** gross cleared. Delivery is 3–5 founder hours with Claude (estimate); variable cash cost $0, as the buyer pays their own API and hosting | Arithmetic, not a quote |
| Collection evidence | Bank statement line plus buyer acceptance message, reconciled through the existing canonical payment truth | Not yet existing |

**Proof-ladder position:**
- Reached: CONCEPT → MECHANISM IDENTIFIED → PUBLIC SOURCE VERIFIED → BUYER DEMAND OBSERVED → **DELIVERY CAPABILITY VERIFIED** (mocks).
- Next: PAYMENT ROUTE VERIFIED (founder bank) → AUTHORIZED MARKET EXPERIMENT (approved DM) → OFFER ACCEPTED → …

**Kill conditions:**
- The buyer goes silent for 5 days after the DM.
- The buyer insists on Upwork.
- The buyer's budget is below US$150.
- The buyer requires a non-transfer payment method the founder cannot receive.

**Reuse if this buyer declines:** the same build fits every "WhatsApp AI support agent" request. These recur on the n8n Jobs board and elsewhere, and an Arabic/English variant suits MENA brands. The next buyer costs configuration time, not a rebuild.
