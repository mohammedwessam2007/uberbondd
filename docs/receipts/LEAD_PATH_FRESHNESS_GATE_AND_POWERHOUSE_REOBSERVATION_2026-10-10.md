# Lead-path freshness gate + Powerhouse/Sylvester re-observation | 2026-10-10 (Africa/Cairo)

**Truth class:** VERIFIED_SOURCE_CHANGE + DATED_PUBLIC_REOBSERVATION. Zero external effects: no prospect contact, no form submission, no send, no provider/account/DNS/payment change, no production write, no paid API call.

**Base:** `main` `cda13c65e895b679499dacba2f100bfd5812e48a`.

## Blocker selected

The only ranked prospect (Powerhouse Consulting Group → client Sylvester Electric) depended on a claim observed `2026-10-02T19:57:19Z`. The Oct 8 23:38Z G-SPOT readout still reported `READY_FOR_AUTHORIZATION` six days later. The Oct 9 recheck then found possible page drift (`docs/receipts/POWERHOUSE_PROOF_RECHECK_2026-10-09.md`).

Root cause in source:
- `src/prospect-verification-intake.mjs` checked only that `clientEvidence.observation.observedAt` parsed. It had no maximum age, so a stale quoted claim stayed eligible forever.
- `src/prospect-message-tournament.mjs` hardcoded `sourceFreshness: 1`, so a stale claim scored as perfectly fresh.

This is the highest-value internally solvable blocker. Sender-side Egypt law, fresh transport and the founder's per-message authorization are external. A truthful first touch, however, is a precondition of any accepted revenue, and the system could not tell a current claim from a drifted one. The founder had to catch it by hand.

## Change

- New `EVIDENCE_OBSERVATION_MAX_AGE_MS = 24h`. This encodes the same-day law already written in the Oct 9 receipt and prepayment handoff step 2.
- A lead-path observation older than 24h yields `INCOMPLETE` with `lead-path-observation-stale-recheck-required`, which preflight maps to `BLOCKED_EXTERNAL_FACT`. A future-dated observation is `REJECTED`. Callers may only tighten the window, never widen it.
- Intake now reports `evidenceFreshness` (scope, maxAgeMs, age, freshness, recheckRequired).
- The tournament uses an in-window bucket (1/0) instead of the constant 1. It is a bucket, not a continuous value, because the policy output is bound into the frozen effect digest. A continuous value broke frozen-effect revalidation (`material-effect-binding-changed`), which baseline comparison caught and this design fixed.
- Recipient-address age is unchanged and still owned by `src/contact-source-verifier.mjs` (7-day `CONTACT_SOURCE_MAX_AGE_DAYS`).

## Tests

- `tests/prospect-evidence-freshness.test.mjs`: 10/10 pass. It covers the window boundary, inclusive edge, future rejection, tighten-only override with garbage inputs, recipient-age ownership, a control (READY on observation day), the regression (Oct 2 evidence at the Oct 8 23:38Z readout is `BLOCKED_EXTERNAL_FACT`, never READY, with no draft, zero writes and zero effects), and restoration via normal same-day re-observation.
- Mutation check: disabling only the stale-age line fails 3 of the 10, including the regression.
- Focused prospect/preflight/tournament/frozen-effect/revenue-core set: 105/105.
- Full deterministic suite: 9,902 tests, 60 failures before the bucket fix. The 33 failing files were re-run on unmodified `main`: **0 new failures** after the fix, and 58 pre-existing. The two in `revenue-singularity-evidence-bridge` (payment/collection, deferred LAST) and the syntax failure in `tests/infinite-opus-haiku55-live-canary.test.mjs:37` predate this change.

## Public re-observation (WebFetch, ~2026-10-10T00:38Z)

| Page | Result |
|---|---|
| `https://sylvesterelectric.com/` | Contains both "Emergency service available during business hours and for qualifying after hours situations." and the services card "24/7 Emergency Service … we respond fast, any time." (phone 978-957-3422) |
| `https://sylvesterelectric.com/home` | Same two statements present |
| `https://mypowerhouse.group/` | Real content (no interstitial). Testimonial attributed "Nick Sylvester, Owner, Sylvester Electric". No email published |
| Recipient source `…/event/webinar-servicetitan-field-mobile-app-advanced-features/` | Real content. Exact excerpt unchanged: "Also available to non-clients – just email hello@mypowerhouse.group for more information!" No anti-solicitation statement |

Conclusion: on Oct 10 the historical same-page inconsistency survives on **both** `/` and `/home`, and the client relationship is publicly evidenced. This supersedes the Oct 9 `RECHECK_REQUIRED` state for these observations, but only for 24 hours.

Limits: WebFetch returns model-extracted text, not raw bytes. Raw HTML capture from this sandbox was refused by the egress allowlist (CONNECT 403) and was not retried. Before any send, take a same-day owner screenshot or raw capture. The observation expires **2026-10-11T00:38Z** under the new gate.

## State through the real preflight (2026-10-10T00:42Z)

| Input | State | Blockers |
|---|---|---|
| Stored Oct 2 evidence | `BLOCKED_EXTERNAL_FACT` | `lead-path-observation-stale-recheck-required` |
| Re-observed today, Egypt sender-side law unresolved (actual) | `BLOCKED_LEGAL_AUTHORITY` | `sender-side-legal-authority-hold-unresolved` |
| Re-observed today, sender-side resolved (hypothetical; fixture identity/policy) | `READY_FOR_AUTHORIZATION` | none |

The production store was **not** updated. Loading the re-observed evidence requires an owner-authenticated action. Nothing here grants send authority.

## 890 crossover

Supported by `founder-moonshot-0483` THE TRUST GRADIENT (graded trust over provenance, replication, causal support, **recency** and applicability) and `founder-moonshot-0449` THE REALITY TYPE SYSTEM (an observation is not a verified fact). The gate implements a bounded recency dimension only. Neither idea is claimed realized.

## PHOENIX

`UBERBOND-LEAD-PATH-FRESHNESS-GATE-20261010` — the quoted-claim staleness defect is fixed and regression-tested, and the Powerhouse/Sylvester proof was re-observed as surviving at 2026-10-10T00:38Z (24h validity). Remaining revenue blockers are external: Egypt sender-side determination, fresh SMTP/placement for the selected mailbox, and the founder's per-message authorization.
