# OMNIA V9 Real Outbound Canary Contract (Design Only -- NOT EXECUTED)

Per explicit mission instruction: this document designs the future first real-outbound canary. **Nothing in this document is executed by this mission.** No real send occurs. No owner approval is solicited by this document -- it only specifies what such an approval would need to name.

## Prerequisite: Gmail adapter readiness

Before this contract can move from design to execution, a real Gmail adapter implementing [`external-effect-adapter.mjs`](../../src/omnia-v9/integrations/external-effect-adapter.mjs)'s four-method contract would need to exist and be tested against a **disposable test Gmail account**, not built or exercised in this mission. Per [`V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md`](./V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md):

| Requirement | Gmail's actual capability |
|---|---|
| Pre-generated logical effect identity | Caller-set `Message-ID:` header, **plausible but not yet empirically verified** in a live account |
| Dispatch tracking | Yes -- the durable `DISPATCHING` marker this mission built is provider-agnostic |
| Post-send provider identifier | Gmail's own message `id`, returned synchronously if the response is received |
| Uncertain-result recovery | Only via `Message-ID:` + `rfc822msgid:` search -- **narrower than Stripe-style idempotency, but real** |
| Lookup / reconciliation | `rfc822msgid:` is a real, documented Gmail search operator |
| Safe duplicate suppression | Enforced by this system's own business-key partial unique index, not by anything Gmail provides |

**This is not a blocker in the sense of "Gmail cannot work at all"** -- it is a blocker in the sense that the one open item (does Gmail preserve a caller-supplied `Message-ID:` verbatim?) has never been empirically confirmed in this codebase, because no live send has ever occurred. The first real canary's first job, before any customer-facing content is sent, would be verifying exactly that against a disposable test account.

## Maximum scope

- **1-5 emails total**, hard cap, no exceptions.
- **Explicit, written Mohamed approval**, naming: the exact recipient list (see below), the exact email content, the exact expiry, and the exact kill-switch trigger. Not implied by any mission's existence -- a separate, explicit act.
- **One tenant, one campaign** -- no cross-tenant fan-out.
- **Known public business recipients only** -- e.g. a generic `info@` or `contact@` address of a business that already publicly solicits inbound contact, never a private individual, never anyone from a purchased or scraped list.
- **Existing legacy safety underneath unchanged** -- `src/send-safety.mjs` and the legacy eligibility path remain exactly as they are today; this canary would run *alongside*, never *instead of*, that existing gate.
- **A separate Gmail/provider account**, if available, so a mistake cannot touch UberBond's primary sending reputation or existing customer relationships.
- **A stable logical effect identity, pre-generated before dispatch** -- exactly the `businessKey`/`providerEffectIdentity` pattern this mission already built and tested against the null-sink simulator.
- **A pre-generated `Message-ID:`** set explicitly in the raw MIME headers before send (a genuinely new line of code in `src/gmail.mjs`'s `sendEmail()`, which today sets no explicit `Message-ID:` at all -- see the Gmail research doc).
- **No follow-up automation** -- a human reads every reply, if any; nothing in this system auto-responds.
- **No payment authority anywhere in scope.**
- **An immediate kill switch** -- this mission's own `OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH` mechanism, verified in this mission to block new dispatch while preserving read-only recovery of anything already attempted.
- **Manual observation** -- Mohamed (or a designated reviewer) watches every one of the 1-5 sends in real time; no unattended batch.
- **An explicit expiry** -- the approval authorizing this canary expires automatically (the same signed, revocable, expirable approval mechanism already proven in the zero-consequence canary), not left open-ended.

## Owner approval card (template -- not filled in, not issued)

```
REAL OUTBOUND CANARY APPROVAL
------------------------------
Approver:            Mohamed (explicit, written, dated)
Tenant / campaign:    <exact single tenant/campaign name>
Recipients (max 5):   <exact list of public business addresses, one per line>
Email content:        <exact, final, reviewed subject + body>
Provider account:     <primary vs. dedicated test account -- name it>
Message-ID scheme:    <exact deterministic format, e.g. <canary-{executionId}@uberbond.example>>
Kill switch:          OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH, verified armed before send
Expiry:               <exact ISO 8601 timestamp, <= 24h from issuance>
Reviewer presence:    <name of the human watching every send in real time>
Rollback/compensation plan: <exact text of what happens if a send should not have occurred -- see V9_EXECUTION_RECEIPT_SEMANTICS.md's suppression/compensation distinction; rollback of an already-sent email is impossible and this card must not claim otherwise>
Explicit prohibition: no follow-up automation; no payment authority; no live outbound beyond this exact list
```

## What this document does not do

It does not name real recipients. It does not issue or request the above approval. It does not build a real Gmail adapter. It does not soften the one open empirical question (Message-ID preservation) to make the canary look closer to ready than it is.
