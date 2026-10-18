# UberWarm 1–6 sovereign zero-paid-warmer live observer

**Date:** 2026-10-18. **Truth class:** independently testable SOURCE IMPLEMENTATION, awaiting exact-head CI and deployed runtime readback. **Scope:** existing `uberwarm-runtime`, already-paid Winnr transport; no Winnr warming add-on, paid provider, new message or receiver manipulation.

## Recovered six-layer intent, not six new SaaS subscriptions

The UberWarm lineage preserves six cooperating mechanisms: (1) evidence-first mailbox/domain reputation and adaptive ramp, (2) immutable consent-bound owner-controlled placement probes with exact signed scope and one-shot PostgreSQL ledger, (3) genuine recipient-provider placement/reputation/Postmaster observations, (4) incidents/complaints/deferrals/holds and uncertain-outcome no-retry, (5) evidence-driven UberQuality/UberReach capacity ceilings, and (6) economic comparison against paid warming. The external Winnr mailbox and submission provider is transport, **not** the warm-up brain. `docs/UBERWARM2_CAPABILITY_DONOR_SYNTHESIS_2026-10-01.md` explicitly says optional paid vendor warm-up is unnecessary for the evidence-ramp controller.

Math actually present in `src/uberwarm-reputation-lab.mjs`: hard hold if risk violates thresholds (complaints > 0.002, hard bounces > 0.03, spam placement > 0.20, inbox placement < 0.75). A good-signal normalized score is `0.30·complaint_score + 0.30·bounce_score + 0.25·placement_score + 0.15·sample_score`; any move is constrained by provider/account cap, confidence, time window and risk. The software cannot produce real recipient-network trust, genuine signatures or elapsed reputation history.

## Exact change

- New pure `src/uberwarm2-sovereign-live-observer.mjs` consumes **fully paginated live GET inventory** and runs each provider-observed mailbox through the existing `compileUberWarmFleet` decision engine. It rejects malformed, duplicate or unpaired identities, aggregates per-state counts, and **never converts provider Active into independent authentication or send permission**. There is no transport, seed network, approval signer or write operation anywhere in this module.
- Existing `scripts/uberwarm2-live-read-doctor.mjs` now feeds real provider inventory into the sovereign observer, reporting a sanitized `sovereignControl` result. `src/uberwarm2-operational-journal.mjs` durably allowlists aggregate control observations, and `Dockerfile.uberwarm-read-monitor` includes the exact imported dependencies. The already-running five-minute Railway read check will execute these pieces after normal deployment.
- Claims distinguished: `SOVEREIGN_CONTROL_MONITORING_ACTIVE` = real read-only inventory + reputation-controller calculation. `BLOCKED_FOR_SENDING` = no signed current sender health, no exact consent/approval/placement evidence. Both can be true at the same time. Provider warm-up activation remains forbidden and was not attempted.

## Verification

- `npm ci --ignore-scripts --no-audit --no-fund`: 21 dependencies installed in an isolated worktree, no lifecycle scripts, no additional paid provider.
- `node --test tests/uberwarm2-*.test.mjs`: **230 tests, 228 passed, 0 failed, 2 skipped** (including one real PostgreSQL fixture requiring an unavailable configured test database).
- `node --test tests/canon-freshness.test.mjs`: **6 of 6 passed**.
- `git diff --check`: clean.
- The tests explicitly reject fake sender authentication, receiver consent, provider paid add-on authority, duplicate domains/mailboxes, missing inventory, unknown identity, leaked addresses and made-up placement.

## True external effects and unresolved source/runtime claims

As of prior live Railway receipt at 2026-10-18T19:31Z, `uberwarm-runtime` was deployed at `340d4b8a`, 53 provider-Active mailboxes across 11 domains, authenticated receiving IMAP and operational receipt journaling, **zero mail sends, zero one-shot ledger claims, no verified consent, no Inbox/Spam placement**. That receipt predates this source change; only new exact deployed readback can prove the sovereign observer is running.

Remaining live independent proof before a bounded send: per-sender signed hold/quarantine/DNS/HTTPS authorization; real owner-controlled recipient opt-in and exact signed one-shot approval; then provider Message-ID, independent Inbox/Spam receipt and further policy-gated repetition. These are requirements for legal/credible real mail, not purchase requirements and not justification to buy Winnr warming. Do not fill missing evidence with synthetic replies, spam rescues, record-presence assumptions or fake signatures.
