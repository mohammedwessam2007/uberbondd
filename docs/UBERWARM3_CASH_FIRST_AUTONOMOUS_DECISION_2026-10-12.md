# PHOENIX: UberWarm³ cash-first operational decision — 2026-10-12

**Founder instruction:** make the engineering and spending decisions autonomously to obtain a stronger real-world alternative to Winnr's optional warming network, without offloading tradeoffs to the founder.

**Truth class:** Branch source implementation + independent vendor/documentation review + Gmail search. No paid Startup purchase, no paid warm-up activation, no live seed network activated, no externally observed performance improvement.

## Decision

DO NOT manufacture warming emails or reciprocal engagement loops. Such traffic is not equivalent to real recipient interest; false delivery confidence would create domain loss and fraud/spam risk. A network of mutually automated positive replies cannot prove an actual deliverability advantage.

DO NOT automatically buy $30 warming for 50 mailboxes. **Owner budget cannot absorb the extra add-on.** Prefer the existing purchased $9 Winnr pre-warmed pilot, one or two actually healthy sending identities, and genuine eligible recipient correspondence with guarded gradual ramps. Protect quarantined ordinal 3.

DO NOT automatically buy or claim an activated $69 Startup fleet before qualified, legally eligible recipient supply and refreshed sender capacities justify it. Founder previously indicated willingness to purchase Startup, but previous Gmail/provider receipts and most recent mail search did not verify a checkout. Source/financial certainty is below transaction confirmation. A genuine checkout requires fresh explicit owner approval; code must not attempt one.

Optimize cleared profit/founder-minute. The 2026-10-12 UberBond Gmail search saw no Startup purchase receipts; this is absence of Gmail evidence, not proof no purchase happened elsewhere.

## Actual software addition

1. `src/uberwarm3-cash-first-governor.mjs`: fail-closed read-only acquisition and spend decision. Known qualified unique recipient count and live pilot sender cap require independent evidence references; unknown/zero volume defers new spending. Even sufficient volume leads to *owner-confirmed checkout recommendation*, never payment. Existing subscription separate, no accidental double spend/cancellation.
2. `tests/uberwarm3-cash-first-governor.test.mjs`: six tests for zero supply, supply below existing pilot capacity, independently proven demand, unaffordable or legally blocked expansion, no double charge and non-evidenced huge raw CRM claims. Tested 6/6 under fetched-source V8 harness; NOT real Node CI.
3. `src/uberwarm3-google-postmaster-v2.mjs` correction: Google deliverability verdict is independent from compliance rows. Negative `NEEDS_WORK` or reasons `SPAM_RATE_HIGH`, `USER_FEEDBACK_NEGATIVE`, `USER_FEEDBACK_LOW`, `SMTP_ERRORS_HIGH`, `SENDER_NOT_COMPLIANT` must not be labeled green simply because SPF/DKIM rows are green. Registrable-domain aggregate is not misrepresented as evidence about a separate subdomain. Corresponding tests now 8/8 in fetched-source V8 harness, NOT exact-head Node CI.

Other UberWarm²/³ PR #1403 source modules remain separated from production: HMAC-bound owner consent and real SMTP diagnostic sends only after authorization, Postgres one-shot ledger, independent recipient-side verification, opt-in panel PLAN_ONLY, two-provider evidence and fair comparison.

## Reality research 2026-10-12

- Google sender guideline FAQ, https://support.google.com/mail/answer/14229414: 5,000/day to personal Gmail across primary domain triggers bulk sender classification, with November 2025 enforcement escalation; authentication, opt-out, complaint control essential. This is **not** a promise of safe sending below 5,000/day.
- Google Postmaster dashboard, https://support.google.com/mail/answer/14668346: non-real-time, low volume hides data, user-reported zero spam may coexist with Gmail filtering messages to spam.
- Google v2 complianceStatus schema, https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/domains/getComplianceStatus: `complianceData.rowData` and independent `deliverabilityStatusVerdict`; confirmed fixes above.
- Winnr warming vendor https://winnr.app/help/warming/how-warming-works.html: $0.60/account/mo, up to 20 network warm-up messages/day; provider advertises 2–4 week prep. No independent, identical-audience causal evidence from these vendor claims.
- Winnr https://winnr.app/pricing.html: Startup $69/mo for 50 mailboxes, warming separate. Mailboxes and message slots are not independent qualified recipients.

## Objective result

**Software quality can exceed a vendor dashboard; actual sender reputation cannot be engineered solely internally.** The strongest zero-addon path is:
- Prove DNS/auth and good real correspondent history,
- use genuinely willing owned seeds in at least two recipient provider types, but do not send farmed replies or artificially rescue Spam,
- monitor actual Postmaster and legitimate bounce/complaint outcomes,
- send a small independently eligible offer cohort only with owner and route-law authorization,
- stop/ramp on measured results and optimize genuinely qualified replies, accepted work, cleared payments.
Full 50-account warm-up/30k first-touch claims remain PROJECTION_ONLY and cannot be authorized from code, vendor capacity or elapsed time.

## Pending exact-run blockers

