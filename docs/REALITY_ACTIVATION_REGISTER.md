# Reality activation register

Every gate between this repository and a real business, what is missing from
each, and exactly what UberBond does automatically once it opens.

Nothing here is prepared-and-fired. Each packet is built and left unexecuted:
executing any of them requires an owner action this repository cannot take on
its own, and several of them spend money or reach a real person.

Read the columns literally. `Status` is about evidence, not effort — a gate is
`BLOCKED_EXTERNAL` even when all the code behind it is finished and tested,
because finished code is not evidence about the world.

---

## 1. `OUTREACH_DOMAINS_MAILBOXES`

| | |
|---|---|
| Status | `BLOCKED_OWNER_AUTHORIZATION` — exact domains are known from the owner, but no provider account or receipt is connected |
| Targets | `uberbond.agency`; `uberbond.cloud` |
| Candidate | Maildoso monthly SMTP, exactly two mailboxes, one per domain |
| Missing evidence | Provider account identity, checkout receipt, API credential, provider-issued DNS requirements, mailbox authentication, warm-up receipt |
| Owner action | Authorize one monthly two-mailbox purchase with a hard ceiling of **$15 USD/month**, no annual/quarterly commitment; provide the credential through the protected secret channel |
| Effect class | `PURCHASE` + `CREDENTIAL` + `DNS` — external and reversible only within provider/registrar terms |
| Expected proof | Redacted provider receipt; exact DNS witness for both domains; authenticated mailbox records; real warm-up status |
| Rollback | Cancel the monthly plan, revoke the credential, pause mailboxes, remove only provider-issued DNS records after verifying no other mail service depends on them |
| Kill condition | Checkout exceeds the cap, provider terms conflict with the route, DNS requirements are ambiguous, credential cannot be stored safely, or provider health is unknown |
| Owner minutes | ~5–10 |

The candidate provider publicly documents bring-your-own-domain setup,
automated SPF/DKIM/DMARC, API/MCP access, and a 15-cold-message-per-mailbox
daily limit. These are provider claims and remain `CREATOR_CLAIM` until UberBond
records actual provider and DNS evidence. The standard public packages begin at
30 mailboxes/$75 per month; UberBond must not buy that package merely to unblock
the two-mailbox canary. The exact custom-plan price must be read at checkout and
must remain at or below the owner gate above.

Sources:

- <https://maildoso.ai/>
- <https://maildoso.ai/pricing>
- <https://developers.maildoso.com/>

**What UberBond does next automatically:** connect the exact domains; collect
the provider's real DNS contract; prepare the minimum GoDaddy changes; verify
public records; create one mailbox per domain; persist redacted receipts; start
warm-up; and stop at any unknown/uncertain provider state. It does not send a
campaign automatically.

---

## 2. `MODEL_PROVIDER_CANARY`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — no provider credential exists |
| Missing evidence | One real completion from one real provider |
| Owner action | Supply one provider API key and an authorised spend ceiling |
| Credential | One of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| Scope | One task class, one model, one call |
| Cost ceiling | **$1.00**, enforced by the compute reservation before the call |
| Effect class | `PROVIDER_CALL` — no business external effect |
| Expected proof | A durable result receipt with usage, latency, cost and a digest |
| Rollback | Revoke the key. No durable business state is created by a canary. |
| Kill condition | Any spend above the reservation, any non-zero business effect ledger, any secret in the result |
| Owner minutes | ~5 |

**What must be proven:** the credential works, the provider is reachable, the
route selects, the compute budget is respected and measured, the receipt is
durable, no secret leaks into it, and no business external effect occurs.

**What UberBond does next, automatically:** the cognitive loop begins running
against a real provider instead of a deterministic fake. Nothing is sent to
anyone; the loop's output is local artifacts and receipts.

---

## 3. `SCHEDULER_LIVE_OBSERVATION`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — nothing fires on a clock |
| Missing evidence | Occurrences firing on a schedule this process does not control |
| Owner action | Point a scheduler at `scripts/agent-mesh-tick.mjs` |
| Environment | `AGENT_MESH_OCCURRENCE_KEY` unique per delivery |
| Effect class | Local only until other gates open |
| Expected proof | Cycle receipts at distinct occurrence keys, across a process restart |
| Rollback | Stop the schedule |
| Kill condition | Two receipts for one occurrence key; a cycle with no receipt |
| Owner minutes | ~10 |

**Do not fake elapsed duration.** Every multi-day tier depends on days actually
passing. There is no compression available and none should be invented.

---

## 4. `SANDBOX_ISOLATION_ATTESTATION`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — and unfixable from inside, by construction |
| Missing evidence | An attestation from the layer that enforces the network boundary |
| Owner action | Provide `CLAUDE_CODE_SANDBOX_ISOLATION_FILE` from that layer |
| Expected proof | A signed statement naming the enforcing layer and the boundary |
| Kill condition | Any attestation this process could have written itself |
| Owner minutes | ~15 |

