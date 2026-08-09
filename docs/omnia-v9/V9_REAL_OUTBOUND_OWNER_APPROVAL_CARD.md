# OMNIA V9 Real Outbound — Owner Approval Card

**Read time: under one minute. This is a template — nothing below is approved, and no message has been sent.**

## What will happen

Up to 5 real emails are sent from an UberBond-controlled Gmail account to real, public businesses that already publicly invite contact. Nothing else happens: no follow-up, no automation beyond the send itself, no payment action of any kind.

## Exactly how many messages

**Maximum 5. Could be fewer.** Each one requires this same approval to already be in force — none are sent automatically once approved; a human still watches each one go out.

## Exact recipients

**Not yet named — this section must list every recipient by name and address before approval is possible.** Only a public general-inquiry address (e.g. `info@`, `contact@`) of a business that already solicits inbound contact. No private individuals. No purchased or scraped lists.

## Maximum consequence if everything goes wrong

Up to 5 recipients each receive one unwanted email. No money moves. No account is compromised. No customer data is exposed. The worst realistic outcome is reputational — a recipient is annoyed or replies negatively — not operational or financial.

## Why this is eligible now

Checkpoint C (the crash-recovery gap that could cause a double-send) is closed and proven under 1,000 property-tested scenarios plus real-Postgres concurrency races (Mission 6). The Gmail adapter's own logic is proven against every scenario a controlled fake can produce, with 7 targeted mutations all caught (this mission). **What remains open**: the adapter has never sent a real email — Gmail's real preservation of the caller-generated Message-ID is still unverified empirically. This card cannot honestly claim full readiness until that gap closes.

## Kill switch

`OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH=engaged`, verified in this mission to block any new dispatch instantly while leaving already-attempted messages resolvable via read-only reconciliation. Mohamed can trigger this at any point during the 5-message window.

## Rollback / compensation

**There is no rollback of an email once genuinely sent — this card does not claim otherwise.** Compensation available: suppress any further contact to a recipient who was sent an email in error (enforced automatically — the business-key uniqueness constraint already prevents a duplicate to the same logical recipient); Mohamed is notified immediately of every send outcome for manual follow-up if needed.

## Unresolved risks, stated plainly

1. Whether Gmail preserves the caller's Message-ID verbatim — unverified.
2. How quickly Gmail's search index reflects a just-sent message — unverified, affects how fast an uncertain result can safely resolve.
3. No real Gmail send of any kind has occurred anywhere in this codebase's history — this would be the first.

## Approval expiry

This approval, once granted, is void 24 hours after issuance or after the 5th message sends, whichever comes first — not open-ended.

---

**Approved by:** _____________________ (Mohamed, explicit and dated) **Date:** _____________