Original GitHub hosted Actions account billing restrictions and inability to write independent-fork verification branch (403 in previous attempt) block exact-head GitHub CI in this connector configuration. No GitHub PR merge or production deploy is approved. Review Node 22 syntax/focused tests, real transactional PostgreSQL, HMAC owner key custody, receiving-provider proof integrations, and platform authorization before rollout.

All original founder 0001–0890 ideas and further GENESIS corpus remain preserved as primary canonical pointers and higher-order missions. No commercial-goal collapse of UberBond.

## Continuation: 2026-10-12 exact-source hardening and remaining release hold

Founder request: "Continue where you left off." The historical local implementation at `/mnt/data/uberwarm2_upgrade` passed 13/13 real `node --test` on Node 22.16.0 on October 12. **This local prototype differs from GitHub PR #1403**; DO NOT misrepresent its green Node run as source acceptance of #1403. `git ls-remote` from this container could not resolve github.com, so the exact branch could not be cloned into the Node host. Connected GitHub fetched code was behavior-tested with ESM import transformations in the V8 sandbox; cryptographic operations in that harness were deterministic mocks, not Node crypto.

**Further specific code defects found and fixed on the same draft branch:**
1. `src/uberwarm3-cash-first-governor.mjs`: before budget-driven checkout advice, fresh contact counts and active pilot daily caps must be verified via authenticated ledger callbacks. Caller-supplied plain text `evidenceRef` cannot authorize spending. Fresh owner campaign authority, legal route and actually bound production dispatch are purchase decision prerequisites. An all-in budget is TOTAL_MONTHLY by default: $69 Startup plus still-active $9 pilot requires $78, never just $69. `INCREMENTAL_AVAILABLE` is possible only if explicitly selected. No actual checkout.
2. `src/uberwarm3-google-postmaster-v2.mjs`: use `subdomainComplianceData` only when it is exactly attributed to the requested subdomain, rather than treating a parent-domain aggregate as subdomain-specific. Independent one-click unsubscribe/honor unsubscribe verdicts can block promotion even if SPF/DKIM green. Adverse `deliverabilityStatusVerdict` remains red. Source aligns with https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/domains/getComplianceStatus .
3. `src/uberwarm2-seed-executor.mjs`: a sender that became quarantined or a recipient who revoked consent AFTER the planning step cannot pass execution. JIT async trusted verifiers for both checks are mandatory before durable reservation and SMTP submission; unavailable/broken verifiers deny effects.
4. `src/uberwarm2-smtp-seed-bridge.mjs`: independently refuses paused, quarantined and placement-quarantined senders, even if a historical manifest said healthy.
5. `src/uberwarm3-consent-panel.mjs`: a user label 'GOOGLE' or 'MICROSOFT' alone cannot establish independent-network coverage. Requires trusted provider/network identity callback in addition to verified participant consent. No actual participant enrolled.

**Reproducible focused test set (only after fetching exact PR #1403 head into a real Node host):**
```sh
node --test tests/uberplacement.test.mjs \
  tests/uberwarm2-seed-executor.test.mjs \
  tests/uberwarm2-pg-ledger.test.mjs \
  tests/uberwarm2-smtp-seed-bridge.test.mjs \
  tests/uberwarm3-reputation-oracle.test.mjs \
  tests/uberwarm3-consent-panel.test.mjs \
  tests/uberwarm3-google-postmaster-v2.test.mjs \
  tests/uberwarm3-cash-first-governor.test.mjs
```

Last fetched-source V8 behavior counts after the hardening: placement 4/4, UberWarm² executor 14/14, PG 5/5, SMTP 4/4, UberWarm³ oracle 16/16, verified panel 9/9, Google Postmaster 12/12, cash-first 11/11, **75/75 total**, with separate reruns of updated suites. The initial combined harness mistakenly omitted a placement planner injection and showed 57/71; all 14 cases were subsequently re-run 14/14 with the corrected harness dependency binding. This is not proof of actual Node ESM loading or real provider operations. Exact-head runner remains blocked by original GitHub Actions account billing and fork branch-write 403, not fixed by 75 V8 unit assertions.

**Current authoritative states:** original production untouched, PR draft unmerged; no SQL migration applied, no credentials exported, no Winnr Startup proof, no paid warming, no diagnostic test sends, no prospect sends and no real Gmail/Outlook cross-provider placement measured. Never treat production Source/CI blockers as proof of user fault. The previous known Money Queue had zero independently contact-qualified prospects, still not re-verified as current live truth in this continuation.

**Commercial decision retained:** protect cash and existing pilot. Do not buy $30 warming or $69 extra infrastructure merely for theoretical 50-mailbox capacity. Only when verified eligible demand exceeds genuinely measured pilot capacity, legal/owner/dispatch authority and total-month affordability pass, propose founder-approved checkout. Choose genuine recipient-interest optimization over synthetic reply farming. No claim of actual superiority to Winnr before controlled real outcomes.

All founder ideas 0001–0890 and GENESIS are inherited by canonical pointer, with original source and provenance retained. Nothing in this experiment supersedes UberBond's sovereign continuum goals.