A Node process cannot make the network unreachable to its own children, so a
Node process signing its own isolation receipt is the self-attestation this
codebase exists to refuse. The provisioner is built and tested; only the
attestation is missing, and it must come from outside.

---

## 5. `HUMAN_PAGER`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — transport `UNCONFIGURED` |
| Missing evidence | One delivery a human confirms receiving |
| Owner action | Configure one human-reachable transport |
| Effect class | Reaches a real person — requires explicit authorization |
| Expected proof | `DELIVERED_VERIFIED` with a human acknowledgement |
| Kill condition | Any transport that reports delivery it cannot witness |
| Owner minutes | ~15 |

The adapter must distinguish four states and never collapse them:
`NOT_CONFIGURED` · `ATTEMPTED_FAILED` · `ATTEMPTED_UNKNOWN` ·
`DELIVERED_VERIFIED`.

---

## 6. `GMAIL_READONLY`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — no grant |
| Missing evidence | A real inbound message classified from a real mailbox |
| Owner action | Grant `https://www.googleapis.com/auth/gmail.readonly` |
| Scope | Read only. Nothing in the module can send. |
| Expected proof | A classified inbound event with `rawBodyPersisted: false` |
| Rollback | Revoke the grant |
| Owner minutes | ~10 |

Privacy behaviour here is already verified against a hostile message: sender
address is HMAC'd, no body or headers are retained, and prompt injection in the
body cannot move authority off `NONE`.

---

## 7. `PAYMENT_PROVIDER`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — no account, no KYC |
| Missing evidence | A provider account that can accept a real payment |
| Owner action | Create the account and complete KYC personally |
| Credential | Webhook signing secret |
| Effect class | Financial. **Not automatable — identity verification is the owner's.** |
| Expected proof | A signed webhook reaching `handleLemonWebhook` and reconciling |
| Kill condition | Any signature that verifies against the wrong secret |
| Owner minutes | ~60, mostly waiting on the provider |

This repository must not create the account, submit KYC, or configure payouts.

---

## 8. `FIRST_BUYER`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — 0 prospects contacted, by design |
| Missing evidence | One real person who wants the bounded offer |
| Owner action | Authorize outbound, or bring a buyer directly |
| Effect class | Contacts a real person — requires explicit authorization |
| Kill condition | Any contact without a current outbound authorization |
| Owner minutes | Unbounded — this is sales, not configuration |

No prospect has been contacted, no message sent, no form submitted, no
advertisement created. That is a standing constraint, not an oversight.

---

## 9. `FIRST_CLEARED_PAYMENT`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — depends on 7 and 8 |
| Missing evidence | A provider-cleared payment event in durable storage |
| Expected proof | Three witnesses agreeing on identity **and** money: order, classification receipt, revenue ledger row |
| Kill condition | Any revenue figure without all three witnesses agreeing |

---

## 10. `FIRST_DELIVERY`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — depends on 9 |
| Missing evidence | Recorded requirements, QA evidence, delivery artifacts |
| Expected proof | State machine reaching `DELIVERED` on real references |
| Kill condition | Any evidence reference that points at nothing |

---

## 11. `FIRST_CUSTOMER_ACCEPTANCE`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — depends on 10 |
| Missing evidence | External customer evidence, from the customer |
| Expected proof | `CUSTOMER_ACCEPTED` with `evidenceClass: EXTERNAL_CUSTOMER` and a reference that points at something |
| Kill condition | Acceptance asserted by us about ourselves |

---

## 12. `FIRST_RENEWAL`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — depends on 11 plus elapsed time |
| Missing evidence | A second cleared payment on a live subscription |
| Expected proof | A renewal event bound to the same customer and product |
| Kill condition | A renewal claimed without its own provider event |

---

## 13. `KILIMANJARO_DURATION`

| | |
|---|---|
| Status | `BLOCKED_EXTERNAL` — requires days that have not passed |
| Missing evidence | 30 consecutive days of real observation |
| Owner action | None. Wait. |
| Expected proof | An observation window with matching source commit and policy versions throughout |
| Kill condition | Any compression of elapsed time |

Only a complete honest proof reaches `KILIMANJARO_READY`.

---

## Owner actions, in order, and why this order

**1. Mailbox activation gate.** Authorize the bounded two-mailbox provider
purchase and provide the credential through the protected secret channel. This
opens the highest-practical reality lane without buying a large fleet.

**2. One provider credential and a spend ceiling.** Unlocks the model canary,
with the smallest action that creates measured cognitive evidence.

**3. Point a scheduler at the mesh tick.** Unlocks the clock on the longest
duration gate.

Everything after that is commercial: an account, a buyer, a payment, a
delivery, an acceptance, a renewal, and thirty days.
